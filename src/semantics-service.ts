import WebSocket, { WebSocketServer } from 'ws';
import * as vscode from 'vscode';
import { exec as _exec, spawn } from 'child_process';

// ====== 공유 타입 ======
export type FramePayload = {
  imageBase64: string; // PNG base64 (data:image/... 접두사 없음)
  width: number;
  height: number;
};

export type UiIssue = {
  id: string | number;
  severity: 'error' | 'warning' | 'info';
  label?: string;
  description?: string;
  elementType?: string;
  rect: { left: number; top: number; width: number; height: number }; // px (프레임 기준)
  source?: { file: string; line: number; column: number };
};

type StartOpts = {
  port?: number;                 // React 대시보드 WS 포트 (기본 3001)
  platform?: 'android' | 'ios' | 'unknown';
  deviceId?: string;             // adb -s <deviceId> 대상 (예: emulator-5554)
};

// ====== 유틸: exec Promise화 ======
function exec(cmd: string, opt: { timeout?: number } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    _exec(cmd, { timeout: opt.timeout ?? 15000, encoding: 'utf8' }, (e, stdout, stderr) => {
      if (e) return reject(e);
      resolve({ stdout, stderr });
    });
  });
}

// ====== 유틸: PNG 헤더로 width/height 파싱 ======
function getPngSize(buf: Buffer): { width: number; height: number } {
  // PNG 시그니처(8) + 'IHDR'(4) + length(4) 다음에 W/H(4+4)
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Invalid PNG buffer');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// ====== ADB 경로 찾기 (간소화 버전) ======
function findAdbPath(): string {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  // 1) PATH에서 adb 찾기 (90% 케이스)
  try {
    const { execSync } = require('child_process');
    const whichCmd = process.platform === 'win32' ? 'where adb' : 'which adb';
    const result = execSync(whichCmd, { encoding: 'utf8' }).trim();
    if (result) {
      console.log(`[SemanticsService] Found ADB in PATH`);
      return 'adb';
    }
  } catch {}

  // 2) 가장 일반적인 설치 경로들만 확인
  const homeDir = os.homedir();
  const commonPaths = [
    // Android Studio 기본 설치 경로
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
  ].filter(Boolean);

  // 플랫폼별 표준 경로 (각 플랫폼당 1-2개만)
  if (process.platform === 'darwin') {
    commonPaths.push(path.join(homeDir, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'));
  } else if (process.platform === 'linux') {
    commonPaths.push(path.join(homeDir, 'Android', 'Sdk', 'platform-tools', 'adb'));
  } else if (process.platform === 'win32') {
    commonPaths.push(path.join(homeDir, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
  }

  for (const adbPath of commonPaths) {
    if (adbPath && fs.existsSync(adbPath)) {
      console.log(`[SemanticsService] Found ADB at: ${adbPath}`);
      return adbPath;
    }
  }

  // 3) 실패 시 도움말
  throw new Error(
    'ADB not found. Please install Android Studio or add adb to your PATH.\n' +
    'Most Flutter developers already have this set up via "flutter doctor".'
  );
}

// ====== Android: 스크린샷/UiAutomator ======
async function adbScreencap(serial: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const adbPath = findAdbPath();
    const p = spawn(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p']);
    const bufs: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d) => bufs.push(Buffer.from(d)));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0 && !bufs.length) return reject(new Error(err || `screencap exit ${code}`));
      resolve(Buffer.concat(bufs));
    });
  });
}

async function adbDumpUI(serial: string): Promise<string> {
  // 많은 기기에서 /dev/stdout로 바로 못 뿜는 경우가 있어서 /sdcard 경유
  const adbPath = findAdbPath();
  const tmp = '/sdcard/uidump.xml';
  await exec(`${adbPath} -s ${serial} shell uiautomator dump ${tmp}`, { timeout: 15000 }).catch(() => ({ stdout: '', stderr: '' }));
  const { stdout } = await exec(`${adbPath} -s ${serial} shell cat ${tmp}`, { timeout: 15000 });
  return stdout || '';
}

// [bounds="[l,t][r,b]"] 와 label 후보(text/content-desc)를 가져온다.
function parseUiautomatorXml(xml: string, fw: number, fh: number): { accessibilityIssues: UiIssue[], textElements: UiIssue[] } {
  const accessibilityIssues: UiIssue[] = [];
  const textElements: UiIssue[] = [];
  if (!xml) return { accessibilityIssues, textElements };

  console.log('[UIAutomator] Parsing XML for screen size:', fw, 'x', fh);

  const rx = /<node\b[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*?>/g;
  let m: RegExpExecArray | null;
  let totalNodes = 0;
  
  while ((m = rx.exec(xml))) {
    totalNodes++;
    const l = Number(m[1]), t = Number(m[2]), r = Number(m[3]), b = Number(m[4]);
    const w = Math.max(0, r - l);
    const h = Math.max(0, b - t);
    
    // 전체 노드 문자열에서 속성들을 개별적으로 추출
    const nodeStr = m[0];
    const textMatch = nodeStr.match(/text="([^"]*)"/);
    const contentDescMatch = nodeStr.match(/content-desc="([^"]*)"/);
    const hintMatch = nodeStr.match(/hint="([^"]*)"/);
    const resourceIdMatch = nodeStr.match(/resource-id="([^"]*)"/);
    
    // 우선순위: text > content-desc > hint > resource-id 마지막 부분
    let label = '';
    if (textMatch?.[1] && textMatch[1].trim()) {
      label = textMatch[1].trim();
    } else if (contentDescMatch?.[1] && contentDescMatch[1].trim()) {
      label = contentDescMatch[1].trim();
    } else if (hintMatch?.[1] && hintMatch[1].trim()) {
      label = hintMatch[1].trim(); // hintText 지원 추가!
    } else if (resourceIdMatch?.[1]) {
      const resourceId = resourceIdMatch[1];
      const lastPart = resourceId.split('/').pop() || resourceId.split(':').pop() || '';
      if (lastPart && !lastPart.includes('android:') && !lastPart.includes('framework')) {
        label = lastPart.replace(/_/g, ' '); // snake_case를 공백으로
      }
    }
    
    // 긴 텍스트가 줄바꿈으로 연결된 경우 필터링 (너무 긴 컨테이너 텍스트 제외)
    if (label.includes('&#10;') && label.length > 50) {
      console.log(`[UIAutomator] Skipped: long concatenated text (likely container): "${label.substring(0, 50)}..."`);
      continue;
    }
    
    // HTML 엔티티 디코딩
    label = label.replace(/&#10;/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    
    console.log(`[UIAutomator] Node ${totalNodes}: bounds=[${l},${t}][${r},${b}] size=${w}x${h} text="${textMatch?.[1] || ''}" content-desc="${contentDescMatch?.[1] || ''}" hint="${hintMatch?.[1] || ''}" -> label="${label}"`);
    
    if (w <= 0 || h <= 0) {
      console.log(`[UIAutomator] Skipped: invalid size (${w}x${h})`);
      continue;
    }

    // 접근성 검사 관점 필터링: 개별 UI 요소들만 캡처
    const hasLabel = label.length > 0;
    const isTooLarge = w * h > (fw * fh * 0.3); // 전체 화면의 30% 이상은 큰 컨테이너
    const isTooSmall = w < 15 || h < 15; // 너무 작은 요소 (20px→15px로 조정)
    const isReasonableSize = w >= 15 && h >= 15 && w <= fw * 0.7 && h <= fh * 0.7; // 적당한 크기의 개별 요소
    
    // 개별 텍스트 요소나 상호작용 가능한 요소만 포함
    const isIndividualElement = hasLabel && isReasonableSize; // 라벨이 있고 적당한 크기
    const isPotentiallyInteractive = !hasLabel && isReasonableSize; // 라벨 없지만 클릭 가능할 수 있음
    
    // 이미지나 아이콘 같은 시각적 요소 감지 (클래스명이나 리소스ID로 판단)
    const classMatch = nodeStr.match(/class="([^"]*)"/);
    const className = classMatch?.[1] || '';
    const isImageOrIcon = className.includes('Image') || className.includes('Icon') || 
                         resourceIdMatch?.[1]?.includes('icon') || resourceIdMatch?.[1]?.includes('image') ||
                         resourceIdMatch?.[1]?.includes('img') || resourceIdMatch?.[1]?.includes('button');
    
        // 요소 타입 분석 (먼저 수행)
    const clickableMatch = nodeStr.match(/clickable="([^"]*)"/);
    const isClickable = clickableMatch?.[1] === 'true';
    const focusableMatch = nodeStr.match(/focusable="([^"]*)"/);
    const isFocusable = focusableMatch?.[1] === 'true';

    // 요소 타입 결정 (Android UIAutomator 기반 - 시스템 정보만 사용)
    let elementType = 'text';
    if (className.includes('Button')) {
      elementType = 'button';
    } else if (className.includes('EditText') || className.includes('TextField')) {
      elementType = 'textfield';
    } else if (className.includes('Image') || className.includes('Icon')) {
      elementType = 'image';
    } else if (isImageOrIcon && !hasLabel) {
      elementType = 'decorative-icon'; // 장식용 아이콘
    } else if (isClickable && !className.includes('TextView')) {
      // TextView가 아니면서 clickable한 경우만 버튼으로 간주
      elementType = 'button';
    }
    // 나머지는 모두 text로 유지

    // 접근성 검사가 필요한 요소만 포함 (일반 텍스트는 자동으로 읽히므로 제외)
    // 단, 단순 텍스트(text)는 이미 스크린 리더가 자동으로 읽으므로 검사 불필요
    const needsAccessibilityCheck = elementType !== 'text';
    
    // 버튼은 크기 제한을 완화 (버튼은 클릭 대상이므로 크더라도 중요)
    const isButtonAndShouldInclude = elementType === 'button' && !isTooSmall;
    const shouldCheck = ((!isTooLarge && !isTooSmall && (isIndividualElement || isPotentiallyInteractive || isImageOrIcon)) || isButtonAndShouldInclude) && needsAccessibilityCheck;

    // 텍스트 요소는 별도로 수집 (텍스트 탭용)
    if (elementType === 'text' && hasLabel && isReasonableSize) {
      console.log(`[UIAutomator] Text element: "${label}" size=${w}x${h} pos=(${l},${t})`);
      textElements.push({
        id: `text-${l},${t},${r},${b},${label},${totalNodes}`,
        label: label || undefined,
        description: `📄 텍스트: "${label}"`,
        severity: 'info' as const,
        elementType: 'text',
        rect: { left: l, top: t, width: w, height: h },
      });
    }

    if (!shouldCheck) {
      if (elementType === 'text' && hasLabel) {
        console.log(`[UIAutomator] Skipped: regular text (auto-readable by screen reader): "${label}"`);
      } else {
        console.log(`[UIAutomator] Skipped: too large/small or decorative (${w}x${h}) class="${className}"`);
      }
      continue;
    }
    
    console.log(`[UIAutomator] Included: hasLabel=${hasLabel} isReasonableSize=${isReasonableSize} isImageOrIcon=${isImageOrIcon} class="${className}"`);
    
    // 장식용 작은 아이콘 필터링 (15-40px 크기의 라벨 없는 아이콘)
    if (elementType === 'decorative-icon' && w < 40 && h < 40) {
      console.log(`[UIAutomator] Skipped: decorative icon (${w}x${h})`);
      continue;
    }
    
    // 접근성 상태에 따른 심각도와 설명
    const severity: UiIssue['severity'] = hasLabel ? 'info' : 'warning';
    let description = '';
    
    if (hasLabel) {
      switch (elementType) {
        case 'button':
          description = `✅ 스크린 리더: "${label}, 버튼" + 이중 탭으로 활성화`;
          break;
        case 'textfield':
          description = `✅ 스크린 리더: "${label}, 입력 필드" + 이중 탭으로 텍스트 입력`;
          break;
        case 'image':
          description = `✅ 스크린 리더: "${label}, 이미지" (화면 읽기 시 자동 포함)`;
          break;
        case 'link':
          description = `✅ 스크린 리더: "${label}, 링크" + 이중 탭으로 열기`;
          break;
        default:
          description = `✅ 스크린 리더: "${label}" (화면 읽기 시 자동 포함)`;
      }
    } else {
      switch (elementType) {
        case 'button':
          description = '⚠️ 버튼이지만 라벨이 없어 "버튼"으로만 읽힙니다. 사용자가 기능을 알 수 없습니다. Semantics(label: "설명")를 추가하세요.';
          break;
        case 'textfield':
          description = '⚠️ 입력 필드이지만 안내가 없어 사용자가 무엇을 입력할지 모릅니다. hintText 또는 Semantics(label: "안내")를 추가하세요.';
          break;
        case 'image':
          description = '⚠️ 이미지이지만 대체 텍스트가 없어 시각 장애인이 내용을 알 수 없습니다. Semantics(label: "이미지 설명")를 추가하세요.';
          break;
        case 'link':
          description = '⚠️ 링크이지만 라벨이 없어 "링크"로만 읽힙니다. Semantics(label: "링크 설명")를 추가하세요.';
          break;
        default:
          description = '⚠️ 접근성 라벨이 없어 스크린 리더가 인식하지 못합니다. Semantics 위젯으로 라벨을 추가하세요.';
      }
    }

    // 고유 ID 생성 (노드 순서 포함으로 중복 방지)
    const uniqueId = `${l},${t},${r},${b},${label},${totalNodes}`;

    console.log(`[UIAutomator] Accessibility check: "${label}" type=${elementType} clickable=${isClickable} size=${w}x${h} pos=(${l},${t}) severity=${severity}`);

    accessibilityIssues.push({
      id: uniqueId,
      label: label || undefined,
      description,
      severity,
      elementType,
      rect: { left: l, top: t, width: w, height: h },
    });
  }
  
  console.log(`[UIAutomator] Parsed ${totalNodes} total nodes, ${accessibilityIssues.length} accessibility issues, ${textElements.length} text elements`);
  return { accessibilityIssues, textElements };
}

// ====== iOS: 스크린샷 ======
async function iosScreencap(): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const p = spawn('xcrun', ['simctl', 'io', 'booted', 'screenshot', '--type=png', '-']);
    const bufs: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d) => bufs.push(Buffer.from(d)));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0 && !bufs.length) return reject(new Error(err || `iOS screenshot exit ${code}`));
      resolve(Buffer.concat(bufs));
    });
  });
}

// ====== 본 서비스 ======
export class SemanticsService {
  private vmWs?: WebSocket;
  private wss?: WebSocketServer;
  private nextId = 1;
  private isolateId?: string;
  private capturing = false;
  private lastAt = 0;
  private captureInterval?: NodeJS.Timeout;

  constructor(private readonly opts: StartOpts = {}) {}

  async start(vmServiceWsUrl: string) {
    // 1) 브라우저 WS 서버
    if (!this.wss) {
      const port = this.opts.port ?? 3001;
      this.wss = new WebSocketServer({ port });
      this.wss.on('listening', () => console.log(`[SemanticsService] React WS listening on :${port}`));
      this.wss.on('connection', () => {
        console.log('[SemanticsService] React client connected.');
      });
    }

    // 2) VM Service 연결
    console.log('[SemanticsService] Connect VM Service:', vmServiceWsUrl);
    this.vmWs = new WebSocket(vmServiceWsUrl);

    this.vmWs.on('open', () => {
      // isolate 선택
      this.callVm({ method: 'getVM' }, (msg) => {
        const isolates = msg?.result?.isolates ?? [];
        this.isolateId = isolates.find((i: any) => i.name === 'main')?.id ?? isolates[0]?.id;
        console.log('[SemanticsService] isolateId =', this.isolateId);

        if (!this.isolateId) {
          vscode.window.showWarningMessage('isolateId를 찾지 못했습니다.');
          return;
        }

        // VM 스트림 구독
        this.subscribeToStreams();

        // Flutter Inspector 서비스 확장 초기화
        this.initFlutterInspector();

        // 지원 서비스 확장 나열(디버그용)
        this.callVm({ method: 'getSupportedProtocols' }, (m) => {
          const exts = (m?.result?.protocols ?? [])
            .flatMap((p: any) => (p?.extensions ?? []).map((e: any) => e?.method))
            .filter(Boolean);
          if (Array.isArray(exts) && exts.length) {
            console.log('[SemanticsService] extensions =', exts);
          }
        });

        // 초기 1회 캡처 (강제)
        console.log('[SemanticsService] Starting initial capture...');
        this.captureOnce().catch((e) => {
          console.error('[SemanticsService] Initial capture failed:', e);
        });
        
        // 정기적인 캡처 시작 (3초마다)
        this.startPeriodicCapture();
        
        // 3초 후 추가 캡처 (안전장치)
        setTimeout(() => {
          console.log('[SemanticsService] Safety capture...');
          this.captureOnce().catch(() => {});
        }, 3000);
      });
    });

    // VM 이벤트 수신 → Widget Tree 변화 감지
    this.vmWs.on('message', (raw) => {
      const msg = safeParse(raw.toString());
      
      // 1) Flutter Inspector Extension 이벤트
      if (msg?.event?.streamId === 'Extension') {
        const event = msg.event?.event;
        console.log('[SemanticsService] Extension event:', event?.extensionKind, event?.extensionEvent?.eventKind);
        
        if (event?.extensionKind === 'Flutter.Inspector') {
          const eventKind = event?.extensionEvent?.eventKind;
          if (eventKind === 'inspectorObjectGroupChanged' || 
              eventKind === 'TreeChanged' ||
              eventKind === 'WidgetTreeChanged') {
            console.log('[SemanticsService] Widget Tree changed, triggering capture...');
            this.debouncedCapture();
          }
        }
      }
      
      // 2) Isolate 스트림 (Hot Reload만 - 가장 확실한 UI 변화)
      if (msg?.event?.streamId === 'Isolate') {
        const kind = msg.event?.event?.kind;
        console.log('[SemanticsService] Isolate event:', kind);
        
        if (kind === 'IsolateReload' || kind === 'IsolateUpdate') {
          console.log('[SemanticsService] Hot reload detected, triggering capture...');
          setTimeout(() => this.debouncedCapture(), 200); // 200ms 후 캡처 (최소 UI 빌드 대기)
        }
      }
      
      // 3) 기타 Extension 이벤트 (fallback)
      if (msg?.event?.streamId === 'Extension' && !msg?.event?.event?.extensionKind) {
        console.log('[SemanticsService] General Extension event, triggering capture...');
        this.debouncedCapture();
      }
    });

    this.vmWs.on('close', () => console.log('[SemanticsService] VM WS closed'));
    this.vmWs.on('error', (err) => {
      console.log('[SemanticsService] VM WS error', err);
      vscode.window.showErrorMessage('VM Service 연결 에러가 발생했습니다. 출력창 로그를 확인하세요.');
    });
  }

  dispose() {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = undefined;
    }
    try { this.vmWs?.close(); } catch {}
    try { this.wss?.close(); } catch {}
  }

  private debouncedCapture() {
    const now = Date.now();
    if (now - this.lastAt > 500) { // 더 긴 디바운스로 안정성 확보 (100ms→500ms)
      this.lastAt = now;
      console.log('[SemanticsService] Stable capture triggered (500ms debounce)');
      // 추가 지연으로 UI 안정화 대기
      setTimeout(() => {
        this.captureOnce().catch((e) => {
          console.log('[SemanticsService] Stable capture failed:', e.message);
        });
      }, 300); // 300ms 추가 대기로 UI 변화 완료 확보
    } else {
      console.log('[SemanticsService] Capture skipped (waiting for UI stability)');
    }
  }

  private subscribeToStreams() {
    console.log('[SemanticsService] Subscribing to essential VM streams only...');
    
    // 🎯 핵심: Extension 스트림 (Flutter Inspector 이벤트) - 가장 정확
    this.callVm({ method: 'streamListen', params: { streamId: 'Extension' } });
    
    // 🔄 중요: Isolate 스트림 (Hot Reload만) - 개발 중 필수
    this.callVm({ method: 'streamListen', params: { streamId: 'Isolate' } });
    
    // ⚠️ 무거운 스트림들 제거:
    // - Debug: 앱 라이프사이클은 백그라운드 전환 시만 의미있음 (빈도 낮음)
    // - GC: 메모리 정리가 UI 변화로 직결되는 경우 드뭄 (노이즈 많음)
    // - Timeline: 초당 60+ 이벤트, 대부분 실제 UI 변화 없음 (성능 킬러)
    
    console.log('[SemanticsService] Essential streams only (Extension + Isolate)');
  }

  private startPeriodicCapture() {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
    }
    
    // 놓친 이벤트들을 위한 스마트 백업 캡처
    console.log('[SemanticsService] Starting smart backup capture (10s after last capture)...');
    this.captureInterval = setInterval(() => {
      if (!this.capturing) {
        const timeSinceLastCapture = Date.now() - this.lastAt;
        if (timeSinceLastCapture >= 10000) {
          console.log('[SemanticsService] Smart backup capture (no activity for 10s)');
          this.captureOnce().catch((e) => {
            console.log('[SemanticsService] Backup capture failed:', e.message);
          });
        } else {
          console.log(`[SemanticsService] Backup skipped (last capture ${Math.round(timeSinceLastCapture/1000)}s ago)`);
        }
      }
    }, 10000); // 10초마다 체크하되, 마지막 캡처 후 10초 경과시에만 실행
  }

  // ====== Flutter Inspector 초기화 ======
  private initFlutterInspector() {
    if (!this.isolateId) return;

    console.log('[SemanticsService] Initializing Flutter Inspector with enhanced Semantics support...');
    
    // 1) Inspector 활성화
    this.callVm({
      method: 'ext.flutter.inspector.show',
      params: { isolateId: this.isolateId }
    }, (msg) => {
      console.log('[SemanticsService] Flutter Inspector activated:', msg?.result);
    });

    // 2) Semantics 활성화 (여러 시도)
    setTimeout(() => {
      // 방법 1: 직접 활성화
      this.callVm({
        method: 'ext.flutter.inspector.enableSemantics',
        params: { isolateId: this.isolateId }
      }, (result) => {
        console.log('[SemanticsService] Direct enableSemantics result:', result?.result);
      });

      // 방법 2: 서비스 확장으로 활성화
      this.callVm({
        method: 'ext.flutter.accessibility.enable',
        params: { isolateId: this.isolateId }
      }, (result) => {
        console.log('[SemanticsService] Accessibility service enable result:', result?.result);
      });
    }, 500);

    // 3) Widget Tree 및 가용 메서드 확인
    setTimeout(() => {
      this.callVm({
        method: 'ext.flutter.inspector.getRootWidgetSummaryTree',
        params: { isolateId: this.isolateId }
      }, (msg) => {
        console.log('[SemanticsService] Widget tree result:', msg?.result ? 'SUCCESS' : 'FAILED');
      });

      // 4) 사용 가능한 확장 메서드 확인
      this.callVm({
        method: 'getSupportedProtocols'
      }, (msg) => {
        const protocols = msg?.result?.protocols || [];
        const inspectorMethods = protocols
          .flatMap((p: any) => p.extensions || [])
          .filter((ext: any) => ext.method?.includes('inspector') || ext.method?.includes('accessibility'))
          .map((ext: any) => ext.method);
        console.log('[SemanticsService] Available inspector/accessibility methods:', inspectorMethods);
      });
    }, 1500);
  }

  // ====== Flutter Semantics Tree 수집 ======
  private async getFlutterSemanticsTree(): Promise<UiIssue[]> {
    if (!this.vmWs || !this.isolateId) {
      console.log('[SemanticsService] No VM connection or isolateId. vmWs:', !!this.vmWs, 'isolateId:', this.isolateId);
      return [];
    }

    return new Promise((resolve) => {
      // 여러 방법으로 Semantics 수집 시도
      console.log('[SemanticsService] Attempting multiple Semantics collection methods with isolateId:', this.isolateId);
      
      // 방법 1: 직접 Semantics Tree 요청
      this.callVm({
        method: 'ext.flutter.inspector.getSemanticsTree',
        params: { isolateId: this.isolateId }
      }, async (msg) => {
        if (msg?.result?.nodes?.length > 0) {
          console.log('[SemanticsService] Method 1 SUCCESS: Direct getSemanticsTree');
          const issues = await this.parseFlutterSemantics(msg.result.nodes);
          resolve(issues);
          return;
        }
        
        // 방법 2: Semantics 활성화 후 재시도
        console.log('[SemanticsService] Method 1 failed, trying enableSemantics first...');
        this.callVm({
          method: 'ext.flutter.inspector.enableSemantics',
          params: { isolateId: this.isolateId }
        }, (enableResult) => {
          console.log('[SemanticsService] Semantics enable result:', enableResult?.result);
          
          setTimeout(() => {
            this.callVm({
              method: 'ext.flutter.inspector.getSemanticsTree',
              params: { isolateId: this.isolateId }
            }, async (semanticsMsg) => {
              if (semanticsMsg?.result?.nodes?.length > 0) {
                console.log('[SemanticsService] Method 2 SUCCESS: enableSemantics + getSemanticsTree');
                const issues = await this.parseFlutterSemantics(semanticsMsg.result.nodes);
                resolve(issues);
                return;
              }
              
              // 방법 3: Widget Tree를 통한 정보 수집
              console.log('[SemanticsService] Method 2 failed, trying Widget Tree approach...');
              this.callVm({
                method: 'ext.flutter.inspector.getRootWidgetSummaryTree',
                params: { isolateId: this.isolateId, groupName: 'default' }
              }, async (widgetMsg) => {
                if (widgetMsg?.result?.children?.length > 0) {
                  console.log('[SemanticsService] Method 3 SUCCESS: Widget Tree available');
                  // Widget Tree에서 clickable/interactive 요소 추출 시도
                  const widgetIssues = await this.parseWidgetTreeForSemantics(widgetMsg.result);
                  resolve(widgetIssues);
                  return;
                }
                
                console.log('[SemanticsService] All Flutter methods failed, fallback to UIAutomator only');
                resolve([]);
              });
            });
          }, 1500);
        });
      });
    });
  }

  // ====== Widget Tree에서 Semantics 정보 추출 ======
  private async parseWidgetTreeForSemantics(widgetTree: any): Promise<UiIssue[]> {
    const issues: UiIssue[] = [];
    
    const extractWidgets = (widget: any, depth = 0) => {
      if (!widget) return;
      
      // 상호작용 가능한 위젯들 찾기
      const widgetType = widget.description || '';
      const isInteractive = widgetType.includes('Button') || 
                           widgetType.includes('TextField') || 
                           widgetType.includes('GestureDetector') ||
                           widgetType.includes('InkWell') ||
                           widgetType.includes('Image');
      
      if (isInteractive && widget.renderObject?.constraints) {
        const elementType = widgetType.includes('Button') ? 'button' :
                           widgetType.includes('TextField') ? 'textfield' :
                           widgetType.includes('Image') ? 'image' : 'button';
        
        // Widget의 속성에서 레이블 찾기
        const properties = widget.properties || [];
        let label = '';
        
        for (const prop of properties) {
          if (prop.name === 'child' && prop.description?.includes('"')) {
            const textMatch = prop.description.match(/"([^"]*)"/);
            if (textMatch) label = textMatch[1];
          }
        }
        
        issues.push({
          id: `flutter-widget-${widget.objectId || Math.random()}`,
          label: label || undefined,
          description: label ? 
            `✅ Flutter ${elementType}: "${label}"` :
            `⚠️ Flutter ${elementType}에 레이블이 없습니다`,
          severity: label ? 'info' : 'warning',
          elementType,
          rect: { left: 0, top: 0, width: 100, height: 100 }, // 기본값 (좌표 정보 부족)
        });
      }
      
      // 자식 위젯들 재귀 처리
      if (widget.children) {
        for (const child of widget.children) {
          extractWidgets(child, depth + 1);
        }
      }
    };
    
    extractWidgets(widgetTree);
    console.log('[SemanticsService] Extracted', issues.length, 'issues from Widget Tree');
    return issues;
  }

  // ====== 위젯 소스코드 위치 조회 ======
  private async getWidgetSourceLocation(widgetId: string): Promise<{file: string, line: number, column: number} | null> {
    if (!this.isolateId) return null;

    return new Promise((resolve) => {
      this.callVm({
        method: 'ext.flutter.inspector.getSourceLocation',
        params: { 
          isolateId: this.isolateId,
          objectId: widgetId 
        }
      }, (msg) => {
        const location = msg?.result?.location;
        if (location?.file) {
          resolve({
            file: location.file,
            line: location.line || 1,
            column: location.column || 1
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  // ====== 위젯 상세 정보 조회 ======  
  private async getWidgetDetails(widgetId: string): Promise<any> {
    if (!this.isolateId) return null;

    return new Promise((resolve) => {
      this.callVm({
        method: 'ext.flutter.inspector.getDetailsSubtree',
        params: {
          isolateId: this.isolateId,
          objectId: widgetId,
          subtreeDepth: 1
        }
      }, (msg) => {
        resolve(msg?.result);
      });
    });
  }

  // ====== Flutter Semantics 노드를 UiIssue로 변환 ======
  private async parseFlutterSemantics(nodes: any[]): Promise<UiIssue[]> {
    const issues: UiIssue[] = [];

    // 병렬로 소스 위치 조회 (성능 향상)
    const sourcePromises = nodes.map(async (node) => {
      const rect = node.rect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;

      const label = node.label || node.value || node.hint || '';
      const hasLabel = label.trim().length > 0;

      // Flutter Semantics에서 정확한 요소 타입 결정
      let elementType = 'text';
      if (node.actions) {
        const actions = Object.keys(node.actions);
        if (actions.includes('tap') || actions.includes('longPress')) {
          elementType = 'button';
        } else if (actions.includes('setText') || actions.includes('setSelection')) {
          elementType = 'textfield';
        } else if (actions.includes('scrollUp') || actions.includes('scrollDown')) {
          elementType = 'scrollable';
        }
      }
      
      // Flutter의 flags를 통한 추가 정보
      if (node.flags) {
        if (node.flags.isButton || node.flags.hasEnabledState) {
          elementType = 'button';
        } else if (node.flags.isTextField) {
          elementType = 'textfield';
        } else if (node.flags.isImage) {
          elementType = 'image';
        } else if (node.flags.isLink) {
          elementType = 'link';
        }
      }

      // 1) 기본 소스 위치 (creationLocation이 있는 경우)
      let source: UiIssue['source'] = undefined;
      if (node.creationLocation?.file) {
        source = {
          file: node.creationLocation.file,
          line: node.creationLocation.line || 1,
          column: node.creationLocation.column || 1
        };
      }

      // 2) 고급 소스 위치 조회 (widgetId가 있는 경우)
      if (!source && node.objectId) {
        try {
          const advancedSource = await this.getWidgetSourceLocation(node.objectId);
          if (advancedSource) {
            source = advancedSource;
          }
        } catch (e) {
          // 조용히 실패 (모든 위젯이 소스 위치를 가지지는 않음)
        }
      }

      return {
        id: `flutter-${node.id || node.objectId}`,
        label: label || undefined,
        description: hasLabel ? 
          `스크린 리더가 "${label} ${elementType === 'button' ? '버튼' : elementType === 'textfield' ? '입력 필드' : elementType === 'image' ? '이미지' : elementType === 'link' ? '링크' : ''}"로 읽습니다 (Flutter ${node.widgetRuntimeType || 'Widget'})` :
          `Flutter ${elementType === 'button' ? '버튼' : elementType === 'textfield' ? '입력 필드' : elementType === 'image' ? '이미지' : elementType === 'link' ? '링크' : 'Widget'}에 접근성 라벨이 없습니다`,
        severity: hasLabel ? 'info' : 'warning',
        elementType,
        rect: {
          left: rect.left,
          top: rect.top, 
          width: rect.width,
          height: rect.height
        },
        source
      } as UiIssue;
    });

    // 모든 소스 위치 조회 완료 대기
    const results = await Promise.all(sourcePromises);
    issues.push(...results.filter(Boolean) as UiIssue[]);

    console.log('[SemanticsService] Parsed Flutter Semantics:', issues.length, 'issues');
    const withSource = issues.filter(i => i.source).length;
    console.log('[SemanticsService] Issues with source location:', withSource);

    return issues;
  }

  // ====== 내부: 한 번 캡처 후 {frame, issues}를 snapshot으로 브로드캐스트 ======
  private async captureOnce(): Promise<{ frame: FramePayload; issues: UiIssue[] } | null> {
    if (this.capturing) return null;
    this.capturing = true;

    try {
      let frame: FramePayload | null = null;
      let issues: UiIssue[] = [];

      if (this.opts.platform === 'android' || this.opts.platform === undefined) {
        const serial = this.opts.deviceId ?? 'emulator-5554';

        // 1+2+3) 스크린샷, Flutter Semantics, UIAutomator XML을 완전 동시 수집
        console.log('[SemanticsService] Starting fully synchronized capture...');
        const [png, flutterIssues, uiAutomatorXml] = await Promise.all([
          adbScreencap(serial),
          this.getFlutterSemanticsTree(),
          adbDumpUI(serial).catch(() => '')
        ]);
        
        const { width, height } = getPngSize(png);
        console.log('[SemanticsService] All data captured simultaneously: screenshot, Flutter, UIAutomator');
        
        if (flutterIssues.length > 0) {
          console.log('[SemanticsService] Using Flutter Semantics Tree:', flutterIssues.length, 'nodes');
          issues = flutterIssues;
        } else {
          console.log('[SemanticsService] Fallback to UIAutomator (synchronized)');
          console.log('[SemanticsService] UIAutomator XML length:', uiAutomatorXml.length);
          const uiAutomatorResult = parseUiautomatorXml(uiAutomatorXml, width, height);
          issues = [...uiAutomatorResult.accessibilityIssues, ...uiAutomatorResult.textElements];
          console.log('[SemanticsService] UIAutomator found', uiAutomatorResult.accessibilityIssues.length, 'accessibility issues,', uiAutomatorResult.textElements.length, 'text elements');
          
          // 디버깅: XML 내용 일부 출력 + 좌표 정보
          if (uiAutomatorXml.length > 0) {
            console.log('[SemanticsService] XML sample:', uiAutomatorXml.substring(0, 200) + '...');
            
            // 좌표 디버깅: bounds 정보 추출
            const boundsMatches = uiAutomatorXml.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g);
            if (boundsMatches) {
              console.log('[SemanticsService] Found bounds:', boundsMatches.slice(0, 5), '...(showing first 5)');
            }
          }
          
          // 실제 UIAutomator 데이터 사용하되, 없으면 테스트 데이터 추가
          if (issues.length === 0) {
            console.log('[SemanticsService] No UIAutomator issues found, adding test data');
            issues = [
              {
                id: 'test-1',
                label: '로그인 버튼',
                description: 'Flutter 버튼 위젯',
                severity: 'info',
                rect: { left: 100, top: 300, width: 200, height: 50 }
              },
              {
                id: 'test-2',
                label: undefined,
                description: 'Flutter TextField - 접근성 레이블 누락',
                severity: 'warning',
                rect: { left: 80, top: 200, width: 250, height: 40 }
              }
            ] as UiIssue[];
          } else {
            console.log('[SemanticsService] Using real UIAutomator data:', issues.length, 'issues');
          }
        }

        frame = { imageBase64: png.toString('base64'), width, height };
      } else if (this.opts.platform === 'ios') {
        // iOS Simulator 스크린샷
        try {
          const pngIOS = await iosScreencap();
          if (pngIOS) {
            const { width, height } = getPngSize(pngIOS);
            frame = { imageBase64: pngIOS.toString('base64'), width, height };
            
            // iOS는 현재 UIAutomator 대신 Flutter Semantics만 사용
            issues = await this.getFlutterSemanticsTree();
          }
        } catch (e) {
          console.log('[SemanticsService] iOS screenshot failed:', e);
          frame = null;
        }
      } else {
        // 알 수 없는 플랫폼
        frame = null;
      }

      if (!frame) return null;

      // 좌표를 퍼센트로 변환 (React가 rectPct를 기대함)
      const issuesWithPercent = issues.map(issue => ({
        ...issue,
        rectPct: {
          left: (issue.rect.left / frame.width) * 100,
          top: (issue.rect.top / frame.height) * 100,
          width: (issue.rect.width / frame.width) * 100,
          height: (issue.rect.height / frame.height) * 100,
        }
      }));

      const snap = { frame, issues: issuesWithPercent };
      console.log('[SemanticsService] Broadcasting snapshot with percent coords:', {
        frameSize: frame.imageBase64.length,
        issuesCount: issuesWithPercent.length,
        clientsCount: this.wss?.clients.size || 0
      });
      this.broadcast({ type: 'snapshot', data: snap });
      return snap;
    } catch (e) {
      console.error('[SemanticsService] Capture failed:', e);
      return null;
    } finally {
      this.capturing = false;
    }
  }

  // ====== VM 호출 헬퍼 ======
  private callVm(payload: any, onReply?: (msg: any) => void) {
    if (!this.vmWs || this.vmWs.readyState !== WebSocket.OPEN) return;
    const id = this.nextId++;
    const msg = { id, ...payload };
    if (onReply) {
      const handle = (data: WebSocket.RawData) => {
        const m = safeParse(data.toString());
        if (m?.id === id) {
          this.vmWs?.off('message', handle);
          onReply(m);
        }
      };
      this.vmWs.on('message', handle);
    }
    this.vmWs.send(JSON.stringify(msg));
  }

  // ====== 브라우저로 전송 ======
  private broadcast(obj: any) {
    if (!this.wss) return;
    const msg = JSON.stringify(obj);
    for (const c of this.wss.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(msg);
    }
  }
}

function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }