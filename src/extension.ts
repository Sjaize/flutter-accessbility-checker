import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';

const PREVIEW_SCHEME = 'flutter-accessibility-preview';

// 지정된 URL이 200 OK를 반환할 때까지 0.5초 폴링
async function waitForServer(url: string, timeout = 30000): Promise<boolean> {
  const start = Date.now();
  return new Promise<boolean>(resolve => {
    const check = () => {
      http
        .get(url, res => {
          if (res.statusCode === 200) return resolve(true);
          retry();
        })
        .on('error', retry);
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
  // ① preview 전용 ContentProvider 등록
  // ────────────────────────────────────────────────────────────
  const provider: vscode.TextDocumentContentProvider = {
    async provideTextDocumentContent(uri: vscode.Uri) {
      const params   = new URLSearchParams(uri.query);
      const file     = params.get('file')!;
      const line     = Number(params.get('line')) - 1;
      const column   = Number(params.get('column')) - 1;
      const text     = params.get('text')!;
      const filePath = path.join(vscode.workspace.rootPath || '', file);
      const doc      = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const lines    = doc.getText().split(/\r?\n/);
      lines[line]    = lines[line].slice(0, column) + text + lines[line].slice(column);
      return lines.join('\n');
    }
  };
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, provider)
  );

  // ────────────────────────────────────────────────────────────
  // ➊ previewSuggestion URI 처리 (diff 모드만 띄우기)
  // ────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        if (uri.path !== '/previewSuggestion') return;
        const params     = new URLSearchParams(uri.query);
        const file       = params.get('file')!;
        const previewUri = vscode.Uri.parse(`${PREVIEW_SCHEME}://${file}?${uri.query}`);
        const actualUri  = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', file));
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
  // ➋ “Open Flutter Accessibility Checker” 커맨드 등록
  // ────────────────────────────────────────────────────────────
  const disposable = vscode.commands.registerCommand(
    'flutter-accessibility-checker.openPanel',
    async () => {
      const choice = await vscode.window.showQuickPick(
        [
          '📦 VS Code 내에서 열기 (웹뷰)',
          '🌐 외부 브라우저에서 열기 (Recommended)'
        ],
        { placeHolder: 'Flutter 화면을 어디에서 열까요?' }
      );
      const workspaceRoot = vscode.workspace.rootPath!;
      const reactAppPath  = path.join(context.extensionPath, 'react-app');

      if (!choice) {
        return;
      }

      if (choice.startsWith('📦')) {
        // (기존) 웹뷰 패널 열기
        const panel = vscode.window.createWebviewPanel(
          'flutterAccessibilityChecker',
          'Flutter Accessibility Checker',
          vscode.ViewColumn.One,
          { enableScripts: true }
        );
        panel.webview.html = getWebviewContent();

      } else {
        // concurrently + wait-on을 사용한 순차 실행
        const terminal = vscode.window.createTerminal({
          name: 'Flutter + React (순차 실행)',
          cwd: workspaceRoot,
          env: process.env
        });

        // concurrently로 Flutter 서버와 React 서버를 순차 실행 (지연 방식)
        const cmd = process.platform === 'win32'
          ? `npx concurrently ` +
            `"cd /d ${workspaceRoot} && flutter run -d web-server --web-port=60778 --web-hostname=localhost --device-vmservice-port=8181" ` +
            `"timeout /t 8 && cd /d ${reactAppPath} && set BROWSER=none&& npm start"`
          : `npx concurrently ` +
            `"cd ${workspaceRoot} && flutter run -d web-server --web-port=60778 --web-hostname=localhost --device-vmservice-port=8181" ` +
            `"sleep 8 && cd ${reactAppPath} && BROWSER=none npm start"`;

        terminal.sendText(cmd);
        terminal.show();

        // React 서버가 준비될 때까지 대기 후 브라우저 오픈
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "서버 시작 중...",
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: "Flutter 서버 대기 중..." });
          
          // Flutter 서버 준비 대기
          const flutterOk = await waitForServer('http://localhost:60778');
          if (flutterOk) {
            progress.report({ increment: 50, message: "React 서버 대기 중..." });
            
            // React 서버 준비 대기
            const reactOk = await waitForServer('http://localhost:3000');
            if (reactOk) {
              progress.report({ increment: 100, message: "서버 준비 완료!" });
              
              // 프로젝트 구조 정보를 React 앱에 전달
              await sendProjectStructure(workspaceRoot);
              
              // 프로젝트 경로를 React 앱에 전달
              await sendProjectPath(workspaceRoot);
              
              await vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
            } else {
              vscode.window.showErrorMessage('❌ React 개발 서버가 응답하지 않습니다.');
            }
          } else {
            vscode.window.showErrorMessage('❌ Flutter 서버가 응답하지 않습니다.');
          }
        });
      }
    }
  );
  context.subscriptions.push(disposable);
}

async function sendProjectStructure(workspaceRoot: string): Promise<void> {
  try {
    // 프로젝트 구조 분석
    const projectTree = await getProjectTree(workspaceRoot);
    const dartFiles = await findDartFiles(workspaceRoot);
    
    // React 앱에 프로젝트 정보 전달
    const response = await fetch('http://localhost:3000/api/project-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspacePath: workspaceRoot,
        projectTree,
        dartFiles
      })
    });
    
    if (!response.ok) {
      console.warn('프로젝트 정보 전달 실패');
    }
  } catch (error) {
    console.error('프로젝트 구조 분석 실패:', error);
  }
}

async function getProjectTree(workspaceRoot: string): Promise<string> {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  try {
    const { stdout } = await execAsync(`tree -I node_modules ${workspaceRoot}`, { maxBuffer: 1024 * 1024 });
    return stdout;
  } catch (error) {
    console.warn('Tree 명령어 실행 실패, 기본 구조 사용');
    return `
.
├── lib/
│   ├── main.dart
│   ├── screens/
│   └── widgets/
├── assets/
├── test/
└── pubspec.yaml
    `.trim();
  }
}

async function findDartFiles(workspaceRoot: string): Promise<string[]> {
  const fs = require('fs').promises;
  const path = require('path');
  
  const dartFiles: string[] = [];
  
  async function scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.dart')) {
          dartFiles.push(path.relative(workspaceRoot, fullPath));
        }
      }
    } catch (error) {
      console.warn(`디렉토리 스캔 실패: ${dir}`, error);
    }
  }
  
  await scanDirectory(workspaceRoot);
  return dartFiles;
}

async function sendProjectPath(workspaceRoot: string): Promise<void> {
  try {
    // React 앱에 프로젝트 경로 전달
    const response = await fetch('http://localhost:3000/api/project-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: workspaceRoot })
    });
    
    if (!response.ok) {
      console.warn('프로젝트 경로 전달 실패');
    }
  } catch (error) {
    console.error('프로젝트 경로 전달 실패:', error);
  }
}

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"/><title>Flutter Accessibility Checker</title></head>
<body>
  <iframe
    src="http://localhost:60778"
    style="width:100%;height:100%;border:none;"
  ></iframe>
</body>
</html>`;
}

export function deactivate() {}