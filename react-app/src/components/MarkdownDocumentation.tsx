import React, { useState, useEffect } from 'react';
import { AccessibilityIssue, FlutterComponent } from '../lib/types';

interface MarkdownDocumentationProps {
  issues: AccessibilityIssue[];
  components: FlutterComponent[];
  accessibilityScore: number;
}

export default function MarkdownDocumentation({ issues, components, accessibilityScore }: MarkdownDocumentationProps) {
  const [markdown, setMarkdown] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(false);

  useEffect(() => {
    generateMarkdown();
  }, [issues, components, accessibilityScore]);

  const generateMarkdown = () => {
    let md = `# Flutter 접근성 분석 문서

## 📊 프로젝트 개요

- **분석 일시**: ${new Date().toLocaleString('ko-KR')}
- **전체 접근성 점수**: ${accessibilityScore}/100
- **총 컴포넌트 수**: ${components.length}개
- **발견된 이슈**: ${issues.length}개

## 🚨 접근성 이슈 분석

### 통계 요약
- **오류 (Error)**: ${issues.filter(i => i.type === 'error').length}개
- **경고 (Warning)**: ${issues.filter(i => i.type === 'warning').length}개
- **정보 (Info)**: ${issues.filter(i => i.type === 'info').length}개

### 상세 이슈 목록

`;

    issues.forEach((issue, index) => {
      md += `#### ${index + 1}. ${issue.title}

**유형**: ${issue.type.toUpperCase()}
**요소**: ${issue.element}
**설명**: ${issue.description}

**개선 제안**:
\`\`\`dart
${issue.suggestions[0]?.text || '구체적인 코드 제안이 없습니다.'}
\`\`\`

---
`;
    });

    md += `
## 📁 코드 구조 분석

### 컴포넌트별 접근성 점수

`;

    components.forEach(component => {
      md += `#### ${component.name} (${component.type})
- **파일**: \`${component.file}:${component.line}\`
- **접근성 점수**: ${component.accessibilityScore}/100
- **이슈 수**: ${component.issues.length}개

${component.issues.length > 0 ? `**발견된 이슈**:
${component.issues.map(issue => `- ${issue}`).join('\n')}` : '**이슈 없음** ✅'}

${component.dependencies && component.dependencies.length > 0 ? `**의존성**:
${component.dependencies.map(dep => `- ${dep}`).join('\n')}` : ''}

---
`;
    });

    md += `
## 🎯 개선 권장사항

### 1. 우선순위 높음 (오류)
${issues.filter(i => i.type === 'error').map(issue => `- ${issue.title}`).join('\n')}

### 2. 우선순위 중간 (경고)
${issues.filter(i => i.type === 'warning').map(issue => `- ${issue.title}`).join('\n')}

### 3. 우선순위 낮음 (정보)
${issues.filter(i => i.type === 'info').map(issue => `- ${issue.title}`).join('\n')}

## 📋 WCAG 2.2 준수 체크리스트

### 레벨 A (필수)
- [ ] 1.1.1 비텍스트 콘텐츠
- [ ] 2.1.1 키보드
- [ ] 2.4.2 페이지 제목
- [ ] 4.1.2 이름 및 역할

### 레벨 AA (권장)
- [ ] 1.4.3 대비 (최소)
- [ ] 2.4.6 제목 및 라벨
- [ ] 2.5.5 입력 메커니즘

### 레벨 AAA (고급)
- [ ] 1.4.6 대비 (향상)
- [ ] 2.1.3 키보드 (예외 없음)

## 🔧 개발 가이드라인

### 이미지 접근성
\`\`\`dart
// 좋은 예시
Image.asset(
  'assets/logo.png',
  semanticLabel: '회사 로고',
  width: 100,
  height: 100,
)

// 나쁜 예시
Image.asset('assets/logo.png')
\`\`\`

### 버튼 접근성
\`\`\`dart
// 좋은 예시
Container(
  constraints: BoxConstraints(
    minWidth: 44.0,
    minHeight: 44.0,
  ),
  child: ElevatedButton(
    onPressed: () {},
    child: Text('확인'),
  ),
)

// 나쁜 예시
GestureDetector(
  onTap: () {},
  child: Container(
    width: 30,
    height: 30,
    child: Icon(Icons.check),
  ),
)
\`\`\`

### 색상 대비
\`\`\`dart
// 좋은 예시
Text(
  '중요한 텍스트',
  style: TextStyle(
    color: Colors.black87, // 높은 대비
    fontSize: 16.0,
  ),
)

// 나쁜 예시
Text(
  '중요한 텍스트',
  style: TextStyle(
    color: Colors.grey, // 낮은 대비
    fontSize: 16.0,
  ),
)
\`\`\`

## 📞 추가 지원

접근성 개선에 대한 추가 도움이 필요하시면:
- WCAG 2.2 공식 가이드라인 참조
- Flutter 접근성 공식 문서 확인
- 전문 접근성 컨설턴트 문의

---

*이 문서는 Flutter Accessibility Checker에 의해 자동 생성되었습니다.*
`;

    setMarkdown(md);
  };

  const downloadMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `accessibility-documentation-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">📄 문서 생성</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {showPreview ? '편집' : '미리보기'}
          </button>
          <button
            onClick={downloadMarkdown}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            📥 다운로드
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-sm font-mono">{markdown}</pre>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
          <div className="prose prose-sm max-w-none">
            <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: markdown.replace(/\n/g, '<br>') }} />
          </div>
        </div>
      )}
    </div>
  );
} 