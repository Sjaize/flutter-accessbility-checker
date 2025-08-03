import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';

const PREVIEW_SCHEME = 'flutter-accessibility-preview';

// React 서버 기동 대기 유틸 (기존 그대로)
async function waitForReactServer(url: string, timeout = 10000): Promise<boolean> {
  const start = Date.now();
  return new Promise(resolve => {
    const check = () => {
      http.get(url, res => {
        if (res.statusCode === 200) return resolve(true);
        retry();
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
  // ────────────────────────────────────────────────────────────
  // ① 미리보기 전용 ContentProvider 등록
  // ────────────────────────────────────────────────────────────
  const provider: vscode.TextDocumentContentProvider = {
    async provideTextDocumentContent(uri: vscode.Uri) {
      // 쿼리 파싱
      const params = new URLSearchParams(uri.query);
      const file  = params.get('file')!;
      const line  = Number(params.get('line')) - 1;
      const col   = Number(params.get('column')) - 1;
      const text  = params.get('text')!;

      // 실제 파일 로드 & 한 줄 삽입
      const filePath = path.join(vscode.workspace.rootPath || '', file);
      const doc      = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const lines    = doc.getText().split(/\r?\n/);
      lines[line]    = lines[line].slice(0, col) + text + lines[line].slice(col);

      return lines.join('\n');
    }
  };
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, provider)
  );

  // ────────────────────────────────────────────────────────────
  // ➊ React 브라우저(UI) 쪽에서 날리는 previewSuggestion URI 처리
  // ────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        if (uri.path !== '/previewSuggestion') {
          return;
        }

        // 쿼리에서 file 정보 꺼내기
        const params     = new URLSearchParams(uri.query);
        const file       = params.get('file')!;
        const previewUri = vscode.Uri.parse(
          `${PREVIEW_SCHEME}://${file}?${uri.query}`
        );
        const actualUri  = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', file));

        // Diff 뷰어로만 열기
        await vscode.commands.executeCommand(
          'vscode.diff',
          previewUri,
          actualUri,
          `Preview: ${path.basename(file)}`,
          { preview: true }
        );
      }
    })
  );

  // ────────────────────────────────────────────────────────────
  // ➋ “Open Flutter Accessibility Checker” 커맨드 등록 (기존 로직 유지)
  // ────────────────────────────────────────────────────────────
  const disposable = vscode.commands.registerCommand(
    'flutter-accessibility-checker.openPanel',
    async () => {
      const choice = await vscode.window.showQuickPick(
        ['📦 VS Code 내에서 열기 (웹뷰)', '🌐 외부 브라우저에서 열기'],
        { placeHolder: 'Flutter 화면을 어디에서 열까요?' }
      );

      if (choice?.startsWith('📦')) {
        // 웹뷰 패널 열기
        const panel = vscode.window.createWebviewPanel(
          'flutterAccessibilityChecker',
          'Flutter Accessibility Checker',
          vscode.ViewColumn.One,
          { enableScripts: true }
        );
        panel.webview.html = getWebviewContent();

      } else if (choice?.startsWith('🌐')) {
        // 외부 React 서버 실행 + 브라우저 열기
        const reactAppPath = path.join(context.extensionPath, 'react-app');
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'React UI 실행 중...',
          cancellable: false
        }, async () => {
          const isWin = process.platform === 'win32';
          const startCmd = isWin
            ? 'set BROWSER=none && npm start'
            : 'BROWSER=none npm start';
          const terminal = vscode.window.createTerminal({
            name: 'React Dev Server',
            cwd: reactAppPath,
            env: process.env
          });
          terminal.sendText(startCmd);
          terminal.show();

          const ok = await waitForReactServer('http://localhost:3000');
          if (ok) {
            vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
          } else {
            vscode.window.showErrorMessage('❌ React 서버가 응답하지 않습니다.');
          }
        });
      }
    }
  );
  context.subscriptions.push(disposable);
}

//────────────────────────────────────────────────────────────────
// 기존에 쓰던 getWebviewContent() 함수도 그대로 유지하세요
//────────────────────────────────────────────────────────────────
function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"/><title>Flutter Accessibility Checker</title>
<style>
  /* … CSS 생략 … */
</style>
</head>
<body>
  <div class="container">
    <div class="frame"><div class="screen">
      <iframe
        src="http://localhost:60778"
        title="Flutter Web App"
        style="width:100%;height:100%;border:none;"
      ></iframe>
    </div></div>
    <div class="sidebar">
      <!-- … 하드코딩된 이슈 박스들 … -->
    </div>
  </div>
</body>
</html>`;
}

export function deactivate() {}