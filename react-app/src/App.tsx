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
import { cn } from './lib/utils';
import { 
  Smartphone, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  Eye, 
  MessageSquare, 
  FileText, 
  BarChart3, 
  Settings,
  Sparkles,
  Zap,
  Shield
} from 'lucide-react';

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
  userJourney?: {
    mainScenarios: string[];
    accessibilityGaps: string[];
    semanticsImprovements: string[];
  };
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
      // iframe 대신 더미 이미지 사용 (연결 문제 해결)
      setIframeSrc('https://via.placeholder.com/375x812/f0f9ff/1e40af?text=Flutter+App+Preview');
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
      console.log('새로운 Flutter 프로젝트 분석 시작:', path);
      
      // 새로운 프로젝트 분석 메서드 사용
      const structure = await projectAnalyzer.analyzeNewProject(path);
      setFlutterComponents(structure.components);
      
      // ChatService에도 프로젝트 정보 설정
      await chatService.analyzeFlutterProject(path);
      
      // 프로젝트 이름 추출
      if (structure.pubspecYaml?.name) {
        setProjectName(structure.pubspecYaml.name);
      }
      
      // 분석된 컴포넌트 정보 로그
      console.log('분석된 컴포넌트들:', structure.components);
      console.log('발견된 Dart 파일들:', structure.dartFiles);
      
      // 접근성 이슈 자동 감지 및 업데이트
      const detectedIssues = detectAccessibilityIssues(structure.components);
      setAccessibilityIssues(detectedIssues);
      
    } catch (error) {
      console.error('프로젝트 분석 실패:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 접근성 이슈 자동 감지
  const detectAccessibilityIssues = (components: FlutterComponent[]): AccessibilityIssue[] => {
    const issues: AccessibilityIssue[] = [];
    let issueId = 1;

    components.forEach((component, index) => {
      component.issues.forEach((issue, issueIndex) => {
        issues.push({
          id: String(issueId++),
          type: issue.includes('누락') ? 'error' : issue.includes('부족') ? 'warning' : 'info',
          title: issue,
          description: `${component.name}에서 ${issue} 문제가 발견되었습니다.`,
          position: { x: 30 + (index * 20), y: 30 + (issueIndex * 15) },
          element: component.name,
          side: index % 2 === 0 ? 'left' : 'right',
          bubblePosition: { x: 30 + (index * 20), y: 25 + (issueIndex * 15) },
          suggestions: [
            {
              id: `${issueId}-1`,
              file: component.file,
              line: component.line,
              column: 1,
              text: generateSuggestionCode(issue, component),
              message: issue,
              type: issue.includes('누락') ? 'error' : issue.includes('부족') ? 'warning' : 'info',
              element: component.name,
              position: { x: 30 + (index * 20), y: 30 + (issueIndex * 15) }
            }
          ]
        });
      });
    });

    return issues;
  };

  // 제안 코드 생성
  const generateSuggestionCode = (issue: string, component: FlutterComponent): string => {
    if (issue.includes('Semantics')) {
      return `Semantics(
  label: '${component.name}',
  child: ${component.name}(),
)`;
    } else if (issue.includes('터치 영역')) {
      return `Container(
  constraints: BoxConstraints(minWidth: 44, minHeight: 44),
  child: ${component.name}(),
)`;
    } else if (issue.includes('대체 텍스트')) {
      return `Image.asset(
  'assets/images/image.png',
  semanticLabel: '이미지 설명',
)`;
    } else {
      return `// ${issue} 해결을 위한 코드 수정 필요`;
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
        
        // 사용자 저니 기반 UML 다이어그램 업데이트
        updateUMLFromChat(messages);
        
        // 대시보드 데이터 업데이트
        updateDashboardFromChat(messages);
        
        setIsUpdatingIssues(false);
      }, 2000); // 2초 로딩
    }
  }

  // 채팅 내용 기반 UML 다이어그램 업데이트
  const updateUMLFromChat = (messages: ChatMessage[]) => {
    const userJourneyMessages = messages.filter(msg => 
      msg.type === 'assistant' && msg.userJourney
    );

    if (userJourneyMessages.length > 0) {
      const latestJourney = userJourneyMessages[userJourneyMessages.length - 1].userJourney;
      
      if (latestJourney && latestJourney.mainScenarios.length > 0) {
        // 사용자 저니 기반 PlantUML 생성
        const newPumlCode = generateUserJourneyPuml(latestJourney);
        setCurrentPumlCode(newPumlCode);
      }
    }
  };

  // 사용자 저니 기반 PlantUML 생성
  const generateUserJourneyPuml = (userJourney: any): string => {
    const scenarios = userJourney.mainScenarios.map((scenario: string, index: number) => 
      `:${scenario};`
    ).join('\n');

    const gaps = userJourney.accessibilityGaps.map((gap: string, index: number) => 
      `note right: ${gap}`
    ).join('\n');

    const improvements = userJourney.semanticsImprovements.map((improvement: string, index: number) => 
      `note left: ${improvement}`
    ).join('\n');

    return `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam roundcorner 5
skinparam shadowing false

title ${projectName} - AI 분석 사용자 저니

start

${scenarios}

if (접근성 이슈 발견?) then (있음)
  ${gaps}
  :접근성 개선 적용;
  ${improvements}
else (없음)
  :정상 사용;
endif

stop
@enduml`;
  };

  // 채팅 내용 기반 대시보드 업데이트
  const updateDashboardFromChat = (messages: ChatMessage[]) => {
    const userJourneyMessages = messages.filter(msg => 
      msg.type === 'assistant' && msg.userJourney
    );

    if (userJourneyMessages.length > 0) {
      const latestJourney = userJourneyMessages[userJourneyMessages.length - 1].userJourney;
      
      // 대시보드에 사용자 저니 정보 저장
      localStorage.setItem('dashboard-user-journey', JSON.stringify(latestJourney));
      
      // 컴포넌트 정보 업데이트
      updateComponentsFromChat(messages);
    }
  };

  // 채팅 내용 기반 컴포넌트 정보 업데이트
  const updateComponentsFromChat = (messages: ChatMessage[]) => {
    const codeSuggestions = messages.filter(msg => 
      msg.type === 'assistant' && msg.codeSuggestion
    );

    if (codeSuggestions.length > 0) {
      const updatedComponents = flutterComponents.map(component => {
        const suggestions = codeSuggestions.filter(msg => 
          msg.fileReference && msg.fileReference.includes(component.file)
        );

        if (suggestions.length > 0) {
          return {
            ...component,
            accessibilityScore: Math.min(100, component.accessibilityScore + 10),
            issues: component.issues.filter(issue => 
              !suggestions.some(s => s.content.includes(issue))
            )
          };
        }
        return component;
      });

      setFlutterComponents(updatedComponents);
    }
  };

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
skinparam roundcorner 5
skinparam shadowing false

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
    <div className="min-h-screen gradient-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/80 backdrop-blur-sm rounded-xl shadow-lg">
                <Sparkles className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Flutter Accessibility Checker
                </h1>
                <p className="text-sm text-gray-600">AI 기반 접근성 분석 도구</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 px-3 py-1 bg-green-100 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-700">실시간 분석</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-8">
          {/* 왼쪽: 에뮬레이터 + 말풍선 */}
          <div className="flex-1 flex items-center justify-center overflow-visible">
            <div className="relative">
              {/* 모바일 프레임 */}
              <div className="relative w-[375px] h-[812px] bg-gradient-to-br from-gray-900 to-gray-800 rounded-[3rem] p-3 shadow-2xl">
                <div className="relative w-full h-full bg-white rounded-[2.5rem] overflow-hidden">
                  {iframeSrc.includes('placeholder') ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
                      <div className="text-center p-8">
                        <Smartphone className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-700 mb-2">Flutter 앱 미리보기</h3>
                        <p className="text-sm text-gray-500 mb-4">
                          실제 Flutter 앱이 실행되면 여기에 표시됩니다
                        </p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                            <span>온보딩 화면</span>
                          </div>
                          <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                            <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                            <span>메인 화면</span>
                          </div>
                          <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            <span>설정 화면</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      src={iframeSrc}
                      title="Flutter Web App"
                      className="w-full h-full border-none"
                      onLoad={handleIframeLoad}
                    />
                  )}
                  
                  {!ready && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-3"></div>
                        <p className="text-sm text-gray-600">Flutter 앱을 로드하는 중…</p>
                      </div>
                    </div>
                  )}
                  
                  {isUpdatingIssues && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
                        <p className="text-sm text-gray-600">접근성 이슈를 업데이트하는 중...</p>
                      </div>
                    </div>
                  )}
                  
                  {isAnalyzing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-3"></div>
                        <p className="text-sm text-gray-600">Flutter 프로젝트를 분석하는 중...</p>
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
                              ? '#ef4444'
                              : issue.type === 'warning'
                              ? '#f59e0b'
                              : '#3b82f6'
                          }
                          strokeWidth={2}
                          strokeDasharray="4,4"
                          opacity={0.6}
                        />
                        <circle
                          cx={`${issue.position.x}%`}
                          cy={`${issue.position.y}%`}
                          r={4}
                          fill={
                            issue.type === 'error'
                              ? '#ef4444'
                              : issue.type === 'warning'
                              ? '#f59e0b'
                              : '#3b82f6'
                          }
                          opacity={0.8}
                        />
                      </svg>
                      <div
                        className="absolute z-10"
                        style={{
                          left: '100%',
                          top: `${issue.bubblePosition.y}%`,
                          transform: 'translate(20px, -50%)',
                          width: 280,
                        }}
                      >
                        <div className={cn(
                          "card-pastel p-4 animate-slide-up",
                          issue.type === 'error' && "border-l-4 border-l-red-400",
                          issue.type === 'warning' && "border-l-4 border-l-amber-400",
                          issue.type === 'info' && "border-l-4 border-l-blue-400"
                        )}>
                          <div className="flex items-start space-x-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              issue.type === 'error' && "bg-red-100",
                              issue.type === 'warning' && "bg-amber-100",
                              issue.type === 'info' && "bg-blue-100"
                            )}>
                              {issue.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-600" />}
                              {issue.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                              {issue.type === 'info' && <Info className="w-4 h-4 text-blue-600" />}
                            </div>
                            <div className="flex-1">
                              <h4 className={cn(
                                "font-semibold text-sm mb-1",
                                issue.type === 'error' && "text-red-800",
                                issue.type === 'warning' && "text-amber-800",
                                issue.type === 'info' && "text-blue-800"
                              )}>
                                {issue.title}
                              </h4>
                              <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                                {issue.description}
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => onPreview(issue.suggestions[0])}
                                  className="btn-pastel-success text-xs px-3 py-1.5"
                                >
                                  수락
                                </button>
                                <button
                                  onClick={() => onIgnore(issue.id)}
                                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                                >
                                  무시
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
              </div>
            </div>
          </div>

          {/* 오른쪽: 리포트 패널 */}
          <div className="w-96 space-y-6">
            {/* 접근성 평가 정보 카드 */}
            <div className="card-pastel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Shield className="w-5 h-5 text-blue-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-800">접근성 평가</h2>
                </div>
                <button
                  onClick={handleDashboardOpen}
                  className="btn-pastel-primary text-xs px-3 py-1.5"
                >
                  대시보드
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-red-50 to-pink-50 rounded-lg border border-red-100">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium text-red-700">오류</span>
                  </div>
                  <span className="text-lg font-bold text-red-600">
                    {accessibilityIssues.filter(i => i.type === 'error').length}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-100">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-700">경고</span>
                  </div>
                  <span className="text-lg font-bold text-amber-600">
                    {accessibilityIssues.filter(i => i.type === 'warning').length}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                  <div className="flex items-center space-x-2">
                    <Info className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-blue-700">정보</span>
                  </div>
                  <span className="text-lg font-bold text-blue-600">
                    {accessibilityIssues.filter(i => i.type === 'info').length}
                  </span>
                </div>
              </div>
            </div>

            {/* 도구 버튼들 */}
            <div className="card-pastel p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                <Zap className="w-5 h-5 text-purple-500" />
                <span>분석 도구</span>
              </h3>
              
              <div className="space-y-3">
                <button
                  onClick={handleCodeStructureOpen}
                  className="w-full flex items-center space-x-3 p-3 bg-gradient-to-r from-purple-100 to-pink-100 hover:from-purple-200 hover:to-pink-200 rounded-lg transition-all duration-200 group"
                >
                  <div className="p-2 bg-purple-500 rounded-lg group-hover:scale-110 transition-transform">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-purple-700">코드 구조 분석</span>
                </button>
                
                <button
                  onClick={handleUMLDiagramOpen}
                  className="w-full flex items-center space-x-3 p-3 bg-gradient-to-r from-indigo-100 to-blue-100 hover:from-indigo-200 hover:to-blue-200 rounded-lg transition-all duration-200 group"
                >
                  <div className="p-2 bg-indigo-500 rounded-lg group-hover:scale-110 transition-transform">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-indigo-700">UML 다이어그램</span>
                </button>
                
                <button
                  onClick={handleMarkdownDocOpen}
                  className="w-full flex items-center space-x-3 p-3 bg-gradient-to-r from-emerald-100 to-teal-100 hover:from-emerald-200 hover:to-teal-200 rounded-lg transition-all duration-200 group"
                >
                  <div className="p-2 bg-emerald-500 rounded-lg group-hover:scale-110 transition-transform">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-emerald-700">문서 생성</span>
                </button>
              </div>
            </div>

            {/* 이슈 목록 */}
            <div className="card-pastel p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">발견된 이슈</h3>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {accessibilityIssues.map(issue => (
                  <div
                    key={issue.id}
                    className={cn(
                      "p-3 rounded-lg border-l-4 transition-all duration-200 hover:shadow-md",
                      issue.type === 'error' && "bg-red-50 border-l-red-400 hover:bg-red-100",
                      issue.type === 'warning' && "bg-amber-50 border-l-amber-400 hover:bg-amber-100",
                      issue.type === 'info' && "bg-blue-50 border-l-blue-400 hover:bg-blue-100"
                    )}
                  >
                    <div className="flex items-start space-x-2">
                      <div className={cn(
                        "p-1 rounded",
                        issue.type === 'error' && "bg-red-100",
                        issue.type === 'warning' && "bg-amber-100",
                        issue.type === 'info' && "bg-blue-100"
                      )}>
                        {issue.type === 'error' && <AlertTriangle className="w-3 h-3 text-red-600" />}
                        {issue.type === 'warning' && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                        {issue.type === 'info' && <Info className="w-3 h-3 text-blue-600" />}
                      </div>
                      <div className="flex-1">
                        <h4 className={cn(
                          "font-medium text-sm mb-1",
                          issue.type === 'error' && "text-red-800",
                          issue.type === 'warning' && "text-amber-800",
                          issue.type === 'info' && "text-blue-800"
                        )}>
                          {issue.title}
                        </h4>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {issue.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">요소: {issue.element}</p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {accessibilityIssues.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">발견된 접근성 이슈가 없습니다!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 미리보기 모달 */}
      {previewSug && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="card-pastel p-6 w-96 max-h-[80vh] overflow-auto animate-slide-up">
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Eye className="w-5 h-5 text-blue-500" />
              <span>제안 미리보기</span>
            </h3>
            <div className="space-y-3 mb-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>파일:</strong> {previewSug.file}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>위치:</strong> Line {previewSug.line}, Column {previewSug.column}
                </p>
              </div>
              <pre className="bg-gray-100 p-3 rounded-lg text-xs overflow-auto whitespace-pre-wrap border">
                {previewSug.text}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreviewSug(null)}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                닫기
              </button>
              <button
                onClick={() => onAccept(previewSug)}
                className="btn-pastel-success text-sm px-4 py-2"
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