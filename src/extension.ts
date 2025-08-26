// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { FlutterAnalyzer } from './services/flutter-analyzer';
import { FlutterRunner } from './services/flutter-runner';
import { ScreenshotService } from './services/screenshot-service';
import { WebSocketService } from './services/websocket-service';
import { ProjectAnalysis } from './types/accessibility';

// 환경 변수 로드 (확장 프로그램 루트에서)
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// 상수
const OUTPUT_NAME = 'Flutter Accessibility Checker';
const WEBSOCKET_PORT = 3001;

// 전역 변수
let outputChannel: vscode.OutputChannel;
let flutterAnalyzer: FlutterAnalyzer;
let flutterRunner: FlutterRunner;
let screenshotService: ScreenshotService;
let websocketService: WebSocketService;
let currentAnalysis: ProjectAnalysis | null = null;

export function activate(context: vscode.ExtensionContext) {
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
  initializeServices(workspaceRoot);

  // 명령어 등록
  registerCommands(context);

  log('✅ 확장 프로그램 초기화 완료');
}

function initializeServices(workspaceRoot: string) {
  // Flutter 분석기 초기화
  flutterAnalyzer = new FlutterAnalyzer(workspaceRoot, outputChannel);
  
  // Flutter 실행기 초기화
  flutterRunner = new FlutterRunner(workspaceRoot, outputChannel);
  
  // WebSocket 서비스 초기화
  websocketService = new WebSocketService(WEBSOCKET_PORT, outputChannel);
  
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

  // 4. React 앱 열기
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility.openReactApp', async () => {
      await openReactApp();
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

    // 4. WebSocket 서버 시작
    await websocketService.start();

    // 5. 스크린샷 서비스 초기화
    const appUrl = 'http://localhost:64022';
    screenshotService = new ScreenshotService(appUrl, outputChannel);
    await screenshotService.initialize();

    // 6. 스크린샷 캡처 시작
    if (currentAnalysis) {
      await screenshotService.startScreenshotCapture(
        currentAnalysis.accessibilityIssues,
        (imageBase64, boundingBoxes) => {
          // 스크린샷 데이터를 React 앱으로 전송
          websocketService.sendScreenshot(imageBase64, boundingBoxes);
        }
      );

      // 7. 분석 결과를 React 앱으로 전송
      websocketService.sendProjectAnalysis(currentAnalysis);
      websocketService.sendAccessibilityIssues(currentAnalysis.accessibilityIssues);
    }

    // 8. React 앱 자동 열기
    await openReactApp();

    vscode.window.showInformationMessage('✅ 접근성 분석이 시작되었습니다!');
      
      } catch (error) {
    log(`❌ 접근성 분석 시작 실패: ${error}`);
    vscode.window.showErrorMessage(`접근성 분석 시작에 실패했습니다: ${error}`);
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

    // 스크린샷 서비스 정리
    if (screenshotService) {
      await screenshotService.stopScreenshotCapture();
      await screenshotService.cleanup();
    }

    // WebSocket 서비스 정리
    if (websocketService) {
      await websocketService.stop();
    }

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
    
    // 브라우저에서 React 앱 열기
    await vscode.env.openExternal(vscode.Uri.parse(reactAppUrl));
    
    outputChannel.appendLine('✅ React 앱이 브라우저에서 열렸습니다.');
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

function log(message: string) {
  outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

export function deactivate() {
  log('🛑 확장 프로그램 비활성화...');
  
  // 모든 서비스 정리
  if (screenshotService) {
    screenshotService.cleanup();
  }
  
  if (websocketService) {
    websocketService.stop();
  }
  
  if (flutterRunner) {
    flutterRunner.stopFlutterApp();
  }
  
  log('✅ 확장 프로그램 정리 완료');
}