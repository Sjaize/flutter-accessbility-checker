import React, { useState, useEffect } from 'react';

interface FlutterComponent {
  name: string;
  file: string;
  line: number;
  type: 'widget' | 'screen' | 'service' | 'model' | 'util';
  accessibilityScore: number;
  issues: string[];
  content?: string;
  dependencies?: string[];
}

interface CodeStructureViewerProps {
  isOpen: boolean;
  onClose: () => void;
  components: FlutterComponent[];
  projectPath: string;
}

export default function CodeStructureViewer({ 
  isOpen, 
  onClose, 
  components, 
  projectPath 
}: CodeStructureViewerProps) {
  const [selectedComponent, setSelectedComponent] = useState<FlutterComponent | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'tree' | 'graph'>('list');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredComponents = components.filter(comp => 
    filterType === 'all' || comp.type === filterType
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'screen': return '📱';
      case 'widget': return '🧩';
      case 'service': return '⚙️';
      case 'model': return '📊';
      case 'util': return '🔧';
      default: return '📄';
    }
  };

  const getAccessibilityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-90 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-11/12 h-5/6 max-w-7xl flex shadow-2xl">
        {/* 좌측: 컴포넌트 목록 */}
        <div className="w-1/3 p-6 border-r border-gray-200 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">코드 구조 분석</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* 필터 및 뷰 모드 */}
          <div className="flex gap-2 mb-4">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="all">전체</option>
              <option value="screen">화면</option>
              <option value="widget">위젯</option>
              <option value="service">서비스</option>
              <option value="model">모델</option>
              <option value="util">유틸</option>
            </select>
            <div className="flex border border-gray-300 rounded">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-sm ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-white'}`}
              >
                목록
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1 text-sm ${viewMode === 'tree' ? 'bg-blue-500 text-white' : 'bg-white'}`}
              >
                트리
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`px-3 py-1 text-sm ${viewMode === 'graph' ? 'bg-blue-500 text-white' : 'bg-white'}`}
              >
                그래프
              </button>
            </div>
          </div>

          {/* 컴포넌트 목록 */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {filteredComponents.map((component) => (
              <div
                key={component.name}
                onClick={() => setSelectedComponent(component)}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedComponent?.name === component.name
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{getTypeIcon(component.type)}</span>
                  <span className="font-medium text-sm">{component.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${getAccessibilityColor(component.accessibilityScore)}`}>
                    {component.accessibilityScore}/100
                  </span>
                </div>
                <div className="text-xs text-gray-600 mb-1">
                  {component.file}:{component.line}
                </div>
                {component.issues.length > 0 && (
                  <div className="text-xs text-red-600">
                    ⚠️ {component.issues.length}개 이슈
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 우측: 상세 정보 */}
        <div className="flex-1 p-6 flex flex-col">
          {selectedComponent ? (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{getTypeIcon(selectedComponent.type)}</span>
                  <h2 className="text-xl font-semibold">{selectedComponent.name}</h2>
                  <span className={`px-3 py-1 rounded text-sm ${getAccessibilityColor(selectedComponent.accessibilityScore)}`}>
                    접근성 점수: {selectedComponent.accessibilityScore}/100
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {selectedComponent.file}:{selectedComponent.line}
                </p>
              </div>

              {/* 탭 메뉴 */}
              <div className="flex border-b border-gray-200 mb-4">
                <button className="px-4 py-2 border-b-2 border-blue-500 text-blue-600 font-medium">
                  코드
                </button>
                <button className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  의존성
                </button>
                <button className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  접근성 이슈
                </button>
              </div>

              {/* 코드 내용 */}
              <div className="flex-1 overflow-auto">
                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                    {selectedComponent.content || '// 코드 내용을 불러올 수 없습니다.'}
                  </pre>
                </div>
              </div>

              {/* 접근성 이슈 */}
              {selectedComponent.issues.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-red-800 mb-2">발견된 접근성 이슈:</h4>
                  <ul className="space-y-1">
                    {selectedComponent.issues.map((issue, index) => (
                      <li key={index} className="text-sm text-red-600 flex items-center gap-2">
                        <span>⚠️</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-4xl mb-4">📁</div>
                <p>왼쪽에서 컴포넌트를 선택하여 상세 정보를 확인하세요</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 