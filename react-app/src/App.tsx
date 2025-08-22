import React, { useEffect, useState } from 'react';
import ChatModal from './components/ChatModal';
import ReportGenerator from './components/ReportGenerator';
import { ProjectAnalyzer } from './services/ProjectAnalyzer';

// 새로운 인터페이스 추가 (기존 인터페이스는 그대로 유지)
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  activityUML?: string; // 액티비티 UML 코드 (시각화용)
}

interface ChatContext {
  userJourneyUML?: string;      // 사용자 저니 UML (학습용, 비시각화)
  currentActivityUML?: string;   // 현재 액티비티 UML (시각화용)
  codebaseAnalysis?: any;       // 프로젝트 분석 결과
  conversationHistory: ChatMessage[];
  acceptedSuggestions: string[]; // onAccept() 클릭 기록 추적
}

interface Suggestion {
  id: string;
  file: string;
  line: number;
  column: number;
  text: string;
  message: string;
  type: 'error' | 'warning' | 'info';
  element: string;
  position: { x: number; y: number };
}

interface AccessibilityIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  position: { x: number; y: number };
  element: string;
  side: 'left' | 'right'; // 좌우 배치를 위한 속성 추가
  bubblePosition: { x: number; y: number }; // 말풍선 위치 추가
  suggestions: Suggestion[];
}

export default function App() {
  // 기존 상태들 (그대로 유지)
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [accessibilityIssues, setAccessibilityIssues] = useState<AccessibilityIssue[]>([]);
  // const [selectedIssue, setSelectedIssue] = useState<string | null>(null); // TODO: 향후 사용 예정

  // 새로운 상태들 추가
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext>({
    conversationHistory: [],
    acceptedSuggestions: []
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showCodeChangeModal, setShowCodeChangeModal] = useState(false);
  const [projectAnalyzer] = useState(() => new ProjectAnalyzer());

  // localStorage에서 컨텍스트 복원 (창 닫으면 날아가게 하기 위해 sessionStorage 사용)
  useEffect(() => {
    const savedContext = sessionStorage.getItem('chatContext');
    if (savedContext) {
      setChatContext(JSON.parse(savedContext));
    }
  }, []);

  // 컨텍스트 변경 시 저장
  useEffect(() => {
    sessionStorage.setItem('chatContext', JSON.stringify(chatContext));
  }, [chatContext]);

  // 기존 useEffect (그대로 유지)
  useEffect(() => {
    document.title = 'Flutter Accessibility Checker';
    const timer = setTimeout(() => {
      setReady(true);
      // 페이지 로드 시 바로 접근성 이슈 표시
      analyze();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // 실제 프로젝트 분석 + 기존 하드코딩 이슈 유지
  async function analyze() {
    setIsAnalyzing(true);
    
    try {
      // ProjectAnalyzer로 실제 프로젝트 분석
      const projectStructure = await projectAnalyzer.analyzeProject();
      
      // 사용자 저니 UML을 chatContext에 저장 (학습용)
      setChatContext(prev => ({
        ...prev,
        userJourneyUML: projectStructure.userJourneyUML,
        codebaseAnalysis: projectStructure
      }));

      // 기존 하드코딩된 이슈들 (UI 위치가 정확히 설정되어 있음)
      const existingIssues: AccessibilityIssue[] = [
        {
          id: '1',
          type: 'error',
          title: '이미지 대체 텍스트 누락',
          description: '전통 한복 인물 이미지에 대한 대체 텍스트가 없습니다.',
          position: { x: 50, y: 30 },
          element: '전통 한복 인물 이미지',
          side: 'left',
          bubblePosition: { x: -280, y: 25 },
          suggestions: [
            {
              id: '1-1',
              file: 'lib/home.dart',
              line: 42,
              column: 4,
              text: `Image.asset(\n  'assets/traditional_man.png',\n  semanticLabel: '전통 한복을 입고 갓을 쓴 남성 인물',\n)`,
              message: '이미지에 구체적인 semanticLabel 추가',
              type: 'error',
              element: '전통 한복 인물 이미지',
              position: { x: 50, y: 30 }
            }
          ]
        },
        {
          id: '2',
          type: 'warning',
          title: '버튼 터치 영역 부족',
          description: '"지금 시작하기" 버튼의 터치 영역이 44x44dp 미만입니다.',
          position: { x: 50, y: 85 },
          element: '"지금 시작하기" 버튼',
          side: 'left',
          bubblePosition: { x: -280, y: 80 },
          suggestions: [
            {
              id: '2-1',
              file: 'lib/home.dart',
              line: 88,
              column: 12,
              text: `Container(\n  constraints: BoxConstraints(minWidth: 44, minHeight: 44),\n  child: ElevatedButton(...),\n)`,
              message: '버튼에 최소 터치 영역(44x44dp) 보장',
              type: 'warning',
              element: '"지금 시작하기" 버튼',
              position: { x: 50, y: 85 }
            }
          ]
        },
        {
          id: '3',
          type: 'info',
          title: '제목 텍스트 대비 개선',
          description: '"나랏말싸미" 텍스트의 색상 대비를 개선할 수 있습니다.',
          position: { x: 50, y: 50 },
          element: '"나랏말싸미" 제목 텍스트',
          side: 'right',
          bubblePosition: { x: -280, y: 50 },
          suggestions: [
            {
              id: '3-1',
              file: 'lib/home.dart',
              line: 65,
              column: 8,
              text: `Text(\n  '나랏말싸미',\n  style: TextStyle(color: Colors.black87),\n)`,
              message: '텍스트 색상을 더 진하게 변경하여 대비 개선',
              type: 'info',
              element: '"나랏말싸미" 제목 텍스트',
              position: { x: 50, y: 50 }
            }
          ]
        }
      ];

      // ProjectAnalyzer에서 발견된 추가 이슈들을 변환
      const newIssues: AccessibilityIssue[] = [];
      let issueId = 4;

      projectStructure.components.forEach((component, compIndex) => {
        component.issues.forEach((issue, issueIndex) => {
          // 새로운 이슈들은 우측에 배치
          const yPosition = 20 + (newIssues.length * 15); // 균등하게 분산
          
          newIssues.push({
            id: issueId.toString(),
            type: issue.includes('이미지') ? 'error' : issue.includes('버튼') ? 'warning' : 'info',
            title: issue.split(' (WCAG')[0], // WCAG 정보 제거
            description: `${component.name} 파일에서 발견된 이슈입니다.`,
            position: { x: 50, y: yPosition },
            element: component.name,
            side: 'right',
            bubblePosition: { x: 100, y: yPosition },
            suggestions: [
              {
                id: `${issueId}-1`,
                file: component.file,
                line: component.line,
                column: 1,
                text: '// TODO: 접근성 개선 필요',
                message: issue.split(' (WCAG')[0],
                type: issue.includes('이미지') ? 'error' : issue.includes('버튼') ? 'warning' : 'info',
                element: component.name,
                position: { x: 50, y: yPosition }
              }
            ]
          });
          issueId++;
        });
      });

      // 기존 이슈 + 새로 발견된 이슈 합치기
      const allIssues = [...existingIssues, ...newIssues];
      
      setAccessibilityIssues(allIssues);
      setSuggestions(allIssues.flatMap(issue => issue.suggestions));

      console.log(`분석 완료: 총 ${allIssues.length}개 이슈 발견 (기존 ${existingIssues.length}개 + 새로 발견 ${newIssues.length}개)`);
      
    } catch (error) {
      console.error('프로젝트 분석 오류:', error);
      
      // 오류 시 기존 하드코딩된 이슈만 표시
      const fallbackIssues: AccessibilityIssue[] = [
        {
          id: '1',
          type: 'error',
          title: '이미지 대체 텍스트 누락',
          description: '전통 한복 인물 이미지에 대한 대체 텍스트가 없습니다.',
          position: { x: 50, y: 30 },
          element: '전통 한복 인물 이미지',
          side: 'left',
          bubblePosition: { x: -280, y: 25 },
          suggestions: [
            {
              id: '1-1',
              file: 'lib/home.dart',
              line: 42,
              column: 4,
              text: `Image.asset(\n  'assets/traditional_man.png',\n  semanticLabel: '전통 한복을 입고 갓을 쓴 남성 인물',\n)`,
              message: '이미지에 구체적인 semanticLabel 추가',
              type: 'error',
              element: '전통 한복 인물 이미지',
              position: { x: 50, y: 30 }
            }
          ]
        }
      ];
      
      setAccessibilityIssues(fallbackIssues);
      setSuggestions(fallbackIssues.flatMap(issue => issue.suggestions));
    } finally {
      setIsAnalyzing(false);
    }
  }

  // 기존 onAccept 함수를 수정하여 추적 기능 추가
  function onAccept(sug: Suggestion) {
    const params = new URLSearchParams({
      file: sug.file,
      line: String(sug.line),
      column: String(sug.column),
      text: sug.text
    });
    window.open(`vscode://my.publisher.myExtension/applySuggestion?${params}`);
    
    // 수정한 사안 추적에 추가
    setChatContext(prev => ({
      ...prev,
      acceptedSuggestions: [...prev.acceptedSuggestions, sug.id]
    }));
  }

  // 기존 onDiscuss 함수를 ChatModal 열기로 변경
  function onDiscuss(sug: Suggestion) {
    // 기존: alert(`"${sug.message}"에 대한 논의를 시작합니다.`);
    // 새로운: ChatModal 열고 해당 이슈에 대한 컨텍스트와 함께 시작
    setIsChatOpen(true);
    
    // 해당 suggestion에 대한 초기 메시지 추가
    const initialMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: `"${sug.element}"의 "${sug.message}" 이슈에 대해 자세히 설명해주세요.`,
      timestamp: Date.now()
    };
    
    setChatContext(prev => ({
      ...prev,
      conversationHistory: [...prev.conversationHistory, initialMessage]
    }));
  }

  // 기존 onIgnore 함수 (그대로 유지)
  function onIgnore(issueId: string) {
    setAccessibilityIssues(prev => prev.filter(issue => issue.id !== issueId));
  }

  // 새로운 함수들 추가
  async function handleRefreshProject() {
    setShowCodeChangeModal(false);
    // ProjectAnalyzer로 다시 분석 수행
    await analyze();
  }

  return (
    <div className="flex min-h-screen gradient-bg p-6 gap-8">
      {/* 기존 왼쪽 에뮬레이터 영역 (그대로 유지) */}
      <div className="flex-1 flex items-center justify-center relative">
        <div className="relative">
          {/* 얇은 모바일 에뮬레이터 프레임 */}
          <div className="w-[395px] h-[832px] bg-gray-800 rounded-[2.5rem] p-2 shadow-2xl">
            {/* 내부 화면 영역 */}
            <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden relative">
              {ready ? (
                <iframe
                  src="http://localhost:60778"
                  title="Flutter Web App"
                  className="w-full h-full border-none"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  🚀 Flutter 앱을 불러오는 중입니다…
                </div>
              )}
            </div>
          </div>
          
          {/* 기존 말풍선 효과들 (그대로 유지) */}
          {accessibilityIssues.map((issue, index) => (
            <div key={issue.id}>
              {/* bubblePosition이 존재할 때만 연결선과 말풍선 렌더링 */}
              {issue.bubblePosition && (
                <>
                  {/* 긴 연결선 - 화면에서 말풍선까지 */}
                  <svg
                    className="absolute z-5 pointer-events-none"
                    style={{
                      left: 0,
                      top: 0,
                      width: '100%',
                      height: '100%'
                    }}
                  >
                    <line
                      x1={`${issue.position.x}%`}
                      y1={`${issue.position.y}%`}
                      x2="-260px"
                      y2={`${issue.bubblePosition.y}%`}
                      stroke={issue.type === 'error' ? '#dc2626' : issue.type === 'warning' ? '#ca8a04' : '#2563eb'}
                      strokeWidth="1"
                      strokeDasharray="3,3"
                      opacity="0.3"
                    />
                    {/* 연결점 */}
                    <circle
                      cx={`${issue.position.x}%`}
                      cy={`${issue.position.y}%`}
                      r="2"
                      fill={issue.type === 'error' ? '#dc2626' : issue.type === 'warning' ? '#ca8a04' : '#2563eb'}
                      opacity="0.6"
                    />
                  </svg>
                  
                  {/* 화면 밖 말풍선 */}
                  <div
                    className={`absolute z-10 ${
                      issue.type === 'error' ? 'text-red-600' : 
                      issue.type === 'warning' ? 'text-yellow-600' : 'text-blue-600'
                    }`}
                    style={{
                      left: '-280px',
                      top: `${issue.bubblePosition.y}%`,
                      transform: 'translateY(-50%)',
                      width: '260px'
                    }}
                  >
                    {/* 컴팩트한 말풍선 */}
                    <div className={`bg-white border-l-4 rounded-r-lg px-3 py-2 shadow-sm ${
                      issue.type === 'error' ? 'border-red-500' : 
                      issue.type === 'warning' ? 'border-yellow-500' : 'border-blue-500'
                    }`}>
                      <div className={`font-medium text-xs ${
                        issue.type === 'error' ? 'text-red-800' : 
                        issue.type === 'warning' ? 'text-yellow-800' : 'text-blue-800'
                      }`}>
                        {issue.title}
                      </div>
                      <div className="text-xs text-gray-600 mt-1 mb-2">
                        {issue.description}
                      </div>
                      
                      {/* 컴팩트한 액션 버튼들 */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => onAccept(issue.suggestions[0])}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded text-xs"
                        >
                          수락
                        </button>
                        <button
                          onClick={() => onDiscuss(issue.suggestions[0])}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded text-xs"
                        >
                          논의
                        </button>
                        <button
                          onClick={() => onIgnore(issue.id)}
                          className="bg-gray-500 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded text-xs"
                        >
                          무시
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 기존 오른쪽 보고서 영역 (글래스 효과 적용) */}
      <div className="w-80 card-pastel p-6 space-y-4 max-h-screen overflow-y-auto animate-fade-in">
        <h2 className="text-lg font-semibold">접근성 평가 정보</h2>
        <p className="text-gray-600 text-xs">
          이 앱에 대한 접근성 평가 결과입니다.
        </p>

                 {/* 새로운 버튼들 (파스텔 효과 적용) */}
         <div className="flex gap-2 mb-4">
           <button
             onClick={() => setIsChatOpen(true)}
             className="btn-pastel-primary text-xs px-3 py-2"
           >
             💬 AI 채팅
           </button>
           <button
             onClick={() => setIsReportOpen(true)}
             className="btn-pastel-success text-xs px-3 py-2"
           >
             📄 리포트
           </button>
           <button
             onClick={handleRefreshProject}
             className="btn-pastel-secondary text-xs px-3 py-2"
           >
             🔄 새로고침
           </button>
         </div>

        {accessibilityIssues.length === 0 ? (
          <div className="bg-green-100 border-l-4 border-green-500 p-3 rounded">
            <div className="flex items-center gap-2">
              <span className="text-green-800 font-medium text-sm">✅ 접근성 검사 완료</span>
            </div>
            <p className="text-xs text-gray-700 mt-1">현재 발견된 접근성 이슈가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accessibilityIssues.map((issue) => (
              <div key={issue.id} className={`border-l-4 p-3 rounded ${
                issue.type === 'error' ? 'bg-red-100 border-red-500' :
                issue.type === 'warning' ? 'bg-yellow-100 border-yellow-500' :
                'bg-blue-100 border-blue-500'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`font-medium text-sm ${
                    issue.type === 'error' ? 'text-red-800' :
                    issue.type === 'warning' ? 'text-yellow-800' :
                    'text-blue-800'
                  }`}>
                    {issue.title}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    issue.type === 'error' ? 'bg-red-200 text-red-800' :
                    issue.type === 'warning' ? 'bg-yellow-200 text-yellow-800' :
                    'bg-blue-200 text-blue-800'
                  }`}>
                    {issue.type === 'error' ? '오류' : issue.type === 'warning' ? '경고' : '정보'}
                  </span>
                </div>
                <p className="text-xs text-gray-700 mt-1">{issue.description}</p>
                <p className="text-xs text-gray-500 mt-1">요소: {issue.element}</p>
              </div>
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="pt-3 space-y-2">
            <h3 className="text-xs font-medium">💡 제안 사항</h3>
            <ul className="space-y-2">
              {suggestions.map((sug) => (
                <li key={sug.id} className="text-xs text-gray-700 bg-gray-50 p-2 rounded">
                  <div className="font-medium mb-1">{sug.message}</div>
                  <div className="text-gray-500 mb-2">{sug.element}</div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onAccept(sug)}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded"
                    >
                      수락
                    </button>
                    <button
                      onClick={() => onDiscuss(sug)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded"
                    >
                      논의
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 코드 변경 감지 모달 (글래스 효과 적용) */}
      {showCodeChangeModal && (
        <div className="modal-overlay">
          <div className="card-pastel p-6 max-w-md animate-slide-down">
            <h3 className="text-lg font-semibold mb-4">코드가 수정되었습니다</h3>
            <p className="text-gray-600 mb-4">
              Flutter 프로젝트 파일이 변경되었습니다. 최신 분석 결과를 보려면 새로고침하세요.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCodeChangeModal(false)}
                className="btn-pastel-secondary px-4 py-2"
              >
                나중에
              </button>
              <button
                onClick={handleRefreshProject}
                className="btn-pastel-primary px-4 py-2"
              >
                새로고침
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ChatModal 컴포넌트 */}
      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        chatContext={chatContext}
        setChatContext={setChatContext}
        accessibilityIssues={accessibilityIssues}
      />

      {/* ReportGenerator 컴포넌트 */}
      <ReportGenerator
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        accessibilityIssues={accessibilityIssues}
        chatContext={chatContext}
      />
    </div>
  );
}