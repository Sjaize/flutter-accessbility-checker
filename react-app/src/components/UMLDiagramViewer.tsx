import React, { useState, useEffect } from 'react';

// plantuml-encoder를 동적으로 import
const plantumlEncoder = require('plantuml-encoder');

interface UMLDiagramViewerProps {
  isOpen: boolean;
  onClose: () => void;
  umlCode: string;
  title?: string;
  type: 'user-journey' | 'activity';
}

export default function UMLDiagramViewer({ isOpen, onClose, umlCode, title, type }: UMLDiagramViewerProps) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen && umlCode) {
      generateUMLImage();
    }
  }, [isOpen, umlCode]);

  const generateUMLImage = async () => {
    setIsLoading(true);
    setError('');

    try {
      // PlantUML 서버 URL (공개 서버 사용)
      const plantUMLServer = 'https://www.plantuml.com/plantuml';
      
      // UML 코드를 더 직관적으로 개선
      const improvedUmlCode = improveUMLCode(umlCode);
      
      // UML 코드 인코딩 (안전한 방법)
      let encoded;
      try {
        if (typeof plantumlEncoder === 'function') {
          encoded = plantumlEncoder(improvedUmlCode);
        } else if (plantumlEncoder && typeof plantumlEncoder.encode === 'function') {
          encoded = plantumlEncoder.encode(improvedUmlCode);
        } else {
          // fallback: 간단한 base64 인코딩
          encoded = btoa(unescape(encodeURIComponent(improvedUmlCode)));
        }
      } catch (encodeError) {
        console.error('UML 인코딩 오류:', encodeError);
        // fallback: 간단한 base64 인코딩
        encoded = btoa(unescape(encodeURIComponent(improvedUmlCode)));
      }
      
      const imageUrl = `${plantUMLServer}/png/${encoded}`;
      
      setImageUrl(imageUrl);
    } catch (err) {
      setError('UML 다이어그램 생성에 실패했습니다.');
      console.error('UML generation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // UML 코드를 더 직관적으로 개선하는 함수
  const improveUMLCode = (code: string): string => {
    let improved = code;
    
    // 색상 테마 적용
    if (!improved.includes('skinparam')) {
      improved = improved.replace('@startuml', `@startuml
skinparam backgroundColor #f8f9fa
skinparam defaultFontName "Noto Sans CJK KR"
skinparam defaultFontSize 12
skinparam activity {
  BackgroundColor #ffffff
  BorderColor #3b82f6
  FontColor #1f2937
}
skinparam note {
  BackgroundColor #fef3c7
  BorderColor #f59e0b
  FontColor #92400e
}
skinparam rectangle {
  BackgroundColor #ffffff
  BorderColor #10b981
  FontColor #1f2937
}
skinparam arrow {
  Color #6b7280
}
skinparam partition {
  BackgroundColor #e5e7eb
  BorderColor #6b7280
  FontColor #374151
}`);
    }
    
    // 아이콘 추가
    improved = improved.replace(/:사용자가 앱 실행;/g, ':📱 사용자가 앱 실행;');
    improved = improved.replace(/:메인 화면 로드;/g, ':🖥️ 메인 화면 로드;');
    improved = improved.replace(/:이미지 대체 텍스트 누락;/g, ':🖼️ 이미지 대체 텍스트 누락;');
    improved = improved.replace(/:버튼 터치 영역 부족;/g, ':🔘 버튼 터치 영역 부족;');
    improved = improved.replace(/:색상 대비 부족;/g, ':🎨 색상 대비 부족;');
    improved = improved.replace(/:Semantics 위젯 추가;/g, ':♿ Semantics 위젯 추가;');
    improved = improved.replace(/:명확한 라벨 설정;/g, ':🏷️ 명확한 라벨 설정;');
    improved = improved.replace(/:터치 영역 확장;/g, ':📏 터치 영역 확장;');
    improved = improved.replace(/:색상 대비 개선;/g, ':✨ 색상 대비 개선;');
    improved = improved.replace(/:접근성 테스트 실행;/g, ':🧪 접근성 테스트 실행;');
    improved = improved.replace(/:스크린 리더 테스트;/g, ':🔊 스크린 리더 테스트;');
    improved = improved.replace(/:키보드 네비게이션 테스트;/g, ':⌨️ 키보드 네비게이션 테스트;');
    
    return improved;
  };

  const downloadUML = () => {
    if (imageUrl) {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `${type}-diagram-${new Date().toISOString().split('T')[0]}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const copyUMLCode = () => {
    navigator.clipboard.writeText(umlCode).then(() => {
      alert('UML 코드가 클립보드에 복사되었습니다.');
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div className="card-pastel rounded-2xl shadow-2xl p-6 w-full max-w-6xl max-h-[90vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold gradient-text">
            📊 {title} UML 다이어그램
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex gap-6">
          {/* UML 이미지 */}
          <div className="flex-1 flex flex-col">
            <div className="card-pastel p-4 rounded-xl flex-1 flex items-center justify-center">
              {isLoading ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">UML 다이어그램을 생성하고 있습니다...</p>
                </div>
              ) : error ? (
                <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <p className="text-red-600 font-medium mb-2">UML 생성 실패</p>
                  <p className="text-gray-600 text-sm">{error}</p>
                </div>
              ) : (
                <img
                  src={imageUrl}
                  alt={`${title} UML 다이어그램`}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setIsLoading(false);
                    setError('이미지를 불러올 수 없습니다.');
                  }}
                />
              )}
            </div>
            
            {/* 액션 버튼들 */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={generateUMLImage}
                className="btn-pastel-primary flex-1"
                disabled={isLoading}
              >
                🔄 새로고침
              </button>
              <button
                onClick={downloadUML}
                className="btn-pastel-success flex-1"
                disabled={isLoading || !!error}
              >
                💾 다운로드
              </button>
              <button
                onClick={copyUMLCode}
                className="btn-pastel-warning flex-1"
              >
                📋 코드 복사
              </button>
            </div>
          </div>

          {/* UML 코드 */}
          <div className="w-96">
            <div className="card-pastel p-4 rounded-xl h-full">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                📝 PlantUML 코드
              </h4>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap">{umlCode}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 