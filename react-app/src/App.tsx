import React, { useState, useEffect } from 'react';
import ChatModal from './components/ChatModal';
import ChatFloatingButton from './components/ChatFloatingButton';
import ReportGenerator from './components/ReportGenerator';
import LLMConfigModal from './components/LLMConfigModal';
import Dashboard from './components/Dashboard';
import CodeStructureViewer from './components/CodeStructureViewer';
import UMLDiagramViewer from './components/UMLDiagramViewer';
import MarkdownDocumentation from './components/MarkdownDocumentation';
import { ProjectAnalyzer } from './services/ProjectAnalyzer';
import { ChatService } from './services/ChatService';

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
  side: 'left' | 'right';
  bubblePosition: { x: number; y: number };
  suggestions: Suggestion[];
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  highlightedElement?: string;
  pumlHighlight?: string;
  codeSuggestion?: string;
  fileReference?: string;
}

interface FlutterComponent {
  name: string;
  file: string;
  line: number;
  type: 'widget' | 'screen' | 'service' | 'model' | 'util';
  accessibilityScore: number;
  issues: string[];
  content?: string;
  dependencies?: string[];
  methods?: string[];
  properties?: string[];
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [iframeSrc, setIframeSrc] = useState('');
  const [accessibilityIssues, setAccessibilityIssues] = useState<AccessibilityIssue[]>([]);
  const [previewSug, setPreviewSug] = useState<Suggestion | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isReportGeneratorOpen, setIsReportGeneratorOpen] = useState(false);
  const [showLLMConfig, setShowLLMConfig] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [isUpdatingIssues, setIsUpdatingIssues] = useState(false);
  const [projectPath, setProjectPath] = useState<string>('');
  
  // 새로운 상태들
  const [showCodeStructure, setShowCodeStructure] = useState(false);
  const [showUMLDiagram, setShowUMLDiagram] = useState(false);
  const [showMarkdownDoc, setShowMarkdownDoc] = useState(false);
  const [flutterComponents, setFlutterComponents] = useState<FlutterComponent[]>([]);
  const [currentPumlCode, setCurrentPumlCode] = useState('');
  const [projectName, setProjectName] = useState('Flutter App');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 서비스 인스턴스들
  const projectAnalyzer = new ProjectAnalyzer();
  const chatService = new ChatService();

  // Flutter 서버가 8초 먼저 시작되므로 안전하게 바로 로드
  useEffect(() => {
    const timer = setTimeout(() => {
      setIframeSrc('http://localhost:60778');
      setReady(true);
      analyze();
      
      // 프로젝트 경로 설정 (VS Code 확장에서 전달받거나 기본값)
      const savedProjectPath = localStorage.getItem('project-path');
      if (savedProjectPath) {
        setProjectPath(savedProjectPath);
        analyzeProject(savedProjectPath);
      } else {
        // 기본값으로 현재 워크스페이스 경로 설정
        const defaultPath = '/Users/jeong-yujin/flutter-accessbility-checker';
        setProjectPath(defaultPath);
        analyzeProject(defaultPath);
      }
    }, 1000); // 1초 지연으로 안전성 확보

    return () => clearTimeout(timer);
  }, []);

  // 프로젝트 분석
  const analyzeProject = async (path: string) => {
    setIsAnalyzing(true);
    try {
      projectAnalyzer.setProjectPath(path);
      const structure = await projectAnalyzer.analyzeProject();
      setFlutterComponents(structure.components);
      
      // ChatService에도 프로젝트 정보 설정
      await chatService.analyzeFlutterProject(path);
      
      // 프로젝트 이름 추출
      if (structure.pubspecYaml?.name) {
        setProjectName(structure.pubspecYaml.name);
      }
    } catch (error) {
      console.error('프로젝트 분석 실패:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // iframe 로드 완료 시 호출
  function handleIframeLoad() {
    // iframe이 로드되었지만 이미 준비가 되어있으므로 별도 처리 불필요
  }

  function analyze() {
    // TODO: 실제 DevTools API 로직으로 교체
    const detectedIssues: AccessibilityIssue[] = [
      {
        id: '1',
        type: 'error',
        title: '이미지 대체 텍스트 누락',
        description: '온보딩 페이지의 이미지에 대한 대체 텍스트가 없습니다.',
        position: { x: 50, y: 30 },
        element: '온보딩 페이지 이미지',
        side: 'left',
        bubblePosition: { x: 50, y: 25 },
        suggestions: [
          {
            id: '1-1',
            file: 'lib/onboarding_page.dart',
            line: 24,
            column: 18,
            text: `Semantics(
  label: '온보딩 페이지 이미지',
  child: Image.asset('assets/images/onboarding.png'),
)`,
            message: '이미지에 Semantics 래퍼 추가',
            type: 'error',
            element: '온보딩 페이지 이미지',
            position: { x: 50, y: 30 },
          }
        ]
      },
      {
        id: '2',
        type: 'warning',
        title: '버튼 터치 영역 부족',
        description: '"지금 시작하기" 버튼의 터치 영역이 44×44dp 미만입니다.',
        position: { x: 50, y: 85 },
        element: '"지금 시작하기" 버튼',
        side: 'left',
        bubblePosition: { x: 50, y: 80 },
        suggestions: [
          {
            id: '2-1',
            file: 'lib/home.dart',
            line: 88,
            column: 12,
            text: `Container(
  constraints: BoxConstraints(minWidth: 44, minHeight: 44),
  child: ElevatedButton(...),
)`,
            message: '버튼에 최소 터치 영역 보장',
            type: 'warning',
            element: '"지금 시작하기" 버튼',
            position: { x: 50, y: 85 },
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
        bubblePosition: { x: 50, y: 50 },
        suggestions: [
          {
            id: '3-1',
            file: 'lib/home.dart',
            line: 65,
            column: 8,
            text: `Text(
  '나랏말싸미',
  style: TextStyle(color: Colors.black87),
)`,
            message: '텍스트 색상을 더 진하게 변경',
            type: 'info',
            element: '"나랏말싸미" 제목 텍스트',
            position: { x: 50, y: 50 },
          }
        ]
      }
    ];

    setAccessibilityIssues(detectedIssues);
  }

  function onPreview(sug: Suggestion) {
    setPreviewSug(sug);
  }

  function onAccept(sug: Suggestion) {
    const params = new URLSearchParams({
      file: sug.file,
      line: String(sug.line),
      column: String(sug.column),
      text: sug.text,
    });
    window.open(
      `vscode://my-publisher.flutter-accessibility-checker/previewSuggestion?${params}`
    );
    setPreviewSug(null);
  }

  function onDiscuss(sug: Suggestion) {
    alert(`"${sug.message}" 논의하기`);
  }

  function onIgnore(issueId: string) {
    setAccessibilityIssues(prev => prev.filter(i => i.id !== issueId));
  }

  function handleChatOpen() {
    // LLM 설정이 없으면 설정 모달 먼저 표시
    const savedConfig = localStorage.getItem('llm-config');
    if (!savedConfig) {
      setShowLLMConfig(true);
    } else {
      setIsChatOpen(true);
    }
  }

  function handleChatClose() {
    setIsChatOpen(false);
  }

  function handleGenerateReport(messages: ChatMessage[]) {
    setChatMessages(messages);
    
    // 대화 내용을 기반으로 접근성 이슈 업데이트
    if (messages.length > 1) {
      setIsUpdatingIssues(true);
      
      // 대화에서 발견된 이슈들을 추출하여 업데이트
      setTimeout(() => {
        const newIssues = extractIssuesFromChat(messages);
        setAccessibilityIssues(newIssues);
        setIsUpdatingIssues(false);
      }, 2000); // 2초 로딩
    }
  }

  function handleOpenReportGenerator() {
    setIsReportGeneratorOpen(true);
  }

  function extractIssuesFromChat(messages: ChatMessage[]): AccessibilityIssue[] {
    const issues: AccessibilityIssue[] = [];
    
    messages.forEach((message, index) => {
      if (message.type === 'assistant' && message.highlightedElement) {
        const fileMatch = message.highlightedElement.match(/^(.+):(\d+)$/);
        if (fileMatch) {
          issues.push({
            id: `chat-issue-${index}`,
            type: 'warning',
            title: extractTitleFromMessage(message.content),
            description: message.content,
            position: { x: 50, y: 30 + (index * 20) },
            element: extractElementFromMessage(message.content),
            side: 'left',
            bubblePosition: { x: 50, y: 25 + (index * 20) },
            suggestions: [{
              id: `suggestion-${index}`,
              file: fileMatch[1],
              line: parseInt(fileMatch[2]),
              column: 1,
              text: message.codeSuggestion || extractSuggestionFromMessage(message.content),
              message: extractTitleFromMessage(message.content),
              type: 'warning',
              element: extractElementFromMessage(message.content),
              position: { x: 50, y: 30 + (index * 20) }
            }]
          });
        }
      }
    });

    return issues;
  }

  function extractTitleFromMessage(content: string): string {
    if (content.includes('대체 텍스트')) return '이미지 대체 텍스트 누락';
    if (content.includes('터치 영역')) return '버튼 터치 영역 부족';
    if (content.includes('색상 대비')) return '텍스트 색상 대비 개선';
    return '접근성 이슈';
  }

  function extractElementFromMessage(content: string): string {
    if (content.includes('온보딩')) return '온보딩 페이지';
    if (content.includes('버튼')) return '버튼';
    if (content.includes('이미지')) return '이미지';
    return 'UI 요소';
  }

  function extractSuggestionFromMessage(content: string): string {
    const codeMatch = content.match(/`([^`]+)`/);
    return codeMatch ? codeMatch[1] : content;
  }

  function handleReportGeneratorClose() {
    setIsReportGeneratorOpen(false);
  }

  function handleLLMConfigSave(config: any) {
    setShowLLMConfig(false);
    setIsChatOpen(true);
  }

  function handleLLMConfigClose() {
    setShowLLMConfig(false);
  }

  function handleDashboardOpen() {
    setShowDashboard(true);
  }

  function handleDashboardClose() {
    setShowDashboard(false);
  }

  // 새로운 핸들러들
  function handleCodeStructureOpen() {
    setShowCodeStructure(true);
  }

  function handleCodeStructureClose() {
    setShowCodeStructure(false);
  }

  function handleUMLDiagramOpen() {
    // 기본 사용자 저니 다이어그램 생성
    const basePuml = `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12

title ${projectName} User Journey

start
:사용자 앱 실행;
:온보딩 화면 표시;

if (첫 방문?) then (yes)
  :온보딩 가이드 표시;
  :"지금 시작하기" 버튼;
else (no)
  :메인 화면으로 이동;
endif

:메인 화면 로드;
:홈 화면 표시;

if (접근성 이슈 감지) then (있음)
  :접근성 경고 표시;
  :수정 제안 표시;
else (없음)
  :정상 화면 표시;
endif

stop
@enduml`;
    
    setCurrentPumlCode(basePuml);
    setShowUMLDiagram(true);
  }

  function handleUMLDiagramClose() {
    setShowUMLDiagram(false);
  }

  function handleMarkdownDocOpen() {
    setShowMarkdownDoc(true);
  }

  function handleMarkdownDocClose() {
    setShowMarkdownDoc(false);
  }

  return (
    <div className="flex min-h-screen bg-gray-50 p-6 gap-8">
      {/* 왼쪽: 에뮬레이터 + 말풍선 */}
      <div className="flex-1 flex items-center justify-center overflow-visible">
        <div className="relative w-[395px] h-[832px] bg-gray-800 rounded-[2.5rem] p-2 shadow-2xl overflow-visible">
          <div className="relative w-full h-full bg-white rounded-[2rem] overflow-hidden">
            <iframe
              src={iframeSrc}
              title="Flutter Web App"
              className="w-full h-full border-none"
              onLoad={handleIframeLoad}
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center bg-white text-gray-500">
                🚀 Flutter 앱을 로드하는 중…
              </div>
            )}
            {isUpdatingIssues && (
              <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 text-gray-500">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p>대화 내용을 분석하여 접근성 이슈를 업데이트하는 중...</p>
                </div>
              </div>
            )}
            {isAnalyzing && (
              <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 text-gray-500">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p>Flutter 프로젝트를 분석하는 중...</p>
                </div>
              </div>
            )}
          </div>

          {/* 말풍선 + 연결선 */}
          {ready &&
            accessibilityIssues.map(issue => (
              <React.Fragment key={issue.id}>
                <svg
                  className="absolute pointer-events-none"
                  style={{ top: 0, left: 0, width: '100%', height: '100%' }}
                >
                  <line
                    x1={`${issue.position.x}%`}
                    y1={`${issue.position.y}%`}
                    x2="100%"
                    y2={`${issue.bubblePosition.y}%`}
                    stroke={
                      issue.type === 'error'
                        ? '#dc2626'
                        : issue.type === 'warning'
                        ? '#ca8a04'
                        : '#2563eb'
                    }
                    strokeWidth={1}
                    strokeDasharray="3,3"
                    opacity={0.4}
                  />
                  <circle
                    cx={`${issue.position.x}%`}
                    cy={`${issue.position.y}%`}
                    r={3}
                    fill={
                      issue.type === 'error'
                        ? '#dc2626'
                        : issue.type === 'warning'
                        ? '#ca8a04'
                        : '#2563eb'
                    }
                    opacity={0.6}
                  />
                </svg>
                <div
                  className="absolute z-10"
                  style={{
                    left: '100%',
                    top: `${issue.bubblePosition.y}%`,
                    transform: 'translate(16px, -50%)',
                    width: 260,
                  }}
                >
                  <div
                    className={`bg-white border-l-4 rounded-r-lg px-3 py-2 shadow-sm ${
                      issue.type === 'error'
                        ? 'border-red-500'
                        : issue.type === 'warning'
                        ? 'border-yellow-500'
                        : 'border-blue-500'
                    }`}
                  >
                    <div
                      className={`font-medium text-xs ${
                        issue.type === 'error'
                          ? 'text-red-800'
                          : issue.type === 'warning'
                          ? 'text-yellow-800'
                          : 'text-blue-800'
                      }`}
                    >
                      {issue.title}
                    </div>
                    <div className="text-xs text-gray-600 mt-1 mb-2">
                      {issue.description}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onPreview(issue.suggestions[0])}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded"
                      >
                        수락
                      </button>
                      <button
                        onClick={() => onDiscuss(issue.suggestions[0])}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded"
                      >
                        논의
                      </button>
                      <button
                        onClick={() => onIgnore(issue.id)}
                        className="bg-gray-500 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded"
                      >
                        무시
                      </button>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            ))}
        </div>
      </div>

      {/* 오른쪽: 리포트 패널 */}
      <div className="w-80 bg-white rounded-2xl shadow p-6 space-y-4 max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">접근성 평가 정보</h2>
          <button
            onClick={handleDashboardOpen}
            className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
          >
            대시보드
          </button>
        </div>
        <p className="text-gray-600 text-xs">
          이 앱에 대한 접근성 평가 결과입니다.
        </p>

        {/* 새로운 도구 버튼들 */}
        <div className="space-y-2">
          <button
            onClick={handleCodeStructureOpen}
            className="w-full px-3 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 transition-colors"
          >
            📁 코드 구조 분석
          </button>
          <button
            onClick={handleUMLDiagramOpen}
            className="w-full px-3 py-2 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 transition-colors"
          >
            📊 UML 다이어그램
          </button>
          <button
            onClick={handleMarkdownDocOpen}
            className="w-full px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors"
          >
            📝 문서 생성
          </button>
        </div>

        {accessibilityIssues.map(issue => (
          <div
            key={issue.id}
            className={`border-l-4 p-3 rounded ${
              issue.type === 'error'
                ? 'bg-red-100 border-red-500'
                : issue.type === 'warning'
                ? 'bg-yellow-100 border-yellow-500'
                : 'bg-blue-100 border-blue-500'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`font-medium text-sm ${
                  issue.type === 'error'
                    ? 'text-red-800'
                    : issue.type === 'warning'
                    ? 'text-yellow-800'
                    : 'text-blue-800'
                }`}
              >
                {issue.title}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  issue.type === 'error'
                    ? 'bg-red-200 text-red-800'
                    : issue.type === 'warning'
                    ? 'bg-yellow-200 text-yellow-800'
                    : 'bg-blue-200 text-blue-800'
                }`}
              >
                {issue.type === 'error'
                  ? '오류'
                  : issue.type === 'warning'
                  ? '경고'
                  : '정보'}
              </span>
            </div>
            <p className="text-xs text-gray-700 mt-1">{issue.description}</p>
            <p className="text-xs text-gray-500 mt-1">요소: {issue.element}</p>
          </div>
        ))}
      </div>

      {/* 미리보기 모달 */}
      {previewSug && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-auto">
            <h3 className="text-lg font-semibold mb-2">제안 미리보기</h3>
            <p className="text-sm text-gray-600 mb-4">
              <strong>파일:</strong> {previewSug.file}
              <br />
              <strong>위치:</strong> Line {previewSug.line}, Column {previewSug.column}
            </p>
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto whitespace-pre-wrap">
              {previewSug.text}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPreviewSug(null)}
                className="px-3 py-1 rounded border"
              >
                닫기
              </button>
              <button
                onClick={() => onAccept(previewSug)}
                className="px-3 py-1 rounded bg-green-600 text-white"
              >
                이대로 수락
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 채팅 플로팅 버튼 */}
      <ChatFloatingButton onClick={handleChatOpen} />

      {/* 채팅 모달 */}
      {isChatOpen && (
        <ChatModal
          isOpen={isChatOpen}
          onClose={handleChatClose}
          onGenerateReport={handleGenerateReport}
          onOpenReportGenerator={handleOpenReportGenerator}
          projectPath={projectPath}
        />
      )}

      {/* 레포트 생성 모달 */}
      {isReportGeneratorOpen && (
        <ReportGenerator
          isOpen={isReportGeneratorOpen}
          messages={chatMessages}
          onClose={handleReportGeneratorClose}
        />
      )}

      {/* LLM 설정 모달 */}
      {showLLMConfig && (
        <LLMConfigModal
          isOpen={showLLMConfig}
          onClose={handleLLMConfigClose}
          onConfigSave={handleLLMConfigSave}
        />
      )}

      {/* 대시보드 */}
      {showDashboard && (
        <Dashboard
          isOpen={showDashboard}
          onClose={handleDashboardClose}
        />
      )}

      {/* 코드 구조 뷰어 */}
      {showCodeStructure && (
        <CodeStructureViewer
          isOpen={showCodeStructure}
          onClose={handleCodeStructureClose}
          components={flutterComponents}
          projectPath={projectPath}
        />
      )}

      {/* UML 다이어그램 뷰어 */}
      {showUMLDiagram && (
        <UMLDiagramViewer
          isOpen={showUMLDiagram}
          onClose={handleUMLDiagramClose}
          pumlCode={currentPumlCode}
          title={`${projectName} - UML 다이어그램`}
        />
      )}

      {/* Markdown 문서 생성기 */}
      {showMarkdownDoc && (
        <MarkdownDocumentation
          isOpen={showMarkdownDoc}
          onClose={handleMarkdownDocClose}
          components={flutterComponents}
          projectPath={projectPath}
          projectName={projectName}
        />
      )}
    </div>
  );
}