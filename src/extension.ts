// extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import {
  exec as _exec,
  spawn,
  ExecOptions,
  ExecOptionsWithStringEncoding,
  ChildProcessWithoutNullStreams,
} from 'child_process';
import { SemanticsService } from './semantics-service';

// ─────────────────────────────────────────────
// 상수/채널
// ─────────────────────────────────────────────
const PREVIEW_SCHEME = 'flutter-accessibility-preview';
const OUTPUT_NAME = 'Flutter Accessibility Checker';

let out: vscode.OutputChannel | null = null;
let semantics: SemanticsService | null = null;
let flutterProc: ChildProcessWithoutNullStreams | null = null;

function log(msg: string) {
  if (!out) out = vscode.window.createOutputChannel(OUTPUT_NAME);
  out.appendLine(msg);
}
function showAndLog(msg: string) {
  log(msg);
  out?.show(true);
}

// ─────────────────────────────────────────────
// 작은 유틸
// ─────────────────────────────────────────────
const execPromise = (cmd: string, opt: ExecOptions = {}) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const options = {
      ...(opt as ExecOptions),
      encoding: 'utf8' as BufferEncoding,
      maxBuffer: 1024 * 1024,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
    } as ExecOptionsWithStringEncoding;

    _exec(cmd, options, (e, stdout, stderr) => {
      if (e) return reject(e);
      resolve({ stdout, stderr });
    });
  });

// Flutter 실행 파일 경로 결정 (설정 → ENV → PATH 순)
function getFlutterExePath(): string {
  // Try VS Code Dart extension setting first
  const cfg = vscode.workspace.getConfiguration('dart');
  const sdkPath = cfg.get<string>('flutterSdkPath');

  // Explicit env var override
  const envBin = process.env.FLUTTER_BIN;
  if (envBin && envBin.trim()) return envBin;

  if (sdkPath && sdkPath.trim()) {
    const exe = process.platform === 'win32' ? 'flutter.bat' : 'flutter';
    return path.join(sdkPath, 'bin', exe);
  }
  return process.platform === 'win32' ? 'flutter.bat' : 'flutter';
}

// 공백/따옴표가 있는 경로 안전 인용
function q(p: string) {
  return /["\s]/.test(p) ? `"${p}"` : p;
}

async function waitForServer(url: string, timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  return new Promise<boolean>((resolve) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) return resolve(true);
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tryOnce, 500);
    };
    tryOnce();
  });
}

// ─────────────────────────────────────────────
type DeviceRow = {
  id: string;
  name: string;
  platform: string;
  category?: string;
  emulator?: boolean;
};
type EmulatorDef = { id: string; platform: string };

async function fetchRunningEmulators(): Promise<DeviceRow[]> {
  try {
    const { stdout } = await execPromise(`${q(getFlutterExePath())} devices --machine`);
    const list = JSON.parse(stdout) as DeviceRow[];
    return list.filter((d) => {
      const plat = String(d.platform || '').toLowerCase();
      const cat = String(d.category || '').toLowerCase();
      const isWebOrDesktop =
        cat === 'web' || cat === 'desktop' ||
        plat.includes('web') || plat.includes('mac') || plat.includes('windows') || plat.includes('linux');
      if (isWebOrDesktop) return false;

      const looksLikeEmu =
        d.emulator === true ||
        (typeof d.id === 'string' && d.id.startsWith('emulator-'));
      return looksLikeEmu;
    });
  } catch {
    const { stdout } = await execPromise(`${q(getFlutterExePath())} devices`);
    const lines = stdout.split(/\r?\n/);
    const rx =
      /^\s*(.+?)\s+\((mobile|web|desktop)\)\s+•\s+([A-Za-z0-9\-.:_]+)\s+•\s+android/i;

    const rows: DeviceRow[] = [];
    for (const line of lines) {
      const m = line.match(rx);
      if (!m) continue;
      const name = m[1];
      const category = m[2];
      const id = m[3];
      const platform = m[4].toLowerCase();
      if (category === 'web' || category === 'desktop') continue;
      rows.push({ id, name, platform, emulator: true });
    }
    return rows;
  }
}

async function fetchInstalledEmulators(): Promise<EmulatorDef[]> {
  const { stdout } = await execPromise(`${q(getFlutterExePath())} emulators`);
  const lines = stdout.split(/\r?\n/);
  const rx = /^\s*([A-Za-z0-9._-]+)\s+•\s+.+?\s+•\s+.+?\s+•\s+android\s*$/i;
  return lines
    .map((l) => l.match(rx))
    .filter(Boolean)
    .map((m) => ({ id: m![1], platform: (m![2] || '').toLowerCase() }));
}

async function pickInstalledAndLaunch(): Promise<string | undefined> {
  let emus: EmulatorDef[] = [];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '설치된 에뮬레이터 목록을 가져오는 중…', cancellable: false },
    async () => { emus = await fetchInstalledEmulators(); }
  );
  if (emus.length === 0) {
    vscode.window.showErrorMessage('설치된 에뮬레이터가 없습니다. Android Studio 또는 Xcode에서 먼저 생성해 주세요.');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    emus.map((e) => ({ label: e.id, description: e.platform })),
    { placeHolder: '부팅할 에뮬레이터를 선택하세요' }
  );
  if (!picked) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `에뮬레이터 실행 중: ${picked.label}`, cancellable: false },
    async () => { await execPromise(`flutter emulators --launch ${picked.label}`); }
  );

  return picked.label;
}

async function waitEmulatorAppear(timeoutMs = 45000, intervalMs = 1200): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = await fetchRunningEmulators();
    if (list.length > 0) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ⬇️ 변경: id만 반환하던 함수를 전체 DeviceRow 반환으로
async function pickRunningEmulator(): Promise<DeviceRow | undefined> {
  let running: DeviceRow[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '연결 가능한 에뮬레이터 목록을 가져오는 중…',
      cancellable: false,
    },
    async () => { running = await fetchRunningEmulators(); }
  );

  if (running.length === 0) {
    const btn = await vscode.window.showInformationMessage(
      '현재 연결 가능한 에뮬레이터가 없습니다.',
      '실행 가능한 목록 가져오기'
    );
    if (btn !== '실행 가능한 목록 가져오기') return;

    const pickedToLaunch = await pickInstalledAndLaunch();
    if (!pickedToLaunch) return;

    let ok = false;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '에뮬레이터 부팅 확인 중…', cancellable: false },
      async () => { ok = await waitEmulatorAppear(45000, 1200); }
    );
    if (!ok) {
      vscode.window.showWarningMessage('에뮬레이터 부팅 대기 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    return await pickRunningEmulator();
  }

  const picked = await vscode.window.showQuickPick(
    running.map((d) => ({
      label: d.id,
      description: `${d.name} • ${d.platform}`,
      // QuickPickItem에는 임의 필드가 없어서 as any로 보관
      // 선택 후 아래서 (picked as any).device 로 꺼냅니다.
      device: d as any,
    }) as any),
    {
      placeHolder: '연결할 에뮬레이터를 선택하세요',
      matchOnDescription: true,
      ignoreFocusOut: true,
    }
  );

  return (picked as any)?.device as DeviceRow | undefined;
}

// ─────────────────────────────────────────────
// VM Service URL 파싱
// ─────────────────────────────────────────────
function normalizeVmWs(u: string): string {
  if (!/\/ws$/.test(u)) return u.endsWith('/') ? u + 'ws' : u + '/ws';
  return u;
}
function tryExtractVmServiceUrl(line: string): string | null {
  const mWs = line.match(/ws:\/\/[^\s'"<>]+/);
  if (mWs?.[0]) return normalizeVmWs(mWs[0]);

  const mHttp = line.match(/http:\/\/[^\s'"<>]+/);
  if (mHttp?.[0]) return normalizeVmWs(mHttp[0].replace(/^http:/, 'ws:'));

  const mUri = line.match(/[?&]uri=([^ \t\r\n]+)/);
  if (mUri?.[1]) {
    try {
      const decoded = decodeURIComponent(mUri[1]);
      if (decoded.startsWith('ws://') || decoded.startsWith('wss://')) {
        return normalizeVmWs(decoded);
      }
    } catch {}
  }
  return null;
}

async function runFlutterAndGetVmService(emulatorId: string, cwd: string): Promise<string> {
  if (flutterProc) { try { flutterProc.kill(); } catch {} }
  if (!out) out = vscode.window.createOutputChannel(OUTPUT_NAME);

  out.clear();
  out.show(true);

  const args = [
    'run',
    '-d', emulatorId,
    '--debug',
    '--track-widget-creation', // ✅ Semantics 소스 매핑에 중요
  ];
  showAndLog(`[Flutter] run ${args.join(' ')}`);

  const flutterExe = getFlutterExePath();
  const isWin = process.platform === 'win32';

  if (isWin) {
    // Windows: 실행 시 UTF-8 강제(chcp 65001) + .bat를 shell로 실행
    const cmdLine = `chcp 65001>nul && ${q(flutterExe)} ${args.join(' ')}`;
    flutterProc = spawn(cmdLine, {
      cwd,
      env: process.env,
      windowsHide: true,
      shell: true,
    });
  } else {
    // POSIX: 기존 방식 유지
    flutterProc = spawn(flutterExe, args, { cwd, env: process.env });
  }

  let vmUrl = '';
  await new Promise<void>((resolve) => {
    const onLine = (buf: Buffer) => {
      const text = buf.toString('utf8');
      out!.append(text);
      for (const line of text.split(/\r?\n/)) {
        const url = tryExtractVmServiceUrl(line);
        if (!vmUrl && url) { vmUrl = url; resolve(); }
      }
    };
    flutterProc!.stdout.on('data', onLine);
    flutterProc!.stderr.on('data', onLine);
    flutterProc!.on('close', (code) => {
      if (!vmUrl) showAndLog(`[Flutter] run 종료(code=${code}) – VM Service URI 미획득`);
    });
  });

  if (!vmUrl) throw new Error('VM Service URL을 로그에서 찾지 못했습니다.');
  log(`[Flutter] VM Service: ${vmUrl}`);
  return vmUrl;
}

// ─────────────────────────────────────────────
// Diff 미리보기 provider
// ─────────────────────────────────────────────
const previewProvider: vscode.TextDocumentContentProvider = {
  async provideTextDocumentContent(uri: vscode.Uri) {
    console.log(`[PreviewProvider] URI: ${uri.toString()}`);
    console.log(`[PreviewProvider] Query: ${uri.query}`);
    
    const params = new URLSearchParams(uri.query);
    const file = params.get('file')!;
    const line = Math.max(0, Number(params.get('line')) - 1);
    const column = Math.max(0, Number(params.get('column')) - 1);
    const text = params.get('text') || '';
    const startLine = params.get('startLine') ? Math.max(0, Number(params.get('startLine')) - 1) : line;
    const endLine = params.get('endLine') ? Math.max(0, Number(params.get('endLine')) - 1) : line;
    
    console.log('[PreviewProvider] Parsed params:', { file, line: line + 1, column: column + 1, startLine: startLine + 1, endLine: endLine + 1, text: text.substring(0, 100) });

    const wsFolders = vscode.workspace.workspaceFolders;
    const base = wsFolders && wsFolders.length > 0 ? wsFolders[0].uri.fsPath : (vscode.workspace.rootPath || '');
    const filePath = path.isAbsolute(file) ? file : path.join(base, file);

    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const lines = doc.getText().split(/\r?\n/);

      if (startLine < lines.length && endLine < lines.length) {
        // JSON에서 newCode만 추출
        let codeToInsert = text;
        if (text.includes('"newCode"')) {
          const jsonMatch = text.match(/"newCode":\s*"([^"]*(?:\\.[^"]*)*)"/);
          if (jsonMatch) {
            codeToInsert = jsonMatch[1].replace(/\\n/g, '\n');
            console.log('[Preview] Extracted newCode from JSON');
          }
        }
        
        // startLine부터 endLine까지의 코드를 newCode로 완전히 대체
        const codeLines = codeToInsert.split('\n');
        
        // 기존 범위 제거 (startLine부터 endLine까지)
        lines.splice(startLine, endLine - startLine + 1);
        
        // newCode 삽입
        lines.splice(startLine, 0, ...codeLines);
        
        console.log('[Preview] Code structure:', {
          startLine: startLine + 1,
          endLine: endLine + 1,
          replacedLines: endLine - startLine + 1,
          insertedLines: codeLines.length,
          firstLine: codeLines[0].substring(0, 50),
          totalLines: lines.length
        });
        
        console.log('[Preview] Code replaced from line', startLine + 1, 'to', endLine + 1, 'with', codeLines.length, 'lines');
        console.log('[Preview] Replaced text:', codeToInsert.substring(0, 50) + '...');
        
        // 코드 대체 완료 - 포맷팅은 VS Code가 자동으로 처리
        console.log('[Preview] Code replacement completed');
      }

      return lines.join('\n');
    } catch (error) {
      console.error(`[PreviewProvider] Error loading file: ${error}`);
      return `Error loading file: ${error}`;
    }
  },
};

// ─────────────────────────────────────────────
// activate / deactivate
// ─────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext) {
  out = vscode.window.createOutputChannel(OUTPUT_NAME);

  // diff 문서 스킴/핸들러 등록
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, previewProvider)
  );

  // 첫 번째 URI handler 제거됨 (중복 방지)

  // 메인 명령: 패널 열기
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility-checker.openPanel', async () => {
      try {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (!wsFolders || wsFolders.length === 0) {
          vscode.window.showErrorMessage('먼저 Flutter 프로젝트가 열려 있어야 합니다.');
          return;
        }
        const workspaceRoot = wsFolders[0].uri.fsPath;

        // 1) 에뮬레이터 선택(필요시 부팅)
        const device = await pickRunningEmulator(); // ⬅️ 변경: DeviceRow 반환
        if (!device) return;

        // 2) flutter run + VM URL 획득
        const vmWsUrl = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Flutter 실행 중…', cancellable: false },
          async () => await runFlutterAndGetVmService(device.id, workspaceRoot)
        );

        // 3) SemanticsService 시작 (pubRootDirectories 등록)
        try {
          if (semantics) { try { semantics.dispose(); } catch {} }
          // 플랫폼 판별을 ID 문자열 대신 device.platform으로
          const plat = (device.platform || '').toLowerCase();
          const platform: 'android' | 'unknown' =
            plat.includes('android') ? 'android' : 'unknown';

          const pubRoots = wsFolders.map(f => f.uri.fsPath);

          semantics = new SemanticsService({
            port: 3001,
            platform,
            deviceId: device.id,
            pubRootDirs: pubRoots,
          });
          await semantics.start(vmWsUrl);
          vscode.window.showInformationMessage('🔍 실시간 접근성 모니터링이 시작되었습니다.');
        } catch (e: any) {
          vscode.window.showWarningMessage(`VM Service 연결 실패: ${e?.message ?? e}`);
        }

        // 4) React 대시보드 실행 + 자동 오픈
        const reactAppPath = path.join(context.extensionPath, 'react-app');
        const term = vscode.window.createTerminal({
          name: 'React Dashboard',
          cwd: reactAppPath,
          env: { ...process.env, BROWSER: 'none' },
        });
        term.show();
        term.sendText('npm start');

        const ok = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '대시보드 준비 중…', cancellable: false },
          async () => await waitForServer('http://localhost:3000', 120000)
        );
        if (ok) await vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
        else vscode.window.showWarningMessage('React 대시보드가 응답하지 않습니다 (포트 3000).');
      } catch (err: any) {
        showAndLog(`[OpenPanel] 실패: ${err?.message || err}`);
        vscode.window.showErrorMessage('패널 열기에 실패했습니다. 출력 창 로그를 확인해 주세요.');
      }
    })
  );

  // 보조 명령: 세션 중지
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility-checker.stop', async () => {
      try {
        semantics?.dispose();
        semantics = null;
        if (flutterProc) { try { flutterProc.kill(); } catch {} }
        flutterProc = null;
        vscode.window.showInformationMessage('모니터링을 중지했습니다.');
      } catch {}
    })
  );

  // ──────────────────────────────────────────────────────────── 
  // React에서 VS Code로 diff 미리보기 및 적용 요청 처리
  // ──────────────────────────────────────────────────────────── 
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        console.log('[Extension] URI Handler called with:', uri.toString());
        if (uri.path !== '/previewSuggestion') {
          console.log('[Extension] URI path mismatch:', uri.path);
          return;
        }
        const params = new URLSearchParams(uri.query);
        const file = params.get('file')!;
        const line = Number(params.get('line') || 1);
        const column = Number(params.get('column') || 1);
        console.log('[Extension] Parsed params:', { file, line, column });

        const wsFolders = vscode.workspace.workspaceFolders;
        const base = wsFolders && wsFolders.length > 0 ? wsFolders[0].uri.fsPath : (vscode.workspace.rootPath || '');
        const actualPath = path.isAbsolute(file) ? file : path.join(base, file);

        const previewUri = vscode.Uri.parse(
          `${PREVIEW_SCHEME}://${file}?${params.toString()}`
        );
        const actualUri = vscode.Uri.file(actualPath);

        // 1. 원본 파일 먼저 열기
        const doc = await vscode.workspace.openTextDocument(actualUri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const pos = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        
        // 2. Preview 탭 열기 (diff 뷰)
        await vscode.commands.executeCommand(
          'vscode.diff',
          previewUri,
          actualUri,
          `Preview: ${path.basename(file)}:${line}:${column}`,
          { preview: true, preserveFocus: false }
        );
        
        // 3. Preview 탭에 즉시 포커스 (사용자가 수정 내용을 바로 볼 수 있도록)
        try {
          await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
          console.log('[Preview] Focus applied to preview tab');
        } catch (error) {
          console.log('[Preview] Focus failed:', error);
        }
               

               

      },
    })
  );

  context.subscriptions.push({ dispose: deactivate });
}

export function deactivate() {
  try { semantics?.dispose(); } catch {}
  semantics = null;

  if (flutterProc) {
    try { flutterProc.kill(); } catch {}
    flutterProc = null;
  }

  try { out?.dispose(); } catch {}
  out = null;
}