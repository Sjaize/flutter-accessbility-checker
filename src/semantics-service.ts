// src/semantics-service.ts
import WebSocket, { WebSocketServer } from 'ws';
import * as vscode from 'vscode';
import { exec as _exec, spawn } from 'child_process';
import { ProposalService } from './proposal-service';

// ─────────────────────────────────────────────
// 공유 타입 (React/Extension과 호환)
// ─────────────────────────────────────────────
export type FramePayload = { imageBase64: string; width: number; height: number };

export type UiIssue = {
  id: string | number;
  severity: 'error' | 'warning' | 'info';
  label?: string;
  description?: string;
  elementType?: string;
  rect: { left: number; top: number; width: number; height: number }; // px
  source?: { file: string; line: number; column: number };            // creationLocation
  m5Location?: { file: string; line: number; column: number };        // M5 매칭 결과
};

interface SemanticsServiceOptions {
  port?: number;
  platform?: 'android' | 'unknown';
  deviceId?: string;
  pubRootDirs?: string[];
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function exec(cmd: string, opt: { timeout?: number } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    _exec(cmd, { timeout: opt.timeout ?? 20000, encoding: 'utf8' }, (e, stdout, stderr) => {
      if (e) return reject(e);
      resolve({ stdout, stderr });
    });
  });
}

function getPngSize(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function findAdbPath(): string {
    const { execSync } = require('child_process');
  const os = require('os'); const path = require('path'); const fs = require('fs');
  try {
    const which = process.platform === 'win32' ? 'where adb' : 'which adb';
    const out = execSync(which, { encoding: 'utf8' }).trim();
    if (out) return 'adb';
  } catch {}
  const home = os.homedir();
  const candidates = [
    process.env.ANDROID_HOME && `${process.env.ANDROID_HOME}/platform-tools/adb`,
    process.env.ANDROID_SDK_ROOT && `${process.env.ANDROID_SDK_ROOT}/platform-tools/adb`,
    process.platform === 'darwin' && `${home}/Library/Android/sdk/platform-tools/adb`,
    process.platform === 'linux' && `${home}/Android/Sdk/platform-tools/adb`,
    process.platform === 'win32' && `${home}/AppData/Local/Android/Sdk/platform-tools/adb.exe`,
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p as string)) return p as string;
  throw new Error('ADB not found. Add to PATH or install Android SDK.');
}

function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }

// ─────────────────────────────────────────────
// Android: screenshot / UIAutomator
// ─────────────────────────────────────────────
async function adbScreencap(serial: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const p = spawn(findAdbPath(), ['-s', serial, 'exec-out', 'screencap', '-p']);
    const bufs: Buffer[] = []; let err = '';
    p.stdout.on('data', d => bufs.push(Buffer.from(d)));
    p.stderr.on('data', d => (err += d.toString()));
    p.on('error', reject);
    p.on('close', code => (code !== 0 && !bufs.length) ? reject(new Error(err || `screencap exit ${code}`)) : resolve(Buffer.concat(bufs)));
  });
}

async function adbDumpUI(serial: string): Promise<string> {
  const adb = findAdbPath(); const tmp = '/sdcard/uidump.xml';
  await exec(`${adb} -s ${serial} shell uiautomator dump ${tmp}`).catch(() => ({ stdout: '', stderr: '' }));
  const { stdout } = await exec(`${adb} -s ${serial} shell cat ${tmp}`).catch(() => ({ stdout: '', stderr: '' }));
  return stdout || '';
}

// UIAutomator XML 파싱 (2-패스: 수집 → 텍스트→버튼 승격)
function parseUiautomatorXml(xml: string, fw: number, fh: number): { accessibilityIssues: UiIssue[] } {
  const acc: UiIssue[] = [];
  const texts: UiIssue[] = [];
  
  if (!xml) return { accessibilityIssues: acc };

  type RawNode = {
    idx: number;
    rect: { left: number; top: number; width: number; height: number };
    cls: string;
    clickable: boolean;
    focusable: boolean;
    label: string;
  };
  const all: RawNode[] = [];

  const rx = /<node\b([^>]*?)>/g; // 각 node 태그
  let m: RegExpExecArray | null; let idx = 0;

  const getAttr = (s: string, name: string) => s.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '';
  const parseBounds = (s: string) => {
    const b = getAttr(s, 'bounds'); // [l,t][r,b]
    const mm = b.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!mm) return { left: 0, top: 0, width: 0, height: 0 };
    const l = +mm[1], t = +mm[2], r = +mm[3], btm = +mm[4];
    return { left: l, top: t, width: Math.max(0, r - l), height: Math.max(0, btm - t) };
  };
  
  while ((m = rx.exec(xml))) {
    idx++;
    const attrs = m[1];
    const rect = parseBounds(attrs);
    if (rect.width <= 0 || rect.height <= 0) continue;

    const cls = getAttr(attrs, 'class');
    const clickable = getAttr(attrs, 'clickable') === 'true';
    const focusable = getAttr(attrs, 'focusable') === 'true';

    // label 후보: text > content-desc > hint > resource-id 마지막 세그먼트
    const text = getAttr(attrs, 'text').trim();
    const cdesc = getAttr(attrs, 'content-desc').trim();
    const hint = getAttr(attrs, 'hint').trim();
    const rid = getAttr(attrs, 'resource-id').trim();
    let label = text || cdesc || hint;
    if (!label && rid) {
      const last = rid.split('/').pop() || rid.split(':').pop() || '';
      if (last) label = last.replace(/_/g, ' ');
    }
    label = label.replace(/&#10;/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

    all.push({ idx, rect, cls, clickable, focusable, label });

    // 1차 분류(라이트): 너무 크거나 작으면 제외
    const isTooLarge = rect.width * rect.height > fw * fh * .3;
    const isTooSmall = rect.width < 15 || rect.height < 15;
    const reasonable = !isTooLarge && !isTooSmall;

    // 역할 힌트
    let elementType: string = 'text';
    if (/EditText|TextField/i.test(cls)) elementType = 'textfield';
    else if (/Image|Icon/i.test(cls)) elementType = 'image';
    else if (/Button/i.test(cls) || (clickable && !/TextView/i.test(cls))) elementType = 'button';

    // 텍스트는 별도 탭용으로만 수집
    if (elementType === 'text' && label && reasonable) {
      texts.push({
        id: `t-${idx}`, severity: 'info', label,
        description: `텍스트 "${label}"`,
        elementType: 'text', rect
      });
      continue;
    }

    if (elementType !== 'text' && reasonable) {
      acc.push({
        id: `u-${idx}`,
        severity: label ? 'info' : 'warning',
        label: label || undefined,
        description: label ? `스크린 리더가 "${label}"로 읽음` : '⚠️ 라벨 없음',
        elementType, rect
      });
    }
  }

  // 2-패스: 텍스트→버튼 승격 (텍스트가 비-TextView clickable 컨테이너에 포함될 때)
  const contains = (big: RawNode['rect'], small: RawNode['rect']) =>
    big.left <= small.left && big.top <= small.top &&
    big.left + big.width >= small.left + small.width &&
    big.top + big.height >= small.top + small.height;

  const clickables = all.filter(n => n.clickable && !/TextView/i.test(n.cls));
  for (const n of all) {
    const isTextCandidate = !!n.label && !/EditText|TextField/i.test(n.cls) && !n.clickable;
    if (!isTextCandidate) continue;

    // 가장 작은(근접) clickable 컨테이너
    const host = clickables
      .filter(c => contains(c.rect, n.rect))
      .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height))[0];

    if (host) {
      // 기존 텍스트 카드 제거(중복 방지)
      const tIdx = texts.findIndex(t => t.label === n.label && contains(host.rect, t.rect));
      if (tIdx >= 0) texts.splice(tIdx, 1);

      // 이미 동일한 버튼이 있으면 중복 피함
      const dup = acc.find(a =>
        a.elementType === 'button' &&
        Math.abs(a.rect.left - host.rect.left) < 2 &&
        Math.abs(a.rect.top - host.rect.top) < 2 &&
        Math.abs(a.rect.width - host.rect.width) < 4 &&
        Math.abs(a.rect.height - host.rect.height) < 4 &&
        (a.label || '') === n.label
      );
      if (!dup) {
        acc.push({
          id: `u-promoted-${n.idx}`,
          severity: 'info',
          label: n.label,
          description: '텍스트가 클릭 가능한 컨테이너 안에 있어 버튼으로 인식',
          elementType: 'button',
          rect: host.rect
        });
      }
    }
  }

  return { accessibilityIssues: acc };
}

// ─────────────────────────────────────────────
// SemanticsService (VM Service + Inspector)
// ─────────────────────────────────────────────
export class SemanticsService {
  private vmWs?: WebSocket;
  private wss?: WebSocketServer;
  private nextId = 1;
  private isolateId?: string;
  private capturing = false;
  private lastAt = 0;
  private captureInterval?: NodeJS.Timeout;
  private group = `vscode-ext-${Date.now()}`;

  // 측정/로그 메트릭
  private metrics = {
    method1_widgetNormalization: { used: false, extractedNodes: 0 },
    method5_matching: { matchedBySummary: 0 },
  };

  // ── Active file (route) scoping ──
  private _activeFile?: string;
  private _stickyUntil = 0;
  
  // ── Proposal Service ──
  private proposalService: ProposalService;
  
  // ── 공통 정규화 함수 ──
  private _normLabel(s?: string) {
    return (s ?? '')
      .normalize('NFC') // 한글/악센트 정규화
      .replace(/\u00A0/g, ' ') // NBSP → space
      .replace(/["'`]/g,'') // quotes (double/single/backtick)
      .replace(/[.:,!?()${}<>]/g, '') // common punctuation
      .replace(/\s*:\s*$/,'') // trailing colon
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  
  private _setActiveFile(file: string, ttlMs = 6000) {
    if (!file) return;
    const previousFile = this._activeFile?.split('/').pop();
    this._activeFile = file;
    this._stickyUntil = Date.now() + ttlMs;
    const newFile = file.split('/').pop();
    console.log(`[ActiveScope] 📁 Set Active File: ${previousFile || 'none'} → ${newFile} (TTL: ${ttlMs}ms)`);
  }
  
  private _activeFileAlive() {
    return !!this._activeFile && Date.now() < this._stickyUntil;
  }

  constructor(private readonly opts: SemanticsServiceOptions = {}) {
    this.proposalService = new ProposalService();
  }

  async start(vmServiceWsUrl: string) {
    // 1) React 대시보드 WS
    if (!this.wss) {
      const port = this.opts.port ?? 3001;
      this.wss = new WebSocketServer({ port });
      this.wss.on('listening', () => console.log(`[SemanticsService] WS listening :${port}`));
      this.wss.on('connection', () => console.log('[SemanticsService] Dashboard connected'));
    }

    // 2) VM Service 연결
    console.log('[SemanticsService] Connect VM:', vmServiceWsUrl);
    this.vmWs = new WebSocket(vmServiceWsUrl);

    this.vmWs.on('open', async () => {
      // isolate 선택
      await this.pickFlutterIsolate();
        if (!this.isolateId) {
          vscode.window.showWarningMessage('isolateId를 찾지 못했습니다.');
          return;
        }

      await Promise.all([
        this.callVmAsync({ method: 'streamListen', params: { streamId: 'Extension' } }),
        this.callVmAsync({ method: 'streamListen', params: { streamId: 'Isolate' } }),
      ]);
      console.log('[SemanticsService] Streams subscribed (Extension + Isolate)');

      await this.initFlutterInspector();

      await this.captureOnce().catch(e => console.error('[Capture] Initial failed:', e.message));
        this.startPeriodicCapture();
    });

        // 스트림 이벤트 → 캡처
    this.vmWs.on('message', (raw) => {
      const msg = safeParse(raw.toString());
      if (msg?.event?.streamId === 'Extension') {
        const k = msg.event?.event?.extensionEvent?.eventKind;
        if (k === 'TreeChanged' || k === 'WidgetTreeChanged' || k === 'inspectorObjectGroupChanged') {
          console.log('[Event] Inspector change → capture debounce');
            this.debouncedCapture();
          }
        
                // 페이지 전환 감지 (Route 변경)
        if (k === 'RouteChanged' || k === 'NavigationChanged') {
          console.log('[Event] 🚀 Route/Navigation change detected!');
          console.log('[Event] 📄 Previous Active Scope:', this._activeFile?.split('/').pop() || 'none');
          this._activeFile = undefined; // Active Scope 초기화
          this._stickyUntil = 0;
          console.log('[Event] 🔄 Active Scope reset, triggering capture...');
          // 즉시 캡처하여 새로운 Active Scope 설정
          setTimeout(() => this.captureOnce(), 100);
        }

      }
      if (msg?.event?.streamId === 'Isolate') {
        const k = msg.event?.event?.kind;
        if (k === 'IsolateReload' || k === 'IsolateUpdate') {
          console.log('[Event] Isolate reload/update → capture debounce');
          setTimeout(() => this.debouncedCapture(), 200);
        }
        if (k === 'IsolateReload' || k === 'IsolateExit' || k === 'IsolateStart') {
          console.log('[Event] Isolate change → reinit inspector');
          this.reinitInspector();
        }
      }
    });

    // React 대시보드 WebSocket 메시지 처리
    this.wss?.on('connection', (ws) => {
      ws.on('message', async (raw) => {
        try {
          const msg = safeParse(raw.toString());
          if (msg?.type === 'navigateIssue') {
            console.log('[React] navigateIssue requested:', msg.data);
            await this.navigateIssue(msg.data);
          } else if (msg?.type === 'generateProposal') {
            console.log('[React] generateProposal requested:', msg.data);
            this.proposalService.setActiveFile(this._activeFile || null);
            await this.proposalService.generateProposal(ws, msg.data);
          } else if (msg?.type === 'applyProposal') {
            console.log('[React] applyProposal requested:', msg.data);
            await this.proposalService.applyProposal(ws, msg.data);
          }
        } catch (e) {
          console.log('[React] Failed to handle message:', e);
        }
      });
    });

    this.vmWs.on('close', () => console.log('[SemanticsService] VM closed'));
    this.vmWs.on('error', (err) => {
      console.error('[SemanticsService] VM error', err);
      vscode.window.showErrorMessage('VM Service 연결 에러');
    });
  }

  dispose() {
    if (this.captureInterval) clearInterval(this.captureInterval);
    
    // Inspector 그룹 정리
    if (this.isolateId) {
      this.callVmAsync({
        method: 'ext.flutter.inspector.disposeGroup',
        params: { isolateId: this.isolateId, objectGroup: this.group }
      }).catch(() => {});
      this.callVmAsync({
        method: 'ext.flutter.inspector.disposeGroup',
        params: { isolateId: this.isolateId, groupName: 'diagnosis' }
      }).catch(() => {});
    }
    
    try { this.vmWs?.close(); } catch {}
    try { this.wss?.close(); } catch {}
  }

  // ── Flutter isolate 선택 ──
  private async pickFlutterIsolate() {
    const vm = await this.callVmAsync({ method: 'getVM' }).catch(() => null);
    const isolates = vm?.result?.isolates ?? [];
    let chosen: string | undefined;

    for (const iso of isolates) {
      const info = await this.callVmAsync({ method: 'getIsolate', params: { isolateId: iso.id } }).catch(() => null);
      const exts: string[] = info?.result?.extensionRPCs ?? [];
      if (exts.some(m => m.startsWith('ext.flutter.inspector'))) {
        chosen = iso.id; break;
      }
    }
    if (!chosen && isolates.length) {
      const nameMain = isolates.find((i: any) => i.name === 'main');
      chosen = nameMain?.id ?? isolates[0].id;
    }
    this.isolateId = chosen;
    console.log('[SemanticsService] isolateId =', this.isolateId);
  }

  // ── Inspector 초기화 ──
  private async initFlutterInspector() {
    if (!this.isolateId) return;
    const iso = this.isolateId;

    console.log('[Inspector] init…');
    await this.callVmAsync({ method: 'ext.flutter.inspector.show', params: { isolateId: iso } }).catch(() => {});
    console.log('[Inspector] show = OK');

    if (this.opts.pubRootDirs?.length) {
      for (const dir of this.opts.pubRootDirs) {
        await this.callVmAsync({
          method: 'ext.flutter.inspector.addPubRootDirectories',
          params: { isolateId: iso, args: [dir] }
        }).then(() => console.log('[Inspector] addPubRootDirectories:', dir))
          .catch(() => console.log('[Inspector] addPubRootDirectories failed:', dir));
      }
    }

    // Flutter Inspector 상태 확인 + 진단
    await this.diagnoseFlutterState();
  }

  // ── Inspector 재초기화 (핫 리로드 후) ──
  private async reinitInspector() {
    if (!this.isolateId) return;
    const iso = this.isolateId;
    
    this.group = `vscode-ext-${Date.now()}`;
    await this.callVmAsync({ method: 'ext.flutter.inspector.show', params: { isolateId: iso } }).catch(()=>{});
    
    if (this.opts.pubRootDirs?.length) {
      for (const dir of this.opts.pubRootDirs) {
        await this.callVmAsync({
          method: 'ext.flutter.inspector.addPubRootDirectories',
          params: { isolateId: iso, args: [dir] }
        }).catch(()=>{});
      }
    }
  }






  // ── Flutter 앱 상태 진단 ──
  private async diagnoseFlutterState() {
    if (!this.isolateId) return;
    const iso = this.isolateId;

    // Flutter Inspector 상태 확인

    // 1) Summary Tree
    let rootTree = await this.callVmAsync({
        method: 'ext.flutter.inspector.getRootWidgetSummaryTree',
      params: { isolateId: iso, trackWidgetCreation: "true", groupName: 'diagnosis' }
    }).catch(() => null);
    // 2) Full Widget Tree (Summary Tree 실패 시)
    if (!rootTree?.result) {
      rootTree = await this.callVmAsync({
        method: 'ext.flutter.inspector.getRootWidgetTree',
        params: { isolateId: iso, trackWidgetCreation: "true", groupName: 'diagnosis' }
      }).catch(() => null);
    }

    // count (정규화해서 세자)
    const norm = this.normalizeInspectorRoot(rootTree?.result);
    const countNodes = (node: any): number => {
      if (!node) return 0;
      if (Array.isArray(node)) return node.reduce((s, n) => s + countNodes(n), 0);
      let count = 1;
      if (Array.isArray(node.children)) {
        for (const child of node.children) count += countNodes(child);
      }
      return count;
    };
    const nodeCount = countNodes(norm);
    console.log(`[Diagnosis] Widget Tree: ${nodeCount} nodes`);
  }

  // ── 캡처 ──
  private debouncedCapture() {
    const now = Date.now();
    if (now - this.lastAt > 500) {
      this.lastAt = now;
      setTimeout(() => this.captureOnce().catch(e => console.log('[Capture] fail:', e.message)), 300);
    }
  }

  private startPeriodicCapture() {
    if (this.captureInterval) clearInterval(this.captureInterval);
    this.captureInterval = setInterval(() => {
      if (Date.now() - this.lastAt >= 10000) this.captureOnce().catch(() => {});
    }, 10000);
  }

  private async captureOnce(): Promise<{ frame: FramePayload; issues: any[] } | null> {
    if (this.capturing) return null;
    this.capturing = true;
    try {
      console.log('[Capture] start');

      let frame: FramePayload | null = null;
      let issues: UiIssue[] = [];

      const serial = this.opts.deviceId ?? 'emulator-5554';
      console.log('[Capture] adb target =', serial);

      const [png, xml] = await Promise.all([
        adbScreencap(serial),
        adbDumpUI(serial).catch(() => ''),
      ]);

      const { width, height } = getPngSize(png);
      frame = { imageBase64: png.toString('base64'), width, height };

      const uia = parseUiautomatorXml(xml, width, height);
      let uiaIssues = [...uia.accessibilityIssues]; // 텍스트 요소 제거
      console.log(`[Capture] uiaIssues=${uiaIssues.length}`);

      // Flutter Inspector 기반 매칭
      const idx = await this.buildWidgetSummaryIndex();
      let matched = 0;
      uiaIssues = uiaIssues.map(u => {
        const loc = this.matchIssueToSummary(
          { label: u.label, elementType: u.elementType, rect: u.rect }, idx
        );
        if (loc) { 
          matched++; 
          console.log(`[M5] ✅ Setting m5Location for issue ${u.id}: ${loc.file.split('/').pop()}:${loc.line}:${loc.column}`);
          return { ...u, m5Location: loc }; // M5 매칭 결과를 별도 필드로 저장
        }
        console.log(`[M5] ❌ No m5Location for issue ${u.id}`);
        return u;
      });
      this.metrics.method5_matching.matchedBySummary = matched;
      console.log(`[Match] ${matched}/${uiaIssues.length} UI elements matched to source code`);
      issues = uiaIssues;

      if (!frame) return null;

      const withPct = issues.map(i => ({
        ...i,
        rectPct: {
          left: (i.rect.left / frame!.width) * 100,
          top: (i.rect.top / frame!.height) * 100,
          width: (i.rect.width / frame!.width) * 100,
          height: (i.rect.height / frame!.height) * 100,
        },
        // M5 매칭 정보도 함께 전송
        m5Location: (i as any).m5Location
      }));

      const withSource = withPct.filter(i => i.source).length;
      console.log(`[Capture] done: issues=${withPct.length}  withSource=${withSource}`);

      // 메트릭 요약 출력
      console.log('[Metrics] M1(norm)=', this.metrics.method1_widgetNormalization,
                  ' M5(match)=', this.metrics.method5_matching);

      this.broadcast({ type: 'snapshot', data: { frame, issues: withPct } });
      return { frame, issues: withPct };
    } finally {
      this.capturing = false;
    }
  }

  // ── Reveal a file:line:column in VS Code ──
  private async _revealInEditor(loc: { file: string; line?: number; column?: number }) {
    try {
      // file:// 프로토콜 정리
      let cleanPath = loc.file;
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.substring(7); // 'file://' 제거
      }
      console.log('[Navigate] Opening file:', cleanPath, 'at', loc.line ?? 1, ':', loc.column ?? 1);
      
      const uri = vscode.Uri.file(cleanPath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      const line = Math.max(0, (loc.line ?? 1) - 1);
      const col = Math.max(0, (loc.column ?? 1) - 1);
      const pos = new vscode.Position(line, col);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      console.log('[Navigate] ✅ Successfully revealed', cleanPath, 'at line', loc.line ?? 1);
    } catch (e) {
      console.log('[Navigate] reveal failed:', (e as Error).message);
      vscode.window.showWarningMessage(`소스 열기 실패: ${loc.file}`);
    }
  }

  // ── Navigate-only flow for "개선하기" (M5-first, deterministic-focused) ──
  public async navigateIssue(issue: UiIssue) {
    try {
      console.log('[Navigate] ===== STARTING NAVIGATION =====');
      console.log('[Navigate] request', { label: issue.label, elementType: issue.elementType, rect: issue.rect });

      // Build / reuse index for M5
      const idx = await this.buildWidgetSummaryIndex();
      console.log('[Navigate] index-size', idx.length, 'activeFileAlive=', this._activeFileAlive(), 'activeFile=', this._activeFile);

      // 1) M5 Deterministic Matching First (최우선)
      console.log('[Navigate] ===== STEP 1: M5 DETERMINISTIC MATCHING =====');
      const m5 = this.matchIssueToSummary({ label: issue.label, elementType: issue.elementType, rect: issue.rect }, idx);
      if (m5) {
        console.log('[Navigate] ✅ M5 SUCCESS! Using M5 match:', m5);
        await this._revealInEditor(m5);
                return;
              }
      console.log('[Navigate] ❌ M5 failed, proceeding to active file...');

      // 2) Fallback to active scope file (top-of-file)
      console.log('[Navigate] ===== STEP 2: ACTIVE FILE FALLBACK =====');
      if (this._activeFileAlive()) {
        console.log('[Navigate] ✅ Active file fallback:', this._activeFile);
        await this._revealInEditor({ file: this._activeFile!, line: 1, column: 1 });
                  return;
                }
                
      console.log('[Navigate] ❌ All methods failed');
      vscode.window.showInformationMessage('위치 매칭에 실패했습니다. 앱에서 관련 위젯을 한번 선택해 주세요.');
    } catch (e) {
      console.log('[Navigate] navigateIssue failed:', (e as Error).message);
    } finally {
      // 어떤 경우든 로딩 상태 해제
      console.log('[Navigate] Broadcasting navigateComplete');
      this.broadcast({ type: 'navigateComplete', data: {} });
    }
  }



  

  // ── M1: inspector 응답 정규화(배열/children/nodes 케이스 모두 처리) ──
  private normalizeInspectorRoot(input: any): any {
    if (!input) return null;
    
    // VM Service 응답 래퍼인 경우 (result/type/method 구조)
    if (input.result !== undefined && input.type && input.method) {
      console.log('[Normalize] VM Service wrapper detected, unwrapping result');
      return this.normalizeInspectorRoot(input.result);
    }
    
    // 이미 객체 + children
    if (typeof input === 'object' && !Array.isArray(input)) {
      if (Array.isArray(input.children)) {
        this.metrics.method1_widgetNormalization.used = true;
        return input;
      }
      if (Array.isArray(input.nodes)) {
        this.metrics.method1_widgetNormalization.used = true;
        return { children: input.nodes };
      }
      return input;
    }
    // 배열이면 가짜 루트로 감싸기
    if (Array.isArray(input)) {
      this.metrics.method1_widgetNormalization.used = true;
      return { children: input };
    }
    return { children: [] };
  }

  // 액션 가능한 위젯 타입 판정 (요약 트리에서 자식 Text를 따오려는 대상)
  private _isActionable(widgetType?: string): boolean {
    const t = (widgetType || '').toLowerCase();
    return /(elevatedbutton|textbutton|outlinedbutton|iconbutton|inkwell|gesturedetector|tapregion|listtile)/.test(t);
  }

  // ── M1: 위젯 정규화 (Widget Normalization) ──
  private async buildWidgetSummaryIndex(): Promise<Array<{
    description: string;
    widgetType?: string;
    loc: { file: string; line: number; column: number };
    nodeId?: string;
    valueId?: string;
    objectId?: string;
    derivedLabel?: string;
    derivedLabelNorm?: string;
    rect?: { left: number; top: number; width: number; height: number };
  }>> {
    this.metrics.method1_widgetNormalization.used = true;
    
    const resp = await this.callVmAsync({
      method: 'ext.flutter.inspector.getRootWidgetSummaryTree',
      params: { isolateId: this.isolateId!, trackWidgetCreation: "true", objectGroup: this.group }
    });
    
    const root = this.normalizeInspectorRoot(resp?.result);

    // Helper: Extract best-guess quoted text from a string
    const extractQuoted = (d?: string): string | undefined => {
      if (!d) return undefined;
      // Keyed string values that may be quoted or unquoted
      let m = d.match(/(labelText|hintText|semanticsLabel|tooltip)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,\)\}\n]+))/);
      if (m) return m[2] || m[3] || (m[4] ? m[4].trim() : undefined);
      // Text(.), Text.rich(...) – grab first quoted payload inside the call
      m = d.match(/Text(?:\.rich)?\s*\(([\s\S]*?)\)/);
      if (m) {
        const q = m[1].match(/['"]([\s\S]*?)['"]/);
        if (q) return q[1];
      }
      // RichText(...)
      m = d.match(/RichText\s*\(([\s\S]*?)\)/);
      if (m) {
        const q = m[1].match(/['"]([\s\S]*?)['"]/);
        if (q) return q[1];
      }
      // Generic first quoted string as very last resort
      const any = d.match(/['"]([\s\S]{1,120}?)['"]/);
      return any ? any[1] : undefined;
    };

    // 서브트리에서 가장 가까운 Text("...") 라벨 추출
    const extractChildText = (node: any, depth = 0): string | undefined => {
      if (!node || depth > 3) return undefined;
      if (Array.isArray(node)) {
        for (const n of node) {
          const got = extractChildText(n, depth);
          if (got) return got;
        }
        return undefined;
      }
      const d = node.description as string | undefined;
      if (d && /(?:^|\s)Text\((?:'|")([\s\S]*?)(?:'|")\)/.test(d)) {
        const m = d.match(/(?:^|\s)Text\((?:'|")([\s\S]*?)(?:'|")\)/);
        if (m) return m[1];
      }
      if (d && /(labelText|hintText)\s*:\s*(?:'|")([\s\S]*?)(?:'|")/.test(d)) {
        const m = d.match(/(labelText|hintText)\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
        if (m) return m[2];
      }
      if (d && /TextSpan\(\s*text\s*:\s*(?:'|")([\s\S]*?)(?:'|")/.test(d)) {
        const m = d.match(/TextSpan\(\s*text\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
        if (m) return m[1];
      }
      if (d && /semanticsLabel\s*:\s*(?:'|")([\s\S]*?)(?:'|")/.test(d)) {
        const m = d.match(/semanticsLabel\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
        if (m) return m[1];
      }
      if (d && /tooltip\s*:\s*(?:'|")([\s\S]*?)(?:'|")/.test(d)) {
        const m = d.match(/tooltip\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
        if (m) return m[1];
      }
      // NEW: permissive fallback
      const q = extractQuoted(d);
      if (q) return q;

      if (Array.isArray(node.children)) {
        for (const c of node.children) {
          const got = extractChildText(c, depth + 1);
          if (got) return got;
        }
      }
      return undefined;
    };
    
    // Offstage 노드 식별 헬퍼
    const isOffstageNode = (n: any) =>
      typeof n?.description === 'string' &&
      /^Offstage/.test(n.description) &&
      /offstage:\s*true/.test(n.description);
    
    // 파일별 노드 카운트
    const fileCount = new Map<string, number>();
    
            const out: Array<{
          description: string;
          widgetType?: string;
          loc: { file: string; line: number; column: number };
          nodeId?: string;
          valueId?: string;
          objectId?: string;
          derivedLabel?: string;
          derivedLabelNorm?: string;
          rect?: { left: number; top: number; width: number; height: number };
        }> = [];

    const walk = async (node: any, offstage = false) => {
      if (!node) return;
      if (Array.isArray(node)) { for (const n of node) await walk(n, offstage); return; }
      
      const nextOffstage = offstage || isOffstageNode(node);
      const desc: string = node.description || node.name || '';
      const widgetType: string | undefined = node.widgetRuntimeType || node.type || undefined;
      
      let loc: { file: string; line: number; column: number } | undefined;
      if (node.creationLocation?.file) {
        loc = {
          file: node.creationLocation.file,
          line: node.creationLocation.line ?? 1,
          column: node.creationLocation.column ?? 1
        };
      } else if (node.location?.file) {
        loc = {
          file: node.location.file,
          line: node.location.line ?? 1,
          column: node.location.column ?? 1
        };
      }
      
      if (!nextOffstage && loc) {
        const isUserCode = this.isUserAppCode(loc.file);
        if (isUserCode && (desc || widgetType)) {
          // 파생 라벨 추출 (모든 패턴을 시도)
          let derivedLabel: string | undefined;
          
          // 1. Text("...") → 따옴표 안 텍스트 추출
          if (!derivedLabel && desc && /(?:^|\s)Text\((?:'|")([\s\S]*?)(?:'|")\)/.test(desc)) {
            const match = desc.match(/(?:^|\s)Text\((?:'|")([\s\S]*?)(?:'|")\)/);
            if (match) derivedLabel = match[1];
          }
          // 2. InputDecoration(labelText: "...") / hintText: → 값 추출
          if (!derivedLabel && desc && /(labelText|hintText)\s*:\s*(?:'|")([\s\S]*?)(?:'|")/.test(desc)) {
            const match = desc.match(/(labelText|hintText)\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
            if (match) derivedLabel = match[2];
          }
          // 3. RichText / TextSpan (text: "...") → 값 추출
          if (!derivedLabel && desc && /TextSpan\(\s*text\s*:\s*(?:'|")([\s\S]*?)(?:'|")/.test(desc)) {
            const match = desc.match(/TextSpan\(\s*text\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
            if (match) derivedLabel = match[1];
          }
          // 4. semanticsLabel: "..." → 값 추출
          if (!derivedLabel && desc && /semanticsLabel\s*:\s*(?:'|")([\s\S]*?)(?:'|")/.test(desc)) {
            const match = desc.match(/semanticsLabel\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
            if (match) derivedLabel = match[1];
          }
          // 5. tooltip: "..." → 값 추출
          if (!derivedLabel && desc && /tooltip\s*:\s*(?:'|")([\s\S]*?)(?:'|")/.test(desc)) {
            const match = desc.match(/tooltip\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
            if (match) derivedLabel = match[1];
          }
          // 6. fallback: permissive extractQuoted
          if (!derivedLabel && desc) {
            const q = extractQuoted(desc);
            if (q) derivedLabel = q;
          }
                // 7. 버튼류 → 자식 요약에서 가장 가까운 Text("...") 찾기
      if (!derivedLabel && widgetType && /(ElevatedButton|TextButton|OutlinedButton|InkWell|GestureDetector)/.test(widgetType)) {
        derivedLabel = extractChildText(node);
      }

              // 8. 💡 소스 코드 기반 텍스트 추출 (최후의 수단)
        if (!derivedLabel && widgetType && /(ElevatedButton|TextButton|OutlinedButton|BottomNavigationBarItem)/.test(widgetType) && loc && loc.file && loc.line) {
          try {
            const sourceText = this.extractTextFromSourceCode(loc.file, loc.line, widgetType);
            if (sourceText) {
              derivedLabel = sourceText;
              console.log(`[WidgetTree][SOURCE] Extracted from source: "${sourceText}" at ${loc.file.split('/').pop()}:${loc.line}`);
            }
          } catch (error) {
            console.log(`[WidgetTree][SOURCE] Failed to extract from source:`, error);
          }
        }
          
          // 🎯 실제 렌더링 위치 정보 가져오기
          let actualRect = { left: 0, top: 0, width: 100, height: 100 };
          try {
            const renderDetails = await this.callVmAsync({
              method: 'ext.flutter.inspector.getRenderObjectDetails',
              params: { isolateId: this.isolateId!, id: node.valueId || node.objectId, objectGroup: this.group }
            }).catch(() => null);
            
            if (renderDetails?.result?.renderObject?.offset && renderDetails?.result?.renderObject?.size) {
              const offset = renderDetails.result.renderObject.offset;
              const size = renderDetails.result.renderObject.size;
              actualRect = {
                left: offset.dx || 0,
                top: offset.dy || 0,
                width: size.width || 100,
                height: size.height || 100
              };
              console.log(`[WidgetTree][RECT] Got actual rect for ${widgetType} at ${loc.file.split('/').pop()}:${loc.line} → (${actualRect.left}, ${actualRect.top}, ${actualRect.width}x${actualRect.height})`);
          }
        } catch (e) {
            console.log(`[WidgetTree][RECT] Failed to get rect for ${widgetType}:`, e);
          }

          out.push({
            description: desc,
            widgetType,
            loc,
            nodeId: node.id,
            valueId: node.valueId,
            objectId: node.objectId,
            // @ts-ignore
            locationId: (node as any).locationId,
            derivedLabel,
            derivedLabelNorm: derivedLabel ? this._normLabel(derivedLabel) : undefined,
            rect: actualRect, // 실제 렌더링 위치 사용
          });
          fileCount.set(loc.file, (fileCount.get(loc.file) || 0) + 1);
        }
      }
      
      if (Array.isArray(node.children)) for (const c of node.children) await walk(c, nextOffstage);
    };

    await walk(root);

    // ── Post-pass: 요약 트리에 자식이 없어서 라벨을 못 뽑은 액션 노드 확장 ──
    for (const row of out) {
      if (row.derivedLabel) continue;
      const anyId = row.nodeId || row.objectId || row.valueId;
      if (!anyId) continue;
      try {
        // 1) children summary 우선
        let ch = await this.callVmAsync({
          method: 'ext.flutter.inspector.getChildrenSummaryTree',
          params: { isolateId: this.isolateId!, id: anyId, objectGroup: this.group }
        }).catch(() => null);
        let chRoot = this.normalizeInspectorRoot(ch?.result);
        let text = extractChildText(chRoot);
        if (!text) {
          // permissive scan on children summary
          const desc = chRoot && chRoot.description ? String(chRoot.description) : undefined;
          const q = extractQuoted(desc);
          if (q) text = q;
        }
        if (!text) {
          // detailsSubtree fallback
          let det = await this.callVmAsync({
        method: 'ext.flutter.inspector.getDetailsSubtree',
            params: { isolateId: this.isolateId!, id: anyId, objectGroup: this.group, subtreeDepth: 3 }
          }).catch(() => null);
          const detRoot = this.normalizeInspectorRoot(det?.result);
          text = extractChildText(detRoot);
          if (!text) {
            const d2 = detRoot && detRoot.description ? String(detRoot.description) : undefined;
            const q2 = extractQuoted(d2);
            if (q2) text = q2;
          }
        }
        if (text) {
          row.derivedLabel = text;
          row.derivedLabelNorm = this._normLabel(text);
        }
      } catch {}
    }
    
          // 다수결로 현재 화면 파일 선택 (Offstage 제외)
      // 단, main.dart는 제외 (보통 앱 진입점이므로 실제 화면이 아님)
      if (!this._activeFileAlive()) {
        let majorityFile: string | undefined;
        let maxCount = 0;
        
        // 파일별 위젯 수 로그
        console.log(`[ActiveScope] 📊 File distribution:`, Array.from(fileCount.entries()).map(([file, count]) => 
          `${file.split('/').pop()}:${count}`
        ).join(', '));
        
        // 실제 UI 요소만 카운트하는 로직
        const uiElementCount = new Map<string, number>();
        
        // 실제 UI 요소만 필터링하여 카운트
        for (const r of out) {
          if (r.loc?.file) {
            const desc = (r.description || r.widgetType || '').toLowerCase();
            // 실제 UI 요소만 카운트 (TextField, Button, Image, Text 등)
            if (desc.includes('textfield') || desc.includes('button') || 
                desc.includes('image') || desc.includes('icon') ||
                desc.includes('text') || desc.includes('elevatedbutton') ||
                desc.includes('textbutton') || desc.includes('inkwell')) {
              uiElementCount.set(r.loc.file, (uiElementCount.get(r.loc.file) || 0) + 1);
            }
          }
        }
        
        // 현재 화면의 위젯만 필터링 (Offstage나 숨겨진 위젯 제외)
        const visibleUiElementCount = new Map<string, number>();
        for (const r of out) {
          if (r.loc?.file && r.rect) {
            const desc = (r.description || r.widgetType || '').toLowerCase();
            // 실제 UI 요소이면서 화면에 보이는 위젯만 카운트
            if ((desc.includes('textfield') || desc.includes('button') || 
                desc.includes('image') || desc.includes('icon') ||
                desc.includes('text') || desc.includes('elevatedbutton') ||
                desc.includes('textbutton') || desc.includes('inkwell') ||
                desc.includes('bottomnavigationbar')) &&
                r.rect.width > 0 && r.rect.height > 0 && 
                r.rect.top >= 0 && r.rect.left >= 0) {
              visibleUiElementCount.set(r.loc.file, (visibleUiElementCount.get(r.loc.file) || 0) + 1);
            }
          }
        }
        
        // 보이는 UI 요소가 더 정확하므로 이를 우선 사용
        const finalCount = visibleUiElementCount.size > 0 ? visibleUiElementCount : uiElementCount;
        
        console.log(`[ActiveScope] 🎯 UI Element distribution:`, Array.from(finalCount.entries()).map(([file, count]) => 
          `${file.split('/').pop()}:${count}`
        ).join(', '));
        
        // UI 요소가 가장 많은 파일 선택
        for (const [f, c] of finalCount) {
          if (!f.includes('main.dart') && !f.includes('vector_graphics.dart') && c > maxCount) {
            maxCount = c;
            majorityFile = f;
          }
        }
        
        // main.dart 제외했는데도 파일이 없으면 기존 로직 사용
        if (!majorityFile) {
          for (const [f, c] of fileCount) {
            if (c > maxCount) {
              maxCount = c;
              majorityFile = f;
            }
          }
        }
        
        if (majorityFile) {
          console.log(`[ActiveScope] 🎯 Auto-detected majority file: ${majorityFile.split('/').pop()} (${maxCount} widgets)`);
          this._setActiveFile(majorityFile);
        } else {
          console.log(`[ActiveScope] ⚠️ No majority file detected, keeping current scope`);
        }
      }
    
    const withLabel = out.filter(n => !!n.derivedLabel).length;
    console.log('[WidgetTree] Total nodes:', out.length, 'with creationLocation:', out.filter(n => n.loc).length, 'with derivedLabel:', withLabel);
    console.log('[WidgetTree] Source files:', Array.from(fileCount.keys()).map(f => f.split('/').pop()).join(', '));
    const sample = out.filter(r => !this._activeFileAlive() || r.loc.file === this._activeFile).slice(0, 8).map(r => ({ f: r.loc.file.split('/').pop(), ln: r.loc.line, t: r.widgetType, label: r.derivedLabel }));
    console.log('[WidgetTree] sample for matching:', sample);
    if (withLabel === 0) {
      console.log('[WidgetTree] WARNING: derivedLabel extraction returned 0 items. Will rely on selection/active-file fallbacks.');
      // 추가 진단 로그 (디버깅 시에만 주석 해제)
      // const debugSamples = out.slice(0, 6).map(r => ({
      //   file: r.loc.file.split('/').pop(),
      //   line: r.loc.line,
      //   widgetType: r.widgetType,
      //   descSnippet: (r.description || '').slice(0, 120)
      // }));
      // console.log('[WidgetTree][debug] first rows (desc snippets):', debugSamples);
    }


    
    this.metrics.method1_widgetNormalization.extractedNodes = out.length;
    return out;
  }

  // ── 공통 단어 추출 (언어 무관) ──
  private extractCommonWords(text1: string, text2: string): string[] {
    const words1 = text1.split(/[\s\-_]+/).filter(w => w.length > 2);
    const words2 = text2.split(/[\s\-_]+/).filter(w => w.length > 2);
    return words1.filter(w1 => words2.some(w2 => w1.includes(w2) || w2.includes(w1)));
  }

  // ── 사용자 앱 코드 판별 (Flutter 프레임워크 파일 제외) ──
  private isUserAppCode(filePath: string): boolean {
    const excludePatterns = [
      'packages/flutter/lib',      // Flutter 프레임워크
      'packages/flutter/src',      // Flutter 소스
      'dart:',                     // Dart 내장 라이브러리
      '/flutter/packages/',        // Flutter 패키지
      'modal_barrier.dart',        // 모달 배경
      'navigator.dart',            // 네비게이션
      'route.dart',                // 라우팅
      'framework.dart',            // 프레임워크
      'binding.dart',              // 바인딩
      'widget.dart',               // 기본 위젯
      'material.dart',             // Material 내부
      'cupertino.dart',            // Cupertino 내부
    ];
    
    const lowerPath = filePath.toLowerCase();
    for (const pattern of excludePatterns) {
      if (lowerPath.includes(pattern.toLowerCase())) {
        return false;
      }
    }
    
    // 사용자 앱 코드로 간주 (lib/ 폴더이거나 프로젝트 루트)
    return filePath.includes('/lib/') || !filePath.includes('packages/');
  }

  // ── M5: 위치 기반 매칭 (Location-based Matching) ──
  private matchIssueToSummary(
    issue: { label?: string; elementType?: string; rect: { left: number; top: number; width: number; height: number } },
    idx: Array<{ 
      description: string; 
      widgetType?: string; 
      loc?: { file: string; line: number; column: number }; 
      nodeId?: string; 
      valueId?: string; 
      objectId?: string;
      derivedLabel?: string;
      derivedLabelNorm?: string;
      rect?: { left: number; top: number; width: number; height: number };
    }>
  ): { file: string; line: number; column: number; nodeId?: string; valueId?: string; objectId?: string; locationId?: string } | null {
    
    let pool = idx.filter(r => r.loc && r.rect);
    // 진단 정보 (필요시에만)
    // console.log('[Match][diag] pool-size=', pool.length, 'issue.label=', issue.label, 'issue.elementType=', issue.elementType);
    
    // 🎯 Active File 스코프 적용
    if (this._activeFileAlive()) {
      const scopedPool = pool.filter(r => r.loc?.file === this._activeFile);
      if (scopedPool.length > 0) {
        pool = scopedPool;
        console.log(`[Match] 🎯 Using existing Active File scope: ${this._activeFile?.split('/').pop()} (${pool.length} widgets)`);
        } else {
        console.log(`[Match] ⚠️ Active File scope exists but no widgets found: ${this._activeFile?.split('/').pop()}`);
      }
    } else {
      console.log(`[Match] 🔍 No Active File scope, auto-detecting from ${pool.length} widgets...`);
      // Active Scope가 없으면 현재 화면의 주요 파일을 자동 감지
      const fileCount = new Map<string, number>();
      for (const r of pool) {
        if (r.loc?.file) {
          const fileName = r.loc.file.split('/').pop() || '';
          // main.dart 제외하고 실제 페이지 파일들만 카운트
          if (!fileName.includes('main.dart') && !fileName.includes('vector_graphics.dart')) {
            fileCount.set(r.loc.file, (fileCount.get(r.loc.file) || 0) + 1);
          }
        }
      }
      
      console.log(`[Match] 📊 File distribution:`, Array.from(fileCount.entries()).map(([file, count]) => 
        `${file.split('/').pop()}:${count}`
      ).join(', '));
      
      // 가장 많은 위젯을 가진 파일을 Active Scope로 설정
      let maxCount = 0;
      let detectedFile: string | undefined;
      for (const [file, count] of fileCount) {
        if (count > maxCount) {
          maxCount = count;
          detectedFile = file;
        }
      }
      
      if (detectedFile) {
        const scopedPool = pool.filter(r => r.loc && r.loc.file === detectedFile);
        if (scopedPool.length > 0) {
          pool = scopedPool;
          console.log(`[Match] 🎯 Auto-detected Active File scope: ${detectedFile.split('/').pop()} (${pool.length} widgets)`);
        }
          } else {
        console.log(`[Match] ⚠️ No suitable file detected for Active Scope`);
      }
    }
    
    if (pool.length === 0) {
      console.log('[Match] ❌ No widgets with location and rect data');
      return null;
    }
    
    // 🎯 위치 기반 매칭 (Location-based Matching)
    const issueCenter = {
      x: issue.rect.left + issue.rect.width / 2,
      y: issue.rect.top + issue.rect.height / 2
    };
    
    console.log(`[Match] 🎯 Looking for widget near (${Math.round(issueCenter.x)}, ${Math.round(issueCenter.y)})`);
    
    // 🎯 UI Automator 정보 활용한 스마트 필터링
    const elementType = (issue.elementType || '').toLowerCase();
    const issueLabel = (issue.label || '').toLowerCase();
    let candidates = pool.filter(w => w.loc && w.rect);
    
    console.log(`[Match] 🎯 UI Automator Info: type=${elementType}, label="${issueLabel}"`);
    
    // 1. 라벨 기반 정확 매칭 (가장 우선순위)
    if (issueLabel) {
      const labelCandidates = candidates.filter(w => {
        const widgetDesc = (w.description || w.widgetType || '').toLowerCase();
        const widgetLabel = (w.derivedLabel || '').toLowerCase();
        
                // TextField의 경우 hintText/labelText 기반 정확 매칭
        if (elementType === 'textfield') {
          // 위젯 설명이 너무 단순하면 더 자세한 정보 추출 시도
          if (widgetDesc === 'textfield' || widgetDesc === 'signuppage') {
            console.log(`[Match] 🎯 TextField simple description detected: "${widgetDesc}"`);
            // 여기서는 일단 라벨 기반 매칭으로 fallback
            return widgetDesc.includes(issueLabel) || widgetDesc.includes('textfield');
          }
          
          // hintText/labelText 추출 시도
          const hintMatch = widgetDesc.match(/(hinttext|labeltext)\s*:\s*(?:'|")([\s\S]*?)(?:'|")/);
          if (hintMatch) {
            const hintText = hintMatch[2].toLowerCase();
            console.log(`[Match] 🎯 TextField hint comparison: "${hintText}" vs "${issueLabel}"`);
            
            // 정확 매칭 시도
            if (hintText === issueLabel) {
              console.log(`[Match] 🎯 TextField EXACT match: "${hintText}"`);
              return true;
            }
            
            // 부분 매칭으로 fallback
            if (hintText.includes(issueLabel) || issueLabel.includes(hintText)) {
              console.log(`[Match] 🎯 TextField partial match: "${hintText}" contains "${issueLabel}"`);
              return true;
            }
          }
          
          // derivedLabel로도 매칭 시도
          if (widgetLabel && (widgetLabel === issueLabel || widgetLabel.includes(issueLabel) || issueLabel.includes(widgetLabel))) {
            console.log(`[Match] 🎯 TextField derivedLabel match: "${widgetLabel}" vs "${issueLabel}"`);
            return true;
          }
        }
        
        // 기본 라벨 매칭
        return widgetDesc.includes(issueLabel) || widgetLabel.includes(issueLabel);
      });
      if (labelCandidates.length > 0) {
        candidates = labelCandidates;
        console.log(`[Match] 🎯 Label-based filtered to ${candidates.length} widgets: "${issueLabel}"`);
      }
    }
    
    // 1.5. 특별한 경우: TextButton, InkWell 등 인터랙티브 위젯 우선
    if (elementType === 'button' && issueLabel) {
      const interactiveCandidates = candidates.filter(w => {
        const desc = (w.description || w.widgetType || '').toLowerCase();
        // TextButton, InkWell, GestureDetector 등 인터랙티브 위젯 우선
        return desc.includes('textbutton') || desc.includes('inkwell') || desc.includes('gesturedetector');
      });
      if (interactiveCandidates.length > 0) {
        candidates = interactiveCandidates;
        console.log(`[Match] 🎯 Interactive widget filtered to ${candidates.length} widgets`);
      }
      
      // 네비게이션 바 아이콘 특별 처리 (tab 키워드만 사용)
      if (issueLabel.includes('tab')) {
        const navCandidates = candidates.filter(w => {
          const desc = (w.description || w.widgetType || '').toLowerCase();
          return desc.includes('bottomnavigationbar') || desc.includes('navigationbar');
        });
        if (navCandidates.length > 0) {
          candidates = navCandidates;
          console.log(`[Match] 🎯 Navigation bar widget filtered to ${candidates.length} widgets`);
        }
      }
    }
    
    // 2. 타입별 필터링
    if (elementType === 'button') {
      const buttonCandidates = candidates.filter(w => {
        const desc = (w.description || w.widgetType || '').toLowerCase();
        return desc.includes('button') || desc.includes('elevatedbutton') || desc.includes('textbutton') || 
               desc.includes('inkwell') || desc.includes('gesturedetector');
      });
      if (buttonCandidates.length > 0) {
        candidates = buttonCandidates;
        console.log(`[Match] 🎯 Type-based filtered to ${candidates.length} button widgets`);
      }
    } else if (elementType === 'image') {
      const imageCandidates = candidates.filter(w => {
        const desc = (w.description || w.widgetType || '').toLowerCase();
        return desc.includes('image') || desc.includes('icon');
      });
      if (imageCandidates.length > 0) {
        candidates = imageCandidates;
        console.log(`[Match] 🎯 Type-based filtered to ${candidates.length} image widgets`);
      }
    } else if (elementType === 'textfield') {
      const textFieldCandidates = candidates.filter(w => {
        const desc = (w.description || w.widgetType || '').toLowerCase();
        return desc.includes('textfield') || desc.includes('textformfield') || desc.includes('input');
      });
      if (textFieldCandidates.length > 0) {
        candidates = textFieldCandidates;
        console.log(`[Match] 🎯 Type-based filtered to ${candidates.length} textfield widgets`);
      }
    } else if (elementType === 'text') {
      const textCandidates = candidates.filter(w => {
        const desc = (w.description || w.widgetType || '').toLowerCase();
        return desc.includes('text') && !desc.includes('textfield');
      });
      if (textCandidates.length > 0) {
        candidates = textCandidates;
        console.log(`[Match] 🎯 Type-based filtered to ${candidates.length} text widgets`);
      }
    }
    
    // 가장 가까운 위젯 찾기 (컨테이너 제외 + 거리 기반)
    let bestMatch: any = null;
    let bestDistance = Infinity;
    
    for (const candidate of candidates) {
      if (!candidate.rect) continue; // rect가 없으면 스킵
      
      // 컨테이너 위젯 제외 (Scaffold, Container, Column, Row 등)
      const desc = (candidate.description || candidate.widgetType || '').toLowerCase();
      if (desc.includes('scaffold') || desc.includes('container') || 
          desc.includes('column') || desc.includes('row') || 
          desc.includes('safearea') || desc.includes('singlechildscrollview')) {
        continue; // 컨테이너는 건너뛰기
      }
      
      // 위젯의 중심점 계산
      const widgetCenter = {
        x: candidate.rect.left + candidate.rect.width / 2,
        y: candidate.rect.top + candidate.rect.height / 2
      };
      
      // 유클리드 거리 계산
      const distance = Math.sqrt(
        Math.pow(issueCenter.x - widgetCenter.x, 2) + 
        Math.pow(issueCenter.y - widgetCenter.y, 2)
      );
      
      // 더 가까운 위젯으로 업데이트
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = candidate;
      }
    }
    
    if (bestMatch && bestDistance < 5000) { // 5000px 이내면 매칭 성공
      console.log(`[Match] ✅ SUCCESS: Location-based match found!`);
          console.log(`[Match] 📍 Widget: ${bestMatch.loc.file.split('/').pop()}:${bestMatch.loc.line}:${bestMatch.loc.column} (${Math.round(bestDistance)}px)`);
      
      return {
        ...bestMatch.loc,
        nodeId: bestMatch.nodeId,
        valueId: bestMatch.valueId,
        objectId: bestMatch.objectId,
        locationId: (bestMatch as any).locationId,
      };
    }
    
    console.log(`[Match] ❌ No match found (best distance: ${Math.round(bestDistance)}px)`);
      return null;
  }









  // ── VM 호출 도우미 ──
  private callVm(payload: any, onReply?: (msg: any) => void) {
    if (!this.vmWs || this.vmWs.readyState !== WebSocket.OPEN) return;
    const id = this.nextId++; const msg = { id, ...payload }; 
    if (onReply) {
      const handle = (data: WebSocket.RawData) => {
        const m = safeParse(data.toString());
        if (m?.id === id) { this.vmWs?.off('message', handle); onReply(m); }
      };
      this.vmWs.on('message', handle);
    }
    this.vmWs.send(JSON.stringify(msg));
  }
  private callVmAsync(payload: any): Promise<any> {
    return new Promise((resolve) => this.callVm(payload, resolve));
  }

  // ── 대시보드 브로드캐스트 ──
  private broadcast(obj: any) {
    if (!this.wss) return;
    const msg = JSON.stringify(obj);
    for (const c of this.wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
  }

  // ── 소스 코드 기반 텍스트 추출 ──
  private extractTextFromSourceCode(filePath: string, startLine: number, widgetType: string): string | null {
    try {
      // file:// 프로토콜 제거
      let cleanPath = filePath;
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.substring(7);
      }

      // 파일 읽기
      const fs = require('fs');
      if (!fs.existsSync(cleanPath)) {
        console.log(`[WidgetTree][SOURCE] File not found: ${cleanPath}`);
        return null;
      }

      const content = fs.readFileSync(cleanPath, 'utf8');
      const lines = content.split('\n');
      
      // 버튼 시작 라인부터 텍스트 검색 (최대 30라인 범위)
      const searchRange = Math.min(30, lines.length - startLine + 1);
      
      for (let i = 0; i < searchRange; i++) {
        const lineIndex = startLine - 1 + i; // 0-based 인덱스
        if (lineIndex >= lines.length) break;
        
        const line = lines[lineIndex];
        
        // Text('...') 또는 Text("...") 패턴 찾기
        const textMatch = line.match(/Text\s*\(\s*['"](.*?)['"]\s*[,)]/);
        if (textMatch && textMatch[1]) {
          const extractedText = textMatch[1].trim();
          if (extractedText.length > 0) {
            console.log(`[WidgetTree][SOURCE] Found Text('${extractedText}') at line ${lineIndex + 1}`);
            return extractedText;
          }
        }
        
        // BottomNavigationBarItem의 label 패턴 찾기
        const navMatch = line.match(/label\s*:\s*['"](.*?)['"]\s*[,)]/);
        if (navMatch && navMatch[1]) {
          const extractedText = navMatch[1].trim();
          if (extractedText.length > 0) {
            console.log(`[WidgetTree][SOURCE] Found Navigation label('${extractedText}') at line ${lineIndex + 1}`);
            return extractedText;
          }
        }
      }
      
      console.log(`[WidgetTree][SOURCE] No Text found in ${searchRange} lines starting from ${startLine}`);
      return null;
    } catch (error) {
      console.log(`[WidgetTree][SOURCE] Error reading source:`, error);
      return null;
    }
  }


}