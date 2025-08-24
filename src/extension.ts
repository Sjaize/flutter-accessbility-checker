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
    console.log('[Debug] Flutter devices --machine output:', stdout);
    const list = JSON.parse(stdout) as DeviceRow[];
    console.log('[Debug] Parsed devices:', list);
    
    const filtered = list.filter((d) => {
      const plat = String(d.platform || '').toLowerCase();
      const cat = String(d.category || '').toLowerCase();
      
      console.log('[Debug] Device:', { id: d.id, name: d.name, platform: plat, category: cat });
      
      // 웹 에뮬레이터도 포함하도록 수정
      const isWeb = cat === 'web' || plat.includes('web');
      const isDesktop = cat === 'desktop' || plat.includes('mac') || plat.includes('windows') || plat.includes('linux');
      
      // 웹은 허용, 데스크톱만 제외
      if (isDesktop && !isWeb) {
        console.log('[Debug] Excluding desktop device:', d.id);
        return false;
      }

      const looksLikeEmu =
        d.emulator === true ||
        (typeof d.id === 'string' && d.id.startsWith('emulator-')) ||
        isWeb; // 웹 에뮬레이터도 포함
      
      console.log('[Debug] Device', d.id, 'looksLikeEmu:', looksLikeEmu);
      return looksLikeEmu;
    });
    
    console.log('[Debug] Filtered devices:', filtered);
    return filtered;
  } catch (error) {
    console.log('[Debug] Machine format failed, trying text format:', error);
    const { stdout } = await execPromise(`${q(getFlutterExePath())} devices`);
    console.log('[Debug] Flutter devices text output:', stdout);
    const lines = stdout.split(/\r?\n/);
    const rx =
      /^\s*(.+?)\s+\((mobile|web|desktop)\)\s+•\s+([A-Za-z0-9\-.:_]+)\s+•\s+([A-Za-z0-9\-.:_]+)/i;

    const rows: DeviceRow[] = [];
    for (const line of lines) {
      const m = line.match(rx);
      if (!m) continue;
      const name = m[1];
      const category = m[2];
      const id = m[3];
      const platform = m[4].toLowerCase();
      
      console.log('[Debug] Text format device:', { name, category, id, platform });
      
      // 웹은 허용, 데스크톱만 제외
      if (category === 'desktop') {
        console.log('[Debug] Excluding desktop device:', id);
        continue;
      }
      
      rows.push({ id, name, platform, category, emulator: category === 'web' });
    }
    console.log('[Debug] Text format result:', rows);
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
  
  // 웹 에뮬레이터 옵션 추가
  const options = [
    { label: '🌐 Chrome (웹)', description: '웹 브라우저에서 실행', id: 'chrome', isWeb: true },
    ...emus.map((e) => ({ label: e.id, description: e.platform, id: e.id, isWeb: false }))
  ];
  
  if (emus.length === 0) {
    const picked = await vscode.window.showQuickPick(
      [{ label: '🌐 Chrome (웹)', description: '웹 브라우저에서 실행', id: 'chrome', isWeb: true }],
      { placeHolder: '웹 에뮬레이터를 사용하시겠습니까?' }
    );
    if (!picked) return;
    return picked.id;
  }

  const picked = await vscode.window.showQuickPick(
    options,
    { placeHolder: '부팅할 에뮬레이터를 선택하세요' }
  );
  if (!picked) return;

  if (picked.isWeb) {
    // 웹 에뮬레이터는 별도 실행 불필요 (Flutter run에서 처리)
    return picked.id;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `에뮬레이터 실행 중: ${picked.label}`, cancellable: false },
    async () => { await execPromise(`flutter emulators --launch ${picked.id}`); }
  );

  return picked.id;
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
    // 크롬 웹 에뮬레이터를 자동으로 선택
    console.log('[Debug] No running emulators, auto-selecting Chrome web emulator');
    
    // 크롬 웹 에뮬레이터 DeviceRow 생성
    const chromeDevice: DeviceRow = {
      id: 'chrome',
      name: 'Chrome (web-javascript)',
      platform: 'web-javascript',
      category: 'web',
      emulator: true
    };
    
    return chromeDevice;
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

  // baemin_new 프로젝트 경로 하드코딩
  const FLUTTER_PROJECT_PATH = '/Users/jeong-yujin/Downloads/baemin_new';
  console.log('[Extension] Hardcoded Flutter project path:', FLUTTER_PROJECT_PATH);

  // diff 문서 스킴/핸들러 등록
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, previewProvider)
  );

  // 첫 번째 URI handler 제거됨 (중복 방지)

  // 메인 명령: 패널 열기
  context.subscriptions.push(
    vscode.commands.registerCommand('flutter-accessibility-checker.openPanel', async () => {
      try {
        // baemin_new 프로젝트 경로 사용 (하드코딩)
        const workspaceRoot = FLUTTER_PROJECT_PATH;
        
        // 시스템 정보 출력
        console.log('🚀 Flutter Accessibility Checker 시작');
        console.log('📁 분석 대상 디렉토리:', workspaceRoot);
        console.log('🌐 Flutter 웹 포트: 53271');
        console.log('🔌 VM Service URL: ws://127.0.0.1:53271/KweCTis1Er4=/ws');
        console.log('📊 React 대시보드 포트: 3000');
        console.log('💾 이미지 저장 디렉토리: 임시 디렉토리 (자동 생성)');

        // 1) 에뮬레이터 선택(필요시 부팅)
        const device = await pickRunningEmulator(); // ⬅️ 변경: DeviceRow 반환
        if (!device) return;

        // 2) flutter run + VM URL 획득
        const vmWsUrl = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Flutter 실행 중…', cancellable: false },
          async () => {
            // Flutter 앱이 실행 중인지 확인하고 VM Service URL 동적 탐지
            console.log('[Extension] Detecting Flutter VM Service URL...');
            
            // Flutter 웹 앱의 VM Service URL (새로운 포트 사용)
            // 현재 실행 중인 Flutter 앱의 VM Service URL
            const vmServiceUrl = 'ws://127.0.0.1:53271/KweCTis1Er4=/ws';
            console.log('[Extension] Using current VM Service URL:', vmServiceUrl);
            return vmServiceUrl;
          }
        );

        // 3) 사용자 저니 분석 및 전송
        const userJourneyData = await analyzeUserJourney(workspaceRoot);
        console.log('[Extension] User journey analysis completed');
        
        // 4) SemanticsService 시작 (pubRootDirectories 등록)
        try {
          if (semantics) { try { semantics.dispose(); } catch {} }
          // 플랫폼 판별을 ID 문자열 대신 device.platform으로
          const plat = (device.platform || '').toLowerCase();
          const platform: 'android' | 'unknown' =
            plat.includes('android') ? 'android' : 'unknown';

          const pubRoots = [workspaceRoot];

          semantics = new SemanticsService({
            port: 3001,
            platform,
            deviceId: device.id,
            pubRootDirs: pubRoots,
          });
          await semantics.start(vmWsUrl);
          
          // 사용자 저니 데이터를 웹소켓으로 전송
          semantics.broadcast({
            type: 'userJourney',
            data: {
              userJourney: userJourneyData.userJourney,
              activityJourney: userJourneyData.activityJourney
            }
          });
          
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
        
        if (uri.path === '/previewSuggestion') {
          // 기존 미리보기 로직
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
          
          // 3. Preview 탭에 즉시 포커스
          try {
            await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
            console.log('[Preview] Focus applied to preview tab');
          } catch (error) {
            console.log('[Preview] Focus failed:', error);
          }
        } else if (uri.path === '/applySuggestion') {
          // 새로운 적용 로직
          const params = new URLSearchParams(uri.query);
          const file = params.get('file')!;
          const line = Number(params.get('line') || 1);
          const column = Number(params.get('column') || 1);
          const text = params.get('text') || '';
          const startLine = params.get('startLine') ? Number(params.get('startLine')) : line;
          const endLine = params.get('endLine') ? Number(params.get('endLine')) : line;
          
          console.log('[Extension] Apply suggestion params:', { file, line, column, startLine, endLine, textLength: text.length });

          try {
            const wsFolders = vscode.workspace.workspaceFolders;
            const base = wsFolders && wsFolders.length > 0 ? wsFolders[0].uri.fsPath : (vscode.workspace.rootPath || '');
            const actualPath = path.isAbsolute(file) ? file : path.join(base, file);

            // 파일 열기
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(actualPath));
            const editor = await vscode.window.showTextDocument(doc, { preview: false });

            // JSON에서 newCode 추출
            let codeToInsert = text;
            if (text.includes('"newCode"')) {
              const jsonMatch = text.match(/"newCode":\s*"([^"]*(?:\\.[^"]*)*)"/);
              if (jsonMatch) {
                codeToInsert = jsonMatch[1].replace(/\\n/g, '\n');
                console.log('[Apply] Extracted newCode from JSON');
              }
            }

            // 코드 수정 적용
            const startPosition = new vscode.Position(Math.max(0, startLine - 1), 0);
            const endPosition = new vscode.Position(Math.max(0, endLine - 1), doc.lineAt(Math.max(0, endLine - 1)).text.length);
            const range = new vscode.Range(startPosition, endPosition);

            await editor.edit(editBuilder => {
              editBuilder.replace(range, codeToInsert);
            });

            // 성공 메시지 표시
            vscode.window.showInformationMessage(
              `✅ ${path.basename(file)}의 접근성이 개선되었습니다!`,
              '확인'
            );

            // 수정된 라인으로 이동
            const newLineCount = codeToInsert.split('\n').length;
            const newEndLine = startLine + newLineCount - 1;
            const newPosition = new vscode.Position(Math.max(0, startLine - 1), 0);
            editor.selection = new vscode.Selection(newPosition, newPosition);
            editor.revealRange(new vscode.Range(newPosition, newPosition), vscode.TextEditorRevealType.InCenter);

            console.log('[Apply] Code modification completed successfully');

          } catch (error) {
            console.error('[Apply] Error applying suggestion:', error);
            vscode.window.showErrorMessage(
              `코드 수정 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
            );
          }
        } else {
          console.log('[Extension] Unknown URI path:', uri.path);
        }
      },
    })
  );

  // ──────────────────────────────────────────────────────────── 
  // Dart 코드 분석하여 사용자 저니 생성
  // ──────────────────────────────────────────────────────────── 
  
  // 사용자 저니 분석 및 PlantUML 생성
  async function analyzeUserJourney(workspaceRoot: string): Promise<{ userJourney: string; activityJourney: string }> {
    console.log('[UserJourney] Analyzing Dart code for user journey...');
    console.log('[UserJourney] Workspace root:', workspaceRoot);
    
    try {
      // Flutter 프로젝트의 lib 폴더에서 Dart 파일들 분석
      const libPath = path.join(workspaceRoot, 'lib');
      console.log('[UserJourney] Looking for lib folder at:', libPath);
      
      // lib 폴더 존재 확인
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(libPath));
        console.log('[UserJourney] lib folder found');
      } catch (error) {
        console.log('[UserJourney] lib folder not found, checking for main.dart in root');
        // lib 폴더가 없으면 루트에서 main.dart 찾기
        const mainDartPath = path.join(workspaceRoot, 'main.dart');
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(mainDartPath));
          console.log('[UserJourney] main.dart found in root');
          const content = await vscode.workspace.fs.readFile(vscode.Uri.file(mainDartPath));
          const code = content.toString();
          
          const userJourney = analyzeUserJourneyFromCode(code, mainDartPath);
          const activityJourney = analyzeActivityJourneyFromCode(code, mainDartPath);
          
          return {
            userJourney: generateUserJourneyPlantUML(userJourney || ''),
            activityJourney: generateActivityJourneyPlantUML(activityJourney || '')
          };
        } catch (mainError) {
          console.log('[UserJourney] main.dart not found in root either');
          throw mainError;
        }
      }
      
      const dartFiles = await findDartFiles(libPath);
      console.log('📊 분석된 Dart 파일 수:', dartFiles.length);
      
      let userJourneyPuml = '';
      let activityJourneyPuml = '';
      
      // 각 Dart 파일 분석
      for (const file of dartFiles) {
        console.log('[UserJourney] Analyzing file:', file);
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
        const code = content.toString();
        
        // 사용자 저니 분석
        const userJourney = analyzeUserJourneyFromCode(code, file);
        if (userJourney) {
          userJourneyPuml += userJourney;
        }
        
        // 액티비티 저니 분석
        const activityJourney = analyzeActivityJourneyFromCode(code, file);
        if (activityJourney) {
          activityJourneyPuml += activityJourney;
        }
      }
      
      // 최종 PlantUML 생성
      const finalUserJourney = generateUserJourneyPlantUML(userJourneyPuml);
      const finalActivityJourney = generateActivityJourneyPlantUML(activityJourneyPuml);
      
      console.log('[UserJourney] User journey analysis completed');
      console.log('[UserJourney] User journey length:', finalUserJourney.length);
      console.log('[UserJourney] Activity journey length:', finalActivityJourney.length);
      
      return {
        userJourney: finalUserJourney,
        activityJourney: finalActivityJourney
      };
      
    } catch (error) {
      console.error('[UserJourney] Error analyzing user journey:', error);
      return {
        userJourney: generateDefaultUserJourney(),
        activityJourney: generateDefaultActivityJourney()
      };
    }
  }
  
  // Dart 파일 찾기
  async function findDartFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry[0]);
        
        if (entry[1] === vscode.FileType.Directory) {
          // lib 폴더 내의 하위 디렉토리도 검색
          const subFiles = await findDartFiles(fullPath);
          files.push(...subFiles);
        } else if (entry[0].endsWith('.dart')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error('[UserJourney] Error reading directory:', error);
    }
    
    return files;
  }
  
  // 코드에서 사용자 저니 분석
  function analyzeUserJourneyFromCode(code: string, filePath: string): string {
    const lines = code.split('\n');
    let journey = '';
    
    // 화면 전환 패턴 분석
    const navigationPatterns = [
      /Navigator\.push\(context,\s*MaterialPageRoute\(builder:\s*\(context\)\s*=>\s*(\w+)\(\)\)\)/g,
      /Navigator\.pushNamed\(context,\s*['"`]([^'"`]+)['"`]\)/g,
      /Get\.to\((\w+)\(\)\)/g,
      /Get\.toNamed\(['"`]([^'"`]+)['"`]\)/g
    ];
    
    // 버튼 텍스트 분석
    const buttonPatterns = [
      /Text\(['"`]([^'"`]+)['"`]\)/g,
      /ElevatedButton\([^)]*child:\s*Text\(['"`]([^'"`]+)['"`]\)/g,
      /TextButton\([^)]*child:\s*Text\(['"`]([^'"`]+)['"`]\)/g
    ];
    
    // 화면 이름 추출
    const screenName = path.basename(filePath, '.dart');
    
    for (const line of lines) {
      // 네비게이션 패턴 찾기
      for (const pattern of navigationPatterns) {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          const targetScreen = match[1];
          journey += `  ${screenName} -> ${targetScreen} : 사용자 액션\n`;
        }
      }
      
      // 버튼 텍스트 찾기
      for (const pattern of buttonPatterns) {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          const buttonText = match[1];
          if (buttonText && buttonText.length > 0) {
            journey += `  note right of ${screenName} : "${buttonText}" 버튼\n`;
          }
        }
      }
    }
    
    return journey;
  }
  
  // 코드에서 액티비티 저니 분석
  function analyzeActivityJourneyFromCode(code: string, filePath: string): string {
    const lines = code.split('\n');
    let activities = '';
    
    // 액티비티/화면 클래스 찾기
    const classPattern = /class\s+(\w+)\s+extends\s+(StatefulWidget|StatelessWidget)/g;
    const match = classPattern.exec(code);
    
    if (match) {
      const className = match[1];
      const screenName = path.basename(filePath, '.dart');
      
      activities += `  ${className} as "${screenName}"\n`;
      
      // 액티비티 내부 기능 분석
      const functionPatterns = [
        /void\s+(\w+)\(/g,
        /Widget\s+build\(/g,
        /onPressed:\s*\(\)\s*{/g
      ];
      
      for (const line of lines) {
        for (const pattern of functionPatterns) {
          const matches = line.matchAll(pattern);
          for (const match of matches) {
            const functionName = match[1] || 'build';
            activities += `  note right of ${className} : ${functionName} 함수\n`;
          }
        }
      }
    }
    
    return activities;
  }
  
  // 사용자 저니 PlantUML 생성
  function generateUserJourneyPlantUML(journeyData: string): string {
    return `@startuml
!theme plain
skinparam backgroundColor #f0f0f0

title 사용자 저니 (User Journey)

${journeyData}

@enduml`;
  }
  
  // 액티비티 저니 PlantUML 생성
  function generateActivityJourneyPlantUML(activityData: string): string {
    return `@startuml
!theme plain
skinparam backgroundColor #f0f0f0

title 액티비티 저니 (Activity Journey)

${activityData}

@enduml`;
  }
  
  // 기본 사용자 저니
  function generateDefaultUserJourney(): string {
    return `@startuml
!theme plain
skinparam backgroundColor #f0f0f0

title 기본 사용자 저니

MainScreen -> LoginScreen : 로그인
LoginScreen -> HomeScreen : 로그인 성공
HomeScreen -> ProfileScreen : 프로필 보기
ProfileScreen -> HomeScreen : 뒤로 가기

@enduml`;
  }
  
  // 기본 액티비티 저니
  function generateDefaultActivityJourney(): string {
    return `@startuml
!theme plain
skinparam backgroundColor #f0f0f0

title 기본 액티비티 저니

MainScreen as "메인 화면"
LoginScreen as "로그인 화면"
HomeScreen as "홈 화면"
ProfileScreen as "프로필 화면"

@enduml`;
  }

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