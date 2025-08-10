import React, { useEffect, useRef, useState } from 'react';

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
  elementType?: string;

  // 둘 중 하나만 올 수 있음
  rect?: { left: number; top: number; width: number; height: number }; // px (원본 프레임 기준)
  rectPct?: { left: number; top: number; width: number; height: number }; // %

  source?: SourceLoc;
}

interface FramePayload {
  imageBase64: string; // 순수 base64
  width: number;
  height: number;
}

type Conn = 'connecting' | 'connected' | 'disconnected';

export default function App() {
  const [frame, setFrame] = useState<FramePayload | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [conn, setConn] = useState<Conn>('connecting');
  const [previewSrc, setPreviewSrc] = useState<SourceLoc | null>(null);
  const [hoveredIssueId, setHoveredIssueId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'accessibility' | 'text'>('accessibility');

  const DEVICE_W = 395;
  const DEVICE_H = 832;

  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;

    const connect = () => {
      try {
        console.log('[React] WebSocket 연결 시도...');
        ws = new WebSocket('ws://localhost:3001');

        ws.onopen = () => {
          console.log('[React] WebSocket 연결됨');
          setConn('connected');
          if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
          }
        };

        ws.onclose = () => {
          console.log('[React] WebSocket 연결 끊김');
          setConn('disconnected');
          scheduleReconnect();
        };

        ws.onerror = (err) => {
          console.log('[React] WebSocket 에러:', err);
          setConn('disconnected');
          scheduleReconnect();
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          console.log('[React] WebSocket 메시지:', msg);

          if (msg.type === 'snapshot') {
            const { frame: newFrame, issues: newIssues } = msg.data;
            setFrame(newFrame);
            setIssues(normalizeIssues(newIssues));

            const is = normalizeIssues(newIssues);
            if (is.length > 0) {
              console.log('[React] 첫 번째 이슈 전체 데이터:', is[0]);
              const coords = is.map(issue => ({
                id: issue.id,
                hasRectPct: !!issue.rectPct,
                hasRect: !!issue.rect,
                x: Math.round(issue.rectPct?.left || 0),
                y: Math.round(issue.rectPct?.top || 0)
              }));
              console.log('[React] 점 좌표들:', coords);
              const uniqueCoords = new Set(coords.map(c => `${c.x},${c.y}`));
              console.log('[React] 고유 좌표 개수:', uniqueCoords.size, '/ 전체:', is.length);
            }
          }
        };
      } catch (err) {
        console.log('[React] WebSocket 연결 실패:', err);
        setConn('disconnected');
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimer.current) return;
      console.log('[React] 3초 후 재연결 시도...');
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, 3000);
    };

    // 5초 대기 후 연결 시도
    const initialTimer = setTimeout(() => {
      connect();
    }, 5000);

    return () => {
      if (initialTimer) clearTimeout(initialTimer);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (ws) {
        ws.close();
      }
    };
  }, []);

  // 백엔드가 rectPct만 줄 수도 있으니 최소 정규화
  function normalizeIssues(input: Issue[]): Issue[] {
    return (input ?? []).map((i, idx) => ({
      id: i.id ?? String(idx),
      severity: i.severity ?? 'info',
      label: i.label,
      description: i.description,
      elementType: i.elementType,
      rect: i.rect,
      rectPct: i.rectPct,
      source: i.source,
    }));
  }

  // 탭별 필터링된 이슈
  const accessibilityIssues = issues.filter(issue => 
    issue.elementType && !['text'].includes(issue.elementType)
  );
  const textIssues = issues.filter(issue => 
    issue.elementType === 'text'
  );

  // 현재 표시할 이슈들
  const displayIssues = activeTab === 'accessibility' ? accessibilityIssues : textIssues;

  const onAccept = (src: SourceLoc) => {
    const params = new URLSearchParams({
      file: src.file,
      line: String(src.line),
      column: String(src.column),
      text: '', // 확장에서 채워줄 수 있음
    });
    window.open(
      `vscode://my-publisher.flutter-accessibility-checker/previewSuggestion?${params}`
    );
    setPreviewSrc(null);
  };

  const pillClass = (s: Severity) =>
    s === 'warning'
      ? 'bg-yellow-200 text-yellow-800'
      : 'bg-green-200 text-green-800';

  return (
    <div className="flex min-h-screen bg-gray-50 p-6">
      {/* 전체 컨테이너 - 완전 중앙 정렬 */}
      <div className="flex-1 flex items-center justify-center relative">
        
        {/* 중앙: 디바이스 프레임 + 오버레이 */}
        <div className="flex items-center justify-center overflow-visible relative">
        <div
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
              <div className="absolute inset-0 flex items-center justify-center bg-white text-gray-500">
                {conn === 'connected' ? '첫 프레임 대기 중…' : '서버 연결 중…'}
              </div>
            )}

            {/* 오버레이 박스 + 말풍선 - 탭별 필터링 */}
            {displayIssues.map((issue) => {
              if (!issue.rectPct) return null;
              
              // 탭별 색상 설정
              let color: string;
              if (issue.elementType === 'text') {
                color = '#3b82f6'; // 파란색 (텍스트)
              } else {
                color = issue.severity === 'warning'
                  ? '#eab308' // 노란색 (경고)
                  : '#22c55e'; // 초록색 (정상)
              }
              const isHovered = hoveredIssueId === String(issue.id);
              
              // 박스 위치 (percentage)
              const boxStyle = {
                left: `${issue.rectPct.left}%`,
                top: `${issue.rectPct.top}%`,
                width: `${issue.rectPct.width}%`,
                height: `${issue.rectPct.height}%`,
                border: `2px solid ${color}`,
                backgroundColor: isHovered ? `${color}20` : 'transparent',
                transition: 'all 0.2s ease',
              };
              
              // 말풍선 위치 계산 (스마트 배치)
              const centerX = issue.rectPct.left + issue.rectPct.width / 2;
              const centerY = issue.rectPct.top + issue.rectPct.height / 2;
              
              // 화면 영역에 따른 말풍선 위치 결정
              let tooltipPosition = 'right';
              if (centerX > 70) tooltipPosition = 'left';
              else if (centerY < 30) tooltipPosition = 'bottom';
              else if (centerY > 70) tooltipPosition = 'top';
              
              return (
                <React.Fragment key={issue.id}>
                  {/* 박스 오버레이 */}
                  <div
                    className="absolute pointer-events-none"
                    style={boxStyle}
                  />
                  
                  {/* Hover 시 점선 연결 - 박스 왼쪽 끝에서 말풍선으로 */}
                  {isHovered && (() => {
                    // 컨테이너의 실제 위치 정보 가져오기
                    const container = document.querySelector('.relative.bg-gray-800') as HTMLElement;
                    if (!container) return null;
                    
                    const containerRect = container.getBoundingClientRect();
                    
                    // 박스의 실제 픽셀 위치 계산
                    const boxLeft = containerRect.left + (issue.rectPct.left * containerRect.width / 100);
                    const boxTop = containerRect.top + (issue.rectPct.top * containerRect.height / 100);
                    const boxHeight = (issue.rectPct.height * containerRect.height / 100);
                    
                    // 박스 왼쪽 끝, 세로 중앙
                    const boxLeftX = boxLeft;
                    const boxCenterY = boxTop + boxHeight / 2;
                    
                    // 말풍선 끝 좌표 (스크린샷 완전히 밖)
                    const balloonX = containerRect.left - 60; // 스크린샷 왼쪽에서 60px 떨어진 위치
                    
                    return (
                      <svg
                        className="absolute pointer-events-none z-40"
                        style={{
                          left: 0,
                          top: 0,
                          width: '100vw',
                          height: '100vh',
                          position: 'fixed'
                        }}
                      >
                        <line
                          x1={boxLeftX}
                          y1={boxCenterY}
                          x2={balloonX}
                          y2={boxCenterY}
                          stroke={color}
                          strokeWidth="2"
                          strokeDasharray="8,4"
                          opacity="0.6"
                        />
                      </svg>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </div>
        </div>
        
        </div>
      </div>

      {/* 왼쪽 말풍선 - 스크린샷 완전히 밖에 위치 */}
      {hoveredIssueId && (() => {
        const hoveredIssue = displayIssues.find(i => i.id === hoveredIssueId);
        if (!hoveredIssue || !hoveredIssue.rectPct) return null;
        
        // 컨테이너의 실제 위치 정보 가져오기
        const container = document.querySelector('.relative.bg-gray-800') as HTMLElement;
        if (!container) return null;
        
        const containerRect = container.getBoundingClientRect();
        
        // 박스의 실제 위치 계산
        const boxTop = containerRect.top + (hoveredIssue.rectPct.top * containerRect.height / 100);
        const boxHeight = (hoveredIssue.rectPct.height * containerRect.height / 100);
        const boxCenterY = boxTop + boxHeight / 2;
        
        return (
          <div 
            className="fixed pointer-events-none z-50"
            style={{
              left: `${containerRect.left - 380}px`, // 스크린샷 왼쪽에서 380px 떨어진 위치
              top: `${boxCenterY}px`,
              transform: 'translateY(-50%)',
              width: '320px'
            }}
          >
                              <div 
                  className={`bg-white border-r-4 rounded-l-lg px-4 py-3 shadow-2xl relative ${
                    hoveredIssue.elementType === 'text'
                      ? 'border-r-blue-500'
                      : hoveredIssue.severity === 'warning'
                      ? 'border-r-yellow-500'
                      : 'border-r-green-500'
                  }`}
                style={{
                  boxShadow: '0 15px 35px rgba(0,0,0,0.2)',
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white'
                }}
              >
                {/* 말풍선 내용 */}
                                 <div className="flex items-center gap-2 mb-2">
                   <span className={`font-medium text-sm ${
                     hoveredIssue.elementType === 'text'
                       ? 'text-blue-800'
                       : hoveredIssue.severity === 'warning'
                       ? 'text-yellow-800'
                       : 'text-green-800'
                   }`}>
                     {hoveredIssue.label || '⚠️ 레이블 누락'}
                   </span>
                   <span className={`text-xs px-2 py-1 rounded ${
                     hoveredIssue.elementType === 'text'
                       ? 'bg-blue-200 text-blue-800'
                       : hoveredIssue.severity === 'warning'
                       ? 'bg-yellow-200 text-yellow-800'
                       : 'bg-green-200 text-green-800'
                   }`}>
                     {hoveredIssue.elementType === 'text' ? '텍스트' : hoveredIssue.severity === 'warning' ? '경고' : '정상'}
                   </span>
                 </div>
                {hoveredIssue.elementType && (
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {hoveredIssue.elementType === 'button' && '🔘 버튼'}
                      {hoveredIssue.elementType === 'textfield' && '📝 입력필드'}
                      {hoveredIssue.elementType === 'image' && '🖼️ 이미지'}
                      {hoveredIssue.elementType === 'text' && '📄 텍스트'}
                      {hoveredIssue.elementType === 'link' && '🔗 링크'}
                      {!['button', 'textfield', 'image', 'text', 'link'].includes(hoveredIssue.elementType) && hoveredIssue.elementType}
                    </span>
                  </div>
                )}
                {hoveredIssue.description && (
                  <div className="text-sm text-gray-700">{hoveredIssue.description}</div>
                )}
              </div>
            </div>
          );
        })()}

      {/* 오른쪽: 리포트 패널 - 화면 끝에 고정 */}
      <div className="w-80 bg-white rounded-2xl shadow p-6 space-y-4 max-h-screen overflow-y-auto flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">접근성 평가 정보</h2>
          <div
            className={`flex items-center gap-2 text-xs ${
              conn === 'connected' ? 'text-green-600' : conn === 'connecting' ? 'text-yellow-600' : 'text-red-600'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                conn === 'connected' ? 'bg-green-500' : conn === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`}
            />
            {conn === 'connected' ? '실시간' : conn === 'connecting' ? '연결 중…' : '끊김'}
          </div>
        </div>

        {/* 탭 버튼 */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('accessibility')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'accessibility'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🔍 접근성 요소 ({accessibilityIssues.length})
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'text'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📄 텍스트 ({textIssues.length})
          </button>
        </div>

        {displayIssues.length === 0 ? (
          <div className="border-l-4 p-3 rounded bg-green-50 border-green-500 text-green-800 text-sm">
            {activeTab === 'accessibility' 
              ? '현재 화면에서 접근성 검사가 필요한 요소가 없습니다.' 
              : '현재 화면에서 일반 텍스트 요소가 없습니다.'}
          </div>
        ) : (
          displayIssues.map((issue) => {
            const isHovered = hoveredIssueId === String(issue.id);
            return (
                               <div
                     key={issue.id}
                     className={`border-l-4 p-3 rounded cursor-pointer transition-all duration-200 ${
                       issue.elementType === 'text'
                         ? 'bg-blue-100 border-blue-500'
                         : issue.severity === 'warning'
                         ? 'bg-yellow-100 border-yellow-500'
                         : 'bg-green-100 border-green-500'
                     } ${isHovered ? 'ring-2 ring-blue-300 scale-105' : ''}`}
                     onMouseEnter={() => setHoveredIssueId(String(issue.id))}
                     onMouseLeave={() => setHoveredIssueId(null)}
                   >
              <div className="flex items-center gap-2">
                                 <span
                  className={`font-medium text-sm ${
                    issue.elementType === 'text'
                      ? 'text-blue-800'
                      : issue.severity === 'warning'
                      ? 'text-yellow-800'
                      : 'text-green-800'
                  }`}
                >
                  {issue.label?.trim() ? issue.label : '⚠️ 레이블 누락'}
                </span>
                <span className={`text-[10px] px-2 py-1 rounded ${
                  issue.elementType === 'text'
                    ? 'bg-blue-200 text-blue-800'
                    : pillClass(issue.severity)
                }`}>
                  {issue.elementType === 'text' ? '텍스트' : issue.severity === 'warning' ? '경고' : '정상'}
                </span>
                 {issue.elementType && (
                   <span className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-700">
                     {issue.elementType === 'button' && '🔘 버튼'}
                     {issue.elementType === 'textfield' && '📝 입력필드'}
                     {issue.elementType === 'image' && '🖼️ 이미지'}
                     {issue.elementType === 'text' && '📄 텍스트'}
                     {issue.elementType === 'link' && '🔗 링크'}
                     {!['button', 'textfield', 'image', 'text', 'link'].includes(issue.elementType) && issue.elementType}
                   </span>
                 )}
                 {issue.id?.toString().startsWith('flutter-') && (
                   <span className="text-[10px] px-2 py-1 rounded bg-purple-100 text-purple-800">
                     Flutter
                   </span>
                 )}
               </div>
               {issue.description && <p className="text-xs text-gray-700 mt-1">{issue.description}</p>}
               {issue.source && (
                 <div className="mt-1">
                   <p className="text-[11px] text-gray-500">
                     {issue.source.file}:{issue.source.line}:{issue.source.column}
                   </p>
                   <button
                     onClick={() => setPreviewSrc(issue.source!)}
                     className="text-[11px] text-blue-600 hover:text-blue-800 mt-1"
                   >
                     🔗 VS Code에서 열기
                   </button>
                 </div>
               )}
            </div>
            );
          })
        )}
      </div>

      {/* 코드 미리보기 모달 */}
      {previewSrc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-auto">
            <h3 className="text-lg font-semibold mb-2">코드 미리보기</h3>
            <p className="text-sm text-gray-600 mb-4">
              <strong>파일:</strong> {previewSrc.file}
              <br />
              <strong>위치:</strong> Line {previewSrc.line}, Column {previewSrc.column}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPreviewSrc(null)} className="px-3 py-1 rounded border">
                닫기
              </button>
              <button onClick={() => onAccept(previewSrc)} className="px-3 py-1 rounded bg-green-600 text-white">
                VS Code에서 보기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
