// react-app/src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  AccessibilityIssue,
  ProjectAnalysis,
  CodeSuggestion,
  BoundingBox,
  WebSocketMessageType,
  WebSocketMessage,
  RequestCodeSuggestionData,
  ApplyCodeSuggestionData,
  ErrorData,
  ConnectionStatusData
} from './types';

const WebSocket_URL = 'ws://localhost:3001';

function App() {
  // 상태 관리
  const [isConnected, setIsConnected] = useState(false);
  const [accessibilityIssues, setAccessibilityIssues] = useState<AccessibilityIssue[]>([]);
  const [currentScreenshot, setCurrentScreenshot] = useState<string>('');
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<AccessibilityIssue | null>(null);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [codeSuggestion, setCodeSuggestion] = useState<CodeSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [projectAnalysis, setProjectAnalysis] = useState<ProjectAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusData | null>(null);

  // WebSocket 연결
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    connectWebSocket();
    return () => {
      disconnectWebSocket();
    };
  }, []);

  const connectWebSocket = () => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      setError(null);
      setIsLoading(true);

      wsRef.current = new WebSocket(WebSocket_URL);

      wsRef.current.onopen = () => {
        console.log('✅ WebSocket 연결됨');
        setIsConnected(true);
        setIsLoading(false);
        setConnectionStatus({
          status: 'connected',
          message: 'VS Code 확장 프로그램에 연결되었습니다.'
        });
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('❌ 메시지 파싱 실패:', error);
          setError('메시지 파싱에 실패했습니다.');
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket 연결 종료:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus({
          status: 'disconnected',
          message: '연결이 종료되었습니다.'
        });
        
        // 자동 재연결 시도
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`🔄 재연결 시도 ${reconnectAttempts.current}/${maxReconnectAttempts}`);
            connectWebSocket();
          }, delay);
        } else {
          setError('최대 재연결 시도 횟수를 초과했습니다.');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket 오류:', error);
        setError('WebSocket 연결 오류가 발생했습니다.');
        setIsLoading(false);
      };

    } catch (error) {
      console.error('❌ WebSocket 연결 실패:', error);
      setError('WebSocket 연결에 실패했습니다.');
      setIsLoading(false);
    }
  };

  const disconnectWebSocket = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleWebSocketMessage = (message: WebSocketMessage) => {
    try {
      switch (message.type) {
        case WebSocketMessageType.SCREENSHOT_DATA:
          handleScreenshotData(message.data);
          break;
          
        case WebSocketMessageType.ACCESSIBILITY_ISSUES:
          handleAccessibilityIssues(message.data);
          break;
          
        case WebSocketMessageType.PROJECT_ANALYSIS:
          handleProjectAnalysis(message.data);
          break;
          
        case WebSocketMessageType.CODE_SUGGESTION:
          handleCodeSuggestion(message.data);
          break;
          
        case WebSocketMessageType.ERROR:
          handleError(message.data as ErrorData);
          break;
          
        case WebSocketMessageType.CONNECTION_STATUS:
          handleConnectionStatus(message.data as ConnectionStatusData);
          break;
      
      default:
          console.warn('⚠️ 알 수 없는 메시지 타입:', message.type);
      }
    } catch (error) {
      console.error('❌ 메시지 처리 실패:', error);
      setError('메시지 처리에 실패했습니다.');
    }
  };

  const handleScreenshotData = (data: any) => {
    try {
      if (data.imageBase64) {
        setCurrentScreenshot(`data:image/png;base64,${data.imageBase64}`);
      }
      
      if (data.boundingBoxes && Array.isArray(data.boundingBoxes)) {
        setBoundingBoxes(data.boundingBoxes);
      }
    } catch (error) {
      console.error('❌ 스크린샷 데이터 처리 실패:', error);
    }
  };

  const handleAccessibilityIssues = (data: any) => {
    try {
      if (Array.isArray(data)) {
        setAccessibilityIssues(data);
      }
    } catch (error) {
      console.error('❌ 접근성 이슈 처리 실패:', error);
    }
  };

  const handleProjectAnalysis = (data: any) => {
    try {
      setProjectAnalysis(data);
    } catch (error) {
      console.error('❌ 프로젝트 분석 처리 실패:', error);
    }
  };

  const handleCodeSuggestion = (data: any) => {
    try {
      setCodeSuggestion(data);
      setShowCodePreview(true);
    } catch (error) {
      console.error('❌ 코드 제안 처리 실패:', error);
    }
  };

  const handleError = (data: ErrorData) => {
    console.error('❌ 서버 오류:', data.message);
    setError(`서버 오류: ${data.message}`);
  };

  const handleConnectionStatus = (data: ConnectionStatusData) => {
    setConnectionStatus(data);
  };

  const sendWebSocketMessage = (type: WebSocketMessageType, data: any) => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const message: WebSocketMessage = {
          type,
          data,
          timestamp: Date.now()
        };
        
        wsRef.current.send(JSON.stringify(message));
      } else {
        setError('WebSocket이 연결되지 않았습니다.');
      }
    } catch (error) {
      console.error('❌ 메시지 전송 실패:', error);
      setError('메시지 전송에 실패했습니다.');
    }
  };

  const handleIframeClick = (event: React.MouseEvent<HTMLDivElement>) => {
    try {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // 클릭한 위치의 바운딩 박스 찾기
      const clickedBox = boundingBoxes.find(box => 
        x >= box.left && x <= box.left + box.width &&
        y >= box.top && y <= box.top + box.height
      );

      if (clickedBox) {
        const issue = accessibilityIssues.find(issue => issue.id === clickedBox.issueId);
        if (issue) {
          setSelectedIssue(issue);
          requestCodeSuggestion(issue);
        }
      }
    } catch (error) {
      console.error('❌ iframe 클릭 처리 실패:', error);
      setError('클릭 이벤트 처리에 실패했습니다.');
    }
  };

  const requestCodeSuggestion = (issue: AccessibilityIssue) => {
    try {
      const data: RequestCodeSuggestionData = {
        issueId: issue.id,
        file: issue.file,
        line: issue.line
      };

      sendWebSocketMessage(WebSocketMessageType.REQUEST_CODE_SUGGESTION, data);
      alert('VS Code에서 코드 프리뷰가 열렸습니다!');
    } catch (error) {
      console.error('❌ 코드 제안 요청 실패:', error);
      setError('코드 제안 요청에 실패했습니다.');
    }
  };

  const applyCodeSuggestion = () => {
    try {
      if (!codeSuggestion) {
        setError('적용할 코드 제안이 없습니다.');
        return;
      }

      const data: ApplyCodeSuggestionData = {
        suggestionId: codeSuggestion.id,
        file: codeSuggestion.file,
        line: codeSuggestion.line,
        code: codeSuggestion.suggestedCode
      };

      sendWebSocketMessage(WebSocketMessageType.APPLY_CODE_SUGGESTION, data);
      setShowCodePreview(false);
      setCodeSuggestion(null);
      setSelectedIssue(null);
    } catch (error) {
      console.error('❌ 코드 적용 실패:', error);
      setError('코드 적용에 실패했습니다.');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'red';
      case 'warning': return 'orange';
      case 'info': return 'blue';
      default: return 'gray';
    }
  };

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case 'error': return '위험';
      case 'warning': return '경고';
      case 'info': return '정보';
      default: return '알 수 없음';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">연결 중...</p>
        </div>
      </div>
    );
  }

                return (
    <div className="min-h-screen bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Flutter 접근성 체커
              </h1>
              <p className="text-sm text-gray-500">
                {projectAnalysis ? `${projectAnalysis.projectName} - ${projectAnalysis.totalFiles}개 파일` : '프로젝트 분석 중...'}
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* 연결 상태 */}
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {isConnected ? '연결됨' : '연결 끊김'}
                </span>
              </div>

              {/* 이슈 개수 */}
              <div className="text-sm text-gray-600">
                {accessibilityIssues.length}개 이슈
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600"
              >
                <span className="sr-only">닫기</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Flutter 앱 미러링 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b">
                <h2 className="text-lg font-medium text-gray-900">Flutter 앱 미러링</h2>
                <p className="text-sm text-gray-500">실시간 스크린샷과 바운딩 박스</p>
            </div>

              <div className="relative">
                {/* iframe (투명하게) */}
                <iframe
                  src="http://localhost:64022"
                  className="w-full h-96 opacity-0 absolute inset-0 z-10"
                  title="Flutter App"
                  onClick={handleIframeClick}
                />
                
                {/* 스크린샷 오버레이 */}
                {currentScreenshot && (
                  <div className="relative z-0">
                    <img
                      src={currentScreenshot}
                      alt="Flutter 앱 스크린샷"
                      className="w-full h-96 object-contain"
                    />
                    
                    {/* 바운딩 박스들 */}
                    {boundingBoxes.map((box, index) => (
                      <div
                        key={`${box.issueId}-${index}`}
                        className="absolute border-2 pointer-events-none"
                        style={{
                          left: `${box.left}px`,
                          top: `${box.top}px`,
                          width: `${box.width}px`,
                          height: `${box.height}px`,
                          borderColor: box.color,
                          backgroundColor: `${box.color}20`
                        }}
                      />
                    ))}
                  </div>
                )}
                
                {!currentScreenshot && (
                  <div className="w-full h-96 flex items-center justify-center bg-gray-50">
                    <p className="text-gray-500">스크린샷을 기다리는 중...</p>
                  </div>
                )}
                  </div>
                </div>
              </div>

          {/* 접근성 이슈 목록 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b">
                <h2 className="text-lg font-medium text-gray-900">접근성 이슈</h2>
                <p className="text-sm text-gray-500">{accessibilityIssues.length}개 발견</p>
                      </div>
              
              <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                {accessibilityIssues.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">발견된 이슈가 없습니다.</p>
                ) : (
                  accessibilityIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedIssue?.id === issue.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedIssue(issue)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className={`px-2 py-1 text-xs rounded-full text-white bg-${getSeverityColor(issue.severity)}-500`}>
                              {getSeverityText(issue.severity)}
                            </span>
                            <span className="text-xs text-gray-500">{issue.elementType}</span>
                          </div>
                          <p className="text-sm text-gray-900 mb-1">{issue.description}</p>
                          <p className="text-xs text-gray-500">{issue.file}:{issue.line}</p>
                        </div>
                            </div>
                          </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 코드 제안 모달 */}
      {showCodePreview && codeSuggestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">코드 제안</h3>
              <button
                onClick={() => setShowCodePreview(false)}
                  className="text-gray-400 hover:text-gray-600"
              >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
              </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {selectedIssue && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">선택된 이슈</h4>
                  <p className="text-sm text-gray-700">{selectedIssue.description}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedIssue.file}:{selectedIssue.line}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">원본 코드</h4>
                  <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                    <code>{codeSuggestion.originalCode}</code>
                    </pre>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">제안 코드</h4>
                  <pre className="bg-green-50 p-3 rounded text-sm overflow-x-auto border border-green-200">
                    <code>{codeSuggestion.suggestedCode}</code>
                    </pre>
                </div>
              </div>

                  <div>
                <h4 className="font-medium text-gray-900 mb-2">설명</h4>
                <p className="text-sm text-gray-700">{codeSuggestion.explanation}</p>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => setShowCodePreview(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={applyCodeSuggestion}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              >
                코드 적용
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}

export default App;
