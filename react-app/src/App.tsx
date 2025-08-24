// react-app/src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Issue, AccessibilityIssue, Suggestion, ChatMessage, FlutterComponent, SourceLoc } from './lib/types';
import { ProjectAnalyzer } from './services/ProjectAnalyzer';
import { ReportGenerator } from './services/ReportGenerator';
import { ChatService } from './services/ChatService';
import ChatModal from './components/ChatModal';

type Severity = 'error' | 'warning' | 'info';

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
  // 통합된 상태 관리
  const [frame, setFrame] = useState<FramePayload | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [conn, setConn] = useState<Conn>('connecting');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ issueId: string | number; label: string } | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applying, setApplying] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [previewIssue, setPreviewIssue] = useState<Issue | null>(null);

  // AI 채팅 기능 상태
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [components, setComponents] = useState<FlutterComponent[]>([]);
  const [accessibilityScore, setAccessibilityScore] = useState(0);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [acceptedIssues, setAcceptedIssues] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [userJourney, setUserJourney] = useState<string>('');
  const [activityJourney, setActivityJourney] = useState<string>('');
  
  // 서비스 인스턴스들
  const projectAnalyzer = useMemo(() => new ProjectAnalyzer(), []);
  const reportGenerator = useMemo(() => new ReportGenerator(), []);
  const chatService = useMemo(() => new ChatService(), []);

  // 서비스 초기화 및 API 연결 상태 확인
  useEffect(() => {
    // ChatService API 연결 상태 확인 (한 번만)
    chatService.checkApiConnection();
    // ProjectAnalyzer API 연결 상태 확인 (한 번만)
    projectAnalyzer.checkApiConnection();
  }, [chatService, projectAnalyzer]);

  // refs for synchronization
  const issuesRef = useRef<Issue[]>([]);
  const pendingRef = useRef<{ issueId: string | number; label: string } | null>(null);
  const activeFileRef = useRef<string | null>(null);

  // 동기화 useEffect
  useEffect(() => { issuesRef.current = issues; }, [issues]);
  useEffect(() => { pendingRef.current = pendingSelection; }, [pendingSelection]);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);
  
  // proposal 상태 디버깅
  useEffect(() => {
    // proposal 상태 변경 로그 제거
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
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 1000;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          console.log('[React] WebSocket connected');
          setConn('connected');
          setWs(ws);
          reconnectAttempts = 0; // 연결 성공 시 재시도 카운트 리셋
          
          if (reconnectTimer.current) {
            window.clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
          }
        };

        ws.onclose = (event) => {
          console.log('[React] WebSocket disconnected:', event.code, event.reason);
          setConn('disconnected');
          
          // 정상적인 종료가 아닌 경우에만 재연결 시도
          if (event.code !== 1000) {
            scheduleReconnect();
          }
        };

        ws.onerror = (error) => {
          console.error('[React] WebSocket error:', error);
          setConn('disconnected');
          // 에러 발생 시에도 재연결 시도
          scheduleReconnect();
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            
            if (msg.type === 'snapshot') {
              const { frame: newFrame, issues: newIssues } = msg.data || {};
              
              // 프레임 데이터 설정
              if (newFrame && newFrame.imageBase64) {
                setFrame(newFrame);
              }
              
              // 이슈 데이터 설정
              if (newIssues) {
                setIssues(normalizeIssues(newIssues));
              }
              
            } else if (msg.type === 'selection') {
              // Selection 이벤트 처리 (Inspector에서 위젯 선택 시)
              const { file } = msg.data || {};
              if (file) {
                setActiveFile(file);
              }
            } else if (msg.type === 'activeScope') {
              // Backend가 active scope 파일을 브로드캐스트하는 경우
              const { file } = msg.data || {};
              if (file) {
                setActiveFile(file);
              }
            } else if (msg.type === 'navigateComplete') {
              // navigateIssue 완료 시 로딩 상태 해제
              if (pendingRef.current) {
                setPendingSelection(null);
                pendingRef.current = null;
              }
            } else if (msg.type === 'proposal') {
              setProposal(msg.data);
              setPendingSelection(null);
            } else if (msg.type === 'applyComplete') {
              setApplying(false);
              setProposal(null);
            } else if (msg.type === 'userJourney') {
              setUserJourney(msg.data.userJourney);
              setActivityJourney(msg.data.activityJourney);
            }
          } catch (error) {
            console.error('[React] Failed to parse WebSocket message:', error);
          }
        };
      } catch (error) {
        console.error('[React] WebSocket connection error:', error);
        setConn('disconnected');
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimer.current || reconnectAttempts >= maxReconnectAttempts) {
        if (reconnectAttempts >= maxReconnectAttempts) {
          console.log('[React] Max reconnection attempts reached');
          setConn('disconnected');
        }
        return;
      }
      
      reconnectAttempts++;
      const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts - 1); // 지수 백오프
      
      reconnectTimer.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    connect();

    return () => {
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (ws) {
        ws.close(1000, 'Component unmounting'); // 정상적인 종료 코드
      }
    };
  }, []);

  // ProjectAnalyzer 업데이트
  useEffect(() => {
    if (ws && issues.length > 0) {
      projectAnalyzer.setWebSocketData({ frame, issues });
    }
  }, [ws, issues, frame, projectAnalyzer]);

  function normalizeIssues(input: any[]): Issue[] {
    return (input ?? []).map((i: any, idx: number) => ({
      id: i.id ?? String(idx),
      type: i.type || i.severity || 'info',
      severity: i.severity || i.type || 'info',
      label: i.label,
      description: i.description,
      elementType: i.elementType,
      rectPct: i.rectPct,
      rect: i.rect,
      source: i.source,
      m5Location: i.m5Location,
    }));
  }

  // 통합된 이슈 필터링 (텍스트 제외)
  const accessibilityIssues = useMemo(
    () => issues.filter((i: Issue) => i.elementType && i.elementType !== 'text'),
    [issues]
  );
  const displayIssues = accessibilityIssues;

  // 접근성 점수 계산
  const calculatedAccessibilityScore = useMemo(() => {
    if (accessibilityIssues.length === 0) return 100;
    
    const errorCount = accessibilityIssues.filter(i => i.severity === 'error').length;
    const warningCount = accessibilityIssues.filter(i => i.severity === 'warning').length;
    const infoCount = accessibilityIssues.filter(i => i.severity === 'info').length;
    
    // 점수 계산: 에러는 -10점, 경고는 -5점, 정보는 -2점
    const totalDeduction = (errorCount * 10) + (warningCount * 5) + (infoCount * 2);
    const score = Math.max(0, 100 - totalDeduction);
    
    return score;
  }, [accessibilityIssues]);

  // 접근성 점수 상태 업데이트
  useEffect(() => {
    setAccessibilityScore(calculatedAccessibilityScore);
  }, [calculatedAccessibilityScore]);

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
    window.open(`vscode://my.publisher.myExtension/applySuggestion?${params}`);
  }

  function onDiscuss(sug: Suggestion) {
    // 채팅 모달 열기
    setIsChatModalOpen(true);
  }

  // navigateToIssue 함수 제거됨 (미사용)

  // 툴팁 앵커 좌표 계산 -------------------------------------------
  const hoveredIssue = useMemo(
    () => (hoveredId ? accessibilityIssues.find((i: Issue) => String(i.id) === hoveredId) : undefined),
    [hoveredId, accessibilityIssues]
  );

  // 누락된 함수들 추가
  function handleGenerateReport(newChatHistory: ChatMessage[]) {
    setChatHistory(newChatHistory);
    
    // 리포트 생성
    reportGenerator.setAcceptedIssues(acceptedIssues);
    reportGenerator.setChatHistory(newChatHistory);
    const reportData = reportGenerator.generateReport(accessibilityIssues, acceptedIssues, newChatHistory);
    
    // HTML 리포트 다운로드
    reportGenerator.downloadHTMLReport(reportData);
  }

  function handleRefreshAnalysis() {
    // 분석 새로고침 로직
    console.log('[React] Refreshing analysis...');
    // 여기에 실제 분석 새로고침 로직 추가
  }

  // LLM 제안 요청 함수
  const requestProposal = (issue: Issue) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[React] WebSocket not connected, using direct VS Code URI');
      // WebSocket이 연결되지 않은 경우 직접 VS Code URI 호출
      openInVSCodeDirectly(issue);
      return;
    }
    
    setPendingSelection({ issueId: issue.id, label: issue.label || '' });
    ws.send(JSON.stringify({ type: 'generateProposal', data: { issue } }));
  };

  // WebSocket 없이 직접 VS Code URI 호출
  const openInVSCodeDirectly = (issue: Issue) => {
    console.log('[React] Opening VS Code directly for issue:', issue);
    
    // 이슈의 소스 위치 정보 사용
    const sourceLocation = issue.source || issue.m5Location;
    if (!sourceLocation) {
      console.log('[React] No source location found for issue');
      return;
    }

    const params = new URLSearchParams({
      file: sourceLocation.file,
      line: String(sourceLocation.line),
      column: String(sourceLocation.column),
      text: JSON.stringify({
        issueId: issue.id,
        label: issue.label,
        description: issue.description,
        elementType: issue.elementType,
        severity: issue.severity
      })
    });

    // VS Code URI 호출
    const vscodeUri = `vscode://file/${encodeURIComponent(sourceLocation.file)}:${sourceLocation.line}:${sourceLocation.column}`;
    console.log('[React] Opening VS Code URI:', vscodeUri);
    
    // 브라우저에서 VS Code 프로토콜 호출
    window.open(vscodeUri, '_blank');
    
    // 추가로 VS Code 명령 실행을 위한 URI도 시도
    const commandUri = `vscode://vscode-remote/extension/my-publisher.flutter-accessibility-checker/openPanel`;
    window.open(commandUri, '_blank');
  };

  // 직접 코드 수정 적용
  const applyProposalDirectly = (issue: Issue) => {
    console.log('[React] Applying proposal directly for issue:', issue);
    
    // 이슈 타입에 따른 기본 수정 코드 생성
    const fixCode = generateFixCode(issue);
    
    // 이슈의 소스 위치 정보 사용
    const sourceLocation = issue.source || issue.m5Location;
    if (!sourceLocation) {
      console.log('[React] No source location found for issue');
      return;
    }

    const params = new URLSearchParams({
      file: sourceLocation.file,
      line: String(sourceLocation.line),
      column: String(sourceLocation.column),
      text: JSON.stringify({
        newCode: fixCode,
        startLine: sourceLocation.line,
        endLine: sourceLocation.line,
        beforeA11y: issue.description || '접근성 이슈',
        afterA11y: '개선된 접근성'
      }),
      startLine: String(sourceLocation.line),
      endLine: String(sourceLocation.line)
    });

    // VS Code URI 호출 (적용)
    // 확장 프로그램 ID를 올바르게 설정
    const vscodeUri = `vscode://file/${encodeURIComponent(sourceLocation.file)}:${sourceLocation.line}:${sourceLocation.column}`;
    console.log('[React] Opening VS Code URI:', vscodeUri);
    
    // 브라우저에서 VS Code 프로토콜 호출
    window.open(vscodeUri, '_blank');
    
    // 추가로 확장 프로그램 명령 실행
    setTimeout(() => {
      const commandUri = `vscode://my-publisher.flutter-accessibility-checker/applySuggestion?${params.toString()}`;
      console.log('[React] Applying VS Code command URI:', commandUri);
      window.open(commandUri, '_blank');
    }, 1000);
  };

  // 이슈 타입에 따른 수정 코드 생성
  const generateFixCode = (issue: Issue): string => {
    const elementType = issue.elementType || '';
    const label = issue.label || '';
    
    switch (elementType) {
      case 'image':
        return `Semantics(
  label: "${label} 이미지",
  image: true,
  child: Image.asset('assets/image.png'),
)`;
      
      case 'button':
        return `Container(
  constraints: BoxConstraints(
    minWidth: 44.0,
    minHeight: 44.0,
  ),
  child: ElevatedButton(
    onPressed: () {},
    child: Text("${label}"),
  ),
)`;
      
      case 'textfield':
        return `TextField(
  decoration: InputDecoration(
    labelText: "${label}",
    hintText: "입력해주세요",
  ),
  semanticsLabel: "${label} 입력 필드",
)`;
      
      case 'text':
        return `Text(
  "${label}",
  style: TextStyle(
    color: Colors.black87,
    fontSize: 16.0,
  ),
)`;
      
      default:
        return `Semantics(
  label: "${label}",
  child: Container(
    child: Text("${label}"),
  ),
)`;
    }
  };

  // 이슈 타입에 따른 기존 코드 (잘못된 예시) 생성
  const generateOriginalCode = (issue: Issue): string => {
    const elementType = issue.elementType || '';
    const label = issue.label || '';
    
    switch (elementType) {
      case 'image':
        return `// 접근성 이슈: 이미지에 대체 텍스트 없음
Image.asset('assets/image.png'),

// 문제점: 스크린 리더가 이미지 내용을 알 수 없음`;
      
      case 'button':
        return `// 접근성 이슈: 터치 영역이 너무 작음
TextButton(
  onPressed: () {},
  child: Text("${label}"),
),

// 문제점: 최소 터치 영역(44x44dp) 미달`;
      
      case 'textfield':
        return `// 접근성 이슈: 입력 필드에 라벨 없음
TextField(
  decoration: InputDecoration(
    hintText: "입력해주세요",
  ),
),

// 문제점: 사용자가 무엇을 입력해야 하는지 모름`;
      
      case 'text':
        return `// 접근성 이슈: 색상 대비 부족
Text(
  "${label}",
  style: TextStyle(
    color: Colors.grey[600],  // 낮은 대비
  ),
),

// 문제점: 저시력 사용자가 읽기 어려움`;
      
      default:
        return `// 접근성 이슈: 시맨틱 정보 없음
Container(
  child: Text("${label}"),
),

// 문제점: 스크린 리더가 요소의 역할을 알 수 없음`;
    }
  };

  // 채팅 응답 생성 함수 (사용자 저니 포함)
  const generateChatResponse = async (message: string) => {
    try {
      const response = await chatService.generateResponse(message, {
        issues: accessibilityIssues,
        components: [],
        userJourney: userJourney
      });
      return response;
    } catch (error) {
      console.error('[React] Chat response generation failed:', error);
      return null;
    }
  };

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
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                  <div className="text-center">
                    <div className="text-4xl mb-4">📱</div>
                    <div className="text-lg font-semibold mb-2">
                      {conn === 'connected' ? '스크린샷 로딩 중...' : conn === 'connecting' ? '서버 연결 중...' : '연결 끊김'}
                    </div>
                    <div className="text-sm opacity-75">
                      {conn === 'connected' ? 'Flutter 앱에서 스크린샷을 캡처하고 있습니다.' : 'WebSocket 연결을 확인해주세요.'}
                    </div>
                  </div>
                </div>
              )}

              {/* 오버레이 박스 */}
              {accessibilityIssues.map((issue) => {
                // 바운딩 박스 좌표 결정 (rectPct 우선, position 기반 계산 폴백)
                let boundingBox = null;
                
                if (issue.rectPct) {
                  // rectPct가 있으면 퍼센트 좌표 사용
                  boundingBox = {
                    left: `${issue.rectPct.left}%`,
                    top: `${issue.rectPct.top}%`,
                    width: `${issue.rectPct.width}%`,
                    height: `${issue.rectPct.height}%`
                  };
                } else if (issue.position) {
                  // position이 있으면 절대 좌표를 퍼센트로 변환
                  const deviceWidth = DEVICE_W;
                  const deviceHeight = DEVICE_H;
                  boundingBox = {
                    left: `${(issue.position.x / deviceWidth) * 100}%`,
                    top: `${(issue.position.y / deviceHeight) * 100}%`,
                    width: '20px', // 기본 크기
                    height: '20px'
                  };
                } else {
                  // 좌표 정보가 없으면 렌더링하지 않음
                  return null;
                }

                const color = issue.type === 'warning' || issue.severity === 'warning'
                  ? '#eab308'
                  : issue.type === 'error' || issue.severity === 'error'
                  ? '#ef4444'
                  : '#22c55e';
                const isHovered = hoveredId === String(issue.id);

                return (
                  <div
                    key={issue.id}
                    className="absolute"
                    style={{
                      left: boundingBox.left,
                      top: boundingBox.top,
                      width: boundingBox.width,
                      height: boundingBox.height,
                      border: `2px solid ${color}`,
                      backgroundColor: isHovered ? `${color}1A` : 'transparent',
                      transition: 'all .2s ease',
                      pointerEvents: 'auto',
                      borderRadius: '2px',
                      boxShadow: isHovered ? `0 0 8px ${color}40` : 'none',
                    }}
                    onMouseEnter={() => setHoveredId(String(issue.id))}
                    onMouseLeave={() => setHoveredId(null)}
                    title={`${issue.label || issue.title || '접근성 이슈'}\n${issue.description || ''}`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 오른쪽 보고서 영역 - 줄어든 크기 */}
      <div className="w-80 bg-white rounded-2xl shadow p-6 space-y-4 max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">접근성 평가 정보</h2>
          <button
            onClick={handleRefreshAnalysis}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            title="새로고침"
          >
            🔄
          </button>
        </div>
        
        {/* 접근성 점수 */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-xl border border-blue-200">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{accessibilityScore}</div>
            <div className="text-sm text-gray-600">접근성 점수</div>
          </div>
        </div>
        
        {/* 접근성 이슈 목록 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">발견된 이슈 ({displayIssues.length}개)</h3>
          
          {displayIssues.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-2xl mb-2">✅</div>
              <div className="text-sm">접근성 이슈가 발견되지 않았습니다</div>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {displayIssues.map((issue) => (
                <div
                  key={issue.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                    hoveredId === String(issue.id) 
                      ? 'border-blue-300 bg-blue-50' 
                      : 'border-gray-200 bg-gray-50'
                  }`}
                  onMouseEnter={() => setHoveredId(String(issue.id))}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-1 rounded ${pillClassBySeverity(issue.severity || 'info')}`}>
                          {issue.severity === 'error' ? '오류' : issue.severity === 'warning' ? '경고' : '정보'}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${pillClassByType(issue.elementType)}`}>
                          {typeLabel(issue.elementType)}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        {issue.label || '접근성 이슈'}
                      </div>
                      <div className="text-xs text-gray-600 line-clamp-2">
                        {issue.description || '설명 없음'}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setPreviewIssue(issue);
                        setShowCodePreview(true);
                      }}
                      className="ml-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      disabled={pendingSelection?.issueId === issue.id}
                    >
                      {pendingSelection?.issueId === issue.id ? '처리중...' : '개선하기'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <p className="text-gray-600 text-xs">
          이 앱에 대한 접근성 평가 결과입니다.
        </p>
      </div>
      
      {/* ChatModal */}
      <ChatModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        issues={accessibilityIssues}
        onGenerateReport={handleGenerateReport}
        activityJourney={activityJourney}
      />
      
      {/* 플로팅 채팅 버튼 */}
      <button
        onClick={() => setIsChatModalOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group z-40"
        title="AI 접근성 분석과 대화하기"
      >
        <div className="text-xl">💬</div>
        <div className="absolute right-16 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          AI와 대화하기
        </div>
      </button>

      {/* 코드 미리보기 모달 */}
      {showCodePreview && previewIssue && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">접근성 개선 제안</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {previewIssue.label} - {previewIssue.source ? `${previewIssue.source.file.split('/').pop()}:${previewIssue.source.line}` : '위치 정보 없음'}
                </p>
              </div>
              <button
                onClick={() => setShowCodePreview(false)}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 내용 */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* 이슈 정보 */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-1 rounded ${
                    previewIssue.severity === 'error' ? 'bg-red-200 text-red-800' : 
                    previewIssue.severity === 'warning' ? 'bg-yellow-200 text-yellow-800' : 
                    'bg-green-200 text-green-800'
                  }`}>
                    {previewIssue.severity === 'error' ? '오류' : previewIssue.severity === 'warning' ? '경고' : '정보'}
                  </span>
                  <span className="text-sm font-medium text-red-800">{previewIssue.label}</span>
                </div>
                <p className="text-sm text-red-700">{previewIssue.description}</p>
              </div>

              {/* 코드 비교 */}
              <div className="grid grid-cols-2 gap-4">
                {/* 기존 코드 (잘못된 예시) */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">기존 코드 (문제가 있는 코드)</h3>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <pre className="text-xs text-red-800 font-mono overflow-x-auto whitespace-pre-wrap">
                      {generateOriginalCode(previewIssue)}
                    </pre>
                  </div>
                </div>

                {/* 개선된 코드 */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">개선된 코드</h3>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <pre className="text-xs text-green-800 font-mono overflow-x-auto whitespace-pre-wrap">
                      {generateFixCode(previewIssue)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* 접근성 개선 효과 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-800 mb-2">접근성 개선 효과</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-red-700 font-medium">개선 전</p>
                    <p className="text-red-600">{previewIssue.description || '접근성 이슈'}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">개선 후</p>
                    <p className="text-green-600">스크린 리더가 명확한 정보를 제공</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowCodePreview(false)}
                className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  applyProposalDirectly(previewIssue);
                  setShowCodePreview(false);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                코드 적용하기
              </button>
            </div>
          </div>
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
