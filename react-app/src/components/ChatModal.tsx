import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Settings } from 'lucide-react';
import { ChatService } from '../services/ChatService';

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

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatContext: ChatContext;
  setChatContext: React.Dispatch<React.SetStateAction<ChatContext>>;
  accessibilityIssues: any[]; // 현재 접근성 이슈들
}

export default function ChatModal({ 
  isOpen, 
  onClose, 
  chatContext, 
  setChatContext,
  accessibilityIssues 
}: ChatModalProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatService] = useState(() => new ChatService());

  // 메시지 목록 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatContext.conversationHistory]);

  // API 키 로드
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai_api_key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  // 실제 ChatService를 사용한 메시지 전송
  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    setIsLoading(true);
    
    // 사용자 메시지 추가
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: message.trim(),
      timestamp: Date.now()
    };

    setChatContext(prev => ({
      ...prev,
      conversationHistory: [...prev.conversationHistory, userMessage]
    }));

    try {
      // ChatService를 통한 실제 AI 응답 생성
      const analysisContext = {
        userJourneyUML: chatContext.userJourneyUML,
        codebaseAnalysis: chatContext.codebaseAnalysis,
        currentIssues: accessibilityIssues,
        acceptedSuggestions: chatContext.acceptedSuggestions
      };

      let assistantMessage: ChatMessage;

      if (chatService.isConfigured()) {
        // OpenAI API 사용
        assistantMessage = await chatService.generateResponse(message, analysisContext);
      } else {
        // API 키가 없으면 Mock 응답 사용
        const mockResponse = generateMockResponse(message, accessibilityIssues);
        assistantMessage = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: mockResponse.content + '\n\n⚠️ OpenAI API 키를 설정하면 더 정확한 분석을 받을 수 있습니다.',
          timestamp: Date.now(),
          activityUML: mockResponse.activityUML
        };
      }

      setChatContext(prev => ({
        ...prev,
        conversationHistory: [...prev.conversationHistory, assistantMessage],
        currentActivityUML: assistantMessage.activityUML // 시각화용 UML 업데이트
      }));

    } catch (error) {
      console.error('채팅 오류:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `죄송합니다. 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}\n\nMock 응답으로 대체합니다.`,
        timestamp: Date.now()
      };

      // 오류 시 Mock 응답 추가
      const mockResponse = generateMockResponse(message, accessibilityIssues);
      errorMessage.content += `\n\n${mockResponse.content}`;
      errorMessage.activityUML = mockResponse.activityUML;

      setChatContext(prev => ({
        ...prev,
        conversationHistory: [...prev.conversationHistory, errorMessage],
        currentActivityUML: mockResponse.activityUML
      }));
    } finally {
      setIsLoading(false);
      setInputMessage('');
    }
  };

  // Mock 응답 생성 (실제 OpenAI API 연동 전까지 임시 사용)
  const generateMockResponse = (userInput: string, issues: any[]) => {
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes('이미지') || lowerInput.includes('대체') || lowerInput.includes('텍스트')) {
      return {
        content: `이미지 대체 텍스트에 대해 설명드리겠습니다.

현재 발견된 이슈:
- 전통 한복 인물 이미지에 semanticLabel이 없습니다.

**해결 방안:**
\`\`\`dart
Image.asset(
  'assets/traditional_man.png',
  semanticLabel: '전통 한복을 입고 갓을 쓴 남성 인물',
)
\`\`\`

**WCAG 2.2 기준:**
- 1.1.1 비텍스트 콘텐츠: 모든 이미지는 대체 텍스트를 제공해야 합니다.
- 스크린 리더 사용자가 이미지의 내용과 목적을 이해할 수 있도록 도와줍니다.`,
        activityUML: `@startuml
start
:사용자가 이미지 확인;
if (semanticLabel 존재?) then (yes)
  :스크린 리더가 대체 텍스트 읽음;
  :사용자가 이미지 내용 이해;
else (no)
  :스크린 리더가 파일명만 읽음;
  :사용자가 이미지 내용 파악 불가;
  note right: 접근성 이슈 발생
endif
stop
@enduml`
      };
    }
    
    if (lowerInput.includes('버튼') || lowerInput.includes('터치') || lowerInput.includes('영역')) {
      return {
        content: `버튼 터치 영역에 대해 설명드리겠습니다.

현재 발견된 이슈:
- "지금 시작하기" 버튼의 터치 영역이 44x44dp 미만입니다.

**해결 방안:**
\`\`\`dart
Container(
  constraints: BoxConstraints(minWidth: 44, minHeight: 44),
  child: ElevatedButton(
    onPressed: () {},
    child: Text('지금 시작하기'),
  ),
)
\`\`\`

**WCAG 2.2 기준:**
- 2.5.5 대상 크기: 터치 대상은 최소 44x44dp 이상이어야 합니다.
- 특히 손가락이 큰 사용자나 운동 장애가 있는 사용자를 고려해야 합니다.`,
        activityUML: `@startuml
start
:사용자가 버튼 터치 시도;
if (터치 영역 >= 44x44dp?) then (yes)
  :정확한 터치 인식;
  :의도한 동작 실행;
else (no)
  :터치 인식 실패 또는 오터치;
  :사용자 좌절감 증가;
  note right: 접근성 이슈 발생
endif
stop
@enduml`
      };
    }

    // 기본 응답
    return {
      content: `안녕하세요! Flutter 접근성 전문 AI입니다. 

현재 ${issues.length}개의 접근성 이슈가 발견되었습니다:
${issues.map((issue, index) => `${index + 1}. ${issue.title}`).join('\n')}

구체적인 이슈에 대해 질문해주시면 더 자세한 분석과 해결방안을 제공해드리겠습니다.

**추천 질문:**
- "이미지 대체 텍스트는 어떻게 추가하나요?"
- "버튼 터치 영역을 어떻게 개선할 수 있나요?"
- "전체적인 접근성 개선 순서를 알려주세요"`,
      activityUML: `@startuml
start
:접근성 분석 시작;
:Flutter 앱 스캔;
:${issues.length}개 이슈 발견;
:사용자와 개선 방안 논의;
stop
@enduml`
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputMessage);
  };

  // API 키 저장
  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      chatService.setConfig({
        provider: 'openai',
        apiKey: apiKey.trim(),
        model: 'gpt-4'
      });
      setShowApiKeyModal(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="card-pastel p-6 max-w-4xl w-full max-h-[80vh] overflow-hidden animate-slide-up">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4 border-b border-white/20 pb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              AI 접근성 채팅
            </h3>
            {!chatService.isConfigured() && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                API 키 필요
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowApiKeyModal(true)}
              className="text-gray-500 hover:text-gray-700 p-1 hover:scale-110 transition-transform"
              title="OpenAI API 설정"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl hover:scale-110 transition-transform"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 채팅 영역 */}
        <div className="flex h-[60vh] gap-4">
          {/* 메시지 목록 */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
              {chatContext.conversationHistory.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>AI와 접근성 개선에 대해 대화해보세요!</p>
                  <p className="text-sm mt-1">현재 발견된 이슈들에 대해 질문해주세요.</p>
                </div>
              )}
              
              {chatContext.conversationHistory.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.type === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-blue-400 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[70%] p-3 rounded-lg ${
                    message.type === 'user' 
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white' 
                      : 'bg-white/60 border border-white/30'
                  }`}>
                    <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  {message.type === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-blue-400 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white/60 border border-white/30 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-gray-600">분석 중입니다...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* 입력 영역 */}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="접근성 이슈에 대해 질문해보세요..."
                className="input-pastel flex-1"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                className="btn-pastel-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* UML 다이어그램 영역 */}
          <div className="w-80 card-pastel p-4">
            <h4 className="font-medium mb-3 text-sm text-gray-700">액티비티 다이어그램</h4>
            {chatContext.currentActivityUML ? (
              <div className="bg-white rounded-lg p-3 text-xs">
                <img 
                  src={`http://www.plantuml.com/plantuml/svg/${btoa(chatContext.currentActivityUML)}`}
                  alt="Activity Diagram"
                  className="w-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.removeAttribute('style');
                  }}
                />
                <div style={{ display: 'none' }} className="text-gray-500 text-center py-4">
                  다이어그램을 불러올 수 없습니다
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center text-sm py-8">
                AI와 대화하면 액티비티 다이어그램이 표시됩니다
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API 키 설정 모달 */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card-pastel p-6 max-w-md w-full mx-4 animate-slide-down">
            <h4 className="text-lg font-semibold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              OpenAI API 설정
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              더 정확한 접근성 분석을 위해 OpenAI API 키를 입력해주세요.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API 키
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="input-pastel"
                />
              </div>
              <div className="text-xs text-gray-500">
                <p>• API 키는 로컬에만 저장됩니다</p>
                <p>• <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenAI 플랫폼</a>에서 발급받을 수 있습니다</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="btn-pastel-secondary px-4 py-2"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim()}
                  className="btn-pastel-primary px-4 py-2 disabled:opacity-50"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 