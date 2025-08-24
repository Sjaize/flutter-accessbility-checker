import React, { useState, useEffect } from 'react';

interface UMLDiagramViewerProps {
  plantUMLCode: string;
  title?: string;
}

export default function UMLDiagramViewer({ plantUMLCode, title = "UML 다이어그램" }: UMLDiagramViewerProps) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!plantUMLCode) {
      setImageUrl('');
      setError('');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // PlantUML 서버 URL (공개 서버 사용)
      const encoded = encodeURIComponent(plantUMLCode);
      const url = `https://www.plantuml.com/plantuml/png/${encoded}`;
      setImageUrl(url);
    } catch (err) {
      setError('다이어그램을 생성할 수 없습니다.');
      console.error('UML 다이어그램 오류:', err);
    } finally {
      setIsLoading(false);
    }
  }, [plantUMLCode]);

  if (!plantUMLCode) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">다이어그램 생성 중...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <details className="mt-2">
            <summary className="text-red-600 text-xs cursor-pointer">PlantUML 코드 보기</summary>
            <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
              {plantUMLCode}
            </pre>
          </details>
        </div>
      )}

      {imageUrl && !isLoading && !error && (
        <div className="space-y-3">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-auto"
              onError={() => setError('이미지를 로드할 수 없습니다.')}
            />
          </div>
          
          <details className="text-sm">
            <summary className="text-gray-600 cursor-pointer hover:text-gray-800">
              PlantUML 코드 보기
            </summary>
            <pre className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-x-auto">
              {plantUMLCode}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
} 