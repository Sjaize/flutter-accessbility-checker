// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { FlutterAnalyzer } from './services/flutter-analyzer';
import { FlutterRunner } from './services/flutter-runner';
import { WebSocketService } from './services/websocket-service';
import { ProjectAnalysis } from './types/accessibility';

// 환경 변수 로드 (확장 프로그램 루트에서)
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// 상수
const OUTPUT_NAME = 'Flutter Accessibility Checker';

// 전역 변수
let outputChannel: vscode.OutputChannel;
let flutterAnalyzer: FlutterAnalyzer;
let flutterRunner: FlutterRunner;
let webSocketService: WebSocketService;
let currentAnalysis: ProjectAnalysis | null = null;

export async function activate(context: vscode.ExtensionContext) {
  console.log('🚀 Flutter Accessibility Checker 확장 프로그램이 활성화되었습니다.');

  // 환경 변수 로드 확인
  const apiKey1 = process.env.OPENAI_API_KEY;
  const apiKey2 = process.env.OPENAI_API_KEY2;
  console.log(`🔑 API Key 1: ${apiKey1 ? '설정됨' : '설정되지 않음'}`);
  console.log(`🔑 API Key 2: ${apiKey2 ? '설정됨' : '설정되지 않음'}`);

  // 출력 채널 초기화
  outputChannel = vscode.window.createOutputChannel(OUTPUT_NAME);
  outputChannel.show();

  // 워크스페이스 확인
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Flutter 프로젝트를 열어주세요.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  log(`📁 워크스페이스: ${workspaceRoot}`);

  // 서비스 초기화
  await initializeServices(workspaceRoot);

  // 명령어 등록
  registerCommands(context);

  log('✅ 확장 프로그램 초기화 완료');
}

async function initializeServices(workspaceRoot: string) {
  // Flutter 분석기 초기화
  flutterAnalyzer = new FlutterAnalyzer(workspaceRoot, outputChannel);
  
  // Flutter 실행기 초기화
  flutterRunner = new FlutterRunner(workspaceRoot, outputChannel);
  
  // WebSocket 서비스 초기화
  webSocketService = new WebSocketService(outputChannel);
  await webSocketService.startServer();
  
  // 코드 수정 명령어 등록
  // (HTTP 서버 대신 VS Code 명령어 사용)
  
  log('🔧 서비스 초기화 완료');
}

function registerCommands(context: vscode.ExtensionContext) {
  // 1. 접근성 분석 시작
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility.startAnalysis', async () => {
      await startAccessibilityAnalysis();
    })
  );

  // 2. 접근성 분석 중지
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility.stopAnalysis', async () => {
      await stopAccessibilityAnalysis();
    })
  );

  // 3. 분석 결과 보기
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility.showReport', async () => {
      await showAnalysisReport();
    })
  );

  // 4. 라벨 분석만 실행
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility.analyzeLabels', async () => {
      await analyzeLabelsOnly();
    })
  );

  // 5. React 앱 열기
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility.openReactApp', async () => {
      await openReactApp();
    })
  );

  // 6. 코드 제안 적용
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility.applyCodeSuggestion', async (data: any) => {
      await applyCodeSuggestion(data);
    })
  );

  // 7. 웹뷰 메시지 핸들러 등록
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility.handleWebviewMessage', async (message: any) => {
      if (message.command === 'flutter-accessibility.applyCodeSuggestion') {
        await applyCodeSuggestion(message.data);
      }
    })
  );
}

async function startAccessibilityAnalysis() {
  try {
    log('🔍 접근성 분석 시작...');
    
    // 1. 페르소나 수 입력받기
    const personaCount = await getPersonaCount();
    if (personaCount === undefined) {
      log('❌ 페르소나 수 입력이 취소되었습니다.');
      return;
    }
    
    log(`👥 페르소나 수: ${personaCount}명`);
    
    // 2. Flutter 앱 실행 (64022 포트)
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Flutter 앱 실행 중...',
      cancellable: false
    }, async () => {
      await flutterRunner.startFlutterApp();
    });

    // 3. 프로젝트 분석 (페르소나 수 포함)
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '프로젝트 분석 중...',
      cancellable: false
    }, async () => {
      currentAnalysis = await flutterAnalyzer.analyzeProject(personaCount);
    });

    // 4. 분석 결과를 JSON 파일로 저장
    if (currentAnalysis) {
      // JSON 파일을 React 앱으로 복사
      await copyJsonToReactApp();
      log('✅ 분석 결과가 JSON 파일로 저장되었습니다.');
    }

    // 5. React 앱 자동 열기
    await openReactApp();

    vscode.window.showInformationMessage('✅ 접근성 분석이 시작되었습니다!');
      
      } catch (error) {
    log(`❌ 접근성 분석 시작 실패: ${error}`);
    vscode.window.showErrorMessage(`접근성 분석 시작에 실패했습니다: ${error}`);
  }
}

async function analyzeLabelsOnly() {
  try {
    log('🔍 라벨 분석 시작...');
    
    // 1. 페르소나 수 입력받기
    const personaCount = await getPersonaCount();
    if (personaCount === undefined) {
      log('❌ 페르소나 수 입력이 취소되었습니다.');
      return;
    }
    
    log(`👥 페르소나 수: ${personaCount}명`);
    
    // 2. 프로젝트 분석 (라벨 JSON 포함)
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '라벨 분석 중...',
      cancellable: false
    }, async () => {
      currentAnalysis = await flutterAnalyzer.analyzeProject(personaCount);
    });

    // 3. 분석 결과를 HTTP API 서버를 통해 전송
    if (currentAnalysis && webSocketService) {
      webSocketService.updateData({
        labelAnalysis: currentAnalysis,
        timestamp: new Date().toISOString()
      });
      
      const message = `✅ 라벨 분석 완료!\n📊 총 ${currentAnalysis.totalClasses}개 클래스, ${currentAnalysis.totalWidgets}개 위젯 분석\n🌐 HTTP API 서버를 통해 데이터가 전송되었습니다.`;
      vscode.window.showInformationMessage(message);
    }
      
  } catch (error) {
    log(`❌ 라벨 분석 실패: ${error}`);
    vscode.window.showErrorMessage(`라벨 분석에 실패했습니다: ${error}`);
  }
}

async function getPersonaCount(): Promise<number | undefined> {
  const result = await vscode.window.showInputBox({
    prompt: '페르소나 수를 입력하세요 (1-10)',
    placeHolder: '3',
    value: '3',
    validateInput: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 1 || num > 10) {
        return '1-10 사이의 숫자를 입력해주세요.';
      }
      return null;
    }
  });

  return result ? parseInt(result) : undefined;
}

async function stopAccessibilityAnalysis() {
  try {
    log('🛑 접근성 분석 중지...');

    // Flutter 앱 종료
    if (flutterRunner) {
      await flutterRunner.stopFlutterApp();
    }

    vscode.window.showInformationMessage('✅ 접근성 분석이 중지되었습니다.');
      
    } catch (error) {
    log(`❌ 접근성 분석 중지 실패: ${error}`);
    vscode.window.showErrorMessage(`접근성 분석 중지에 실패했습니다: ${error}`);
  }
}

async function showAnalysisReport() {
  if (!currentAnalysis) {
    vscode.window.showWarningMessage('먼저 접근성 분석을 실행해주세요.');
    return;
  }

  try {
    // 분석 결과를 새 문서로 열기
    const reportContent = generateReportContent(currentAnalysis);
    const document = await vscode.workspace.openTextDocument({
      content: reportContent,
      language: 'markdown'
    });

    await vscode.window.showTextDocument(document);
    log('📋 분석 리포트 표시');

    } catch (error) {
    log(`❌ 리포트 표시 실패: ${error}`);
    vscode.window.showErrorMessage(`리포트 표시에 실패했습니다: ${error}`);
  }
}

async function openReactApp() {
  try {
    // React 앱이 실행 중인지 확인하고, 실행 중이 아니면 시작
    const reactAppUrl = 'http://localhost:3000';
    
    // React 앱 시작 (백그라운드에서)
    const reactProcess = spawn('npm', ['start'], {
      cwd: path.join(__dirname, '..', 'react-app'),
      detached: true,
      stdio: 'ignore'
    });
    
    // React 앱이 시작될 때까지 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // VS Code에서 웹뷰로 React 앱 열기
    const panel = vscode.window.createWebviewPanel(
      'flutterAccessibility',
      'Flutter Accessibility Checker',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    
    // React 앱 URL 설정 (웹뷰 내에서 iframe으로 로드)
    panel.webview.html = getWebviewContent(reactAppUrl);
    
    // 웹뷰 메시지 핸들러
    panel.webview.onDidReceiveMessage(
      async (message) => {
        log(`📨 웹뷰 메시지 수신: ${message.command}`);
        if (message.command === 'flutter-accessibility.applyCodeSuggestion') {
          log(`📝 코드 제안 적용 요청: ${JSON.stringify(message.data)}`);
          await applyCodeSuggestion(message.data);
        }
      }
    );
    
    log('✅ React 앱이 VS Code 웹뷰에서 열렸습니다.');
  } catch (error) {
    outputChannel.appendLine(`❌ React 앱 실행 실패: ${error}`);
    vscode.window.showErrorMessage('React 앱 실행에 실패했습니다.');
  }
}

function generateReportContent(analysis: ProjectAnalysis): string {
  const { accessibilityIssues, userJourneys } = analysis;
  
  const errorCount = accessibilityIssues.filter(i => i.severity === 'error').length;
  const warningCount = accessibilityIssues.filter(i => i.severity === 'warning').length;
  const infoCount = accessibilityIssues.filter(i => i.severity === 'info').length;

  return `# Flutter 접근성 분석 리포트

## 📊 요약
- **총 이슈**: ${accessibilityIssues.length}개
- **오류**: ${errorCount}개
- **경고**: ${warningCount}개
- **정보**: ${infoCount}개
- **분석된 클래스**: ${analysis.totalClasses}개
- **사용자 저니**: ${userJourneys.length}개

## 🚨 접근성 이슈

${accessibilityIssues.map(issue => `
### ${issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🟢'} ${issue.description}

- **파일**: \`${issue.file}:${issue.line}\`
- **타입**: ${issue.type}
- **요소**: ${issue.elementType}
- **제안 라벨**: ${issue.suggestedLabel || '없음'}

\`\`\`dart
// 현재 코드
// ${issue.suggestedCode || '코드 제안 없음'}

// 개선된 코드
${issue.suggestedCode || '코드 제안 없음'}
\`\`\`
`).join('\n')}

## 👥 사용자 저니

${userJourneys.map(journey => `
### ${journey.persona}

${journey.steps.map(step => `- **${step.action}**: ${step.target} → ${step.expected} ${step.issues.length > 0 ? '❌' : '✅'}`).join('\n')}
`).join('\n')}

---
*생성일: ${new Date().toLocaleString('ko-KR')}*
`;
}

async function applyCodeSuggestion(data: any) {
  try {
    const { file, line, originalCode, suggestedCode, issueId } = data;
    
    log(`📝 코드 제안 적용 시작: ${file}:${line}`);
    
    // 워크스페이스 확인
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('워크스페이스가 열려있지 않습니다.');
      return;
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const filePath = path.join(workspaceRoot, file);
    
    // 파일 존재 확인
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`파일을 찾을 수 없습니다: ${file}`);
      return;
    }
    
    // 파일 내용 읽기
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');
    
    // 라인 번호 확인
    if (line < 1 || line > lines.length) {
      vscode.window.showErrorMessage(`유효하지 않은 라인 번호: ${line}`);
      return;
    }
    
    // 백업 파일 생성
    const backupPath = `${filePath}.backup.${Date.now()}`;
    fs.writeFileSync(backupPath, lines.join('\n'));
    
    // 코드 수정 적용
    const suggestedLines = suggestedCode.split('\n');
    
    if (suggestedLines.length === 1) {
      // 단일 라인 수정
      lines[line - 1] = suggestedCode;
    } else {
      // 여러 라인 수정
      lines.splice(line - 1, 1, ...suggestedLines);
    }
    
    // 파일에 저장
    fs.writeFileSync(filePath, lines.join('\n'));
    
    // VS Code에서 파일 열기
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const editor = await vscode.window.showTextDocument(document);
    
    // 수정된 라인으로 스크롤
    const position = new vscode.Position(line - 1, 0);
    editor.revealRange(new vscode.Range(position, position));
    
    // diff 뷰 생성
    await showDiffView(filePath, backupPath, line);
    
    // 성공 메시지 표시
    vscode.window.showInformationMessage(
      `코드가 성공적으로 수정되었습니다! 라인 ${line}`,
      '변경사항 보기',
      '백업 파일 열기'
    ).then(selection => {
      if (selection === '변경사항 보기') {
        // diff 뷰가 이미 열려있으므로 포커스만 이동
        vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      } else if (selection === '백업 파일 열기') {
        // 백업 파일 열기
        vscode.workspace.openTextDocument(vscode.Uri.file(backupPath));
      }
    });
    
    log(`✅ 코드 수정 완료: ${file}:${line}`);
    
  } catch (error) {
    log(`❌ 코드 수정 실패: ${error}`);
    vscode.window.showErrorMessage(`코드 수정에 실패했습니다: ${error}`);
  }
}

async function showDiffView(filePath: string, backupPath: string, lineNumber: number): Promise<void> {
  try {
    // VS Code에서 diff 뷰 열기
    const originalUri = vscode.Uri.file(backupPath);
    const modifiedUri = vscode.Uri.file(filePath);
    
    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, 
      `접근성 개선 - ${path.basename(filePath)} (라인 ${lineNumber})`, 
      { preview: true }
    );
    
    log(`✅ diff 뷰 생성 완료: ${filePath}`);
  } catch (error) {
    log(`❌ diff 뷰 생성 실패: ${error}`);
  }
}

async function copyJsonToReactApp() {
  try {
    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const reactAppPublicPath = path.join(__dirname, '..', 'react-app', 'public');
    
    // React 앱의 public 폴더가 존재하는지 확인
    if (!fs.existsSync(reactAppPublicPath)) {
      log('⚠️ React 앱 public 폴더를 찾을 수 없습니다.');
      return;
    }
    
    // JSON 파일들을 복사
    const jsonFiles = ['accessibility-analysis.json', 'label-analysis.json'];
    let copiedCount = 0;
    
    for (const jsonFile of jsonFiles) {
      const sourcePath = path.join(workspaceRoot, jsonFile);
      const targetPath = path.join(reactAppPublicPath, jsonFile);
      
      if (fs.existsSync(sourcePath)) {
        try {
          const content = fs.readFileSync(sourcePath, 'utf8');
          fs.writeFileSync(targetPath, content, 'utf8');
          log(`✅ ${jsonFile}을 React 앱으로 복사했습니다.`);
          copiedCount++;
        } catch (copyError) {
          log(`❌ ${jsonFile} 복사 실패: ${copyError}`);
        }
      } else {
        log(`⚠️ ${jsonFile} 파일을 찾을 수 없습니다: ${sourcePath}`);
      }
    }
    
    if (copiedCount > 0) {
      log(`📊 총 ${copiedCount}개 JSON 파일이 React 앱으로 복사되었습니다.`);
    } else {
      log('⚠️ 복사할 JSON 파일이 없습니다. 먼저 접근성 분석을 실행해주세요.');
    }
    
  } catch (error) {
    log(`❌ JSON 파일 복사 실패: ${error}`);
  }
}

function getWebviewContent(reactAppUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flutter Accessibility Checker</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
    </style>
</head>
<body>
    <iframe src="${reactAppUrl}" allow="clipboard-read; clipboard-write"></iframe>
    <script>
        // VS Code API 초기화
        const vscode = acquireVsCodeApi();
        
        // iframe으로부터 메시지 수신 -> VS Code로 무조건 포워딩 (개발용, origin 체크 제거)
        window.addEventListener('message', (event) => {
            try {
                vscode.postMessage(event.data);
            } catch (err) {
                console.error('메시지 포워딩 실패:', err);
            }
        });
    </script>
</body>
</html>`;
}

function log(message: string) {
  outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

export async function deactivate() {
  log('🛑 확장 프로그램 비활성화...');
  
  // 모든 서비스 정리
  if (flutterRunner) {
    flutterRunner.stopFlutterApp();
  }
  
  if (webSocketService) {
    await webSocketService.stopServer();
  }
  
  // HTTP 서버는 더 이상 사용하지 않음
  
  log('✅ 확장 프로그램 정리 완료');
}