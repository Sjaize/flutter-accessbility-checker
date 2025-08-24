import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';

// ✅ 먼저 선언: 외부 브라우저에서 React 서버 확인용
async function waitForReactServer(url: string, timeout = 10000): Promise<boolean> {
  const start = Date.now();
  return new Promise(resolve => {
    const check = () => {
      http.get(url, res => {
        if (res.statusCode === 200) resolve(true);
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 500);
    };
    check();
  });
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'flutter-accessibility-checker.openPanel',
    async () => {
      const choice = await vscode.window.showQuickPick(
        ['\ud83d\udce6 VS Code \ub0b4\uc5d0\uc11c \uc5f4\uae30 (\uc6f9\ubdf0)', '\ud83c\udf10 \uc678\ubd80 \ube0c\ub77c\uc6b0\uc800\uc5d0\uc11c \uc5f4\uae30'],
        { placeHolder: 'Flutter \ud654\uba74\uc744 \uc5b4\ub290 \uac70\uc5d0\uc11c \uc5f4\uae30\ub824\uace0 \ud558\uc2dc\ub098\uc694?' }
      );

      if (choice === '\ud83d\udce6 VS Code \ub0b4\uc5d0\uc11c \uc5f4\uae30 (\uc6f9\ubdf0)') {
        const panel = vscode.window.createWebviewPanel(
          'flutterAccessibilityChecker',
          'Flutter Accessibility Checker',
          vscode.ViewColumn.One,
          { enableScripts: true }
        );
        panel.webview.html = getWebviewContent();
      } else if (choice === '\ud83c\udf10 \uc678\ubd80 \ube0c\ub77c\uc6b0\uc800\uc5d0\uc11c \uc5f4\uae30') {
        // 현재 열린 Flutter 프로젝트 경로 찾기
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let flutterProjectPath = null;
        
        if (workspaceFolders && workspaceFolders.length > 0) {
          // 첫 번째 워크스페이스에서 Flutter 프로젝트 찾기
          for (const folder of workspaceFolders) {
            const pubspecPath = path.join(folder.uri.fsPath, 'pubspec.yaml');
            if (fs.existsSync(pubspecPath)) {
              flutterProjectPath = folder.uri.fsPath;
              break;
            }
          }
        }
        
        if (!flutterProjectPath) {
          vscode.window.showErrorMessage('Flutter 프로젝트를 찾을 수 없습니다. pubspec.yaml 파일이 있는 디렉토리를 열어주세요.');
          return;
        }
        
        vscode.window.showInformationMessage(`Flutter 프로젝트 발견: ${flutterProjectPath}`);
        
        // 백엔드 서버 시작
        const serverPath = context.extensionPath;
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: '백엔드 서버 및 Flutter 앱 시작 중...',
          cancellable: false
        }, async () => {
          const isWin = process.platform === 'win32';
          const startCmd = isWin
            ? 'npm start'
            : 'npm start';

          // 백엔드 서버 터미널
          const serverTerminal = vscode.window.createTerminal({
            name: 'Backend Server',
            cwd: serverPath,
            env: process.env
          });

          serverTerminal.sendText(startCmd);
          serverTerminal.show();

          // 백엔드 서버 대기
          const isBackendReady = await waitForReactServer('http://localhost:3001');
          if (isBackendReady) {
            vscode.window.showInformationMessage('✅ 백엔드 서버가 시작되었습니다.');
            
            // Flutter 앱 실행 터미널
            const flutterTerminal = vscode.window.createTerminal({
              name: 'Flutter App',
              cwd: flutterProjectPath,
              env: process.env
            });

            const flutterCmd = `flutter run -d web-server --web-port=60778`;
            flutterTerminal.sendText(flutterCmd);
            flutterTerminal.show();
            
            vscode.window.showInformationMessage('🚀 Flutter 앱을 시작하고 있습니다...');
            
            // 브라우저에서 React 앱 열기
            setTimeout(() => {
              vscode.env.openExternal(vscode.Uri.parse('http://localhost:3001'));
              vscode.window.showInformationMessage('🌐 브라우저가 열렸습니다. Flutter 앱이 로드되면 자동으로 분석이 시작됩니다!');
            }, 3000);
            
          } else {
            vscode.window.showErrorMessage('\u274c 백엔드 서버가 응답하지 않습니다.');
          }
        });
      }
    }
  );

  context.subscriptions.push(disposable);
}

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>Flutter Accessibility Checker</title>
  <style>
    * {
      box-sizing: border-box;
      font-family: sans-serif;
    }
    body {
      margin: 0;
      background: #f9fafb;
    }
    .container {
      display: flex;
      height: 100vh;
      padding: 24px 48px;
      gap: 40px;
      justify-content: center;
    }
    .frame {
      position: relative;
      width: 395px;
      height: 832px;
      border-radius: 2.5rem;
      background: #1f2937;
      padding: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      flex-shrink: 0;
    }
    .screen {
      width: 100%;
      height: 100%;
      border-radius: 2rem;
      overflow: hidden;
      background: white;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .sidebar {
      flex: 1;
      background: white;
      border-radius: 1rem;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      overflow-y: auto;
      max-height: 100%;
    }
    .sidebar h2 {
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
    }
    .issue-box {
      border-left: 4px solid;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      font-size: 0.85rem;
    }
    .error { border-color: #dc2626; background: #fee2e2; }
    .warning { border-color: #ca8a04; background: #fef9c3; }
    .info { border-color: #2563eb; background: #dbeafe; }
    .issue-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .tag {
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 8px;
    }
    .error .tag { background: #fecaca; color: #7f1d1d; }
    .warning .tag { background: #fef08a; color: #78350f; }
    .info .tag { background: #bfdbfe; color: #1e3a8a; }
    .suggestion {
      font-size: 0.75rem;
      color: #374151;
      margin-top: 6px;
    }
    .btn-row {
      display: flex;
      gap: 6px;
      margin-top: 10px;
    }
    .btn {
      font-size: 0.7rem;
      padding: 4px 8px;
      border-radius: 6px;
      color: white;
      border: none;
      cursor: pointer;
    }
    .btn.accept { background: #16a34a; }
    .btn.discuss { background: #2563eb; }
    .btn.ignore { background: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="frame">
      <div class="screen">
        <iframe src="http://localhost:60778" title="Flutter Web App"></iframe>
      </div>
    </div>

    <div class="sidebar">
      <h2>접근성 평가 정보</h2>
      <p style="font-size: 0.75rem; color: #6b7280;">
        Flutter 앱에 대한 접근성 평가 결과가 여기에 표시됩니다.
      </p>

      <div class="issue-box error">
        <div class="issue-title">
          이미지 대체 텍스트 누락
          <span class="tag">오류</span>
        </div>
        <div class="suggestion">전통 한복 인물 이미지에 대한 대체 텍스트가 없습니다.</div>
        <div class="btn-row">
          <button class="btn accept">수락</button>
          <button class="btn discuss">논의</button>
          <button class="btn ignore">무시</button>
        </div>
      </div>

      <div class="issue-box warning">
        <div class="issue-title">
          버튼 터치 영역 부족
          <span class="tag">경고</span>
        </div>
        <div class="suggestion">"지금 시작하기" 버튼의 터치 영역이 44x44dp 미만입니다.</div>
        <div class="btn-row">
          <button class="btn accept">수락</button>
          <button class="btn discuss">논의</button>
          <button class="btn ignore">무시</button>
        </div>
      </div>

      <div class="issue-box info">
        <div class="issue-title">
          제목 텍스트 대비 개선
          <span class="tag">정보</span>
        </div>
        <div class="suggestion">"나랏말싸미" 텍스트의 색상 대비를 개선할 수 있습니다.</div>
        <div class="btn-row">
          <button class="btn accept">수락</button>
          <button class="btn discuss">논의</button>
          <button class="btn ignore">무시</button>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function deactivate() {}