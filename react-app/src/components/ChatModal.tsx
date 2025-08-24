import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, LLMConfig, AccessibilityIssue } from '../lib/types';
import { ChatService } from '../services/ChatService';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  issues: AccessibilityIssue[];
  onGenerateReport: (chatHistory: ChatMessage[]) => void;
}

export default function ChatModal({ isOpen, onClose, issues, onGenerateReport }: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<LLMConfig>({
    apiKey: '',
    model: 'gpt-4',
    temperature: 0.7
  });
  
  const chatService = useRef(new ChatService());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // 기존 설정 로드
      const savedConfig = chatService.current.getConfig();
      if (savedConfig) {
        setConfig(savedConfig);
      }
      
      // 기존 채팅 기록 로드
      const savedHistory = sessionStorage.getItem('chatHistory');
      if (savedHistory) {
        setMessages(JSON.parse(savedHistory));
      }
    }
  }, [isOpen]);

  useEffect(() => {
    // 채팅 기록을 sessionStorage에 저장
    if (messages.length > 0) {
      sessionStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    // 자동 스크롤
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await chatService.current.generateResponse(inputMessage, { issues, components: [] });
      setMessages(prev => [...prev, response]);
    } catch (error) {
      console.error('채팅 오류:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSaveConfig = () => {
    chatService.current.setConfig(config);
    setShowSettings(false);
  };

  const handleGenerateReport = () => {
    onGenerateReport(messages);
    onClose();
  };

  const clearChat = () => {
    setMessages([]);
    sessionStorage.removeItem('chatHistory');
    chatService.current.clearChatHistory();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 text-blue-600">🤖</div>
            <h2 className="text-xl font-semibold text-gray-800">AI 접근성 분석</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="설정"
            >
              ⚙️
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <div className="w-12 h-12 mx-auto mb-4 text-gray-300">🤖</div>
              <p className="text-lg font-medium mb-2">AI 접근성 분석 도우미</p>
              <p className="text-sm">Flutter 앱의 접근성에 대해 질문해보세요!</p>
              <div className="mt-4 space-y-2">
                <p className="text-xs text-gray-400">예시 질문:</p>
                <p className="text-xs text-gray-500">• "이미지 대체 텍스트는 어떻게 추가하나요?"</p>
                <p className="text-xs text-gray-500">• "버튼 터치 영역을 개선하는 방법은?"</p>
                <p className="text-xs text-gray-500">• "색상 대비를 높이는 방법은?"</p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    🤖
                  </div>
                )}
                <div
                  className={`max-w-[70%] p-4 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.umlDiagram && (
                    <div className="mt-3 p-3 bg-gray-800 text-green-400 rounded-lg text-xs font-mono">
                      <div className="text-white mb-2">PlantUML 다이어그램:</div>
                      <pre className="overflow-x-auto">{message.umlDiagram}</pre>
                    </div>
                  )}
                  <div className={`text-xs mt-2 ${
                    message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {message.timestamp.toLocaleTimeString('ko-KR')}
                  </div>
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    👤
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                🤖
              </div>
              <div className="bg-gray-100 text-gray-800 p-4 rounded-2xl">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm">AI가 응답을 생성하고 있습니다...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex gap-3">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="접근성에 대해 질문해보세요..."
              className="flex-1 p-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              📤
            </button>
          </div>
          
          {/* 액션 버튼들 */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <button
                onClick={clearChat}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                대화 초기화
              </button>
            </div>
            {messages.length > 0 && (
              <button
                onClick={handleGenerateReport}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                📄 리포트 생성
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 설정 모달 */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">AI 설정</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  OpenAI API 키
                </label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  모델
                </label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value as 'gpt-4' | 'gpt-3.5-turbo' }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  창의성 (Temperature)
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.temperature}
                  onChange={(e) => setConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {config.temperature} (낮음: 일관성, 높음: 창의성)
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSaveConfig}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 