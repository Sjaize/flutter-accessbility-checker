import React, { useEffect, useState } from 'react';

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

export default function App() {
  const [ready, setReady] = useState(false);
  const [accessibilityIssues, setAccessibilityIssues] = useState<AccessibilityIssue[]>([]);
  const [previewSug, setPreviewSug] = useState<Suggestion | null>(null);

  useEffect(() => {
    document.title = 'Flutter Accessibility Checker';
    const timer = setTimeout(() => {
      setReady(true);
      analyze();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  function analyze() {
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
            position: { x: 50, y: 30 }
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
            position: { x: 50, y: 50 }
          }
        ]
      }
    ];

    setAccessibilityIssues(detectedIssues);
  }

  // 말풍선 “수락” → 모달 미리보기
  function onPreview(sug: Suggestion) {
    setPreviewSug(sug);
  }

  // 모달 “이대로 수락” → diff 뷰어 호출
  function onAccept(sug: Suggestion) {
    const params = new URLSearchParams({
      file:   sug.file,
      line:   String(sug.line),
      column: String(sug.column),
      text:   sug.text
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

  return (
    <div className="flex min-h-screen bg-gray-50 p-6 gap-8">
      {/* 왼쪽: 에뮬레이터 + 말풍선 */}
      <div className="flex-1 flex items-center justify-center overflow-visible">
        <div className="relative w-[395px] h-[832px] bg-gray-800 rounded-[2.5rem] p-2 shadow-2xl overflow-visible">
          <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden">
            {ready ? (
              <iframe
                src="http://localhost:60778"
                title="Flutter Web App"
                className="w-full h-full border-none"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                🚀 Flutter 앱 로딩 중…
              </div>
            )}
          </div>

          {/* 말풍선 + 연결선 */}
          {accessibilityIssues.map(issue => (
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
                  width: 260
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
        <h2 className="text-lg font-semibold">접근성 평가 정보</h2>
        <p className="text-gray-600 text-xs">
          이 앱에 대한 접근성 평가 결과입니다.
        </p>
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
              <span className={`font-medium text-sm ${
                issue.type === 'error'
                  ? 'text-red-800'
                  : issue.type === 'warning'
                  ? 'text-yellow-800'
                  : 'text-blue-800'
              }`}>
                {issue.title}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${
                issue.type === 'error'
                  ? 'bg-red-200 text-red-800'
                  : issue.type === 'warning'
                  ? 'bg-yellow-200 text-yellow-800'
                  : 'bg-blue-200 text-blue-800'
              }`}>
                {issue.type === 'error' ? '오류' : issue.type === 'warning' ? '경고' : '정보'}
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
              <strong>파일:</strong> {previewSug.file}<br/>
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
    </div>
  );
}
