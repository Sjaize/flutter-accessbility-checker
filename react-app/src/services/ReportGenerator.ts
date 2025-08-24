import { ReportData, AnalysisResult, AccessibilityIssue, ChatMessage } from '../lib/types';

export class ReportGenerator {
  private data?: ReportData;
  private acceptedIssues: any[] = [];
  private chatHistory: ChatMessage[] = [];

  constructor(data?: ReportData) {
    this.data = data;
  }

  setAcceptedIssues(issues: any[]): void {
    this.acceptedIssues = issues;
  }

  setChatHistory(history: ChatMessage[]): void {
    this.chatHistory = history;
  }

  generateReport(issues: any[], acceptedIssues: any[], chatHistory: ChatMessage[]): ReportData {
    const reportData: ReportData = {
      projectName: 'Flutter Accessibility Project',
      analysisDate: new Date(),
      results: {
        components: [],
        issues: issues,
        suggestions: [],
        summary: {
          totalIssues: issues.length,
          errors: issues.filter(i => i.severity === 'error').length,
          warnings: issues.filter(i => i.severity === 'warning').length,
          info: issues.filter(i => i.severity === 'info').length,
        }
      },
      recommendations: this.generateRecommendations(issues)
    };
    
    this.data = reportData;
    return reportData;
  }

  private generateRecommendations(issues: any[]): string[] {
    const recommendations: string[] = [];
    
    if (issues.some(i => i.severity === 'error')) {
      recommendations.push('높은 심각도의 접근성 오류를 우선적으로 해결하세요.');
    }
    
    if (issues.some(i => i.elementType === 'image')) {
      recommendations.push('모든 이미지에 적절한 대체 텍스트를 추가하세요.');
    }
    
    if (issues.some(i => i.elementType === 'button')) {
      recommendations.push('버튼에 명확한 레이블과 역할을 지정하세요.');
    }
    
    return recommendations;
  }

  downloadHTMLReport(reportData: ReportData): void {
    this.data = reportData;
    this.downloadReport('html');
  }

  generateHTMLReport(): string {
    if (!this.data) {
      return '<html><body><h1>데이터가 없습니다.</h1></body></html>';
    }
    const { projectName, analysisDate, results, recommendations } = this.data;
    
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>접근성 분석 보고서 - ${projectName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { margin: 20px 0; }
        .issue { margin: 10px 0; padding: 10px; border-left: 4px solid; }
        .error { border-color: #ff4444; background: #ffe6e6; }
        .warning { border-color: #ffaa00; background: #fff3e6; }
        .info { border-color: #4444ff; background: #e6e6ff; }
        .recommendations { background: #e8f5e8; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Flutter 접근성 분석 보고서</h1>
        <p><strong>프로젝트:</strong> ${projectName}</p>
        <p><strong>분석 날짜:</strong> ${analysisDate.toLocaleDateString()}</p>
    </div>
    
    <div class="summary">
        <h2>요약</h2>
        <p>총 이슈: ${results.summary.totalIssues}</p>
        <p>오류: ${results.summary.errors}</p>
        <p>경고: ${results.summary.warnings}</p>
        <p>정보: ${results.summary.info}</p>
    </div>
    
    <div class="issues">
        <h2>발견된 이슈</h2>
        ${this.generateIssuesHTML(results.issues)}
    </div>
    
    <div class="recommendations">
        <h2>권장사항</h2>
        <ul>
            ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
  }

  private generateIssuesHTML(issues: AccessibilityIssue[]): string {
    return issues.map(issue => `
        <div class="issue ${issue.severity}">
            <h3>${issue.title}</h3>
            <p><strong>심각도:</strong> ${issue.severity}</p>
            <p><strong>영향도:</strong> ${issue.impact}</p>
            <p><strong>설명:</strong> ${issue.description}</p>
            <p><strong>위치:</strong> ${issue.location.file}:${issue.location.line}</p>
            ${issue.wcagGuideline ? `<p><strong>WCAG 가이드라인:</strong> ${issue.wcagGuideline}</p>` : ''}
        </div>
    `).join('');
  }

  generateJSONReport(): string {
    return JSON.stringify(this.data, null, 2);
  }

  generateCSVReport(): string {
    if (!this.data) {
      return '';
    }
    const { results } = this.data;
    const headers = ['ID', '제목', '심각도', '영향도', '파일', '라인', '설명'];
    const rows = results.issues.map(issue => [
      issue.id,
      issue.title,
      issue.severity,
      issue.impact,
      issue.location.file,
      issue.location.line,
      issue.description.replace(/"/g, '""')
    ]);
    
    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }

  downloadReport(format: 'html' | 'json' | 'csv'): void {
    let content: string;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case 'html':
        content = this.generateHTMLReport();
        filename = 'accessibility-report.html';
        mimeType = 'text/html';
        break;
      case 'json':
        content = this.generateJSONReport();
        filename = 'accessibility-report.json';
        mimeType = 'application/json';
        break;
      case 'csv':
        content = this.generateCSVReport();
        filename = 'accessibility-report.csv';
        mimeType = 'text/csv';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
