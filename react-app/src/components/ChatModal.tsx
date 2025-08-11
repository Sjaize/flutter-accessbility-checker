import React, { useState, useRef, useEffect } from 'react';
import { ChatService } from '../services/ChatService';

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

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateReport: (messages: ChatMessage[]) => void;
  onOpenReportGenerator: () => void;
  projectPath?: string;
}

export default function ChatModal({ isOpen, onClose, onGenerateReport, onOpenReportGenerator, projectPath }: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'assistant',
      content: '안녕하세요! Flutter 앱의 접근성을 분석하고 개선 방안을 논의해보겠습니다. 어떤 부분부터 살펴보고 싶으신가요?\n\n💡 **사용 팁:**\n• 특정 파일을 분석하려면 \`파일명.dart\` 형식으로 언급하세요\n• "접근성 이슈를 찾아줘" 같은 구체적인 요청을 해보세요\n• 코드 제안이 필요하면 "수정된 코드를 보여줘"라고 요청하세요',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPuml, setCurrentPuml] = useState('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatService = useRef(new ChatService());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // PlantUML 다이어그램 생성 (예시)
  const generatePuml = (highlightedFlow?: string) => {
    const basePuml = `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12

title Flutter App User Journey

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

    if (highlightedFlow) {
      // 특정 플로우 하이라이트 로직
      return basePuml.replace(
        new RegExp(`:${highlightedFlow};`, 'g'),
        `:${highlightedFlow}; #LightBlue`
      );
    }
    return basePuml;
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // LLM 설정 확인
      const savedConfig = localStorage.getItem('llm-config');
      if (!savedConfig) {
        throw new Error('LLM 설정이 필요합니다. 먼저 AI 모델을 설정해주세요.');
      }

      const config = JSON.parse(savedConfig);
      chatService.current.setConfig(config);
      
      // 컨텍스트 업데이트
      chatService.current.updateContext({
        chatHistory: messages
      });

      const response = await chatService.current.sendMessage(inputMessage);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.content,
        timestamp: new Date(),
        highlightedElement: response.highlightedElement,
        pumlHighlight: response.pumlHighlight,
        codeSuggestion: response.codeSuggestion,
        fileReference: response.fileReference
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // PlantUML 업데이트
      if (response.pumlHighlight) {
        setCurrentPuml(generatePuml(response.pumlHighlight));
      }

      // 파일 참조가 있으면 선택
      if (response.fileReference) {
        setSelectedFile(response.fileReference);
      }
    } catch (error) {
      console.error('API 호출 실패:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = () => {
    onGenerateReport(messages);
    onOpenReportGenerator();
    onClose();
  };

  const handleExit = () => {
    // 나가기 버튼: 대화 내용을 기반으로 접근성 평가 정보만 업데이트
    onGenerateReport(messages);
    onClose();
  };

  const handleQuickActions = (action: string) => {
    const quickMessages = {
      'analyze': '현재 Flutter 프로젝트의 접근성 이슈를 분석해주세요.',
      'semantics': 'Semantics 위젯을 활용한 접근성 개선 방법을 알려주세요.',
      'touch-target': '터치 타겟 크기와 관련된 접근성 가이드라인을 설명해주세요.',
      'color-contrast': '색상 대비와 관련된 WCAG 가이드라인을 알려주세요.',
      'screen-reader': '스크린 리더 사용자를 위한 Flutter 앱 최적화 방법을 알려주세요.'
    };

    setInputMessage(quickMessages[action as keyof typeof quickMessages] || '');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-90 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-11/12 h-5/6 max-w-7xl flex shadow-2xl">
        {/* 좌측: PlantUML 다이어그램 */}
        <div className="w-1/2 p-6 border-r border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">사용자 저니 다이어그램</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 h-full overflow-auto border border-gray-200">
            {currentPuml ? (
              <img
                src={`http://www.plantuml.com/plantuml/png/${encodeURIComponent(currentPuml)}`}
                alt="User Journey Diagram"
                className="w-full rounded-lg shadow-sm"
              />
            ) : (
              <div className="text-gray-500 text-center py-8">
                <div className="text-4xl mb-4">📊</div>
                <p>대화를 시작하면 다이어그램이 표시됩니다</p>
                <p className="text-sm mt-2">AI가 분석한 사용자 저니를 시각화합니다</p>
              </div>
            )}
          </div>
        </div>

        {/* 우측: 채팅 */}
        <div className="w-1/2 flex flex-col bg-gray-50">
          <div className="p-6 border-b border-gray-200 bg-white rounded-tr-2xl">
            <h3 className="text-lg font-semibold text-gray-800">접근성 분석 채팅</h3>
            <p className="text-sm text-gray-600">AI와 함께 앱의 접근성을 개선해보세요</p>
            {projectPath && (
              <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600">
                📁 프로젝트: {projectPath}
              </div>
            )}
            {selectedFile && (
              <div className="mt-1 p-2 bg-blue-100 rounded text-xs text-blue-700">
                📄 현재 파일: {selectedFile}
              </div>
            )}
          </div>

          {/* 빠른 액션 버튼들 */}
          <div className="px-6 py-3 border-b border-gray-200 bg-white">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleQuickActions('analyze')}
                className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200"
              >
                🔍 분석
              </button>
              <button
                onClick={() => handleQuickActions('semantics')}
                className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded hover:bg-green-200"
              >
                🏷️ Semantics
              </button>
              <button
                onClick={() => handleQuickActions('touch-target')}
                className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs rounded hover:bg-yellow-200"
              >
                👆 터치 타겟
              </button>
              <button
                onClick={() => handleQuickActions('color-contrast')}
                className="px-3 py-1 bg-purple-100 text-purple-700 text-xs rounded hover:bg-purple-200"
              >
                🎨 색상 대비
              </button>
              <button
                onClick={() => handleQuickActions('screen-reader')}
                className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200"
              >
                🔊 스크린 리더
              </button>
            </div>
          </div>

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                    message.type === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-800 border border-gray-200'
                  }`}
                >
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
                  
                  {/* 코드 제안 표시 */}
                  {message.codeSuggestion && (
                    <div className="mt-3 p-2 bg-gray-100 rounded text-xs">
                      <div className="font-medium mb-1">💡 코드 제안:</div>
                      <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                        {message.codeSuggestion}
                      </pre>
                    </div>
                  )}
                  
                  {message.highlightedElement && (
                    <div className="text-xs mt-2 opacity-75 bg-black bg-opacity-10 px-2 py-1 rounded">
                      📍 {message.highlightedElement}
                    </div>
                  )}
                  <div className="text-xs mt-2 opacity-50">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-800 px-4 py-3 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    <span className="text-sm">AI가 응답을 생성하고 있습니다...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력 영역 */}
          <div className="p-4 border-t border-gray-200 bg-white rounded-br-2xl">
            <div className="flex space-x-3">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="메시지를 입력하세요... (예: 'lib/main.dart 파일의 접근성을 분석해줘')"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputMessage.trim()}
                className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                전송
              </button>
            </div>
          </div>

          {/* 하단 버튼들 */}
          <div className="p-4 border-t border-gray-200 bg-white rounded-br-2xl flex justify-between">
            <button
              onClick={handleExit}
              className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors font-medium"
            >
              나가기
            </button>
            <button
              onClick={handleGenerateReport}
              className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
            >
              레포트 생성
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 