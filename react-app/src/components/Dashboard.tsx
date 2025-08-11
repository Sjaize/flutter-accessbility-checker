import React, { useState, useEffect } from 'react';

interface AccessibilityIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  wcagCriteria: string;
  impact: 'high' | 'medium' | 'low';
  file?: string;
  line?: number;
  suggestion: string;
}

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Dashboard({ isOpen, onClose }: DashboardProps) {
  const [issues, setIssues] = useState<AccessibilityIssue[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [userJourney, setUserJourney] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      generateAccessibilityReport();
      loadUserJourney();
    }
  }, [isOpen]);

  const loadUserJourney = () => {
    const savedJourney = localStorage.getItem('dashboard-user-journey');
    if (savedJourney) {
      try {
        const journey = JSON.parse(savedJourney);
        setUserJourney(journey);
      } catch (error) {
        console.error('사용자 저니 로드 실패:', error);
      }
    }
  };

  const generateAccessibilityReport = async () => {
    setIsGenerating(true);
    setProgress(0);

    try {
      // WCAG 2.2 기준으로 분석
      const wcagIssues = await analyzeWCAG22();
      setIssues(wcagIssues);
      setProgress(100);
    } catch (error) {
      console.error('접근성 분석 실패:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const analyzeWCAG22 = async (): Promise<AccessibilityIssue[]> => {
    // 실제 구현에서는 Flutter 코드 분석
    return [
      {
        id: '1',
        type: 'error',
        title: '이미지 대체 텍스트 누락',
        description: '온보딩 페이지의 이미지에 대한 대체 텍스트가 없습니다.',
        wcagCriteria: '1.1.1 Non-text Content',
        impact: 'high',
        file: 'lib/onboarding_page.dart',
        line: 24,
        suggestion: 'Semantics(label: "온보딩 이미지", child: Image.asset(...))'
      },
      {
        id: '2',
        type: 'warning',
        title: '버튼 터치 영역 부족',
        description: '"지금 시작하기" 버튼의 터치 영역이 44×44dp 미만입니다.',
        wcagCriteria: '2.5.5 Target Size',
        impact: 'medium',
        file: 'lib/home.dart',
        line: 88,
        suggestion: 'Container(constraints: BoxConstraints(minWidth: 44, minHeight: 44), child: ElevatedButton(...))'
      },
      {
        id: '3',
        type: 'info',
        title: '색상 대비 개선',
        description: '텍스트 색상 대비가 WCAG AA 기준에 미달합니다.',
        wcagCriteria: '1.4.3 Contrast (Minimum)',
        impact: 'medium',
        file: 'lib/home.dart',
        line: 65,
        suggestion: 'TextStyle(color: Colors.black87, fontSize: 16)'
      }
    ];
  };

  const downloadHTML = () => {
    const htmlContent = generateHTMLReport();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `accessibility-report-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadMarkdown = () => {
    const mdContent = generateMarkdownReport();
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `accessibility-report-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateHTMLReport = (): string => {
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const infoCount = issues.filter(i => i.type === 'info').length;

    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flutter 접근성 분석 리포트</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .summary { display: flex; gap: 20px; margin-bottom: 30px; }
        .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .issue { margin-bottom: 20px; padding: 15px; border-radius: 8px; border-left: 4px solid; }
        .issue.error { background: #fef2f2; border-color: #dc2626; }
        .issue.warning { background: #fffbeb; border-color: #ca8a04; }
        .issue.info { background: #eff6ff; border-color: #2563eb; }
        .wcag-criteria { font-size: 0.9em; color: #666; }
        .impact { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; }
        .impact.high { background: #dc2626; color: white; }
        .impact.medium { background: #ca8a04; color: white; }
        .impact.low { background: #2563eb; color: white; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Flutter 접근성 분석 리포트</h1>
        <p>생성일: ${new Date().toLocaleString('ko-KR')}</p>
        <p>WCAG 2.2 기준 준수 분석</p>
    </div>

    <div class="summary">
        <div class="summary-card">
            <h3>오류</h3>
            <p style="font-size: 2em; color: #dc2626;">${errorCount}</p>
        </div>
        <div class="summary-card">
            <h3>경고</h3>
            <p style="font-size: 2em; color: #ca8a04;">${warningCount}</p>
        </div>
        <div class="summary-card">
            <h3>정보</h3>
            <p style="font-size: 2em; color: #2563eb;">${infoCount}</p>
        </div>
    </div>

    <h2>발견된 이슈</h2>
    ${issues.map(issue => `
    <div class="issue ${issue.type}">
        <h3>${issue.title}</h3>
        <p>${issue.description}</p>
        <p class="wcag-criteria"><strong>WCAG 기준:</strong> ${issue.wcagCriteria}</p>
        <p><span class="impact ${issue.impact}">${issue.impact.toUpperCase()}</span></p>
        ${issue.file ? `<p><strong>파일:</strong> ${issue.file}:${issue.line}</p>` : ''}
        <p><strong>제안사항:</strong> <code>${issue.suggestion}</code></p>
    </div>
    `).join('')}
</body>
</html>`;
  };

  const generateMarkdownReport = (): string => {
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const infoCount = issues.filter(i => i.type === 'info').length;

    return `# Flutter 접근성 분석 리포트

**생성일**: ${new Date().toLocaleString('ko-KR')}  
**기준**: WCAG 2.2

## 📊 요약

- ❌ **오류**: ${errorCount}개
- ⚠️ **경고**: ${warningCount}개  
- ℹ️ **정보**: ${infoCount}개

## 🚨 발견된 이슈

${issues.map(issue => `
### ${issue.title}

**유형**: ${issue.type === 'error' ? '❌ 오류' : issue.type === 'warning' ? '⚠️ 경고' : 'ℹ️ 정보'}  
**WCAG 기준**: ${issue.wcagCriteria}  
**영향도**: ${issue.impact.toUpperCase()}  
${issue.file ? `**파일**: ${issue.file}:${issue.line}` : ''}

**설명**: ${issue.description}

**제안사항**: 
\`\`\`dart
${issue.suggestion}
\`\`\`
`).join('\n')}

---

*이 레포트는 Flutter Accessibility Checker에 의해 자동 생성되었습니다.*
`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg w-11/12 h-5/6 max-w-6xl flex flex-col">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">접근성 분석 대시보드</h2>
            <p className="text-gray-600">WCAG 2.2 기준 준수 분석</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        {/* 진행 상황 */}
        {isGenerating && (
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span>접근성 분석 중... {progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-auto p-6">
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-red-800">오류</h3>
              <p className="text-3xl font-bold text-red-600">
                {issues.filter(i => i.type === 'error').length}
              </p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-yellow-800">경고</h3>
              <p className="text-3xl font-bold text-yellow-600">
                {issues.filter(i => i.type === 'warning').length}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-800">정보</h3>
              <p className="text-3xl font-bold text-blue-600">
                {issues.filter(i => i.type === 'info').length}
              </p>
            </div>
          </div>

          {/* 사용자 저니 정보 */}
          {userJourney && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4">🎯 AI 분석 사용자 저니</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 주요 시나리오 */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-green-800 mb-3">주요 사용 시나리오</h4>
                  <ul className="space-y-2">
                    {userJourney.mainScenarios.map((scenario: string, index: number) => (
                      <li key={index} className="text-sm text-green-700 flex items-start">
                        <span className="mr-2">•</span>
                        <span>{scenario}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 접근성 격차 */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-red-800 mb-3">접근성 격차</h4>
                  <ul className="space-y-2">
                    {userJourney.accessibilityGaps.map((gap: string, index: number) => (
                      <li key={index} className="text-sm text-red-700 flex items-start">
                        <span className="mr-2">⚠️</span>
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Semantics 개선 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-blue-800 mb-3">Semantics 개선</h4>
                  <ul className="space-y-2">
                    {userJourney.semanticsImprovements.map((improvement: string, index: number) => (
                      <li key={index} className="text-sm text-blue-700 flex items-start">
                        <span className="mr-2">🏷️</span>
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 이슈 목록 */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">발견된 이슈</h3>
            {issues.map(issue => (
              <div
                key={issue.id}
                className={`border-l-4 p-4 rounded ${
                  issue.type === 'error'
                    ? 'bg-red-50 border-red-500'
                    : issue.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-500'
                    : 'bg-blue-50 border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold">{issue.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                    <div className="flex items-center space-x-4 mt-2 text-xs">
                      <span className="text-gray-500">WCAG: {issue.wcagCriteria}</span>
                      <span className={`px-2 py-1 rounded ${
                        issue.impact === 'high' ? 'bg-red-200 text-red-800' :
                        issue.impact === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-blue-200 text-blue-800'
                      }`}>
                        {issue.impact.toUpperCase()}
                      </span>
                      {issue.file && (
                        <span className="text-gray-500">📍 {issue.file}:{issue.line}</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="text-sm font-medium">제안사항:</p>
                      <code className="text-xs bg-gray-100 p-2 rounded block mt-1">
                        {issue.suggestion}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="p-6 border-t border-gray-200 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            닫기
          </button>
          <div className="space-x-3">
            <button
              onClick={downloadMarkdown}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Markdown 다운로드
            </button>
            <button
              onClick={downloadHTML}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              HTML 다운로드
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 