import React, { useState } from 'react';
import { FlutterComponent } from '../lib/types';

interface CodeStructureViewerProps {
  components: FlutterComponent[];
}

export default function CodeStructureViewer({ components }: CodeStructureViewerProps) {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'type'>('name');

  const filteredComponents = components.filter(component => 
    selectedType === 'all' || component.type === selectedType
  );

  const sortedComponents = [...filteredComponents].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'score':
        return b.accessibilityScore - a.accessibilityScore;
      case 'type':
        return a.type.localeCompare(b.type);
      default:
        return 0;
    }
  });

  const typeColors = {
    widget: 'bg-blue-100 text-blue-800',
    screen: 'bg-green-100 text-green-800',
    service: 'bg-purple-100 text-purple-800',
    model: 'bg-orange-100 text-orange-800',
    util: 'bg-gray-100 text-gray-800'
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold mb-4">코드 구조 분석</h3>
      
      {/* 필터 및 정렬 */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">타입 필터</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">전체</option>
            <option value="widget">Widget</option>
            <option value="screen">Screen</option>
            <option value="service">Service</option>
            <option value="model">Model</option>
            <option value="util">Util</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">정렬 기준</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'score' | 'type')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="name">이름순</option>
            <option value="score">점수순</option>
            <option value="type">타입순</option>
          </select>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{components.length}</div>
          <div className="text-sm text-blue-800">총 컴포넌트</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-2xl font-bold text-green-600">
            {Math.round(components.reduce((sum, c) => sum + c.accessibilityScore, 0) / components.length)}
          </div>
          <div className="text-sm text-green-800">평균 점수</div>
        </div>
      </div>

      {/* 컴포넌트 목록 */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {sortedComponents.map((component) => (
          <div key={component.name} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-gray-900">{component.name}</h4>
                <span className={`text-xs px-2 py-1 rounded-full ${typeColors[component.type]}`}>
                  {component.type}
                </span>
              </div>
              <div className={`font-bold ${getScoreColor(component.accessibilityScore)}`}>
                {component.accessibilityScore}점
              </div>
            </div>
            
            <div className="text-sm text-gray-600 mb-2">
              📁 {component.file}:{component.line}
            </div>
            
            {component.issues.length > 0 && (
              <div className="text-sm">
                <div className="text-red-600 font-medium mb-1">발견된 이슈:</div>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  {component.issues.map((issue, index) => (
                    <li key={index} className="text-xs">{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {component.dependencies && component.dependencies.length > 0 && (
              <div className="text-sm mt-2">
                <div className="text-blue-600 font-medium mb-1">의존성:</div>
                <div className="flex flex-wrap gap-1">
                  {component.dependencies.map((dep, index) => (
                    <span key={index} className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {sortedComponents.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          <div className="text-2xl mb-2">📁</div>
          <p>선택한 타입의 컴포넌트가 없습니다.</p>
        </div>
      )}
    </div>
  );
} 