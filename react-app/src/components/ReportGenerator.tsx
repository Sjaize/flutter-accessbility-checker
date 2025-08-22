import React, { useState } from 'react';
import { Download, FileText, Calendar, CheckCircle, AlertTriangle, Info } from 'lucide-react';

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
  acceptedSuggestions: string[]; // 수정한 사안
  chatHistory: Array<{
    id: string;
    type: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>; // 고려할 사안
}

interface ReportGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  accessibilityIssues: any[];
  chatContext: any;
}

export default function ReportGenerator({ 
  isOpen, 
  onClose, 
  accessibilityIssues,
  chatContext 
}: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  // 리포트 데이터 생성
  const generateReportData = (): ReportData => {
    const now = new Date();
    
    // 접근성 이슈를 리포트 형식으로 변환
    const issues = accessibilityIssues.map(issue => ({
      id: issue.id,
      type: issue.type,
      title: issue.title,
      description: issue.description,
      file: issue.suggestions[0]?.file,
      line: issue.suggestions[0]?.line,
      suggestion: issue.suggestions[0]?.message || '수정 방안을 확인해주세요.'
    }));

    // 요약 생성
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const infoCount = issues.filter(i => i.type === 'info').length;

    const summary = `총 ${issues.length}개의 접근성 이슈가 발견되었습니다. (오류: ${errorCount}개, 경고: ${warningCount}개, 정보: ${infoCount}개)`;

    return {
      version: '1.0.0',
      timestamp: now.toISOString(),
      summary,
      issues,
      acceptedSuggestions: chatContext.acceptedSuggestions || [],
      chatHistory: chatContext.conversationHistory || []
    };
  };

  // Markdown 리포트 생성
  const generateMarkdownReport = (data: ReportData): string => {
    const date = new Date(data.timestamp).toLocaleString('ko-KR');
    
    let markdown = `# Flutter 접근성 분석 리포트\n\n`;
    markdown += `**생성일:** ${date}  \n`;
    markdown += `**버전:** ${data.version}  \n\n`;
    
    // 요약
    markdown += `## 📊 분석 요약\n\n`;
    markdown += `${data.summary}\n\n`;
    
    // 발견된 이슈
    markdown += `## 🔍 발견된 이슈\n\n`;
    
    if (data.issues.length === 0) {
      markdown += `✅ 접근성 이슈가 발견되지 않았습니다.\n\n`;
    } else {
      data.issues.forEach((issue, index) => {
        const icon = issue.type === 'error' ? '🚨' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
        markdown += `### ${icon} ${issue.title}\n\n`;
        markdown += `**종류:** ${issue.type === 'error' ? '오류' : issue.type === 'warning' ? '경고' : '정보'}  \n`;
        markdown += `**설명:** ${issue.description}  \n`;
        if (issue.file) markdown += `**파일:** ${issue.file}${issue.line ? `:${issue.line}` : ''}  \n`;
        markdown += `**개선 방안:** ${issue.suggestion}\n\n`;
      });
    }

    // 수정한 사안
    markdown += `## ✅ 수정한 사안\n\n`;
    if (data.acceptedSuggestions.length === 0) {
      markdown += `아직 수정된 사안이 없습니다.\n\n`;
    } else {
      data.acceptedSuggestions.forEach(suggestionId => {
        const relatedIssue = data.issues.find(issue => 
          issue.id === suggestionId.split('-')[0]
        );
        if (relatedIssue) {
          markdown += `- ${relatedIssue.title}\n`;
        }
      });
      markdown += `\n`;
    }

    // 고려할 사안 (AI 채팅에서 논의된 내용)
    markdown += `## 💭 고려할 사안\n\n`;
    if (data.chatHistory.length === 0) {
      markdown += `AI와 논의된 사안이 없습니다.\n\n`;
    } else {
      const userQuestions = data.chatHistory
        .filter(msg => msg.type === 'user')
        .slice(-5); // 최근 5개 질문만

      userQuestions.forEach((msg, index) => {
        markdown += `${index + 1}. ${msg.content}\n`;
      });
      markdown += `\n`;
    }

    // 권장 사항
    markdown += `## 🎯 권장 개선 순서\n\n`;
    markdown += `1. **오류 수정**: 스크린 리더 접근성에 심각한 영향을 주는 이슈들을 우선 해결\n`;
    markdown += `2. **경고 해결**: 사용성에 영향을 주는 이슈들을 차례로 개선\n`;
    markdown += `3. **정보 확인**: 추가적인 접근성 향상을 위한 개선 사항 검토\n\n`;

    markdown += `---\n\n`;
    markdown += `*이 리포트는 Flutter Accessibility Checker에 의해 자동 생성되었습니다.*\n`;

    return markdown;
  };

  // HTML 리포트 생성
  const generateHTMLReport = (data: ReportData): string => {
    const date = new Date(data.timestamp).toLocaleString('ko-KR');
    
    let html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flutter 접근성 분석 리포트</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; margin: 40px; background: #f8fafc; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        h1 { color: #1a202c; border-bottom: 3px solid #3b82f6; padding-bottom: 16px; }
        h2 { color: #2d3748; margin-top: 32px; }
        .meta { background: #f7fafc; padding: 16px; border-radius: 8px; margin: 20px 0; }
        .issue { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .error { border-left: 4px solid #ef4444; background: #fef2f2; }
        .warning { border-left: 4px solid #f59e0b; background: #fffbeb; }
        .info { border-left: 4px solid #3b82f6; background: #eff6ff; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge.error { background: #ef4444; color: white; }
        .badge.warning { background: #f59e0b; color: white; }
        .badge.info { background: #3b82f6; color: white; }
        code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: 'Monaco', monospace; }
        .summary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 Flutter 접근성 분석 리포트</h1>
        
        <div class="meta">
            <strong>생성일:</strong> ${date}<br>
            <strong>버전:</strong> ${data.version}
        </div>

        <div class="summary">
            <h2 style="color: white; margin-top: 0;">📊 분석 요약</h2>
            <p style="font-size: 18px; margin: 0;">${data.summary}</p>
        </div>

        <h2>🔍 발견된 이슈</h2>`;

    if (data.issues.length === 0) {
      html += `<p>✅ 접근성 이슈가 발견되지 않았습니다.</p>`;
    } else {
      data.issues.forEach(issue => {
        html += `
        <div class="issue ${issue.type}">
            <h3>${issue.title} <span class="badge ${issue.type}">${issue.type === 'error' ? '오류' : issue.type === 'warning' ? '경고' : '정보'}</span></h3>
            <p><strong>설명:</strong> ${issue.description}</p>
            ${issue.file ? `<p><strong>파일:</strong> <code>${issue.file}${issue.line ? `:${issue.line}` : ''}</code></p>` : ''}
            <p><strong>개선 방안:</strong> ${issue.suggestion}</p>
        </div>`;
      });
    }

    html += `
        <h2>✅ 수정한 사안</h2>`;
    
    if (data.acceptedSuggestions.length === 0) {
      html += `<p>아직 수정된 사안이 없습니다.</p>`;
    } else {
      html += `<ul>`;
      data.acceptedSuggestions.forEach(suggestionId => {
        const relatedIssue = data.issues.find(issue => 
          issue.id === suggestionId.split('-')[0]
        );
        if (relatedIssue) {
          html += `<li>${relatedIssue.title}</li>`;
        }
      });
      html += `</ul>`;
    }

    html += `
        <h2>💭 고려할 사안</h2>`;
    
    if (data.chatHistory.length === 0) {
      html += `<p>AI와 논의된 사안이 없습니다.</p>`;
    } else {
      const userQuestions = data.chatHistory
        .filter(msg => msg.type === 'user')
        .slice(-5);

      html += `<ol>`;
      userQuestions.forEach(msg => {
        html += `<li>${msg.content}</li>`;
      });
      html += `</ol>`;
    }

    html += `
        <h2>🎯 권장 개선 순서</h2>
        <ol>
            <li><strong>오류 수정:</strong> 스크린 리더 접근성에 심각한 영향을 주는 이슈들을 우선 해결</li>
            <li><strong>경고 해결:</strong> 사용성에 영향을 주는 이슈들을 차례로 개선</li>
            <li><strong>정보 확인:</strong> 추가적인 접근성 향상을 위한 개선 사항 검토</li>
        </ol>

        <hr style="margin: 40px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="text-align: center; color: #64748b; font-size: 14px;">
            <em>이 리포트는 Flutter Accessibility Checker에 의해 자동 생성되었습니다.</em>
        </p>
    </div>
</body>
</html>`;

    return html;
  };

  // 파일 다운로드
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 리포트 생성 및 다운로드
  const handleGenerateReport = async (format: 'markdown' | 'html') => {
    setIsGenerating(true);
    
    try {
      // 리포트 데이터 생성
      const data = generateReportData();
      setReportData(data);

      // 약간의 지연 (생성 중 효과)
      await new Promise(resolve => setTimeout(resolve, 1000));

      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
      
      if (format === 'markdown') {
        const markdown = generateMarkdownReport(data);
        downloadFile(markdown, `flutter-accessibility-report-${timestamp}.md`, 'text/markdown');
      } else {
        const html = generateHTMLReport(data);
        downloadFile(html, `flutter-accessibility-report-${timestamp}.html`, 'text/html');
      }

    } catch (error) {
      console.error('리포트 생성 오류:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const stats = {
    total: accessibilityIssues.length,
    error: accessibilityIssues.filter(i => i.type === 'error').length,
    warning: accessibilityIssues.filter(i => i.type === 'warning').length,
    info: accessibilityIssues.filter(i => i.type === 'info').length,
    accepted: chatContext.acceptedSuggestions?.length || 0,
    discussed: chatContext.conversationHistory?.length || 0
  };

  return (
    <div className="modal-overlay">
      <div className="card-pastel p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto animate-slide-up">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6 border-b border-white/20 pb-4">
          <h3 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            접근성 리포트 생성
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl hover:scale-110 transition-transform"
          >
            ✕
          </button>
        </div>

        {/* 통계 요약 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="card-pastel p-4 text-center">
            <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
            <div className="text-sm text-gray-600">총 이슈</div>
          </div>
          <div className="card-pastel p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.error}</div>
            <div className="text-sm text-gray-600">오류</div>
          </div>
          <div className="card-pastel p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
            <div className="text-sm text-gray-600">경고</div>
          </div>
          <div className="card-pastel p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.info}</div>
            <div className="text-sm text-gray-600">정보</div>
          </div>
          <div className="card-pastel p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.accepted}</div>
            <div className="text-sm text-gray-600">수정함</div>
          </div>
          <div className="card-pastel p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.discussed}</div>
            <div className="text-sm text-gray-600">논의함</div>
          </div>
        </div>

        {/* 리포트 생성 버튼들 */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-700 mb-3">📄 리포트 형식 선택</h4>
          
          <div className="grid md:grid-cols-2 gap-4">
            {/* Markdown 리포트 */}
            <div className="card-pastel p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="w-6 h-6 text-blue-600" />
                <h5 className="font-medium text-gray-800">Markdown 리포트</h5>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                개발자 친화적인 마크다운 형식으로 생성합니다. 
                GitHub이나 문서 도구에서 바로 사용할 수 있습니다.
              </p>
              <button
                onClick={() => handleGenerateReport('markdown')}
                disabled={isGenerating}
                className="btn-pastel-primary w-full disabled:opacity-50"
              >
                {isGenerating ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    생성 중...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    MD 다운로드
                  </div>
                )}
              </button>
            </div>

            {/* HTML 리포트 */}
            <div className="card-pastel p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="w-6 h-6 text-emerald-600" />
                <h5 className="font-medium text-gray-800">HTML 리포트</h5>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                시각적으로 보기 좋은 HTML 형식으로 생성합니다. 
                브라우저에서 바로 확인하거나 인쇄할 수 있습니다.
              </p>
              <button
                onClick={() => handleGenerateReport('html')}
                disabled={isGenerating}
                className="btn-pastel-success w-full disabled:opacity-50"
              >
                {isGenerating ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    생성 중...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    HTML 다운로드
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 리포트 미리보기 */}
        {reportData && (
          <div className="mt-6 pt-6 border-t border-white/20">
            <h4 className="font-medium text-gray-700 mb-3">📋 리포트 미리보기</h4>
            <div className="card-pastel p-4 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>총 {reportData.issues.length}개 이슈 포함</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span>{reportData.acceptedSuggestions.length}개 수정된 사안 추적</span>
              </div>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600" />
                <span>{reportData.chatHistory.length}개 논의 사항 포함</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 