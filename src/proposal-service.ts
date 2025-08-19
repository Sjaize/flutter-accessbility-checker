// src/proposal-service.ts
import * as vscode from 'vscode';
import * as path from 'path';
import WebSocket from 'ws';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { 
  ProposalRequest, 
  ProposalResponse, 
  ApplyRequest, 
  ApplyResponse, 
  CodeScope, 
  A11yMeta, 
  LLMInput, 
  LLMOutput 
} from './types/proposal';
import { LocationResolver } from './location-resolver';

// 환경 변수 로드
dotenv.config({ path: '/Users/sjaize/Desktop/extension/flutter-accessibility-checker/src/.env' });

export class ProposalService {
  private locationResolver: LocationResolver;
  private openai: OpenAI | null = null;

  constructor(activeFile?: string | null) {
    this.locationResolver = new LocationResolver(activeFile);
    this.initializeOpenAI();
  }

  private initializeOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('[Proposal] Checking API key...', apiKey ? 'Found' : 'Not found');
    console.log('[Proposal] Environment variables:', Object.keys(process.env).filter(key => key.includes('OPENAI')));
    
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please set OPENAI_API_KEY in your .env file.');
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
    });
    console.log('[Proposal] OpenAI initialized successfully');
  }

  setActiveFile(file: string | null) {
    this.locationResolver.setActiveFile(file);
  }

  // ── LLM 제안 생성 ──
  async generateProposal(ws: WebSocket, data: ProposalRequest): Promise<void> {
    const { issue } = data;
    
    try {
      // 1. 정확한 위치 확정 (M5 + activeFile + issue.source)
      console.log(`[Proposal] Issue ID: ${issue.id}, M5: ${issue.m5Location ? `${issue.m5Location.file}:${issue.m5Location.line}:${issue.m5Location.column}` : 'none'}`);
      
      const resolved = await this.locationResolver.resolveLocation(issue);
      if (!resolved) {
        console.log(`[Proposal] ❌ Location resolution failed for issue ${issue.id}`);
        this.sendProposalResponse(ws, {
          issueId: issue.id,
          file: issue?.source?.file || '',
          rationale: '위치를 찾을 수 없습니다.'
        });
        return;
      }

      const { file, line, column } = resolved;
      console.log(`[Proposal] ✅ Resolved location: ${file}:${line}:${column}`);
      
      // 2. 스코프 추출
      const scope = await this.extractScope(file, line, column);
      
      // 3. 접근성 메타데이터 수집
      const a11yMeta = await this.getLatestA11yMeta(issue);
      
      // 4. LLM 호출
      const result = await this.callLLM({
        language: this.locationResolver.guessLanguage(file),
        file, scope, issue, a11yMeta
      });
      const { diff, a11yDelta, rationale } = result;
      
      // 5. 제안 전송
      this.sendProposalResponse(ws, {
        issueId: issue.id, file,
        range: scope.range,
        diff,
        a11yDelta, rationale,
      });
      
    } catch (e) {
      console.error('[Proposal] Error generating proposal:', e);
      this.sendProposalResponse(ws, {
        issueId: issue.id,
        file: issue?.source?.file || '',
        rationale: `제안 생성 실패: ${e}`
      });
    }
  }

  // ── 제안 적용 ── (React에서 직접 VS Code URI 호출하므로 여기서는 단순 응답만)
  async applyProposal(ws: WebSocket, data: ApplyRequest): Promise<void> {
    const { issueId } = data;
    
    try {
      console.log(`[Apply] Apply request received for issue ${issueId} (handled by React -> VS Code URI)`);
      
      // React에서 직접 VS Code URI를 호출하므로 여기서는 성공 응답만
      this.sendApplyResponse(ws, { issueId, ok: true });
      
    } catch (e: any) {
      console.error('[Proposal] Error in apply proposal:', e);
      this.sendApplyResponse(ws, {
        issueId,
        ok: false,
        error: String(e?.message || e)
      });
    }
  }

  // ── VS Code diff 뷰 열기 (옛날 방식 - 간단한 텍스트 교체) ──
  private async openDiffView(file: string, diff: string) {
    try {
      // file:// 프로토콜 제거
      let cleanPath = file;
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.substring(7);
      }

      // diff에서 핵심 변경사항 추출
      const lines = diff.split('\n');
      let targetLine = 1;
      let originalText = '';
      let newText = '';
      
      // @@ 라인에서 시작 라인 번호 추출
      const hunkMatch = diff.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (hunkMatch) {
        targetLine = parseInt(hunkMatch[2]);
      }
      
      // - 라인(삭제)과 + 라인(추가) 분리
      for (const line of lines) {
        if (line.startsWith('-') && !line.startsWith('---')) {
          originalText += line.substring(1) + '\n';
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          newText += line.substring(1) + '\n';
        }
      }
      
      // 텍스트 정리
      originalText = originalText.trim();
      newText = newText.trim();
      
      console.log(`[Diff] Extracted change: line ${targetLine}`);
      console.log(`[Diff] Original: ${originalText.substring(0, 50)}...`);
      console.log(`[Diff] New: ${newText.substring(0, 50)}...`);
      
      // 옛날 방식: 간단한 교체로 diff 표시
      await this.openSimpleDiffView(cleanPath, targetLine, 1, originalText, newText);
      
    } catch (error) {
      console.error('[Diff] Error opening diff view:', error);
      throw error;
    }
  }

  // ── 간단한 diff 뷰 (옛날 방식 - 원본 vs 수정본) ──
  private async openSimpleDiffView(file: string, line: number, column: number, originalText: string, newText: string): Promise<void> {
    const params = new URLSearchParams({
      file: path.basename(file),
      line: String(line),
      column: String(column),
      original: originalText,
      new: newText
    });

    const previewUri = vscode.Uri.parse(
      `flutter-accessibility-preview://${path.basename(file)}?${params.toString()}`
    );
    
    const actualUri = vscode.Uri.file(file);

    console.log(`[Diff] Opening clean diff: ${path.basename(file)}:${line}`);

    // VS Code 창을 맨 앞으로 가져오기
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    
    // diff 명령 실행
    await vscode.commands.executeCommand(
      'vscode.diff',
      actualUri, // 원본을 왼쪽에
      previewUri, // 수정본을 오른쪽에
      `🔧 제안: ${path.basename(file)}`,
      { preview: false, preserveFocus: false }
    );
    
    // 추가 포커스 명령들
    setTimeout(async () => {
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      await vscode.window.showInformationMessage(`✅ ${path.basename(file)} 수정 제안을 확인하세요!`);
    }, 1000);
  }

  // ── diff를 실제 파일에 적용 ──
  private async applyDiffToFile(file: string, diff: string): Promise<void> {
    try {
      // file:// 프로토콜 제거
      let cleanPath = file;
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.substring(7);
      }

      // diff에서 변경사항 추출
      const lines = diff.split('\n');
      let originalText = '';
      let newText = '';
      
      for (const line of lines) {
        if (line.startsWith('-') && !line.startsWith('---')) {
          originalText += line.substring(1) + '\n';
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          newText += line.substring(1) + '\n';
        }
      }
      
      originalText = originalText.trim();
      newText = newText.trim();
      
      if (originalText && newText) {
        // 실제 파일 수정
        const uri = vscode.Uri.file(cleanPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        
        // 원본 텍스트 찾아서 교체
        const fullText = doc.getText();
        const newContent = fullText.replace(originalText, newText);
        
        await editor.edit(editBuilder => {
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(fullText.length)
          );
          editBuilder.replace(fullRange, newContent);
        });
        
        console.log(`[Apply] Successfully applied diff to ${path.basename(cleanPath)}`);
      }
      
    } catch (error) {
      console.error('[Apply] Error applying diff:', error);
      throw error;
    }
  }

  // ── 스코프 추출 ──
  private async extractScope(filePath: string, line: number, column: number): Promise<CodeScope> {
    try {
      // file:// 프로토콜 제거
      let cleanPath = filePath;
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.substring(7);
      }

      const fs = require('fs');
      if (!fs.existsSync(cleanPath)) {
        throw new Error(`File not found: ${cleanPath}`);
      }

      const content = fs.readFileSync(cleanPath, 'utf8');
      const lines = content.split('\n');
      
      // M5 위치(line, column)에서 시작해서 가장 가까운 위젯 블록만 추출
      const targetLine = Math.max(0, line - 1); // 0-based index
      const targetCol = Math.max(0, column - 1);
      
      console.log(`[Scope] M5 위치: ${cleanPath}:${line}:${column} (0-based: ${targetLine}:${targetCol})`);
      
      // 1) M5 위치 주변에서 위젯 시작점 찾기 (Image.asset, ElevatedButton, Text 등)
      let start = targetLine;
      let end = targetLine;
      
      // 2) M5 위치에서 정확한 위젯 찾기
      const targetLineText = lines[targetLine] || '';
      console.log(`[Scope] Target line content: ${targetLineText.trim()}`);
      
      // M5 위치를 중심으로 충분한 컨텍스트 제공 (±15줄)
      // LLM이 정확한 수정을 위해 주변 구조를 파악할 수 있도록
      start = Math.max(0, targetLine - 15);
      end = Math.min(lines.length - 1, targetLine + 15);
      
      console.log(`[Scope] Using M5-centered context: lines ${start + 1}-${end + 1} (M5 at ${targetLine + 1})`);
      
      // M5 위치에서 실제 타겟 위젯 찾기 (디버깅용)
      let targetWidget = '';
      for (let i = Math.max(0, targetLine - 3); i <= Math.min(lines.length - 1, targetLine + 3); i++) {
        const lineText = lines[i];
        const patterns = ['Image.asset(', 'ElevatedButton(', 'Text(', 'Icon(', 'Container(', 'Semantics('];
        
        for (const pattern of patterns) {
          if (lineText.includes(pattern)) {
            targetWidget = pattern;
            console.log(`[Scope] 🎯 Target widget "${pattern}" found at line ${i + 1} (M5 reference)`);
            break;
          }
        }
        if (targetWidget) break;
      }
      
      // 3) M5 위치 정보를 프롬프트에 포함하기 위해 추가 정보 수집
      const contextInfo = {
        m5Line: targetLine + 1,
        m5Column: targetCol + 1,
        targetWidget: targetWidget || 'unknown',
        scopeLines: `${start + 1}-${end + 1}`
      };
      
      console.log(`[Scope] Context info:`, contextInfo);
      
      const text = lines.slice(start, end + 1).join('\n');
      
      return {
        range: {
          start: { line: start + 1, col: 1 },
          end: { line: end + 1, col: lines[end].length + 1 }
        },
        code: text
      };
    } catch (error) {
      console.error('[Scope] Error extracting scope:', error);
      throw error;
    }
  }

  // ── 접근성 메타데이터 수집 ──
  private async getLatestA11yMeta(issue: ProposalRequest['issue']): Promise<A11yMeta> {
    // semantics/uidump에서 라벨/힌트/flags/actions 등 추출
    return {
      label: issue.label,
      elementType: issue.elementType,
      rect: issue.rect,
      // 추가 메타데이터는 필요에 따라 확장
    };
  }

  // ── LLM 호출 (OpenAI GPT) ──
  private async callLLM(input: LLMInput): Promise<LLMOutput> {
    const { language, file, scope, issue, a11yMeta } = input;
    
    const prompt = this.buildPrompt(input);
    const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    
    console.log('[Proposal] Calling OpenAI with model:', model);
    
    const response = await this.openai!.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are an accessibility code fixer. You help improve Flutter/Dart code for better screen reader support and accessibility.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    console.log('[Proposal] OpenAI response received');
    console.log('[Proposal] Response content length:', content.length);
    console.log('[Proposal] Response preview:', content.substring(0, 200));
    
    // 응답 파싱
    return this.parseLLMResponse(content, input);
  }

  // ── 프롬프트 생성 ──
  private buildPrompt(input: LLMInput): string {
    const { language, file, scope, issue, a11yMeta } = input;
    const meta = JSON.stringify({ issue, a11yMeta }, null, 2);
    
    return `당신은 접근성 코드 개선 전문가입니다.

중요한 정보:
- M5 매칭이 정확히 찾아낸 위치: Line ${issue.m5Location?.line || 'unknown'}, Column ${issue.m5Location?.column || 'unknown'}
- 이 위치에 있는 위젯에 접근성 개선이 필요합니다.

수정 규칙 (매우 중요):
- 오직 M5 위치의 위젯에만 Semantics를 추가하세요.
- 기존 코드의 줄바꿈, 들여쓰기, 공백을 절대 변경하지 마세요.
- 기존 위젯 구조를 재배치하거나 변경하지 마세요.
- 오직 Semantics() 위젯으로 감싸는 것만 하세요.
- 최소한의 변경만 하세요 - 접근성 개선에 필요한 것만!
- unified diff 형식으로 출력하세요.

언어: ${language}
파일: ${file}
M5 타겟 위치: Line ${issue.m5Location?.line || 'unknown'}, Column ${issue.m5Location?.column || 'unknown'}
제공된 컨텍스트 범위: ${scope.range.start.line}:${scope.range.start.col} - ${scope.range.end.line}:${scope.range.end.col}

현재 코드:
\`\`\`${language}
${scope.code}
\`\`\`

접근성 이슈:
${meta}

수정 예시 (정확히 이렇게만 하세요):
기존:
  Image.asset('assets/images/onboarding.png'),

수정:
  Semantics(
    label: '온보딩 이미지',
    child: Image.asset('assets/images/onboarding.png'),
  ),

주의사항:
- 기존 들여쓰기와 정확히 같은 스타일 유지
- 다른 라인은 절대 건드리지 말 것
- 오직 Semantics 감싸기만 할 것

다음을 제공해주세요:
1. 변경사항을 보여주는 unified diff
2. 접근성 개선에 대한 간단한 설명
3. 변경 전후 스크린 리더 동작 예상

응답 형식:
\`\`\`diff
[unified diff here]
\`\`\`

\`\`\`json
{
  "a11yDelta": {
    "before": "현재 스크린 리더 동작",
    "after": "개선된 스크린 리더 동작"
  },
  "rationale": "변경 사유"
}
\`\`\``;
  }

  // ── LLM 응답 파싱 ──
  private parseLLMResponse(content: string, input: LLMInput): LLMOutput {
    console.log('[Parse] Parsing LLM response...');
    console.log('[Parse] Full content:', content);
    
    // diff 추출
    const diffMatch = content.match(/```diff\n([\s\S]*?)\n```/);
    if (!diffMatch) {
      console.error('[Parse] No diff block found in response');
      throw new Error('Failed to extract diff from OpenAI response');
    }
    const diff = diffMatch[1].trim();
    console.log('[Parse] Extracted diff:', diff);
    console.log('[Parse] Diff length:', diff.length);
    
    // JSON 추출
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      console.error('[Parse] No JSON block found in response');
      throw new Error('Failed to extract JSON from OpenAI response');
    }
    
    console.log('[Parse] Raw JSON:', jsonMatch[1]);
    const jsonData = JSON.parse(jsonMatch[1]);
    const a11yDelta = jsonData.a11yDelta || { before: '라벨 없음', after: '개선된 라벨' };
    const rationale = jsonData.rationale || '접근성 개선';
    
    console.log('[Parse] Parsed result:', { diffLength: diff.length, a11yDelta, rationale });
    
    return { diff, a11yDelta, rationale };
  }

  // ── 편집 적용 ──
  private async applyEdits(filePath: string, edits: any[]) {
    try {
      // file:// 프로토콜 제거
      let cleanPath = filePath;
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.substring(7);
      }

      const uri = vscode.Uri.file(cleanPath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      
      await editor.edit((builder) => {
        // 주의: 뒤에서부터 적용 (라인 변형 영향 최소화)
        for (const e of edits.sort((a, b) => (b.start.line - a.start.line) || (b.start.col - a.start.col))) {
          const range = new vscode.Range(
            new vscode.Position(e.start.line - 1, e.start.col - 1),
            new vscode.Position(e.end.line - 1, e.end.col - 1)
          );
          builder.replace(range, e.newText);
        }
      });
    } catch (error) {
      console.error('[Edits] Error applying edits:', error);
      throw error;
    }
  }

  // ── 유니파이드 diff 적용 (간단 버전) ──
  private async applyUnifiedDiff(diff: string) {
    // TODO: unidiff 파싱 라이브러리 사용 권장
    // 간단하게는 "edits"도 함께 받아두고, diff 실패 시 edits로 폴백
    throw new Error('Unified diff parser not implemented');
  }

  // ── 문서 포맷팅 ──
  private async formatDocument(filePath: string) {
    try {
      // file:// 프로토콜 제거
      let cleanPath = filePath;
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.substring(7);
      }

      const uri = vscode.Uri.file(cleanPath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('editor.action.formatDocument');
    } catch (error) {
      console.error('[Format] Error formatting document:', error);
      // 포맷팅 실패는 치명적이지 않으므로 무시
    }
  }

  // ── 응답 전송 헬퍼 ──
  private sendProposalResponse(ws: WebSocket, data: ProposalResponse) {
    ws.send(JSON.stringify({ type: 'proposal', data }));
  }

  private sendApplyResponse(ws: WebSocket, data: ApplyResponse) {
    ws.send(JSON.stringify({ type: 'applyResult', data }));
  }
}
