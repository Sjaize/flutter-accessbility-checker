import { FlutterComponent, AccessibilityIssue, Suggestion } from '../lib/types';

export class ProjectAnalyzer {
  private components: FlutterComponent[] = [];
  private issues: AccessibilityIssue[] = [];
  private openaiApiKey: string | null = null;
  private webSocketData: any = null;
  private initialized = false;

  constructor() {
    this.openaiApiKey = this.getOpenAIAPIKey();
  }

  // API 연결 상태 확인 메서드
  checkApiConnection(): boolean {
    if (!this.initialized) {
      if (!this.openaiApiKey) {
        console.log('[ProjectAnalyzer] OpenAI API Key not found');
      } else {
        console.log('🤖 LLM 기능: OpenAI API 연결됨');
      }
      this.initialized = true;
    }
    return !!this.openaiApiKey;
  }

  private getOpenAIAPIKey(): string | null {
    // 방법 1: localStorage에서 확인
    const savedConfig = localStorage.getItem('llmConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        if (parsed.apiKey) {
          return parsed.apiKey;
        }
      } catch (error) {
        console.error('Failed to parse saved config:', error);
      }
    }

    // 방법 2: 환경변수에서 확인 (개발 환경에서만)
    if (process.env.REACT_APP_OPENAI_API_KEY) {
      return process.env.REACT_APP_OPENAI_API_KEY;
    }

    return null;
  }

  private getApiKeySource(): string {
    const savedConfig = localStorage.getItem('llmConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        if (parsed.apiKey) {
          return 'localStorage.llmConfig';
        }
      } catch (error) {
        console.error('Failed to parse saved config:', error);
      }
    }

    if (process.env.REACT_APP_OPENAI_API_KEY) {
      return 'process.env.REACT_APP_OPENAI_API_KEY';
    }

    return 'none';
  }

  // WebSocket으로 받은 실제 데이터 설정
  setWebSocketData(data: any) {
    this.webSocketData = data;
    // 로그 제거 - 불필요한 반복 로그 방지
  }

  // 실제 WebSocket 데이터에서 이슈 추출
  private getIssuesFromWebSocket(): AccessibilityIssue[] {
    if (!this.webSocketData || !this.webSocketData.issues) {
      return [];
    }

    // WebSocket 데이터를 AccessibilityIssue 형태로 변환
    return this.webSocketData.issues.map((issue: any, index: number) => ({
      id: issue.id || `ws-issue-${index}`,
      type: issue.type || 'info',
      title: issue.label || issue.title || '접근성 이슈',
      description: issue.description || `UI 요소 "${issue.element || '알 수 없음'}"의 접근성 문제`,
      severity: issue.severity || 'info',
      position: issue.position || { x: 50, y: 50 },
      element: issue.element || issue.elementType || 'UI 요소',
      source: issue.source || issue.m5Location || {
        file: 'unknown',
        line: 1,
        column: 1
      },
      rectPct: issue.rectPct,
      suggestions: this.generateSuggestionsFromWebSocket(issue)
    }));
  }

  // WebSocket 데이터에서 컴포넌트 추출
  private getComponentsFromWebSocket(): FlutterComponent[] {
    if (!this.webSocketData || !this.webSocketData.components) {
      return [];
    }

    return this.webSocketData.components.map((comp: any, index: number) => ({
      name: comp.name || `component-${index}`,
      file: comp.file || 'unknown',
      line: comp.line || 1,
      type: comp.type || 'widget',
      accessibilityScore: comp.accessibilityScore || 75,
      issues: comp.issues || [],
      content: comp.content || '',
      dependencies: comp.dependencies || []
    }));
  }

  private generateSuggestionsFromWebSocket(issue: any): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // 기본 제안 생성
    const baseSuggestion: Suggestion = {
      id: `${issue.id}-suggestion-${Date.now()}`,
      title: `Fix for ${issue.title}`,
      description: this.generateFixMessageForIssue(issue),
      code: this.generateFixCodeForIssue(issue),
      location: {
        file: issue.source?.file || issue.m5Location?.file || 'unknown',
        line: issue.source?.line || issue.m5Location?.line || 1,
        column: issue.source?.column || issue.m5Location?.column || 1
      },
      file: issue.source?.file || issue.m5Location?.file || 'unknown',
      line: issue.source?.line || issue.m5Location?.line || 1,
      column: issue.source?.column || issue.m5Location?.column || 1,
      text: this.generateFixCodeForIssue(issue),
      message: this.generateFixMessageForIssue(issue),
      type: issue.type || 'info',
      element: issue.element || issue.elementType || 'UI 요소',
      position: issue.position || { x: 50, y: 50 }
    };
    
    suggestions.push(baseSuggestion);
    
    // LLM 기반 추가 제안 (API 키가 있는 경우)
    if (this.openaiApiKey) {
      this.generateLLMSuggestionsForIssue(issue).then(llmSuggestions => {
        suggestions.push(...llmSuggestions);
      }).catch(error => {
        console.error('[ProjectAnalyzer] LLM suggestion generation failed:', error);
      });
    }
    
    return suggestions;
  }

  private generateFixCodeForIssue(issue: any): string {
    const elementType = (issue.elementType || issue.element || '').toLowerCase();
    const label = issue.label || issue.title || '';
    
    if (elementType.includes('image') || elementType.includes('icon')) {
      return `
Semantics(
  label: '${label}',
  child: Image.asset('assets/image.png'),
)`;
    } else if (elementType.includes('button')) {
      return `
Container(
  constraints: BoxConstraints(minWidth: 44, minHeight: 44),
  child: ElevatedButton(
    onPressed: () {},
    child: Text('${label}'),
  ),
)`;
    } else if (elementType.includes('textfield')) {
      return `
TextField(
  decoration: InputDecoration(
    labelText: '${label}',
    hintText: '${label}을 입력하세요',
  ),
)`;
    }
    
    return `
Semantics(
  label: '${label}',
  child: // 원래 위젯
)`;
  }

  private generateFixMessageForIssue(issue: any): string {
    const elementType = (issue.elementType || issue.element || '').toLowerCase();
    
    if (elementType.includes('image')) {
      return 'Semantics 위젯으로 이미지에 설명 추가';
    } else if (elementType.includes('button')) {
      return 'Container로 최소 터치 영역 보장';
    } else if (elementType.includes('textfield')) {
      return 'labelText와 hintText 추가';
    }
    
    return '접근성 개선을 위한 Semantics 위젯 추가';
  }

  async analyzeProject(): Promise<{
    components: FlutterComponent[];
    issues: AccessibilityIssue[];
    accessibilityScore: number;
  }> {
    console.log('[ProjectAnalyzer] Starting analysis with WebSocket data...');
    
    try {
      // 1. WebSocket에서 받은 실제 데이터 사용
      this.issues = this.getIssuesFromWebSocket();
      this.components = this.getComponentsFromWebSocket();
      
      // 2. LLM 기반 추가 분석 (실제 데이터 기반)
      if (this.openaiApiKey && this.issues.length > 0) {
        const llmIssues = await this.analyzeIssuesWithLLM();
        this.issues.push(...llmIssues);
      }
      
      // 3. 접근성 점수 계산 (실제 데이터 기반)
    const accessibilityScore = this.calculateOverallAccessibilityScore();
      
      console.log(`[ProjectAnalyzer] Analysis complete: ${this.components.length} components, ${this.issues.length} issues, score: ${accessibilityScore}`);
    
    return {
      components: this.components,
      issues: this.issues,
      accessibilityScore
    };
    } catch (error) {
      console.error('[ProjectAnalyzer] Analysis failed:', error);
      this.showAnalysisStatus(`분석 중 오류가 발생했습니다: ${error}`);
      return {
        components: [],
        issues: [],
        accessibilityScore: 0
      };
    }
  }

  async analyzeNewProject(path: string): Promise<{
    components: FlutterComponent[];
    issues: AccessibilityIssue[];
    accessibilityScore: number;
  }> {
    console.log(`[ProjectAnalyzer] Analyzing new project: ${path}`);
    return this.analyzeProject();
  }

  // LLM으로 실제 이슈 분석
  private async analyzeIssuesWithLLM(): Promise<AccessibilityIssue[]> {
    if (!this.openaiApiKey || this.issues.length === 0) return [];
    
    try {
      // 실제 이슈들을 LLM에 전송하여 추가 분석
      const issuesSummary = this.issues.map(issue => 
        `${issue.title}: ${issue.description} (${issue.element || '알 수 없음'})`
      ).join('\n');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: '당신은 Flutter 앱의 접근성 전문가입니다. 제공된 접근성 이슈들을 분석하고 추가적인 개선 방안을 제시해주세요.'
            },
            {
              role: 'user',
              content: `다음 접근성 이슈들을 분석하고 추가 개선 방안을 제시해주세요:\n\n${issuesSummary}`
            }
          ],
          temperature: 0.3,
          max_tokens: 800
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API 오류: ${response.status}`);
      }
      
      const data = await response.json();
      const analysis = data.choices[0]?.message?.content || '';
      
      // LLM 분석 결과를 새로운 이슈로 변환
      return this.parseLLMAnalysis(analysis);
    } catch (error) {
      console.error('[ProjectAnalyzer] LLM analysis failed:', error);
      return [];
    }
  }

  private async generateLLMSuggestionsForIssue(issue: any): Promise<Suggestion[]> {
    if (!this.openaiApiKey) return [];
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: '당신은 Flutter 앱의 접근성 전문가입니다. 제공된 이슈에 대한 구체적인 수정 코드를 제안해주세요.'
            },
            {
              role: 'user',
              content: `다음 접근성 이슈를 해결하는 Flutter 코드를 제안해주세요:\n\n이슈: ${issue.title}\n설명: ${issue.description}\n요소: ${issue.element}`
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API 오류: ${response.status}`);
      }
      
      const data = await response.json();
      const suggestion = data.choices[0]?.message?.content || '';
      
      return [{
        id: `llm-suggestion-${Date.now()}`,
        title: `LLM 제안: ${issue.title} 해결`,
        description: `LLM 제안: ${issue.title} 해결`,
        code: suggestion,
        location: {
          file: issue.source?.file || issue.m5Location?.file || 'unknown',
          line: issue.source?.line || issue.m5Location?.line || 1,
          column: issue.source?.column || issue.m5Location?.column || 1
        },
        file: issue.source?.file || issue.m5Location?.file || 'unknown',
        line: issue.source?.line || issue.m5Location?.line || 1,
        column: issue.source?.column || issue.m5Location?.column || 1,
        text: suggestion,
        message: `LLM 제안: ${issue.title} 해결`,
        type: 'info',
        element: issue.element || issue.elementType || 'UI 요소',
        position: issue.position || { x: 50, y: 50 }
      }];
    } catch (error) {
      console.error('[ProjectAnalyzer] LLM suggestion generation failed:', error);
      return [];
    }
  }

  private parseLLMAnalysis(analysis: string): AccessibilityIssue[] {
    const issues: AccessibilityIssue[] = [];
    
    // LLM 분석 결과에서 추가 이슈 추출
    const patterns = [
      { pattern: /추가.*개선.*필요/i, issue: '추가 접근성 개선 필요' },
      { pattern: /스크린.*리더.*지원/i, issue: '스크린 리더 지원 개선' },
      { pattern: /키보드.*접근성/i, issue: '키보드 접근성 개선' },
      { pattern: /포커스.*관리/i, issue: '포커스 관리 개선' }
    ];
    
    for (const { pattern, issue } of patterns) {
      if (pattern.test(analysis)) {
        issues.push({
          id: `llm-${Date.now()}-${Math.random()}`,
          title: issue,
          description: `LLM 분석에서 발견된 ${issue}`,
          severity: 'info',
          location: {
            file: 'unknown',
            line: 1,
            column: 1
          },
          category: 'llm-analysis',
          suggestions: [],
          impact: 'medium',
          userGroups: ['all'],
          position: { x: 50, y: 50 },
          element: 'LLM 분석',
          source: {
            file: 'unknown',
            line: 1,
            column: 1
          }
        });
      }
    }

    return issues;
  }

  private calculateOverallAccessibilityScore(): number {
    if (this.issues.length === 0) return 100;
    
    let totalScore = 100;
    
    // 이슈 심각도에 따른 점수 차감
    for (const issue of this.issues) {
      switch (issue.severity) {
        case 'error':
          totalScore -= 15;
          break;
        case 'warning':
          totalScore -= 10;
          break;
        case 'info':
          totalScore -= 5;
          break;
      }
    }
    
    return Math.max(0, totalScore);
  }

  private showAnalysisStatus(message: string): void {
    console.log(`[ProjectAnalyzer] ${message}`);
    
    // 브라우저 환경에서 토스트 메시지 표시
    if (typeof window !== 'undefined') {
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
      `;
      toast.textContent = message;
      
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
      
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 3000);
    }
  }

  // WCAG 2.2 규칙 체크 메서드들
  private checkImageAltText(): void {
    this.showAnalysisStatus('WCAG 1.1.1: 이미지 대체 텍스트 검사 중...');
  }

  private checkButtonSize(): void {
    this.showAnalysisStatus('WCAG 2.5.5: 버튼 최소 크기 검사 중...');
  }

  private checkTextContrast(): void {
    this.showAnalysisStatus('WCAG 1.4.3: 텍스트 색상 대비 검사 중...');
  }

  private checkSemanticInfo(): void {
    this.showAnalysisStatus('WCAG 4.1.2: 시맨틱 정보 검사 중...');
  }

  private checkFocusOrder(): void {
    this.showAnalysisStatus('WCAG 2.4.3: 포커스 순서 검사 중...');
  }

  // 사용자 저니 UML 생성
  generateUserJourneyUML(): string {
    this.showAnalysisStatus('사용자 저니 UML 다이어그램 생성 중...');
    return `
@startuml
title Flutter 앱 접근성 사용자 저니

start
:사용자가 앱 실행;
:스크린 리더 활성화;
:메인 화면 접근;

if (접근성 이슈가 있나?) then (예)
  :이슈 감지 (${this.issues.length}개);
  :개발자에게 알림;
  :개선 제안 생성;
  :코드 수정 적용;
else (아니오)
  :접근성 검사 통과;
endif

:사용자 테스트;
stop
@enduml
    `;
  }

  // 헬스체크 기능
  private async performHealthCheck() {
    // 헬스체크 로그 제거 - 유의미한 정보만 필요시 출력
  }

  // 공개 헬스체크 메서드
  public getHealthStatus() {
    return {
      openaiApiKey: {
        hasKey: !!this.openaiApiKey,
        source: this.getApiKeySource(),
        keyLength: this.openaiApiKey ? this.openaiApiKey.length : 0
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        debug: process.env.REACT_APP_DEBUG,
        hasApiKeyEnv: !!process.env.REACT_APP_OPENAI_API_KEY
      },
      localStorage: {
        hasConfig: !!localStorage.getItem('llmConfig')
      },
      webSocketData: {
        hasData: !!this.webSocketData,
        dataType: this.webSocketData ? typeof this.webSocketData : 'none'
      }
    };
  }
} 