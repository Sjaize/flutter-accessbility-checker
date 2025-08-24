import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReportGenerator from './components/ReportGenerator';
import UMLDiagramViewer from './components/UMLDiagramViewer';

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
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [chatContext, setChatContext] = useState<any>({ conversationHistory: [], acceptedSuggestions: [] });
  const [umlModalOpen, setUmlModalOpen] = useState(false);
  const [umlCode, setUmlCode] = useState('');
  const [umlType, setUmlType] = useState<'user-journey' | 'activity'>('user-journey');
  const [showCodeChangeModal, setShowCodeChangeModal] = useState(false);

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

  // localStorage에서 채팅 컨텍스트 복원
  useEffect(() => {
    const savedContext = localStorage.getItem('flutter-accessibility-chat-context');
    if (savedContext) {
      try {
        setChatContext(JSON.parse(savedContext));
      } catch (error) {
        console.error('Failed to parse saved chat context:', error);
      }
    }
  }, []);

  // 채팅 컨텍스트 변경 시 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('flutter-accessibility-chat-context', JSON.stringify(chatContext));
  }, [chatContext]);

  // 파일 변경 감지
  useEffect(() => {
    const handleFileChange = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'fileChanged') {
        console.log('[React] File change detected:', data.file);
        setShowCodeChangeModal(true);
      }
    };

    window.addEventListener('message', handleFileChange);
    return () => window.removeEventListener('message', handleFileChange);
  }, []);

  // 디바이스 틀 크기 (UI 레이아웃만) - 모바일 사이즈로 변경
  const DEVICE_W = 375;
  const DEVICE_H = 812;

  // 컨테이너 ref (툴팁/라인 배치 계산용)
  const deviceShellRef = useRef<HTMLDivElement | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  // 웹소켓 연결 ----------------------------------------------------
  useEffect(() => {
    let ws: WebSocket | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        
        // 연결 즉시 분석 요청
        setTimeout(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('[React] 자동 분석 요청 전송');
            ws.send(JSON.stringify({ 
              type: 'requestAnalysis', 
              data: { autoStart: true } 
            }));
          }
        }, 1000);

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
          } else if (msg.type === 'fileChanged') {
            // 파일 변경 감지
            console.log('[React] File change detected from WebSocket:', msg.data);
            setShowCodeChangeModal(true);
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
              alert('적용 실패: ' + (msg.data?.error || '알 수 없는 오류'));
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
    const uri = 'vscode://' + EXTENSION_ID + '/previewSuggestion?' + params.toString();
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

  // 툴팁 앵커 좌표 계산 -------------------------------------------
  const hoveredIssue = useMemo(
    () => (hoveredId ? accessibilityIssues.find(i => String(i.id) === hoveredId) : undefined),
    [hoveredId, accessibilityIssues]
  );

  // 렌더 -----------------------------------------------------------
  return (
    <div className="min-h-screen gradient-bg p-6 animate-fade-in">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-8 animate-slide-down">
          <h1 className="text-4xl font-bold gradient-text mb-2">
            🎯 Flutter 접근성 체커
          </h1>
          <p className="text-lg text-gray-600">
            AI 기반 실시간 접근성 분석 및 개선 도구
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 왼쪽 패널 - 에뮬레이터 프레임 */}
          <div className="lg:col-span-1">
            <div className="card-pastel p-6 rounded-2xl animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold gradient-text">
                  📱 Flutter 앱 미리보기
                </h2>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              </div>
              
              {/* 모바일 에뮬레이터 프레임 */}
              <div className="bg-gray-900 rounded-3xl p-3 mb-4 mx-auto" 
                   style={{ width: `${DEVICE_W}px`, height: `${DEVICE_H}px` }}
                   ref={deviceShellRef}>
                <div className="bg-white rounded-2xl w-full h-full relative overflow-hidden">
                  {frame && frame.imageBase64 ? (
                    <img 
                      src={frame.imageBase64} 
                      alt="Flutter 앱 스크린샷"
                      className="w-full h-full object-cover"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-center text-gray-500">
                      <div>
                        <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm mb-2">Flutter 앱을 실행해주세요</p>
                        <p className="text-xs text-gray-400">flutter run -d web-server --web-port=60778</p>
                      </div>
                    </div>
                  )}
                  
                  {/* 접근성 이슈 오버레이 */}
                  {frame && accessibilityIssues.map((issue) => {
                    if (!issue.rectPct) return null;
                    return (
                      <div
                        key={issue.id}
                        className="absolute border-2 border-red-500 bg-red-500 bg-opacity-20 cursor-pointer transition-all hover:bg-opacity-40"
                        style={{
                          left: `${issue.rectPct.left}%`,
                          top: `${issue.rectPct.top}%`,
                          width: `${issue.rectPct.width}%`,
                          height: `${issue.rectPct.height}%`,
                        }}
                        onClick={() => requestProposal(issue)}
                        onMouseEnter={() => setHoveredId(String(issue.id))}
                        onMouseLeave={() => setHoveredId(null)}
                        title={issue.label || '접근성 이슈'}
                      >
                        <div className="absolute -top-6 left-0 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          {issue.severity === 'error' ? '🚨' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'} {issue.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 제안 시트 */}
              {proposal && (
                <div className="card-pastel p-4 rounded-xl animate-slide-up">
                  <h3 className="font-semibold text-gray-800 mb-2">💡 개선 제안</h3>
                  <p className="text-sm text-gray-600 mb-3">{proposal.rationale}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const { startLine, endLine, diff, file } = proposal;
                        const selectedIssue = issues.find(i => i.id === proposal.issueId);
                        const m5Location = selectedIssue?.m5Location;
                        if (diff && m5Location && startLine && endLine) {
                          const newText = extractNewCode(diff);
                          const params = new URLSearchParams({
                            file: file,
                            line: String(m5Location.line),
                            column: String(m5Location.column),
                            text: newText,
                            startLine: String(startLine),
                            endLine: String(endLine)
                          });
                          const vscodeUri = 'vscode://my-publisher.flutter-accessibility-checker/previewSuggestion?' + params;
                          window.open(vscodeUri);
                          setTimeout(() => {
                            window.location.href = vscodeUri;
                          }, 500);
                        }
                      }}
                      className="btn-pastel-primary text-sm"
                    >
                      🔧 VS Code에서 열기
                    </button>
                    <button
                      onClick={() => {
                        if (proposal) {
                          requestProposal(issues.find(i => i.id === proposal.issueId) || issues[0]);
                        }
                      }}
                      className="btn-pastel-success text-sm"
                    >
                      🤖 AI 개선 제안
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽 패널 - 접근성 요소 */}
          <div className="lg:col-span-1">
            <div className="card-pastel p-6 rounded-2xl animate-slide-up">
              {/* 탭 */}
              <div className="flex border-b border-gray-200 mb-4">
                <button
                  onClick={() => {}}
                  className={'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' + (
                    true // Always active for accessibility
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  🔍 접근성 요소 ({accessibilityIssues.length})
                </button>
              </div>

              {/* 액션 버튼들 */}
              <div className="flex flex-col gap-2 mb-4">
                <button
                  onClick={() => window.location.reload()}
                  className="btn-pastel-warning"
                >
                  🔄 새로고침
                </button>
                <button
                  onClick={() => setReportModalOpen(true)}
                  className="btn-pastel-primary"
                >
                  📄 리포트 생성
                </button>
              </div>

              {/* 리스트 */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {accessibilityIssues.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium">✅ 접근성 이슈가 없습니다!</p>
                    <p className="text-xs text-gray-400 mt-1">모든 요소가 WCAG 2.2 기준을 준수합니다.</p>
                  </div>
                ) : (
                  accessibilityIssues.map((issue, index) => (
                    <div
                      key={issue.id}
                      className={`card-pastel p-4 rounded-xl cursor-pointer transition-all duration-300 hover:scale-105 animate-slide-up`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                      onClick={() => requestProposal(issue)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            issue.severity === 'error' ? 'bg-red-500' :
                            issue.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                          }`}></div>
                          <span className="text-sm font-medium text-gray-800">
                            {issue.label || '접근성 이슈'}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          issue.severity === 'error' ? 'bg-red-100 text-red-700' :
                          issue.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {issue.severity === 'error' ? '오류' : issue.severity === 'warning' ? '경고' : '정보'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                        {issue.description}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (issue.m5Location) {
                              const params = new URLSearchParams({
                                file: issue.m5Location.file,
                                line: String(issue.m5Location.line),
                                column: String(issue.m5Location.column)
                              });
                              const vscodeUri = 'vscode://my-publisher.flutter-accessibility-checker/openFile?' + params;
                              window.open(vscodeUri);
                            }
                          }}
                          className="btn-pastel-primary text-xs px-3 py-1"
                        >
                          🔧 코드 보기
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            requestProposal(issue);
                          }}
                          className="btn-pastel-success text-xs px-3 py-1"
                        >
                          🤖 AI 제안
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
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
                  
                  const vscodeUri = 'vscode://my-publisher.flutter-accessibility-checker/previewSuggestion?' + params;
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

        {/* ChatModal 플로팅 버튼 */}
        <button
          onClick={() => setChatModalOpen(true)}
          className="fixed bottom-6 right-6 z-50 btn-pastel-primary p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
          title="AI와 대화하기"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>

        {/* ChatModal */}
        {chatModalOpen && (
          <ChatModal
            isOpen={chatModalOpen}
            onClose={() => {
              if (chatContext.conversationHistory.length > 0) {
                const lastMessage = chatContext.conversationHistory[chatContext.conversationHistory.length - 1];
                if (lastMessage.type === 'assistant' && lastMessage.content) {
                  const improvements = {
                    timestamp: Date.now(),
                    conversationHistory: chatContext.conversationHistory,
                    acceptedSuggestions: chatContext.acceptedSuggestions,
                    summary: lastMessage.content.substring(0, 200) + '...'
                  };
                  localStorage.setItem('flutter-accessibility-improvements', JSON.stringify(improvements));
                  console.log('[Chat] 개선사항이 저장되었습니다:', improvements);
                }
              }
              setChatModalOpen(false);
            }}
            accessibilityIssues={accessibilityIssues}
            chatContext={chatContext}
            setChatContext={setChatContext}
            onAccept={(suggestion) => {
              setChatContext((prev: any) => ({
                ...prev,
                acceptedSuggestions: [...prev.acceptedSuggestions, suggestion]
              }));
            }}
          />
        )}

        {/* ReportGenerator */}
        {reportModalOpen && (
          <ReportGenerator
            isOpen={reportModalOpen}
            onClose={() => setReportModalOpen(false)}
            accessibilityIssues={accessibilityIssues}
            chatContext={chatContext}
          />
        )}

        {/* UMLDiagramViewer */}
        {umlModalOpen && (
          <UMLDiagramViewer
            isOpen={umlModalOpen}
            onClose={() => setUmlModalOpen(false)}
            umlCode={umlCode}
            type={umlType}
            title={umlType === 'user-journey' ? '사용자 저니' : '액티비티 플로우'}
          />
        )}

        {/* 코드 변경 감지 모달 */}
        {showCodeChangeModal && (
          <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-fade-in">
            <div className="card-pastel rounded-2xl shadow-2xl p-6 w-full max-w-md animate-slide-up">
              <div className="text-center">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">코드가 변경되었습니다</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Flutter 프로젝트의 코드가 변경되었습니다. 최신 접근성 분석을 위해 새로고침하시겠습니까?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCodeChangeModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    나중에
                  </button>
                  <button
                    onClick={() => {
                      setShowCodeChangeModal(false);
                      window.location.reload();
                    }}
                    className="flex-1 btn-pastel-primary"
                  >
                    🔄 새로고침
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
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
          left: balloon.left + 'px',
          top: balloon.top + 'px',
          transform: 'translateY(-50%)',
          width: 320,
        }}
      >
        <div
          className="bg-white border rounded-l-lg px-4 py-3 shadow-2xl relative"
          style={{
            boxShadow: '0 15px 35px rgba(0,0,0,0.2)',
            borderColor: '#e5e7eb',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm text-gray-900">{title}</span>
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{subtitle}</span>
            <span
              className={'text-[10px] px-2 py-1 rounded ' + pillClassBySeverity(severity)}
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

// ---- ChatModal 컴포넌트 ---------------------------------------------
function ChatModal(props: {
  isOpen: boolean;
  onClose: () => void;
  accessibilityIssues: Issue[];
  chatContext: any;
  setChatContext: (context: any) => void;
  onAccept: (suggestion: string) => void;
}) {
  const { isOpen, onClose, accessibilityIssues, chatContext, setChatContext, onAccept } = props;
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showActivityUML, setShowActivityUML] = useState(false);
  const [activityUMLCode, setActivityUMLCode] = useState(`@startuml
title Flutter 앱 접근성 액티비티 플로우

start
:사용자가 앱 실행;
:메인 화면 로드;

partition "시각장애인 사용 어려움" {
  :이미지 기반 버튼들;
  note right #lightgreen
    <color:green>시각적 요소만으로
    정보 전달</color>
  end note
  
  :색상만으로 상태 표시;
  note right #lightgreen
    <color:green>색상 대비 부족</color>
  end note
  
  :아이콘만 있는 버튼;
  note right #lightgreen
    <color:green>semanticsLabel 없음</color>
  end note
}

partition "접근성 개선 필요" {
  :텍스트 필드 힌트 부족;
  note right #lightgreen
    <color:green>labelText/hintText 없음</color>
  end note
  
  :화면 전환 시 안내 부족;
  note right #lightgreen
    <color:green>시각적 피드백만</color>
  end note
}

:AI 접근성 분석;
:개선 제안 생성;

partition "개선된 플로우" {
  :Semantics 위젯 추가;
  :명확한 label 설정;
  :음성 안내 추가;
  :키보드 네비게이션;
}

stop
@enduml`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatContext.conversationHistory]);

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return;
    
    const userMessage = {
      id: Date.now().toString(),
      type: 'user' as const,
      content: message.trim(),
      timestamp: Date.now()
    };

    // 사용자 메시지를 히스토리에 추가
    setChatContext((prev: any) => ({
      ...prev,
      conversationHistory: [...prev.conversationHistory, userMessage]
    }));

    setIsLoading(true);
    setMessage('');

    try {
      // semantic.md 기반 프롬프트 생성
      const semanticPrompt = `
접근성 개선 전문가로서 다음 지침을 따라 답변해주세요:

## 체계적인 접근의 중요성
- 사용자 저니를 기반으로 한 체계적인 분석
- 위젯 트리 구조 파악 후 각 요소의 역할과 사용자 액션 매핑

## 요소별 개선 지침
A. 버튼: Semantics + button: true + 명확한 label
B. 이미지: Semantics + image: true + 대체 텍스트  
C. 텍스트: Semantics + 적절한 label
D. 아이콘: Semantics + 목적 설명

## 사용자 저니 기반 검증
1. 화면 전환 시 안내
2. 액션 완료 시 피드백
3. 오류 상황 시 명확한 안내

현재 접근성 이슈: ${accessibilityIssues.map(i => `${i.label}: ${i.description}`).join(', ')}
수락된 제안: ${chatContext.acceptedSuggestions.join(', ')}

사용자 질문: ${message.trim()}

응답 시 다음 형식으로 답변해주세요:
1. 접근성 개선 제안 (구체적인 코드 예시 포함)
2. 액티비티 UML 다이어그램 (PlantUML 형식)
3. 추가 고려사항
`;

      const response = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: semanticPrompt,
          conversationHistory: chatContext.conversationHistory,
          accessibilityIssues: accessibilityIssues
        }),
      });

      const data = await response.json();
      
      // AI 응답 파싱
      const aiResponse = data.response;
      
      // 액티비티 UML 추출 (PlantUML 코드 블록에서)
      const umlMatch = aiResponse.match(/```plantuml\s*([\s\S]*?)\s*```/);
      if (umlMatch) {
        const umlCode = umlMatch[1].trim();
        setActivityUMLCode(umlCode);
      } else {
        // PlantUML 코드 블록이 없으면 @startuml로 시작하는 부분 찾기
        const startumlMatch = aiResponse.match(/@startuml[\s\S]*?@enduml/);
        if (startumlMatch) {
          setActivityUMLCode(startumlMatch[0]);
        }
      }
      
      // 제안 추출
      const suggestionsMatch = aiResponse.match(/제안:\s*([\s\S]*?)(?=\n\n|$)/);
      const suggestions = suggestionsMatch ? suggestionsMatch[1].split('\n').filter((s: string) => s.trim().startsWith('-') || s.trim().startsWith('•')).map((s: string) => s.replace(/^[-•]\s*/, '')) : [];
      
      // 메시지 추가
      const newMessage = {
        id: Date.now(),
        type: 'assistant' as const,
        content: aiResponse,
        suggestions: suggestions,
        timestamp: new Date().toLocaleTimeString()
      };

      // AI 응답을 히스토리에 추가
      setChatContext((prev: any) => ({
        ...prev,
        conversationHistory: [...prev.conversationHistory, newMessage]
      }));

    } catch (error) {
      console.error('Error sending message to backend:', error);
      
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: '죄송합니다. 메시지를 보낼 수 없습니다. 서버 연결을 확인해주세요.',
        timestamp: Date.now(),
        suggestions: []
      };

      setChatContext((prev: any) => ({
        ...prev,
        conversationHistory: [...prev.conversationHistory, errorMessage]
      }));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="card-pastel rounded-2xl shadow-2xl p-6 w-full max-w-6xl max-h-[90vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold gradient-text">
            🤖 AI 접근성 챗봇
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex gap-6">
          {/* 채팅 영역 */}
          <div className="flex-1 flex flex-col">
            {/* 채팅 히스토리 */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 max-h-96 card-pastel p-4 rounded-xl">
              {chatContext.conversationHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse-slow">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium">AI와 접근성 개선에 대해 대화해보세요!</p>
                  <p className="text-sm mt-2">현재 {accessibilityIssues.length}개의 접근성 이슈가 발견되었습니다.</p>
                </div>
              ) : (
                chatContext.conversationHistory.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-lg ${
                        msg.type === 'user'
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                          : 'card-pastel text-gray-800'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs font-medium mb-2 text-blue-600">💡 제안:</p>
                          {msg.suggestions.map((suggestion: string, index: number) => (
                            <p key={index} className="text-xs mb-1">• {suggestion}</p>
                          ))}
                        </div>
                      )}
                      {msg.content && (msg.content.includes('@startuml') || msg.content.includes('```plantuml')) && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={() => {
                              const umlMatch = msg.content.match(/```plantuml\s*([\s\S]*?)\s*```/);
                              const startumlMatch = msg.content.match(/@startuml[\s\S]*?@enduml/);
                              if (umlMatch) {
                                setActivityUMLCode(umlMatch[1].trim());
                              } else if (startumlMatch) {
                                setActivityUMLCode(startumlMatch[0]);
                              }
                              setShowActivityUML(true);
                            }}
                            className="text-xs text-purple-600 hover:text-purple-800 font-medium transition-colors"
                          >
                            📊 액티비티 UML 보기
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start animate-slide-up">
                  <div className="card-pastel text-gray-800 px-4 py-3 rounded-2xl shadow-lg">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm">AI가 응답을 생성하고 있습니다...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 메시지 입력 */}
            <div className="flex items-center gap-2 card-pastel p-4 rounded-xl">
              <input
                type="text"
                placeholder="접근성 개선에 대해 물어보세요..."
                className="flex-1 p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSendMessage();
                  }
                }}
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                className="btn-pastel-primary p-3 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!message.trim() || isLoading}
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* 사이드바 */}
          <div className="w-80 space-y-4">
            {/* 실시간 액티비티 UML */}
            <div className="card-pastel p-4 rounded-xl">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                📊 실시간 액티비티 UML
              </h4>
              <div className="text-xs text-gray-600">
                {activityUMLCode ? (
                  <div className="space-y-2">
                    <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs max-h-32 overflow-y-auto">
                      <pre>{activityUMLCode.substring(0, 200)}...</pre>
                    </div>
                    <button
                      onClick={() => setShowActivityUML(true)}
                      className="w-full px-3 py-2 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      🔍 전체 UML 보기
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-xs">AI와 대화하면 액티비티 UML이 여기에 표시됩니다</p>
                  </div>
                )}
              </div>
            </div>

            {/* 수락된 제안 */}
            {chatContext.acceptedSuggestions.length > 0 && (
              <div className="card-pastel p-4 rounded-xl">
                <h4 className="text-sm font-medium text-green-700 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  ✅ 수락된 제안
                </h4>
                <div className="text-xs text-green-600 space-y-1">
                  {chatContext.acceptedSuggestions.map((suggestion: string, index: number) => (
                    <p key={index} className="p-2 bg-green-50 rounded-lg">• {suggestion}</p>
                  ))}
                </div>
              </div>
            )}

            {/* 새로고침 버튼 */}
            <div className="card-pastel p-4 rounded-xl">
              <button
                onClick={() => window.location.reload()}
                className="w-full btn-pastel-warning"
              >
                🔄 새로고침
              </button>
            </div>
          </div>
        </div>

        {/* 액티비티 UML 모달 */}
        {showActivityUML && activityUMLCode && (
          <UMLDiagramViewer
            isOpen={showActivityUML}
            onClose={() => setShowActivityUML(false)}
            umlCode={activityUMLCode}
            type="activity"
            title="액티비티 플로우"
          />
        )}
      </div>
    </div>
  );
}