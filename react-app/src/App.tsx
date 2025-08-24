import React, { useEffect, useState } from 'react';
import { AccessibilityIssue, Suggestion, ChatMessage, FlutterComponent } from './lib/types';
import { ProjectAnalyzer } from './services/ProjectAnalyzer';
import { ReportGenerator } from './services/ReportGenerator';
import ChatModal from './components/ChatModal';

export default function App() {
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [accessibilityIssues, setAccessibilityIssues] = useState<AccessibilityIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  
  // 새로운 상태들
  const [components, setComponents] = useState<FlutterComponent[]>([]);
  const [accessibilityScore, setAccessibilityScore] = useState(0);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [acceptedIssues, setAcceptedIssues] = useState<string[]>([]);
  
  // 서비스 인스턴스들
  const projectAnalyzer = new ProjectAnalyzer();
  const reportGenerator = new ReportGenerator();

  useEffect(() => {
    document.title = 'Flutter Accessibility Checker';
    const timer = setTimeout(() => {
      setReady(true);
      // 페이지 로드 시 바로 접근성 이슈 표시
      analyze();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  async function analyze() {
    try {
      // ProjectAnalyzer를 사용한 실제 분석
      const analysisResult = await projectAnalyzer.analyzeProject();
      
      setComponents(analysisResult.components);
      setAccessibilityIssues(analysisResult.issues);
      setAccessibilityScore(analysisResult.accessibilityScore);
      setSuggestions(analysisResult.issues.flatMap(issue => issue.suggestions));
    } catch (error) {
      console.error('분석 오류:', error);
      // 오류 발생 시 기존 Mock 데이터 사용
      const detectedIssues: AccessibilityIssue[] = [
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

    setAccessibilityIssues(detectedIssues);
    setSuggestions(detectedIssues.flatMap(issue => issue.suggestions));
  }

  function onAccept(sug: Suggestion) {
    const params = new URLSearchParams({
      file: sug.file,
      line: String(sug.line),
      column: String(sug.column),
      text: sug.text
    });
    window.open(`vscode://my.publisher.myExtension/applySuggestion?${params}`);
    
    // 수락된 이슈 추적
    const issue = accessibilityIssues.find(i => i.suggestions.some(s => s.id === sug.id));
    if (issue) {
      setAcceptedIssues(prev => [...prev, issue.id]);
    }
  }

  function onDiscuss(sug: Suggestion) {
    // 채팅 모달 열기
    setIsChatModalOpen(true);
  }

  function onIgnore(issueId: string) {
    setAccessibilityIssues(prev => prev.filter(issue => issue.id !== issueId));
  }

  function handleGenerateReport(newChatHistory: ChatMessage[]) {
    setChatHistory(newChatHistory);
    
    // 리포트 생성
    reportGenerator.setAcceptedIssues(acceptedIssues);
    reportGenerator.setChatHistory(newChatHistory);
    const reportData = reportGenerator.generateReport(accessibilityIssues);
    
    // HTML 리포트 다운로드
    reportGenerator.downloadHTMLReport(reportData);
  }

  function handleRefreshAnalysis() {
    analyze();
  }

  return (
    <div className="flex min-h-screen bg-gray-50 p-6 gap-8">
      {/* 왼쪽 에뮬레이터 영역 - 중앙으로 이동 */}
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
          
          {/* 말풍선 효과들 - 화면을 가리지 않게 밖으로 배치 */}
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
        
        <p className="text-gray-600 text-xs">
          이 앱에 대한 접근성 평가 결과입니다.
        </p>

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
      
      {/* ChatModal */}
      <ChatModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        issues={accessibilityIssues}
        onGenerateReport={handleGenerateReport}
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
    </div>
  );
}