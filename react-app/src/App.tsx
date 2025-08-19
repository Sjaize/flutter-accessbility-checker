// react-app/src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

type Severity = 'error' | 'warning' | 'info';

interface SourceLoc {
  file: string;
  line: number;
  column: number;
}

interface Issue {
  id: string | number;
  severity: Severity;
  label?: string;
  description?: string;
  elementType?: 'button' | 'textfield' | 'image' | 'text' | 'link' | string;

  // 퍼센트 좌표(백엔드가 rectPct로 내려줌)
  rectPct?: { left: number; top: number; width: number; height: number };

  // 절대 좌표가 올 수도 있으나, 여기선 rectPct만 사용
  rect?: { left: number; top: number; width: number; height: number };

  source?: SourceLoc; // creationLocation
  
  // M5 매칭으로 찾은 정확한 코드 위치
  m5Location?: SourceLoc;
}

// LLM 제안 타입 (백엔드 타입과 동기화)
interface Proposal {
  issueId: string | number;
  file: string;
  range: { start: { line: number; col: number }; end: { line: number; col: number } };
  diff?: string;
  startLine?: number;
  endLine?: number;
  edits?: Array<{ file: string; start: { line: number; col: number }; end: { line: number; col: number }; newText: string }>;
  a11yDelta?: { before?: string; after: string };
  rationale?: string;
}

interface FramePayload {
  imageBase64: string;
  width: number;
  height: number;
}

type Conn = 'connecting' | 'connected' | 'disconnected';

// ---- 환경 상수 ---------------------------------------------------
const WS_URL = 'ws://localhost:3001';
// 여기를 네 익스텐션 식별자( publisher.name )로 바꾸면 됨
const EXTENSION_ID = 'my-publisher.flutter-accessibility-checker';

// ---- 유틸 --------------------------------------------------------
function pillClassBySeverity(s: Severity) {
  switch (s) {
    case 'error': return 'bg-red-200 text-red-800';
    case 'warning': return 'bg-yellow-200 text-yellow-800';
    default: return 'bg-green-200 text-green-800';
  }
}
function pillClassByType(t?: Issue['elementType']) {
  if (t === 'text') return 'bg-blue-200 text-blue-800';
  return 'bg-gray-100 text-gray-700';
}
function typeLabel(t?: Issue['elementType']) {
  switch (t) {
    case 'button': return '🔘 버튼';
    case 'textfield': return '📝 입력필드';
    case 'image': return '🖼️ 이미지';
    case 'text': return '📄 텍스트';
    case 'link': return '🔗 링크';
    default: return t || '요소';
  }
}

// ---- 컴포넌트 ----------------------------------------------------
export default function App() {
  const [frame, setFrame] = useState<FramePayload | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [conn, setConn] = useState<Conn>('connecting');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ issueId: string | number; label: string } | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applying, setApplying] = useState(false);

  // state 근처에 추가
  const issuesRef = useRef<Issue[]>([]);
  const pendingRef = useRef<{ issueId: string | number; label: string } | null>(null);
  const activeFileRef = useRef<string | null>(null);

  // 동기화 useEffect
  useEffect(() => { issuesRef.current = issues; }, [issues]);
  useEffect(() => { pendingRef.current = pendingSelection; }, [pendingSelection]);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);
  
  // proposal 상태 디버깅
  useEffect(() => {
    console.log('[React] Proposal state changed:', proposal);
    console.log('[React] Proposal startLine:', proposal?.startLine);
    console.log('[React] Proposal endLine:', proposal?.endLine);
  }, [proposal]);

  // 디바이스 틀 크기 (UI 레이아웃만)
  const DEVICE_W = 395;
  const DEVICE_H = 832;

  // 컨테이너 ref (툴팁/라인 배치 계산용)
  const deviceShellRef = useRef<HTMLDivElement | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  // 웹소켓 연결 ----------------------------------------------------
  useEffect(() => {
    let ws: WebSocket | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          console.log('[React] WebSocket connected to:', WS_URL);
          setConn('connected');
          setWs(ws);
          if (reconnectTimer.current) {
            window.clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
          }
        };

        ws.onclose = () => {
          console.log('[React] WebSocket disconnected');
          setConn('disconnected');
          scheduleReconnect();
        };

        ws.onerror = (error) => {
          console.error('[React] WebSocket error:', error);
          setConn('disconnected');
          scheduleReconnect();
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'snapshot') {
            const { frame: newFrame, issues: newIssues } = msg.data || {};
            setFrame(newFrame || null);
            setIssues(normalizeIssues(newIssues || []));
          } else if (msg.type === 'selection') {
            // Selection 이벤트 처리 (Inspector에서 위젯 선택 시)
            console.log('[React] Selection event received:', msg.data);
            const { file } = msg.data || {};
            if (file) {
              setActiveFile(file);
              console.log('[React] Active file updated:', file);
            }
          } else if (msg.type === 'activeScope') {
            // Backend가 active scope 파일을 브로드캐스트하는 경우
            const { file } = msg.data || {};
            if (file) {
              setActiveFile(file);
              console.log('[React] Active scope updated:', file);
            }
          } else if (msg.type === 'navigateComplete') {
            // navigateIssue 완료 시 로딩 상태 해제
            console.log('[React] Navigate operation completed');
            if (pendingRef.current) {
              console.log('[React] Clearing pendingSelection after navigation');
              setPendingSelection(null);
              pendingRef.current = null;
            }
          } else if (msg.type === 'proposal') {
            // LLM 제안 수신
            console.log('[React] Proposal received:', msg.data);
            console.log('[React] Proposal startLine:', msg.data?.startLine);
            console.log('[React] Proposal endLine:', msg.data?.endLine);
            setProposal(msg.data);
            setPendingSelection(null);
            pendingRef.current = null;
          } else if (msg.type === 'applyResult') {
            // 제안 적용 결과 수신
            console.log('[React] Apply result received:', msg.data);
            setApplying(false);
            if (msg.data?.ok) {
              // 토스트 등
              setProposal(null);
            } else {
              alert(`적용 실패: ${msg.data?.error || '알 수 없는 오류'}`);
            }
          } else if (msg.type === 'exactLocation') {
            // Selection 결과 처리
            console.log('[React] Exact location received:', msg.data);
            const { location } = msg.data || {};
            
            // 최신 상태는 ref에서 읽는다
            const pending = pendingRef.current;
            const currIssues = issuesRef.current;
            const currActiveFile = activeFileRef.current;
            
            console.log('[React] Active scope (ref):', activeFileRef.current);
            console.log('[React] Issues count (ref):', issuesRef.current.length);
            
            console.log('[React] Extracted location:', location);
            console.log('[React] Pending selection (ref):', pending);
            
            if (location) {
              console.log('[React] Location found, opening in VS Code:', location);
              setActiveFile(location.file); // 활성 파일 업데이트
              openInVSCode(location, '');
              if (pending) {
                console.log('[React] Clearing pending selection');
                setPendingSelection(null);
                pendingRef.current = null;
              }
              return;
            } else {
              console.log('[React] No exact location found, using scope-aware fallback');
              const issue = currIssues.find(i => i.id === pending?.issueId);
              
              // 1) activeFile(스코프) 우선
              if (currActiveFile) {
                console.log('[React] Using active scope file:', currActiveFile);
                openInVSCode({ file: currActiveFile, line: 1, column: 1}, '');
              }
              // 2) 없으면 issue.source
              else if (issue?.source) {
                console.log('[React] Using fallback source:', issue.source);
                setActiveFile(issue.source.file);
                openInVSCode(issue.source, '');
              }
              // 3) 아무것도 없으면
              else {
                console.log('[React] No scope or source available for fallback');
              }
              
              if (pending) {
                setPendingSelection(null);
                pendingRef.current = null;
              }
            }
          }
        };
      } catch {
        setConn('disconnected');
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimer.current) return;
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = null;
        setConn('connecting');
        connect();
      }, 3000);
    };

    // 첫 연결
    connect();

    return () => {
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (ws) ws.close();
    };
  }, []);

  function normalizeIssues(input: Issue[]): Issue[] {
    return (input ?? []).map((i, idx) => ({
      id: i.id ?? String(idx),
      severity: i.severity ?? 'info',
      label: i.label,
      description: i.description,
      elementType: i.elementType,
      rectPct: i.rectPct,
      rect: i.rect,
      source: i.source,
      m5Location: i.m5Location, // ← 이게 빠져있었음!
    }));
  }

  // 접근성 요소만 필터링 (텍스트 제외)
  const accessibilityIssues = useMemo(
    () => issues.filter(i => i.elementType && i.elementType !== 'text'),
    [issues]
  );
  const displayIssues = accessibilityIssues;

  // VS Code URI 열기 ----------------------------------------------
  const openInVSCode = (src: SourceLoc, suggestedText = '') => {
    console.log('[React] openInVSCode called with:', src);
    const params = new URLSearchParams({
      file: src.file.startsWith('file://') ? src.file.substring(7) : src.file,
      line: String(src.line),
      column: String(src.column),
      text: suggestedText, // 필요 시 수정 내용 미리보기
      ...(proposal?.startLine && { startLine: String(proposal.startLine) }),
      ...(proposal?.endLine && { endLine: String(proposal.endLine) }),
    });
    
    console.log('[React] openInVSCode - proposal:', proposal);
    console.log('[React] openInVSCode - proposal.startLine:', proposal?.startLine);
    console.log('[React] openInVSCode - proposal.endLine:', proposal?.endLine);
    console.log('[React] openInVSCode - params:', Object.fromEntries(params.entries()));
    const uri = `vscode://${EXTENSION_ID}/previewSuggestion?${params.toString()}`;
    console.log('[React] Generated URI:', uri);
    console.log('[React] Calling window.open...');
    
    // URL handler 호출 시도
    try {
      window.open(uri, '_blank', 'noopener');
      console.log('[React] window.open called successfully');
    } catch (error) {
      console.error('[React] window.open failed:', error);
      // 폴백: location.href 사용
      try {
        window.location.href = uri;
        console.log('[React] location.href fallback used');
      } catch (fallbackError) {
        console.error('[React] location.href fallback also failed:', fallbackError);
      }
    }
  };

  // LLM 제안 요청 함수
  const requestProposal = (issue: Issue) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    console.log('[React] requestProposal called for issue:', issue.id);
    console.log('[React] Issue M5 location:', issue.m5Location);
    console.log('[React] Issue source location:', issue.source);
    console.log('[React] Full issue object:', issue);
    
    setPendingSelection({ issueId: issue.id, label: issue.label || '' });
    ws.send(JSON.stringify({ type: 'generateProposal', data: { issue } }));
  };

  // navigateToIssue 함수 제거됨 (미사용)

  // 툴팁 앵커 좌표 계산 -------------------------------------------
  const hoveredIssue = useMemo(
    () => (hoveredId ? accessibilityIssues.find(i => String(i.id) === hoveredId) : undefined),
    [hoveredId, accessibilityIssues]
  );

  // 렌더 -----------------------------------------------------------
  return (
    <div className="flex min-h-screen bg-gray-50 p-6">
      {/* 활성 파일 인디케이터 */}
      {activeFile && (
        <div className="fixed top-4 left-4 z-50 bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
          <div className="font-medium">활성 파일</div>
          <div className="text-blue-100">{activeFile.split('/').pop()}</div>
        </div>
      )}
      
      {/* 가운데: 디바이스 프레임 + 오버레이 */}
      <div className="flex-1 flex items-center justify-center relative">
        <div className="flex items-center justify-center overflow-visible relative">
          <div
            ref={deviceShellRef}
            className="relative bg-gray-800 rounded-[2.5rem] p-2 shadow-2xl overflow-visible"
            style={{ width: DEVICE_W, height: DEVICE_H }}
          >
            <div className="relative w-full h-full bg-black rounded-[2rem] overflow-hidden">
              {/* 스크린샷 */}
              {frame ? (
                <img
                  alt="device"
                  className="w-full h-full object-cover"
                  src={`data:image/png;base64,${frame.imageBase64}`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-white text-gray-500">
                  {conn === 'connected' ? '첫 프레임 대기 중…' : conn === 'connecting' ? '서버 연결 중…' : '연결 끊김'}
                </div>
              )}

              {/* 오버레이 박스 */}
              {accessibilityIssues.map((issue) => {
                if (!issue.rectPct) return null;
                const color = issue.severity === 'warning'
                  ? '#eab308'
                  : issue.severity === 'error'
                  ? '#ef4444'
                  : '#22c55e';
                const isHovered = hoveredId === String(issue.id);

                return (
                  <div
                    key={issue.id}
                    className="absolute"
                    style={{
                      left: `${issue.rectPct.left}%`,
                      top: `${issue.rectPct.top}%`,
                      width: `${issue.rectPct.width}%`,
                      height: `${issue.rectPct.height}%`,
                      border: `2px solid ${color}`,
                      backgroundColor: isHovered ? `${color}1A` : 'transparent',
                      transition: 'all .2s ease',
                      pointerEvents: 'auto',
                    }}
                    onMouseEnter={() => setHoveredId(String(issue.id))}
                    onMouseLeave={() => setHoveredId(null)}
                    title={issue.label || issue.description || ''}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 오른쪽: 리포트 패널 */}
      <div className="w-80 bg-white rounded-2xl shadow p-6 space-y-4 max-h-screen overflow-y-auto flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">접근성 평가 정보</h2>
          <div
            className={`flex items-center gap-2 text-xs ${
              conn === 'connected' ? 'text-green-600' : conn === 'connecting' ? 'text-yellow-600' : 'text-red-600'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                conn === 'connected' ? 'bg-green-500' : conn === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`}
            />
            {conn === 'connected' ? '실시간' : conn === 'connecting' ? '연결 중…' : '끊김'}
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b">
          <button
            onClick={() => {}}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              true // Always active for accessibility
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🔍 접근성 요소 ({accessibilityIssues.length})
          </button>
        </div>

        {/* 리스트 */}
        {displayIssues.length === 0 ? (
          <div className="border-l-4 p-3 rounded bg-green-50 border-green-500 text-green-800 text-sm">
            현재 화면에서 접근성 검사가 필요한 요소가 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {displayIssues.map((issue) => {
              const isHovered = hoveredId === String(issue.id);
              return (
                <div
                  key={issue.id}
                  className={`border-l-4 p-3 rounded transition-all duration-200 cursor-default ${
                    issue.elementType === 'text'
                      ? 'bg-blue-100 border-blue-500'
                      : issue.severity === 'warning'
                      ? 'bg-yellow-100 border-yellow-500'
                      : issue.severity === 'error'
                      ? 'bg-red-100 border-red-500'
                      : 'bg-green-100 border-green-500'
                  } ${isHovered ? 'ring-2 ring-blue-300 scale-[1.01]' : ''}`}
                  onMouseEnter={() => setHoveredId(String(issue.id))}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium text-sm ${
                        issue.elementType === 'text'
                          ? 'text-blue-800'
                          : issue.severity === 'warning'
                          ? 'text-yellow-800'
                          : issue.severity === 'error'
                          ? 'text-red-800'
                          : 'text-green-800'
                      }`}
                    >
                      {issue.label?.trim() || '⚠️ 레이블 누락'}
                    </span>

                    {/* 유형/심각도 필 */}
                    <span className={`text-[10px] px-2 py-1 rounded ${pillClassByType(issue.elementType)}`}>
                      {typeLabel(issue.elementType)}
                    </span>
                    <span className={`text-[10px] px-2 py-1 rounded ${pillClassBySeverity(issue.severity)}`}>
                      {issue.severity === 'warning'
                        ? '경고'
                        : issue.severity === 'error'
                        ? '오류'
                        : '정상'}
                    </span>

                    {/* Flutter에서 온 노드 표식 */}
                    {String(issue.id).startsWith('flutter-') && (
                      <span className="text-[10px] px-2 py-1 rounded bg-purple-100 text-purple-800">Flutter</span>
                    )}
                  </div>

                  {issue.description && (
                    <p className="text-xs text-gray-700 mt-1">{issue.description}</p>
                  )}

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {/* M5 매칭 위치 (우선 표시) */}
                    {(() => {
                      console.log('Issue debug:', issue.id, 'has m5Location:', !!issue.m5Location, issue.m5Location);
                      return null;
                    })()}
                    {issue.m5Location && (
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-green-600 font-medium">
                          🎯 M5 매칭: {issue.m5Location.file.split('/').pop()}:{issue.m5Location.line}:{issue.m5Location.column}
                        </p>
                      </div>
                    )}
                    
                    {/* 기본 소스 위치 */}
                    {issue.source ? (
                      <p className={`text-[11px] ${issue.m5Location ? 'text-gray-400' : 'text-gray-500'}`}>
                        📍 기본: {issue.source.file.split('/').pop()}:{issue.source.line}:{issue.source.column}
                      </p>
                    ) : null}
                    <button
                      className={`text-[11px] px-2 py-1 rounded ${
                        pendingSelection?.issueId === issue.id 
                          ? 'bg-gray-400 text-white cursor-not-allowed' 
                          : conn !== 'connected' || !ws || ws.readyState !== WebSocket.OPEN
                          ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                      onClick={() => {
                        const isBusy = pendingSelection?.issueId === issue.id;
                        const disabled = isBusy || conn !== 'connected' || !ws || ws.readyState !== WebSocket.OPEN;
                        if (disabled || isBusy) return;
                        console.log('[React] 개선하기 button clicked for issue:', issue);
                        requestProposal(issue);
                      }}
                      disabled={pendingSelection?.issueId === issue.id || conn !== 'connected' || !ws || ws.readyState !== WebSocket.OPEN}
                      title={`${
                        pendingSelection?.issueId === issue.id 
                          ? '제안 생성 중...' 
                          : conn !== 'connected' 
                          ? '서버에 연결되지 않았습니다'
                          : 'LLM이 접근성 개선 제안을 생성합니다'
                      }\n${activeFile ? `활성 파일: ${activeFile.split('/').pop()}` : ''}`}
                    >
                      {pendingSelection?.issueId === issue.id ? '🔍 제안 생성 중...' : '✨ 개선하기'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 왼쪽 말풍선 & 점선: 호버된 이슈가 있고, 장치 셸 ref가 있을 때만 */}
      {hoveredIssue && hoveredIssue.rectPct && deviceShellRef.current && (
        <FloatingBalloon
          containerEl={deviceShellRef.current}
          rectPct={hoveredIssue.rectPct}
          color={
            hoveredIssue.severity === 'warning'
              ? '#eab308'
              : hoveredIssue.severity === 'error'
              ? '#ef4444'
              : '#22c55e'
          }
          title={hoveredIssue.label?.trim() || '⚠️ 레이블 누락'}
          subtitle={typeLabel(hoveredIssue.elementType)}
          severity={hoveredIssue.severity}
          description={hoveredIssue.description}
        />
      )}

      {/* LLM 제안 오버레이 */}
      {proposal && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center">
          <ProposalSheet
            proposal={proposal}
            applying={applying}
            onClose={() => setProposal(null)}
            onApply={() => {
              console.log('Apply button clicked, opening VS Code diff...');
              
              // proposal 정보를 미리 추출
              const { startLine, endLine, diff, file } = proposal;
              const selectedIssue = issues.find(i => i.id === proposal.issueId);
              const m5Location = selectedIssue?.m5Location;
              
              if (diff && m5Location && startLine && endLine) {
                console.log('Full diff content:', diff);
                console.log('Using startLine:', startLine, 'endLine:', endLine);
                
                // JSON에서 newCode만 추출해서 VS Code로 전송
                const newText = extractNewCode(diff);
                
                console.log('Extracted newCode for VS Code:', { 
                  originalLength: diff.length,
                  extractedLength: newText.length,
                  extractedPreview: newText.substring(0, 100)
                });
                
                // VS Code URI 생성 (startLine, endLine 포함)
                const params = new URLSearchParams({
                  file: file,
                  line: String(m5Location.line),
                  column: String(m5Location.column),
                  text: newText,
                  startLine: String(startLine),
                  endLine: String(endLine)
                });
                
                const vscodeUri = `vscode://my-publisher.flutter-accessibility-checker/previewSuggestion?${params}`;
                console.log('Opening VS Code preview URI:', vscodeUri);
                
                // 브라우저에서 VS Code 열기 (고유 scheme 사용)
                window.open(vscodeUri);
                
                // fallback
                setTimeout(() => {
                  window.location.href = vscodeUri;
                }, 500);
              }
              
              setApplying(false);
              setProposal(null);
            }}
          />
        </div>
      )}
    </div>
  );
}



// ---- 코드 추출 헬퍼 함수 ---------------------------------------------
function extractNewCode(diff: string): string {
  try {
    // JSON 형태인지 확인
    if (diff.includes('"newCode"')) {
      const jsonMatch = diff.match(/"newCode":\s*"([^"]*(?:\\.[^"]*)*)"/);
      if (jsonMatch) {
        // 이스케이프된 문자열을 실제 줄바꿈으로 변환
        return jsonMatch[1].replace(/\\n/g, '\n');
      }
    }
    // JSON이 아니면 그대로 반환
    return diff;
  } catch (error) {
    console.error('Error extracting newCode:', error);
    return diff;
  }
}

// ---- ProposalSheet 컴포넌트 ---------------------------------------------
function ProposalSheet(props: {
  proposal: Proposal;
  applying: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const { proposal, onApply, onClose, applying } = props;

  return (
    <div className="w-full max-w-4xl max-h-[80vh] bg-white rounded-2xl p-6 overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">접근성 개선 제안</div>
          <button className="text-gray-500 hover:text-gray-900" onClick={onClose}>닫기</button>
        </div>

        {/* 스크린 리더 발화 전/후 */}
        {(proposal.a11yDelta?.before || proposal.a11yDelta?.after) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded bg-red-50 border border-red-200">
              <div className="text-xs font-medium text-red-800">현재 스크린 리더 발화</div>
              <div className="text-sm text-red-900 whitespace-pre-wrap">{proposal.a11yDelta?.before || '-'}</div>
            </div>
            <div className="p-3 rounded bg-green-50 border border-green-200">
              <div className="text-xs font-medium text-green-800">개선 후 스크린 리더 발화</div>
              <div className="text-sm text-green-900 whitespace-pre-wrap">{proposal.a11yDelta?.after || '-'}</div>
            </div>
          </div>
        )}

        {/* 변경 요약 */}
        {proposal.rationale && (
          <div className="mb-3 p-3 rounded bg-gray-50 border text-sm text-gray-700 whitespace-pre-wrap">
            {proposal.rationale}
          </div>
        )}

        {/* 코드 변경 미리보기 */}
        {proposal.diff && (
          <div className="mb-4">
            <div className="text-sm font-medium text-gray-700 mb-2">코드 변경 미리보기</div>
            <div className="max-h-60 overflow-y-auto">
              <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                {extractNewCode(proposal.diff)}
              </pre>
            </div>
          </div>
        )}

        {/* 적용 버튼 */}
        <div className="flex gap-2">
          <button
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            onClick={onApply}
            disabled={applying}
          >
            {applying ? '적용 중...' : '적용하기'}
          </button>
          <button
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            onClick={onClose}
            disabled={applying}
          >
            취소
          </button>
        </div>
      </div>
  );
}

// ---- 말풍선 컴포넌트 ---------------------------------------------
function FloatingBalloon(props: {
  containerEl: HTMLElement;
  rectPct: { left: number; top: number; width: number; height: number };
  color: string;
  title: string;
  subtitle: string;
  severity: Severity;
  description?: string;
}) {
  const { containerEl, rectPct, color, title, subtitle, severity, description } = props;
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [balloon, setBalloon] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const r = containerEl.getBoundingClientRect();
      const boxLeft = r.left + (rectPct.left * r.width / 100);
      const boxTop = r.top + (rectPct.top * r.height / 100);
      const boxH = rectPct.height * r.height / 100;

      const x1 = boxLeft; // 박스 왼쪽
      const y1 = boxTop + boxH / 2;

      const x2 = r.left - 60; // 프레임 왼쪽에서 60px
      const y2 = y1;

      setLine({ x1, y1, x2, y2 });
      setBalloon({ left: r.left - 380, top: y1 });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [containerEl, rectPct.left, rectPct.top, rectPct.height]);

  if (!line || !balloon) return null;

  return (
    <>
      {/* 점선 */}
      <svg
        className="fixed pointer-events-none z-40"
        style={{ left: 0, top: 0, width: '100vw', height: '100vh' }}
      >
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={color}
          strokeWidth="2"
          strokeDasharray="8,4"
          opacity="0.6"
        />
      </svg>

      {/* 말풍선 */}
      <div
        className="fixed pointer-events-none z-50"
        style={{
          left: `${balloon.left}px`,
          top: `${balloon.top}px`,
          transform: 'translateY(-50%)',
          width: 320,
        }}
      >
        <div
          className={`bg-white border rounded-l-lg px-4 py-3 shadow-2xl relative`}
          style={{
            boxShadow: '0 15px 35px rgba(0,0,0,0.2)',
            borderColor: '#e5e7eb',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm text-gray-900">{title}</span>
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{subtitle}</span>
            <span
              className={`text-[10px] px-2 py-1 rounded ${pillClassBySeverity(severity)}`}
            >
              {severity === 'warning' ? '경고' : severity === 'error' ? '오류' : '정상'}
            </span>
          </div>
          {description && <div className="text-sm text-gray-700">{description}</div>}
        </div>
      </div>
    </>
  );
}
