import * as http from 'http';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class HttpServer {
  private server: http.Server | null = null;
  private port: number = 3001;
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer(async (req, res) => {
          this.handleRequest(req, res);
        });

        this.server.listen(this.port, () => {
          this.log(`🚀 HTTP 서버가 포트 ${this.port}에서 시작되었습니다.`);
          resolve();
        });

        this.server.on('error', (error) => {
          this.log(`❌ HTTP 서버 시작 실패: ${error.message}`);
          reject(error);
        });
      } catch (error) {
        this.log(`❌ HTTP 서버 생성 실패: ${error}`);
        reject(error);
      }
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/apply-code-suggestion') {
      await this.handleCodeSuggestion(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  }

  private async handleCodeSuggestion(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { file, line, originalCode, suggestedCode, issueId } = data;

          this.log(`📝 코드 수정 요청: ${file}:${line}`);

          // 파일 경로 확인
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders || workspaceFolders.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: '워크스페이스가 열려있지 않습니다.' 
            }));
            return;
          }

          const workspaceRoot = workspaceFolders[0].uri.fsPath;
          const filePath = path.join(workspaceRoot, file);

          // 파일 존재 확인
          if (!fs.existsSync(filePath)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: `파일을 찾을 수 없습니다: ${file}` 
            }));
            return;
          }

          // 파일 내용 읽기
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const lines = fileContent.split('\n');

          // 라인 번호 확인
          if (line < 1 || line > lines.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: `유효하지 않은 라인 번호: ${line}` 
            }));
            return;
          }

          // 코드 수정 적용
          const result = await this.applyCodeChanges(
            filePath, 
            lines, 
            line - 1, // 0-based index
            originalCode, 
            suggestedCode
          );

          if (result.success) {
            // 수정 전후 비교를 위한 diff 뷰 생성
            await this.showDiffView(filePath, result.changes, line);

            // 성공 응답
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: '코드가 성공적으로 수정되었습니다.',
              file: file,
              line: line,
              changes: result.changes
            }));

            this.log(`✅ 코드 수정 완료: ${file}:${line}`);
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: result.error 
            }));
          }
        } catch (parseError) {
          this.log(`❌ JSON 파싱 오류: ${parseError}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: '잘못된 JSON 형식입니다.' 
          }));
        }
      });
    } catch (error) {
      this.log(`❌ 코드 수정 처리 오류: ${error}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: '서버 내부 오류가 발생했습니다.' 
      }));
    }
  }

  private async applyCodeChanges(
    filePath: string, 
    lines: string[], 
    lineIndex: number, 
    originalCode: string, 
    suggestedCode: string
  ): Promise<{ success: boolean; error?: string; changes?: any }> {
    try {
      // 원본 코드와 현재 라인 비교
      const currentLine = lines[lineIndex].trim();
      const originalCodeTrimmed = originalCode.trim();

      // 코드 매칭 확인
      if (!this.isCodeMatching(currentLine, originalCodeTrimmed)) {
        return {
          success: false,
          error: `현재 코드와 원본 코드가 일치하지 않습니다.\n현재: ${currentLine}\n원본: ${originalCodeTrimmed}`
        };
      }

      // 백업 파일 생성
      const backupPath = `${filePath}.backup.${Date.now()}`;
      fs.writeFileSync(backupPath, lines.join('\n'));

      // 코드 수정
      const suggestedLines = suggestedCode.split('\n');
      
      if (suggestedLines.length === 1) {
        // 단일 라인 수정
        lines[lineIndex] = suggestedCode;
      } else {
        // 여러 라인 수정
        lines.splice(lineIndex, 1, ...suggestedLines);
      }

      // 파일에 저장
      fs.writeFileSync(filePath, lines.join('\n'));

      return {
        success: true,
        changes: {
          originalLine: currentLine,
          suggestedCode: suggestedCode,
          backupFile: backupPath
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `코드 수정 중 오류 발생: ${error}`
      };
    }
  }

  private isCodeMatching(currentCode: string, originalCode: string): boolean {
    // 공백과 줄바꿈을 제거하고 비교
    const normalize = (code: string) => code.replace(/\s+/g, ' ').trim();
    return normalize(currentCode) === normalize(originalCode);
  }

  private async showDiffView(filePath: string, changes: any, lineNumber: number): Promise<void> {
    try {
      // 백업 파일에서 원본 내용 읽기
      const backupContent = fs.readFileSync(changes.backupFile, 'utf8');
      const currentContent = fs.readFileSync(filePath, 'utf8');

      // 임시 파일 생성 (원본 내용용)
      const tempDir = path.dirname(filePath);
      const tempOriginalFile = path.join(tempDir, `.${path.basename(filePath)}.original.${Date.now()}`);
      fs.writeFileSync(tempOriginalFile, backupContent);

      // VS Code에서 diff 뷰 열기
      const originalUri = vscode.Uri.file(tempOriginalFile);
      const modifiedUri = vscode.Uri.file(filePath);

      // diff 뷰 열기
      await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, 
        `접근성 개선 - ${path.basename(filePath)} (라인 ${lineNumber})`, 
        { preview: true }
      );

      // 변경사항 요약 알림 표시
      await this.showChangeSummary(changes, lineNumber);

      // 임시 파일 정리 (5초 후)
      setTimeout(() => {
        try {
          if (fs.existsSync(tempOriginalFile)) {
            fs.unlinkSync(tempOriginalFile);
          }
        } catch (error) {
          this.log(`⚠️ 임시 파일 정리 실패: ${error}`);
        }
      }, 5000);

    } catch (error) {
      this.log(`❌ diff 뷰 생성 실패: ${error}`);
      // diff 뷰 실패 시 기본 파일 열기
      await this.openFileInEditor(filePath, lineNumber);
    }
  }

  private async openFileInEditor(filePath: string, lineNumber: number): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const editor = await vscode.window.showTextDocument(document);
      
      // 수정된 라인으로 스크롤
      const position = new vscode.Position(lineNumber - 1, 0);
      editor.revealRange(new vscode.Range(position, position));
    } catch (error) {
      this.log(`❌ 파일 열기 실패: ${error}`);
    }
  }

  private async showChangeSummary(changes: any, lineNumber: number): Promise<void> {
    try {
      const summary = `📝 **접근성 코드 개선 완료!**

**파일**: ${path.basename(changes.backupFile.replace('.backup.', ''))}
**라인**: ${lineNumber}
**변경사항**: 
\`\`\`
${changes.originalLine}
↓
${changes.suggestedCode}
\`\`\`

**백업 파일**: ${path.basename(changes.backupFile)}
**개선 효과**: 스크린 리더 사용자 경험 향상`;

      // 정보 메시지 표시
      vscode.window.showInformationMessage(
        `접근성 코드 개선이 완료되었습니다! 라인 ${lineNumber}`,
        '변경사항 보기',
        '백업 파일 열기'
      ).then(selection => {
        if (selection === '변경사항 보기') {
          // diff 뷰가 이미 열려있으므로 포커스만 이동
          vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        } else if (selection === '백업 파일 열기') {
          // 백업 파일 열기
          vscode.workspace.openTextDocument(vscode.Uri.file(changes.backupFile));
        }
      });

    } catch (error) {
      this.log(`❌ 변경사항 요약 표시 실패: ${error}`);
    }
  }

  stopServer(): void {
    if (this.server) {
      this.server.close(() => {
        this.log('🛑 HTTP 서버가 중지되었습니다.');
      });
      this.server = null;
    }
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[HTTP Server] ${message}`);
    console.log(`[HTTP Server] ${message}`);
  }
}
