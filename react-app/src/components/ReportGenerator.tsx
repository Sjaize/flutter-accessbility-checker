import React, { useState } from 'react';

interface ReportGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  accessibilityIssues: any[];
  chatContext?: any;
}

export default function ReportGenerator({ isOpen, onClose, accessibilityIssues, chatContext }: ReportGeneratorProps) {
  const [reportType, setReportType] = useState<'markdown' | 'html'>('markdown');
  const [reportContent, setReportContent] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      generateReport();
    }
  }, [isOpen, accessibilityIssues, reportType]);

  const generateReport = () => {
    if (reportType === 'markdown') {
      setReportContent(generateMarkdownReport());
    } else {
      setReportContent(generateHTMLReport());
    }
  };

  const generateMarkdownReport = (): string => {
    const timestamp = new Date().toLocaleString('ko-KR');
    
    let report = `# Flutter 접근성 분석 리포트\n\n`;
    report += `**생성일시**: ${timestamp}\n\n`;
    report += `**총 이슈 수**: ${accessibilityIssues.length}개\n\n`;
    
    // 이슈 요약
    const errorCount = accessibilityIssues.filter(i => i.severity === 'error').length;
    const warningCount = accessibilityIssues.filter(i => i.severity === 'warning').length;
    const infoCount = accessibilityIssues.filter(i => i.severity === 'info').length;
    
    report += `## 📊 이슈 요약\n\n`;
    report += `- 🔴 오류: ${errorCount}개\n`;
    report += `- 🟡 경고: ${warningCount}개\n`;
    report += `- 🔵 정보: ${infoCount}개\n\n`;
    
    // 상세 이슈 목록
    report += `## 🔍 상세 이슈 목록\n\n`;
    
    accessibilityIssues.forEach((issue, index) => {
      const severityIcon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
      const severityText = issue.severity === 'error' ? '오류' : issue.severity === 'warning' ? '경고' : '정보';
      
      report += `### ${index + 1}. ${severityIcon} ${issue.label || '레이블 없음'}\n\n`;
      report += `**심각도**: ${severityText}\n\n`;
      report += `**요소 타입**: ${issue.elementType || '알 수 없음'}\n\n`;
      
      if (issue.description) {
        report += `**설명**: ${issue.description}\n\n`;
      }
      
      if (issue.m5Location) {
        report += `**정확한 위치**: \`${issue.m5Location.file}:${issue.m5Location.line}:${issue.m5Location.column}\`\n\n`;
      }
      
      if (issue.source) {
        report += `**기본 위치**: \`${issue.source.file}:${issue.source.line}:${issue.source.column}\`\n\n`;
      }
      
      report += `---\n\n`;
    });
    
    // 개선 제안
    report += `## 💡 개선 제안\n\n`;
    report += `### 1. 이미지 접근성 개선\n`;
    report += `모든 이미지에 \`semanticsLabel\` 속성을 추가하여 스크린 리더가 이미지를 인식할 수 있도록 합니다.\n\n`;
    report += `\`\`\`dart\n`;
    report += `Semantics(\n`;
    report += `  label: "이미지 설명",\n`;
    report += `  child: Image.asset('assets/image.png'),\n`;
    report += `)\n`;
    report += `\`\`\`\n\n`;
    
    report += `### 2. 버튼 접근성 개선\n`;
    report += `모든 버튼에 \`semanticsLabel\` 또는 \`tooltip\` 속성을 추가합니다.\n\n`;
    report += `\`\`\`dart\n`;
    report += `ElevatedButton(\n`;
    report += `  onPressed: () {},\n`;
    report += `  child: Text('버튼'),\n`;
    report += `  tooltip: '버튼 설명',\n`;
    report += `)\n`;
    report += `\`\`\`\n\n`;
    
    report += `### 3. 텍스트 필드 접근성 개선\n`;
    report += `텍스트 필드에 \`hintText\` 또는 \`labelText\` 속성을 추가합니다.\n\n`;
    report += `\`\`\`dart\n`;
    report += `TextField(\n`;
    report += `  decoration: InputDecoration(\n`;
    report += `    hintText: '힌트 텍스트',\n`;
    report += `    labelText: '라벨 텍스트',\n`;
    report += `  ),\n`;
    report += `)\n`;
    report += `\`\`\`\n\n`;
    
    // 채팅 컨텍스트가 있으면 추가
    if (chatContext && chatContext.conversationHistory) {
      report += `## 💬 AI 대화 기록\n\n`;
      chatContext.conversationHistory.forEach((msg: any, index: number) => {
        const role = msg.type === 'user' ? '👤 사용자' : '🤖 AI';
        report += `### ${index + 1}. ${role}\n\n`;
        report += `${msg.content}\n\n`;
        report += `---\n\n`;
      });
    }
    
    return report;
  };

  const generateHTMLReport = (): string => {
    const timestamp = new Date().toLocaleString('ko-KR');
    
    let report = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flutter 접근성 분석 리포트</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .issue { border-left: 4px solid #007bff; padding: 15px; margin: 15px 0; background: #f8f9fa; border-radius: 0 8px 8px 0; }
        .issue.error { border-left-color: #dc3545; }
        .issue.warning { border-left-color: #ffc107; }
        .issue.info { border-left-color: #17a2b8; }
        .code { background: #f4f4f4; padding: 15px; border-radius: 5px; font-family: 'Courier New', monospace; }
        .severity-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px; font-weight: bold; }
        .severity-error { background: #dc3545; }
        .severity-warning { background: #ffc107; color: #212529; }
        .severity-info { background: #17a2b8; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎯 Flutter 접근성 분석 리포트</h1>
        <p><strong>생성일시</strong>: ${timestamp}</p>
        <p><strong>총 이슈 수</strong>: ${accessibilityIssues.length}개</p>
    </div>`;
    
    // 이슈 요약
    const errorCount = accessibilityIssues.filter(i => i.severity === 'error').length;
    const warningCount = accessibilityIssues.filter(i => i.severity === 'warning').length;
    const infoCount = accessibilityIssues.filter(i => i.severity === 'info').length;
    
    report += `
    <div class="summary">
        <h2>📊 이슈 요약</h2>
        <ul>
            <li>🔴 오류: ${errorCount}개</li>
            <li>🟡 경고: ${warningCount}개</li>
            <li>🔵 정보: ${infoCount}개</li>
        </ul>
    </div>`;
    
    // 상세 이슈 목록
    report += `<h2>🔍 상세 이슈 목록</h2>`;
    
    accessibilityIssues.forEach((issue, index) => {
      const severityClass = issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info';
      const severityBadgeClass = issue.severity === 'error' ? 'severity-error' : issue.severity === 'warning' ? 'severity-warning' : 'severity-info';
      const severityText = issue.severity === 'error' ? '오류' : issue.severity === 'warning' ? '경고' : '정보';
      
      report += `
    <div class="issue ${severityClass}">
        <h3>${index + 1}. ${issue.label || '레이블 없음'}</h3>
        <p><span class="severity-badge ${severityBadgeClass}">${severityText}</span></p>
        <p><strong>요소 타입</strong>: ${issue.elementType || '알 수 없음'}</p>`;
      
      if (issue.description) {
        report += `<p><strong>설명</strong>: ${issue.description}</p>`;
      }
      
      if (issue.m5Location) {
        report += `<p><strong>정확한 위치</strong>: <code>${issue.m5Location.file}:${issue.m5Location.line}:${issue.m5Location.column}</code></p>`;
      }
      
      if (issue.source) {
        report += `<p><strong>기본 위치</strong>: <code>${issue.source.file}:${issue.source.line}:${issue.source.column}</code></p>`;
      }
      
      report += `</div>`;
    });
    
    // 개선 제안
    report += `
    <h2>💡 개선 제안</h2>
    <h3>1. 이미지 접근성 개선</h3>
    <p>모든 이미지에 <code>semanticsLabel</code> 속성을 추가하여 스크린 리더가 이미지를 인식할 수 있도록 합니다.</p>
    <div class="code">
Semantics(
  label: "이미지 설명",
  child: Image.asset('assets/image.png'),
)
    </div>
    
    <h3>2. 버튼 접근성 개선</h3>
    <p>모든 버튼에 <code>semanticsLabel</code> 또는 <code>tooltip</code> 속성을 추가합니다.</p>
    <div class="code">
ElevatedButton(
  onPressed: () {},
  child: Text('버튼'),
  tooltip: '버튼 설명',
)
    </div>
    
    <h3>3. 텍스트 필드 접근성 개선</h3>
    <p>텍스트 필드에 <code>hintText</code> 또는 <code>labelText</code> 속성을 추가합니다.</p>
    <div class="code">
TextField(
  decoration: InputDecoration(
    hintText: '힌트 텍스트',
    labelText: '라벨 텍스트',
  ),
)
    </div>`;
    
    // 채팅 컨텍스트가 있으면 추가
    if (chatContext && chatContext.conversationHistory) {
      report += `<h2>💬 AI 대화 기록</h2>`;
      chatContext.conversationHistory.forEach((msg: any, index: number) => {
        const role = msg.type === 'user' ? '👤 사용자' : '🤖 AI';
        report += `
    <div class="issue">
        <h3>${index + 1}. ${role}</h3>
        <p>${msg.content}</p>
    </div>`;
      });
    }
    
    report += `
</body>
</html>`;
    
    return report;
  };

  const downloadReport = () => {
    const blob = new Blob([reportContent], { 
      type: reportType === 'markdown' ? 'text/markdown' : 'text/html' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accessibility-report-${new Date().toISOString().split('T')[0]}.${reportType === 'markdown' ? 'md' : 'html'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="card-pastel rounded-2xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold gradient-text">
            📄 접근성 리포트 생성기
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex gap-6">
          {/* 설정 패널 */}
          <div className="w-80 space-y-4">
            <div className="card-pastel p-4 rounded-xl">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                ⚙️ 리포트 설정
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">리포트 형식</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as 'markdown' | 'html')}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="markdown">Markdown (.md)</option>
                    <option value="html">HTML (.html)</option>
                  </select>
                </div>
                <button
                  onClick={generateReport}
                  className="w-full btn-pastel-primary"
                >
                  📊 리포트 생성
                </button>
                {reportContent && (
                  <button
                    onClick={downloadReport}
                    className="w-full btn-pastel-success"
                  >
                    💾 다운로드
                  </button>
                )}
              </div>
            </div>

            {/* 통계 */}
            <div className="card-pastel p-4 rounded-xl">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                📈 접근성 통계
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>총 이슈:</span>
                  <span className="font-medium">{accessibilityIssues.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>오류:</span>
                  <span className="font-medium text-red-600">
                    {accessibilityIssues.filter(i => i.severity === 'error').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>경고:</span>
                  <span className="font-medium text-yellow-600">
                    {accessibilityIssues.filter(i => i.severity === 'warning').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>정보:</span>
                  <span className="font-medium text-blue-600">
                    {accessibilityIssues.filter(i => i.severity === 'info').length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 미리보기 */}
          <div className="flex-1">
            <div className="card-pastel p-4 rounded-xl h-full">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                👁️ 리포트 미리보기
              </h4>
              <div className="bg-white border border-gray-200 rounded-lg p-4 h-96 overflow-y-auto">
                {reportContent ? (
                  <div 
                    className={reportType === 'html' ? 'prose prose-sm max-w-none' : ''}
                    dangerouslySetInnerHTML={reportType === 'html' ? { __html: reportContent } : undefined}
                  >
                    {reportType === 'markdown' && (
                      <pre className="whitespace-pre-wrap text-sm">{reportContent}</pre>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">리포트를 생성하면 여기에 미리보기가 표시됩니다</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 