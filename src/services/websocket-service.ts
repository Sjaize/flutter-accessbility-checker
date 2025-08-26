// src/services/websocket-service.ts
import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { 
  WebSocketMessage, 
  WebSocketMessageType, 
  RequestCodeSuggestionData, 
  ApplyCodeSuggestionData,
  ScreenshotData,
  ErrorData,
  ConnectionStatusData,
  CodeSuggestion,
  AccessibilityIssue,
  ProjectAnalysis
} from '../types/accessibility';

export class WebSocketService {
  private server: WebSocket.Server | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;
  private outputChannel: vscode.OutputChannel;
  private isRunning: boolean = false;

  constructor(port: number, outputChannel: vscode.OutputChannel) {
    this.port = port;
    this.outputChannel = outputChannel;
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        this.outputChannel.appendLine('⚠️ WebSocket 서버가 이미 실행 중입니다.');
        return;
      }

      this.server = new WebSocket.Server({ port: this.port });
      
      this.server.on('connection', (ws: WebSocket) => {
        this.handleConnection(ws);
      });

      this.server.on('error', (error: Error) => {
        this.outputChannel.appendLine(`❌ WebSocket 서버 오류: ${error.message}`);
        this.handleServerError(error);
      });

      this.isRunning = true;
      this.outputChannel.appendLine(`✅ WebSocket 서버가 포트 ${this.port}에서 시작되었습니다.`);
      
    } catch (error) {
      this.outputChannel.appendLine(`❌ WebSocket 서버 시작 실패: ${error}`);
      throw new Error(`WebSocket 서버 시작 실패: ${error}`);
    }
  }

  private handleConnection(ws: WebSocket): void {
    try {
      this.clients.add(ws);
      this.outputChannel.appendLine('🔗 새로운 클라이언트가 연결되었습니다.');

      // 연결 상태 전송
      this.sendToClient(ws, WebSocketMessageType.CONNECTION_STATUS, {
        status: 'connected',
        message: 'VS Code 확장 프로그램에 연결되었습니다.'
      } as ConnectionStatusData);

      ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.outputChannel.appendLine('🔌 클라이언트 연결이 종료되었습니다.');
      });

      ws.on('error', (error: Error) => {
        this.outputChannel.appendLine(`❌ 클라이언트 연결 오류: ${error.message}`);
        this.clients.delete(ws);
      });

    } catch (error) {
      this.outputChannel.appendLine(`❌ 클라이언트 연결 처리 실패: ${error}`);
      this.sendErrorToClient(ws, 'CONNECTION_ERROR', '클라이언트 연결 처리에 실패했습니다.');
    }
  }

  private async handleMessage(ws: WebSocket, data: WebSocket.Data): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      if (!message.type || !message.data) {
        throw new Error('잘못된 메시지 형식');
      }

      this.outputChannel.appendLine(`📨 메시지 수신: ${message.type}`);

      switch (message.type) {
        case WebSocketMessageType.REQUEST_CODE_SUGGESTION:
          await this.handleCodeSuggestionRequest(ws, message.data as RequestCodeSuggestionData);
          break;
          
        case WebSocketMessageType.APPLY_CODE_SUGGESTION:
          await this.handleApplyCodeSuggestion(ws, message.data as ApplyCodeSuggestionData);
          break;
          
        case WebSocketMessageType.REQUEST_SCREENSHOT:
          await this.handleScreenshotRequest(ws);
          break;
          
        default:
          this.sendErrorToClient(ws, 'UNKNOWN_MESSAGE_TYPE', `알 수 없는 메시지 타입: ${message.type}`);
      }

    } catch (error) {
      this.outputChannel.appendLine(`❌ 메시지 처리 실패: ${error}`);
      this.sendErrorToClient(ws, 'MESSAGE_PARSING_ERROR', '메시지 파싱에 실패했습니다.');
    }
  }

  private async handleCodeSuggestionRequest(ws: WebSocket, data: RequestCodeSuggestionData): Promise<void> {
    try {
      if (!data.issueId || !data.file || !data.line) {
        throw new Error('필수 데이터가 누락되었습니다.');
      }

      // 파일 존재 확인
      const filePath = path.resolve(data.file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`파일을 찾을 수 없습니다: ${data.file}`);
      }

      // 코드 제안 생성 (실제 이슈 정보 활용)
      const suggestion = await this.generateCodeSuggestion(data);
      
      // VS Code에서 코드 프리뷰 열기
      await this.openCodePreview(suggestion);
      
      // 클라이언트에 제안 전송
      this.sendToClient(ws, WebSocketMessageType.CODE_SUGGESTION, suggestion);

    } catch (error) {
      this.outputChannel.appendLine(`❌ 코드 제안 요청 처리 실패: ${error}`);
      this.sendErrorToClient(ws, 'CODE_SUGGESTION_ERROR', `코드 제안 생성 실패: ${error}`);
    }
  }

  private async handleApplyCodeSuggestion(ws: WebSocket, data: ApplyCodeSuggestionData): Promise<void> {
    try {
      if (!data.suggestionId || !data.file || !data.line || !data.code) {
        throw new Error('필수 데이터가 누락되었습니다.');
      }

      // 파일 존재 확인
      const filePath = path.resolve(data.file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`파일을 찾을 수 없습니다: ${data.file}`);
      }

      // VS Code에서 코드 적용
      await this.applyCodeToFile(data.file, data.line, data.code);
      
      this.outputChannel.appendLine(`✅ 코드가 성공적으로 적용되었습니다: ${data.file}:${data.line}`);

    } catch (error) {
      this.outputChannel.appendLine(`❌ 코드 적용 실패: ${error}`);
      this.sendErrorToClient(ws, 'CODE_APPLY_ERROR', `코드 적용 실패: ${error}`);
    }
  }

  private async handleScreenshotRequest(ws: WebSocket): Promise<void> {
    try {
      // 스크린샷 요청에 대한 응답 (실제로는 스크린샷 서비스에서 처리)
      this.outputChannel.appendLine('📸 스크린샷 요청을 받았습니다.');
      
    } catch (error) {
      this.outputChannel.appendLine(`❌ 스크린샷 요청 처리 실패: ${error}`);
      this.sendErrorToClient(ws, 'SCREENSHOT_ERROR', '스크린샷 요청 처리에 실패했습니다.');
    }
  }

  private async generateCodeSuggestion(data: RequestCodeSuggestionData): Promise<CodeSuggestion> {
    try {
      // 파일에서 실제 코드 읽기
      const document = await vscode.workspace.openTextDocument(data.file);
      const fileContent = document.getText();
      const lines = fileContent.split('\n');
      
      // 해당 라인의 원본 코드 가져오기
      const originalLine = lines[data.line - 1] || '';
      
      // 접근성 이슈에 따른 제안 코드 생성
      let suggestedCode = '';
      let explanation = '';
      
      // 라인에서 위젯 타입 감지 및 개선
      if (originalLine.includes('Text(')) {
        const textMatch = originalLine.match(/Text\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (textMatch) {
          const textContent = textMatch[1];
          suggestedCode = originalLine.replace(
            /Text\s*\(\s*['"`]([^'"`]+)['"`]/,
            `Semantics(label: "${textContent}", child: Text("${textContent}"))`
          );
          explanation = `Text 위젯에 접근성 라벨 "${textContent}"을 추가했습니다.`;
        } else {
          suggestedCode = `Semantics(label: "텍스트 내용", child: ${originalLine.trim()})`;
          explanation = 'Text 위젯에 접근성 라벨을 추가했습니다.';
        }
      } else if (originalLine.includes('Image.')) {
        if (originalLine.includes('semanticLabel:')) {
          // 이미 semanticLabel이 있는 경우 개선
          suggestedCode = originalLine.replace(
            /semanticLabel:\s*['"`]([^'"`]+)['"`]/,
            'semanticLabel: "명확한 이미지 설명"'
          );
          explanation = '이미지의 대체 텍스트를 더 명확하게 개선했습니다.';
        } else {
          // semanticLabel이 없는 경우 추가
          suggestedCode = originalLine.replace(
            /Image\.(network|asset)\s*\(/,
            'Image.$1(\n  semanticLabel: "이미지 설명",\n  '
          );
          explanation = '이미지에 대체 텍스트를 추가했습니다.';
        }
      } else if (originalLine.includes('Icon(')) {
        if (originalLine.includes('semanticLabel:')) {
          // 이미 semanticLabel이 있는 경우 개선
          suggestedCode = originalLine.replace(
            /semanticLabel:\s*['"`]([^'"`]+)['"`]/,
            'semanticLabel: "아이콘 기능 설명"'
          );
          explanation = '아이콘의 접근성 라벨을 더 명확하게 개선했습니다.';
        } else {
          // semanticLabel이 없는 경우 추가
          suggestedCode = `Semantics(label: "아이콘 기능", child: ${originalLine.trim()})`;
          explanation = '아이콘에 접근성 라벨을 추가했습니다.';
        }
      } else if (originalLine.includes('Button')) {
        if (originalLine.includes('semanticLabel:')) {
          // 이미 semanticLabel이 있는 경우 개선
          suggestedCode = originalLine.replace(
            /semanticLabel:\s*['"`]([^'"`]+)['"`]/,
            'semanticLabel: "버튼 기능 설명"'
          );
          explanation = '버튼의 접근성 라벨을 더 명확하게 개선했습니다.';
        } else {
          // semanticLabel이 없는 경우 추가
          const buttonMatch = originalLine.match(/(ElevatedButton|TextButton|IconButton)\s*\(/);
          if (buttonMatch) {
            suggestedCode = originalLine.replace(
              /(ElevatedButton|TextButton|IconButton)\s*\(/,
              '$1(\n  semanticLabel: "버튼 기능",\n  '
            );
            explanation = '버튼에 접근성 라벨을 추가했습니다.';
          } else {
            suggestedCode = `Semantics(label: "버튼 기능", child: ${originalLine.trim()})`;
            explanation = '버튼에 접근성 라벨을 추가했습니다.';
          }
        }
      } else {
        // 기본적인 Semantics 래핑
        suggestedCode = `Semantics(\n  label: "위젯 설명",\n  child: ${originalLine.trim()}\n)`;
        explanation = '위젯에 접근성 라벨을 추가했습니다.';
      }
      
      const suggestion: CodeSuggestion = {
        id: `suggestion_${Date.now()}`,
        issueId: data.issueId,
        file: data.file,
        line: data.line,
        originalCode: originalLine,
        suggestedCode: suggestedCode,
        explanation: explanation
      };

      return suggestion;
    } catch (error) {
      this.outputChannel.appendLine(`❌ 코드 제안 생성 실패: ${error}`);
      
      // 에러 시 기본 제안 반환
      return {
        id: `suggestion_${Date.now()}`,
        issueId: data.issueId,
        file: data.file,
        line: data.line,
        originalCode: '// 코드를 읽을 수 없습니다',
        suggestedCode: '// 접근성 개선이 필요합니다',
        explanation: '파일을 읽는 중 오류가 발생했습니다.'
      };
    }
  }

  private async openCodePreview(suggestion: CodeSuggestion): Promise<void> {
    try {
      // 원본 파일 열기
      const originalDocument = await vscode.workspace.openTextDocument(suggestion.file);
      await vscode.window.showTextDocument(originalDocument);

      // 제안 코드로 임시 문서 생성
      const suggestedDocument = await vscode.workspace.openTextDocument({
        content: suggestion.suggestedCode,
        language: 'dart'
      });

      // diff 뷰 열기
      await vscode.commands.executeCommand('vscode.diff', 
        originalDocument.uri, 
        suggestedDocument.uri, 
        '코드 제안',
        { preview: true }
      );

    } catch (error) {
      this.outputChannel.appendLine(`❌ 코드 프리뷰 열기 실패: ${error}`);
      throw error;
    }
  }

  private async applyCodeToFile(filePath: string, line: number, code: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document);
      
      // 해당 라인으로 이동
      const lineIndex = line - 1;
      const lineRange = document.lineAt(lineIndex).range;
      
      // 선택 영역 설정
      editor.selection = new vscode.Selection(lineRange.start, lineRange.end);
      
      // 코드 적용 (라인 전체 교체)
      await editor.edit(editBuilder => {
        editBuilder.replace(lineRange, code);
      });

      this.outputChannel.appendLine(`✅ 코드가 성공적으로 적용되었습니다: ${filePath}:${line}`);

    } catch (error) {
      this.outputChannel.appendLine(`❌ 파일에 코드 적용 실패: ${error}`);
      throw error;
    }
  }

  private sendToClient(ws: WebSocket, type: WebSocketMessageType, data: any): void {
    try {
      const message: WebSocketMessage = {
        type,
        data,
        timestamp: Date.now()
      };
      
      ws.send(JSON.stringify(message));
    } catch (error) {
      this.outputChannel.appendLine(`❌ 클라이언트에 메시지 전송 실패: ${error}`);
    }
  }

  private sendErrorToClient(ws: WebSocket, code: string, message: string): void {
    const errorData: ErrorData = {
      message,
      code,
      details: { timestamp: Date.now() }
    };
    
    this.sendToClient(ws, WebSocketMessageType.ERROR, errorData);
  }

  private handleServerError(error: Error): void {
    this.outputChannel.appendLine(`❌ WebSocket 서버 오류: ${error.message}`);
    this.isRunning = false;
    
    // 서버 재시작 시도
    setTimeout(() => {
      if (!this.isRunning) {
        this.outputChannel.appendLine('🔄 WebSocket 서버 재시작을 시도합니다...');
        this.start().catch(err => {
          this.outputChannel.appendLine(`❌ WebSocket 서버 재시작 실패: ${err}`);
        });
      }
    }, 5000);
  }

  // 브로드캐스트 메서드들
  sendScreenshot(imageBase64: string, boundingBoxes: any[]): void {
    const data: ScreenshotData = {
      imageBase64,
      boundingBoxes,
      timestamp: Date.now()
    };
    
    this.broadcast(WebSocketMessageType.SCREENSHOT_DATA, data);
  }

  sendAccessibilityIssues(issues: AccessibilityIssue[]): void {
    this.broadcast(WebSocketMessageType.ACCESSIBILITY_ISSUES, issues);
  }

  sendProjectAnalysis(analysis: ProjectAnalysis): void {
    this.broadcast(WebSocketMessageType.PROJECT_ANALYSIS, analysis);
  }

  private broadcast(type: WebSocketMessageType, data: any): void {
    const message: WebSocketMessage = {
      type,
      data,
      timestamp: Date.now()
    };

    const messageStr = JSON.stringify(message);
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          this.outputChannel.appendLine(`❌ 브로드캐스트 실패: ${error}`);
        }
      }
    });
  }

  async stop(): Promise<void> {
    try {
      if (this.server) {
        this.server.close();
        this.server = null;
      }
      
      this.clients.clear();
      this.isRunning = false;
      
      this.outputChannel.appendLine('🛑 WebSocket 서버가 중지되었습니다.');
      
    } catch (error) {
      this.outputChannel.appendLine(`❌ WebSocket 서버 중지 실패: ${error}`);
      throw error;
    }
  }

  getConnectionCount(): number {
    return this.clients.size;
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }
}
