import { ReportData, ChatMessage, AccessibilityIssue } from '../lib/types';

export class ReportGenerator {
  private acceptedIssues: string[] = [];
  private chatHistory: ChatMessage[] = [];

  setAcceptedIssues(issueIds: string[]): void {
    this.acceptedIssues = issueIds;
  }

  setChatHistory(history: ChatMessage[]): void {
    this.chatHistory = history;
  }

  generateReport(issues: AccessibilityIssue[]): ReportData {
    const statistics = {
      total: issues.length,
      errors: issues.filter(i => i.type === 'error').length,
      warnings: issues.filter(i => i.type === 'warning').length,
      info: issues.filter(i => i.type === 'info').length
    };

    const summary = this.generateSummary(statistics, issues);

    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      summary,
      issues: issues.map(issue => ({
        id: issue.id,
        type: issue.type,
        title: issue.title,
        description: issue.description,
        file: issue.suggestions[0]?.file,
        line: issue.suggestions[0]?.line,
        suggestion: issue.suggestions[0]?.message || ''
      })),
      chatHistory: this.chatHistory,
      statistics
    };
  }

  private generateSummary(statistics: any, issues: AccessibilityIssue[]): string {
    const { total, errors, warnings, info } = statistics;
    
    let summary = `# Flutter 접근성 분석 리포트\n\n`;
    summary += `**분석 일시:** ${new Date().toLocaleString('ko-KR')}\n\n`;
    summary += `## 📊 요약\n\n`;
    summary += `- **총 발견 이슈:** ${total}개\n`;
    summary += `- **오류 (Error):** ${errors}개\n`;
    summary += `- **경고 (Warning):** ${warnings}개\n`;
    summary += `- **정보 (Info):** ${info}개\n\n`;

    if (this.acceptedIssues.length > 0) {
      summary += `## ✅ 수정 완료된 이슈\n\n`;
      this.acceptedIssues.forEach(issueId => {
        const issue = issues.find(i => i.id === issueId);
        if (issue) {
          summary += `- ${issue.title}\n`;
        }
      });
      summary += `\n`;
    }

    if (this.chatHistory.length > 0) {
      summary += `## 💬 AI 분석 기록\n\n`;
      this.chatHistory.forEach(msg => {
        summary += `**${msg.role === 'user' ? '사용자' : 'AI'}:** ${msg.content}\n\n`;
      });
    }

    return summary;
  }

  downloadMarkdownReport(reportData: ReportData): void {
    const markdown = this.generateMarkdownReport(reportData);
    this.downloadFile(markdown, 'accessibility-report.md', 'text/markdown');
  }

  downloadHTMLReport(reportData: ReportData): void {
    const html = this.generateHTMLReport(reportData);
    this.downloadFile(html, 'accessibility-report.html', 'text/html');
  }

  private generateMarkdownReport(reportData: ReportData): string {
    let markdown = `# Flutter 접근성 분석 리포트\n\n`;
    markdown += `**버전:** ${reportData.version}\n`;
    markdown += `**생성일:** ${new Date(reportData.timestamp).toLocaleString('ko-KR')}\n\n`;
    
    markdown += `## 📊 통계 요약\n\n`;
    markdown += `| 구분 | 개수 |\n`;
    markdown += `|------|------|\n`;
    markdown += `| 총 이슈 | ${reportData.statistics.total} |\n`;
    markdown += `| 오류 | ${reportData.statistics.errors} |\n`;
    markdown += `| 경고 | ${reportData.statistics.warnings} |\n`;
    markdown += `| 정보 | ${reportData.statistics.info} |\n\n`;

    markdown += `## 🚨 발견된 이슈\n\n`;
    reportData.issues.forEach(issue => {
      markdown += `### ${issue.type.toUpperCase()}: ${issue.title}\n\n`;
      markdown += `${issue.description}\n\n`;
      if (issue.file && issue.line) {
        markdown += `**파일:** ${issue.file}:${issue.line}\n\n`;
      }
      if (issue.suggestion) {
        markdown += `**제안:** ${issue.suggestion}\n\n`;
      }
      markdown += `---\n\n`;
    });

    if (reportData.chatHistory.length > 0) {
      markdown += `## 💬 AI 분석 대화\n\n`;
      reportData.chatHistory.forEach(msg => {
        markdown += `**${msg.role === 'user' ? '사용자' : 'AI'}** (${msg.timestamp.toLocaleString('ko-KR')}):\n\n`;
        markdown += `${msg.content}\n\n`;
        if (msg.umlDiagram) {
          markdown += `\`\`\`plantuml\n${msg.umlDiagram}\n\`\`\`\n\n`;
        }
        markdown += `---\n\n`;
      });
    }

    return markdown;
  }

  private generateHTMLReport(reportData: ReportData): string {
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flutter 접근성 분석 리포트</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 25%, #fef3c7 50%, #fce7f3 75%, #f3e8ff 100%);
            min-height: 100vh;
        }
        .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1f2937;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 10px;
        }
        h2 {
            color: #374151;
            margin-top: 30px;
        }
        h3 {
            color: #4b5563;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f8fafc;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            border-left: 4px solid #3b82f6;
        }
        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: #1f2937;
        }
        .stat-label {
            color: #6b7280;
            margin-top: 5px;
        }
        .issue-card {
            background: #fefefe;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
            border-left: 4px solid;
        }
        .issue-error { border-left-color: #dc2626; }
        .issue-warning { border-left-color: #ca8a04; }
        .issue-info { border-left-color: #2563eb; }
        .issue-type {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
        }
        .type-error { background: #fee2e2; color: #7f1d1d; }
        .type-warning { background: #fef3c7; color: #78350f; }
        .type-info { background: #dbeafe; color: #1e3a8a; }
        .chat-message {
            background: #f9fafb;
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
        }
        .chat-user { border-left: 4px solid #3b82f6; }
        .chat-assistant { border-left: 4px solid #10b981; }
        .chat-role {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .chat-timestamp {
            font-size: 0.8rem;
            color: #6b7280;
        }
        pre {
            background: #1f2937;
            color: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
        }
        code {
            background: #f3f4f6;
            padding: 2px 4px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 Flutter 접근성 분석 리포트</h1>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${reportData.statistics.total}</div>
                <div class="stat-label">총 이슈</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${reportData.statistics.errors}</div>
                <div class="stat-label">오류</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${reportData.statistics.warnings}</div>
                <div class="stat-label">경고</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${reportData.statistics.info}</div>
                <div class="stat-label">정보</div>
            </div>
        </div>

        <h2>🚨 발견된 이슈</h2>
        ${reportData.issues.map(issue => `
            <div class="issue-card issue-${issue.type}">
                <span class="issue-type type-${issue.type}">${issue.type}</span>
                <h3>${issue.title}</h3>
                <p>${issue.description}</p>
                ${issue.file && issue.line ? `<p><strong>파일:</strong> ${issue.file}:${issue.line}</p>` : ''}
                ${issue.suggestion ? `<p><strong>제안:</strong> ${issue.suggestion}</p>` : ''}
            </div>
        `).join('')}

        ${reportData.chatHistory.length > 0 ? `
            <h2>💬 AI 분석 대화</h2>
            ${reportData.chatHistory.map(msg => `
                <div class="chat-message chat-${msg.role}">
                    <div class="chat-role">${msg.role === 'user' ? '사용자' : 'AI'}</div>
                    <div class="chat-timestamp">${msg.timestamp.toLocaleString('ko-KR')}</div>
                    <div>${msg.content.replace(/\n/g, '<br>')}</div>
                    ${msg.umlDiagram ? `<pre><code>${msg.umlDiagram}</code></pre>` : ''}
                </div>
            `).join('')}
        ` : ''}
    </div>
</body>
</html>`;

    return html;
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  extractIssuesFromChat(chatHistory: ChatMessage[]): AccessibilityIssue[] {
    // 채팅 기록에서 이슈 정보 추출 (간단한 구현)
    const issues: AccessibilityIssue[] = [];
    
    chatHistory.forEach(msg => {
      if (msg.role === 'assistant' && msg.content.includes('이슈')) {
        // 간단한 이슈 추출 로직
        const issueMatch = msg.content.match(/(오류|경고|정보):\s*(.+)/);
        if (issueMatch) {
          issues.push({
            id: `chat-${Date.now()}`,
            type: issueMatch[1] === '오류' ? 'error' : issueMatch[1] === '경고' ? 'warning' : 'info',
            title: issueMatch[2],
            description: '채팅에서 발견된 이슈',
            position: { x: 50, y: 50 },
            element: '채팅 분석',
            side: 'left',
            bubblePosition: { x: -280, y: 50 },
            suggestions: []
          });
        }
      }
    });

    return issues;
  }
} 