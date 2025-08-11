// src/extension.ts
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

const PREVIEW_SCHEME = 'flutter-accessibility-preview';

// ─────────────────────────────────────────────
// tiny helpers
// ─────────────────────────────────────────────
let out: vscode.OutputChannel | null = null;
let semantics: SemanticsService | null = null;
let flutterProc: ChildProcessWithoutNullStreams | null = null;

function log(msg: string) {
  if (!out) out = vscode.window.createOutputChannel('Flutter Accessibility Checker');
  out.appendLine(msg);
  out.show(true);
}

const exec = (cmd: string, opt: ExecOptions = {}) =>
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
  const cfg = vscode.workspace.getConfiguration('dart');
  const sdkPath = cfg.get<string>('flutterSdkPath');
  const envBin = process.env.FLUTTER_BIN;
  if (envBin && envBin.trim()) return envBin;

  if (sdkPath && sdkPath.trim()) {
    const exe = process.platform === 'win32' ? 'flutter.bat' : 'flutter';
    return path.join(sdkPath, 'bin', exe);
  }
  return process.platform === 'win32' ? 'flutter.bat' : 'flutter';
}

function q(p: string) {
  return /["\s]/.test(p) ? `"${p}"` : p;
}

// Windows에서 UTF-8 강제(chcp 65001) 뒤 실행하여 한글 깨짐 방지
async function runFlutter(args: string): Promise<string> {
  const flutter = getFlutterExePath();
  const base = `${q(flutter)} ${args}`.trim();
  const cmd =
    process.platform === 'win32'
      ? `cmd.exe /d /s /c chcp 65001>nul && ${base}`
      : base;

  const { stdout } = await exec(cmd, { windowsHide: true });
  return stdout;
}

async function waitForServer(url: string, timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  return new Promise<boolean>((resolve) => {
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) return resolve(true);
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(check, 500);
    };
    check();
  });
}

// ─────────────────────────────────────────────
// device / emulator discovery
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
    const stdout = await runFlutter('devices --machine');
    const raw = JSON.parse(stdout) as Array<{
      id: string;
      name: string;
      category?: string;
      platformType?: string;
      emulator?: boolean;
    }>;

    const rows: DeviceRow[] = raw
      .filter((d) => {
        const cat = String(d.category || '').toLowerCase();
        return cat !== 'web' && cat !== 'desktop';
      })
      .map((d) => {
        const platform = String(d.platformType || '').toLowerCase();
        const emu =
          d.emulator === true ||
          (typeof d.id === 'string' && d.id.startsWith('emulator-')) ||
          (platform === 'ios' && /simulator/i.test(d.name || ''));
        return { id: d.id, name: d.name, platform, category: d.category, emulator: emu };
      });

    return rows;
  } catch {
    const { stdout } = await exec('flutter devices');
    const lines = stdout.split(/\r?\n/);
    const rx =
      /^\s*(.+?)\s+\((mobile|web|desktop)\)\s+•\s+([A-Za-z0-9\-.:_]+)\s+•\s+(ios|android)/i;

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
  const { stdout } = await exec('flutter emulators');
  const lines = stdout.split(/\r?\n/);
  const rx = /^\s*([A-Za-z0-9._-]+)\s+•\s+.+?\s+•\s+.+?\s+•\s+(android|ios)\s*$/i;
  return lines
    .map((l) => l.match(rx))
    .filter(Boolean)
    .map((m) => ({ id: m![1], platform: (m![2] || '').toLowerCase() }));
}

// ── QuickPick flow with marquee notifications ──
async function pickRunningEmulator(): Promise<string | undefined> {
  let running: DeviceRow[] = [];

  // 1) 마키 알림으로 검색
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '연결 가능한 에뮬레이터 목록을 가져오는 중…',
      cancellable: false,
    },
    async () => { running = await fetchRunningEmulators(); }
  );

  // 2) 결과 없음 → 설치 목록으로
  if (running.length === 0) {
    const btn = await vscode.window.showInformationMessage(
      '현재 연결 가능한 에뮬레이터가 없습니다.',
      '실행 가능한 목록 가져오기'
    );
    if (btn !== '실행 가능한 목록 가져오기') return;

    const pickedToLaunch = await pickInstalledAndLaunch();
    if (!pickedToLaunch) return;

    // 부팅 확인도 마키 알림
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

  // 3) QuickPick 표시
  const picked = await vscode.window.showQuickPick(
    running.map((d) => ({ label: d.id, description: `${d.name} • ${d.platform}` })),
    {
      placeHolder: '연결할 에뮬레이터를 선택하세요',
      matchOnDescription: true,
      ignoreFocusOut: true,
    }
  );
  return picked?.label;
}

async function pickInstalledAndLaunch(): Promise<string | undefined> {
  let emus: EmulatorDef[] = [];

  // 목록 로딩 마키 알림
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

  // 부팅 자체도 마키 알림
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `에뮬레이터 실행 중: ${picked.label}`, cancellable: false },
    async () => { await exec(`flutter emulators --launch ${picked.label}`); }
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

// ─────────────────────────────────────────────
// flutter run + VM Service URL parsing
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
  if (!out) out = vscode.window.createOutputChannel('Flutter Accessibility Checker');

  out.clear();
  out.show(true);
  log(`[Flutter] run -d ${emulatorId}`);

  const flutterExe = getFlutterExePath();

  // 핵심 변경: Windows에서 .bat는 shell:true로 실행 (spawn EINVAL 회피)
  const isWin = process.platform === 'win32';
  const cmd = isWin
    ? `chcp 65001>nul && ${q(flutterExe)} run -d ${q(emulatorId)}`
    : `${q(flutterExe)} run -d ${q(emulatorId)}`;

  flutterProc = spawn(cmd, {
    cwd,
    env: process.env,
    windowsHide: true,
    shell: true, // ← 여기
  });

  flutterProc.on('error', (err) => {
    log(`[Flutter] spawn error: ${String(err)}`);
  });

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
      if (!vmUrl) log(`[Flutter] run 종료(code=${code}) – VM Service URI 미획득`);
    });
  });

  if (!vmUrl) throw new Error('VM Service URL을 로그에서 찾지 못했습니다.');
  log(`[Flutter] VM Service: ${vmUrl}`);
  return vmUrl;
}

// ─────────────────────────────────────────────
// diff preview provider
// ─────────────────────────────────────────────
const previewProvider: vscode.TextDocumentContentProvider = {
  async provideTextDocumentContent(uri: vscode.Uri) {
    const params = new URLSearchParams(uri.query);
    const file = params.get('file')!;
    const line = Number(params.get('line')) - 1;
    const column = Number(params.get('column')) - 1;
    const text = params.get('text')!;
    const filePath = path.join(vscode.workspace.rootPath || '', file);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const lines = doc.getText().split(/\r?\n/);
    lines[line] = lines[line].slice(0, column) + text + lines[line].slice(column);
    return lines.join('\n');
  },
};

// ─────────────────────────────────────────────
// activate / deactivate
// ─────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext) {
  out = vscode.window.createOutputChannel('Flutter Accessibility Checker');

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, previewProvider)
  );

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        if (uri.path !== '/previewSuggestion') return;
        const params = new URLSearchParams(uri.query);
        const file = params.get('file')!;
        const previewUri = vscode.Uri.parse(`${PREVIEW_SCHEME}://${file}?${uri.query}`);
        const actualUri = vscode.Uri.file(path.join(vscode.workspace.rootPath || '', file));
        await vscode.commands.executeCommand(
          'vscode.diff',
          previewUri,
          actualUri,
          `Preview: ${path.basename(file)}`,
          { preview: true }
        );
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility-checker.openPanel', async () => {
      // 1) 에뮬레이터 선택(필요시 부팅)
      const emulatorId = await pickRunningEmulator();
      if (!emulatorId) return;

      const workspaceRoot = vscode.workspace.rootPath!;
      const reactAppPath = path.join(context.extensionPath, 'react-app');

      // 2) Flutter run + VM URL 획득 (마키 알림)
      const vmWsUrl = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Flutter 실행 중…', cancellable: false },
        async () => await runFlutterAndGetVmService(emulatorId, workspaceRoot)
      );

      // 3) SemanticsService 시작(React 브로드캐스트는 3001)
      try {
        if (semantics) { try { semantics.dispose(); } catch {} }
        // ▼ 에뮬레이터 플랫폼 자동 감지
        const platform = emulatorId.startsWith('emulator-') ? 'android' : 
                        emulatorId.includes('simulator') ? 'ios' : 'unknown';
        console.log(`[Extension] Detected platform: ${platform} for device: ${emulatorId}`);
        
        semantics = new SemanticsService({ port: 3001, platform, deviceId: emulatorId });
        await semantics.start(vmWsUrl);
        vscode.window.showInformationMessage('🔍 실시간 접근성 모니터링이 시작되었습니다.');
      } catch (e: any) {
        vscode.window.showWarningMessage(`VM Service 연결 실패: ${e?.message ?? e}`);
      }

      // 4) React 대시보드 실행 + 준비되면 자동 오픈
      const t2 = vscode.window.createTerminal({
        name: 'React Dashboard',
        cwd: reactAppPath,
        env: { ...process.env, BROWSER: 'none' },
      });
      t2.show();
      t2.sendText('npm start');

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '대시보드 준비 중…', cancellable: false },
        async () => {
          const ok = await waitForServer('http://localhost:3000', 120000);
          if (ok) await vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
          else vscode.window.showWarningMessage('React 대시보드가 응답하지 않습니다 (포트 3000).');
        }
      );
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
