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

interface MarkdownDocumentationProps {
  isOpen: boolean;
  onClose: () => void;
  components: FlutterComponent[];
  projectPath: string;
  projectName?: string;
}

export default function MarkdownDocumentation({ 
  isOpen, 
  onClose, 
  components, 
  projectPath,
  projectName = "Flutter App"
}: MarkdownDocumentationProps) {
  const [markdownContent, setMarkdownContent] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen && components.length > 0) {
      generateMarkdown();
    }
  }, [isOpen, components]);

  const generateMarkdown = async () => {
    setIsGenerating(true);
    
    // 실제로는 LLM을 호출하여 더 정교한 문서를 생성할 수 있습니다
    const content = createMarkdownContent();
    setMarkdownContent(content);
    
    setIsGenerating(false);
  };

  const createMarkdownContent = () => {
    const now = new Date().toLocaleDateString('ko-KR');
    
    return `# ${projectName} - 접근성 분석 문서

**생성일:** ${now}  
**프로젝트 경로:** \`${projectPath}\`  
**분석된 컴포넌트 수:** ${components.length}개

---

## 📋 목차

1. [프로젝트 개요](#프로젝트-개요)
2. [컴포넌트 구조](#컴포넌트-구조)
3. [접근성 분석 결과](#접근성-분석-결과)
4. [개선 권장사항](#개선-권장사항)
5. [UML 다이어그램](#uml-다이어그램)

---

## 🏗️ 프로젝트 개요

이 문서는 ${projectName}의 접근성 분석 결과를 담고 있습니다. WCAG 2.2 기준에 따라 각 컴포넌트의 접근성 수준을 평가하고 개선 방안을 제시합니다.

### 📊 전체 접근성 점수

${calculateOverallScore()}

---

## 🧩 컴포넌트 구조

### 📱 화면 (Screens)

${components
  .filter(c => c.type === 'screen')
  .map(component => `
#### ${component.name}

- **파일:** \`${component.file}:${component.line}\`
- **접근성 점수:** ${component.accessibilityScore}/100
- **주요 이슈:** ${component.issues.length > 0 ? component.issues.join(', ') : '없음'}

\`\`\`dart
${component.content || '// 코드 내용을 불러올 수 없습니다.'}
\`\`\`
`).join('\n')}

### 🧩 위젯 (Widgets)

${components
  .filter(c => c.type === 'widget')
  .map(component => `
#### ${component.name}

- **파일:** \`${component.file}:${component.line}\`
- **접근성 점수:** ${component.accessibilityScore}/100
- **주요 이슈:** ${component.issues.length > 0 ? component.issues.join(', ') : '없음'}

\`\`\`dart
${component.content || '// 코드 내용을 불러올 수 없습니다.'}
\`\`\`
`).join('\n')}

### ⚙️ 서비스 (Services)

${components
  .filter(c => c.type === 'service')
  .map(component => `
#### ${component.name}

- **파일:** \`${component.file}:${component.line}\`
- **접근성 점수:** ${component.accessibilityScore}/100
- **주요 이슈:** ${component.issues.length > 0 ? component.issues.join(', ') : '없음'}

\`\`\`dart
${component.content || '// 코드 내용을 불러올 수 없습니다.'}
\`\`\`
`).join('\n')}

---

## 🔍 접근성 분석 결과

### 📈 점수 분포

${generateScoreDistribution()}

### ⚠️ 발견된 이슈

${generateIssuesSummary()}

---

## 💡 개선 권장사항

### 🎯 우선순위별 개선사항

#### 🔴 높은 우선순위 (즉시 수정 필요)

${components
  .filter(c => c.accessibilityScore < 60)
  .map(component => `
- **${component.name}** (\`${component.file}\`)
  - 현재 점수: ${component.accessibilityScore}/100
  - 개선 방안: ${component.issues.map(issue => `\n    - ${issue}`).join('')}
`).join('\n')}

#### 🟡 중간 우선순위 (계획적 수정)

${components
  .filter(c => c.accessibilityScore >= 60 && c.accessibilityScore < 80)
  .map(component => `
- **${component.name}** (\`${component.file}\`)
  - 현재 점수: ${component.accessibilityScore}/100
  - 개선 방안: ${component.issues.map(issue => `\n    - ${issue}`).join('')}
`).join('\n')}

#### 🟢 낮은 우선순위 (선택적 개선)

${components
  .filter(c => c.accessibilityScore >= 80)
  .map(component => `
- **${component.name}** (\`${component.file}\`)
  - 현재 점수: ${component.accessibilityScore}/100
  - 추가 개선사항: ${component.issues.length > 0 ? component.issues.join(', ') : '없음'}
`).join('\n')}

---

## 📊 UML 다이어그램

### 사용자 저니 다이어그램

\`\`\`plantuml
@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12

title ${projectName} User Journey

start
:사용자 앱 실행;
:온보딩 화면 표시;

if (첫 방문?) then (yes)
  :온보딩 가이드 표시;
  :"지금 시작하기" 버튼;
else (no)
  :메인 화면으로 이동;
endif

:메인 화면 로드;
:홈 화면 표시;

if (접근성 이슈 감지) then (있음)
  :접근성 경고 표시;
  :수정 제안 표시;
else (없음)
  :정상 화면 표시;
endif

stop
@enduml
\`\`\`

### 클래스 구조 다이어그램

\`\`\`plantuml
@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12

title ${projectName} Class Structure

${components.map(component => `
class ${component.name} {
  +build(BuildContext context): Widget
  +_handleAccessibility(): void
}`).join('\n')}

${generateClassRelationships()}
@enduml
\`\`\`

---

## 📝 결론

이 분석을 통해 ${projectName}의 접근성 현황을 파악하고 개선 방향을 제시했습니다. 

**주요 개선 포인트:**
1. 접근성 점수가 낮은 컴포넌트 우선 개선
2. WCAG 2.2 기준 준수
3. 지속적인 접근성 모니터링

**다음 단계:**
- [ ] 높은 우선순위 이슈 수정
- [ ] 접근성 테스트 자동화 구축
- [ ] 정기적인 접근성 감사 실시

---

*이 문서는 Flutter Accessibility Checker에 의해 자동 생성되었습니다.*
`;
  };

  const calculateOverallScore = () => {
    if (components.length === 0) return '평가할 컴포넌트가 없습니다.';
    
    const totalScore = components.reduce((sum, comp) => sum + comp.accessibilityScore, 0);
    const averageScore = Math.round(totalScore / components.length);
    
    let scoreLevel = '';
    if (averageScore >= 80) scoreLevel = '🟢 우수';
    else if (averageScore >= 60) scoreLevel = '🟡 보통';
    else scoreLevel = '🔴 개선 필요';
    
    return `**평균 접근성 점수:** ${averageScore}/100 (${scoreLevel})`;
  };

  const generateScoreDistribution = () => {
    const excellent = components.filter(c => c.accessibilityScore >= 80).length;
    const good = components.filter(c => c.accessibilityScore >= 60 && c.accessibilityScore < 80).length;
    const poor = components.filter(c => c.accessibilityScore < 60).length;
    
    return `
- 🟢 우수 (80-100점): ${excellent}개
- 🟡 보통 (60-79점): ${good}개  
- 🔴 개선 필요 (0-59점): ${poor}개
    `.trim();
  };

  const generateIssuesSummary = () => {
    const allIssues = components.flatMap(c => c.issues);
    const issueCounts = allIssues.reduce((acc, issue) => {
      acc[issue] = (acc[issue] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    if (Object.keys(issueCounts).length === 0) {
      return '발견된 접근성 이슈가 없습니다. 🎉';
    }
    
    return Object.entries(issueCounts)
      .map(([issue, count]) => `- **${issue}**: ${count}회 발생`)
      .join('\n');
  };

  const generateClassRelationships = () => {
    // 간단한 관계 생성 (실제로는 더 정교한 분석 필요)
    const screens = components.filter(c => c.type === 'screen');
    const widgets = components.filter(c => c.type === 'widget');
    
    let relationships = '';
    
    // 화면과 위젯 간의 관계
    screens.forEach(screen => {
      widgets.forEach(widget => {
        relationships += `${screen.name} --> ${widget.name}\n`;
      });
    });
    
    return relationships;
  };

  const handleDownload = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}-accessibility-report.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(markdownContent);
    alert('Markdown 문서가 클립보드에 복사되었습니다.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-90 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-11/12 h-5/6 max-w-7xl flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Markdown 문서 생성</h3>
            <p className="text-sm text-gray-600">프로젝트 접근성 분석 문서</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 컨트롤 패널 */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">보기 모드:</span>
            <div className="flex border border-gray-300 rounded">
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 text-sm ${viewMode === 'preview' ? 'bg-blue-500 text-white' : 'bg-white'}`}
              >
                미리보기
              </button>
              <button
                onClick={() => setViewMode('source')}
                className={`px-3 py-1 text-sm ${viewMode === 'source' ? 'bg-blue-500 text-white' : 'bg-white'}`}
              >
                소스
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
            >
              다운로드
            </button>
            <button
              onClick={handleCopyToClipboard}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              복사
            </button>
          </div>
        </div>

        {/* 문서 내용 */}
        <div className="flex-1 p-6 overflow-auto">
          {isGenerating ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Markdown 문서를 생성하는 중...</p>
              </div>
            </div>
          ) : viewMode === 'preview' ? (
            <div className="prose prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: markdownToHtml(markdownContent) }} />
            </div>
          ) : (
            <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-auto whitespace-pre-wrap">
              {markdownContent}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// 간단한 Markdown to HTML 변환 (실제로는 marked.js 같은 라이브러리 사용 권장)
const markdownToHtml = (markdown: string): string => {
  return markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
    .replace(/\n/gim, '<br>');
}; 