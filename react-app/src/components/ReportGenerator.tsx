import React, { useState } from 'react';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  highlightedElement?: string;
  pumlHighlight?: string;
}

interface ReportGeneratorProps {
  isOpen: boolean;
  messages: ChatMessage[];
  onClose: () => void;
}

interface ReportData {
  version: string;
  timestamp: string;
  summary: string;
  issues: Array<{
    id: string;
    type: 'error' | 'warning' | 'info';
    title: string;
    description: string;
    file?: string;
    line?: number;
    suggestion: string;
  }>;
  chatHistory: ChatMessage[];
}

export default function ReportGenerator({ isOpen, messages, onClose }: ReportGeneratorProps) {
  const [reportTitle, setReportTitle] = useState('Flutter 접근성 분석 레포트');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateReport = async () => {
    setIsGenerating(true);
    
    try {
      // 채팅 메시지에서 이슈 추출
      const issues = extractIssuesFromChat(messages);
      
      const reportData: ReportData = {
        version: `v${Date.now()}`,
        timestamp: new Date().toISOString(),
        summary: generateSummary(messages, issues),
        issues,
        chatHistory: messages
      };

      // 레포트 생성 및 다운로드
      await downloadReport(reportData);
      
      // TODO: GitHub 레포지토리에 업로드
      // await uploadToGitHub(reportData);
      
    } catch (error) {
      console.error('레포트 생성 실패:', error);
    } finally {
      setIsGenerating(false);
      onClose();
    }
  };

  const extractIssuesFromChat = (chatMessages: ChatMessage[]) => {
    const issues: ReportData['issues'] = [];
    
    chatMessages.forEach((message, index) => {
      if (message.type === 'assistant' && message.highlightedElement) {
        const fileMatch = message.highlightedElement.match(/^(.+):(\d+)$/);
        if (fileMatch) {
          issues.push({
            id: `issue-${index}`,
            type: 'warning',
            title: extractTitleFromMessage(message.content),
            description: message.content,
            file: fileMatch[1],
            line: parseInt(fileMatch[2]),
            suggestion: extractSuggestionFromMessage(message.content)
          });
        }
      }
    });

    return issues;
  };

  const extractTitleFromMessage = (content: string): string => {
    if (content.includes('대체 텍스트')) return '이미지 대체 텍스트 누락';
    if (content.includes('터치 영역')) return '버튼 터치 영역 부족';
    if (content.includes('색상 대비')) return '텍스트 색상 대비 개선';
    return '접근성 이슈';
  };

  const extractSuggestionFromMessage = (content: string): string => {
    const codeMatch = content.match(/`([^`]+)`/);
    return codeMatch ? codeMatch[1] : content;
  };

  const generateSummary = (messages: ChatMessage[], issues: ReportData['issues']) => {
    const totalIssues = issues.length;
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    
    return `총 ${totalIssues}개의 접근성 이슈가 발견되었습니다. (오류: ${errorCount}, 경고: ${warningCount})`;
  };

  const downloadReport = async (reportData: ReportData) => {
    const reportContent = generateMarkdownReport(reportData);
    const blob = new Blob([reportContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `accessibility-report-${reportData.version}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const generateMarkdownReport = (reportData: ReportData): string => {
    return `# ${reportTitle}

**버전**: ${reportData.version}  
**생성일**: ${new Date(reportData.timestamp).toLocaleString('ko-KR')}

## 📊 요약

${reportData.summary}

## 🚨 발견된 이슈

${reportData.issues.map(issue => `
### ${issue.title}

**유형**: ${issue.type === 'error' ? '❌ 오류' : issue.type === 'warning' ? '⚠️ 경고' : 'ℹ️ 정보'}  
**파일**: ${issue.file || 'N/A'}  
**라인**: ${issue.line || 'N/A'}

**설명**: ${issue.description}

**제안사항**: 
\`\`\`dart
${issue.suggestion}
\`\`\`
`).join('\n')}

## 💬 분석 대화 기록

${reportData.chatHistory.map(message => `
**${message.type === 'user' ? '👤 사용자' : '🤖 AI'}** (${message.timestamp.toLocaleString('ko-KR')})
${message.content}
${message.highlightedElement ? `📍 참조: ${message.highlightedElement}` : ''}
`).join('\n')}

---

*이 레포트는 Flutter Accessibility Checker에 의해 자동 생성되었습니다.*
`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg p-6 w-96 max-w-md">
        <h3 className="text-lg font-semibold mb-4">레포트 생성</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            레포트 제목
          </label>
          <input
            type="text"
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <p className="text-sm text-gray-600">
            채팅 기록을 바탕으로 접근성 분석 레포트를 생성합니다.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            총 {messages.length}개의 메시지에서 {extractIssuesFromChat(messages).length}개의 이슈를 발견했습니다.
          </p>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
            disabled={isGenerating}
          >
            취소
          </button>
          <button
            onClick={generateReport}
            disabled={isGenerating}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>생성 중...</span>
              </>
            ) : (
              <>
                <span>레포트 생성</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 