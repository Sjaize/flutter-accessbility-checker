import { ChatMessage, LLMConfig, AccessibilityIssue } from '../lib/types';

export class ChatService {
  private config: LLMConfig | null = null;
  private chatHistory: ChatMessage[] = [];

  setConfig(config: LLMConfig): void {
    this.config = config;
    // 로컬 스토리지에 저장
    localStorage.setItem('llmConfig', JSON.stringify(config));
  }

  getConfig(): LLMConfig | null {
    if (!this.config) {
      const saved = localStorage.getItem('llmConfig');
      if (saved) {
        this.config = JSON.parse(saved);
      }
    }
    return this.config;
  }

  async generateResponse(
    message: string, 
    context: { issues: AccessibilityIssue[]; components: any[] }
  ): Promise<ChatMessage> {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    this.chatHistory.push(userMessage);

    try {
      if (!this.config?.apiKey) {
        // Mock 응답 (API 키가 없는 경우)
        return this.generateMockResponse(message, context);
      }

      // OpenAI API 호출
      const response = await this.callOpenAI(message, context);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        umlDiagram: response.umlDiagram
      };

      this.chatHistory.push(assistantMessage);
      return assistantMessage;

    } catch (error) {
      console.error('ChatService 오류:', error);
      
      // 오류 발생 시 Mock 응답
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `죄송합니다. 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}. Mock 응답을 제공합니다.`,
        timestamp: new Date()
      };

      this.chatHistory.push(errorMessage);
      return errorMessage;
    }
  }

  private async callOpenAI(
    message: string, 
    context: { issues: AccessibilityIssue[]; components: any[] }
  ): Promise<{ content: string; umlDiagram?: string }> {
    if (!this.config?.apiKey) {
      throw new Error('API 키가 설정되지 않았습니다.');
    }

    const systemPrompt = `당신은 Flutter 앱의 접근성 전문가입니다. 
다음 접근성 이슈들을 분석하고 개선 방안을 제시해주세요:

${context.issues.map(issue => 
  `- ${issue.type.toUpperCase()}: ${issue.title} (${issue.description})`
).join('\n')}

사용자의 질문에 대해 친근하고 실용적인 답변을 제공하고, 
필요한 경우 PlantUML 다이어그램을 생성해주세요.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: this.config.temperature,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API 오류: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '응답을 생성할 수 없습니다.';

    // PlantUML 다이어그램 추출
    const umlMatch = content.match(/@startuml[\s\S]*?@enduml/);
    const umlDiagram = umlMatch ? umlMatch[0] : undefined;

    return { content, umlDiagram };
  }

  private generateMockResponse(
    message: string, 
    context: { issues: AccessibilityIssue[]; components: any[] }
  ): ChatMessage {
    const mockResponses = {
      '이미지 대체 텍스트': `이미지 대체 텍스트는 시각 장애인을 위한 중요한 접근성 요소입니다.

**해결 방법:**
\`\`\`dart
Image.asset(
  'assets/image.png',
  semanticLabel: '구체적인 이미지 설명',
  // 또는
  alt: '대체 텍스트',
)
\`\`\`

**WCAG 2.2 기준 1.1.1 준수:**
- 모든 이미지에 의미있는 대체 텍스트 제공
- 장식용 이미지는 빈 문자열 또는 aria-hidden="true" 사용

현재 발견된 이슈: ${context.issues.filter(i => i.title.includes('이미지')).length}개`,

      '버튼 터치 영역': `버튼의 최소 터치 영역은 모바일 접근성의 핵심입니다.

**해결 방법:**
\`\`\`dart
Container(
  constraints: BoxConstraints(
    minWidth: 44.0,  // 최소 44dp
    minHeight: 44.0,
  ),
  child: ElevatedButton(
    onPressed: () {},
    child: Text('버튼'),
  ),
)
\`\`\`

**WCAG 2.2 기준 2.5.5 준수:**
- 터치 타겟 크기: 최소 44x44dp
- 터치 타겟 간격: 최소 8dp

현재 발견된 이슈: ${context.issues.filter(i => i.title.includes('버튼')).length}개`,

      '색상 대비': `색상 대비는 저시력 사용자를 위한 중요한 요소입니다.

**해결 방법:**
\`\`\`dart
Text(
  '텍스트',
  style: TextStyle(
    color: Colors.black87,  // 높은 대비 색상
    fontSize: 16.0,
  ),
)
\`\`\`

**WCAG 2.2 기준 1.4.3 준수:**
- 일반 텍스트: 4.5:1 이상
- 큰 텍스트: 3:1 이상

현재 발견된 이슈: ${context.issues.filter(i => i.title.includes('대비')).length}개`,

      'default': `Flutter 앱의 접근성을 개선하는 방법에 대해 질문해주세요!

**주요 접근성 체크 포인트:**
1. 이미지 대체 텍스트
2. 버튼 터치 영역
3. 색상 대비
4. 시맨틱 정보
5. 키보드 접근성

현재 발견된 총 이슈: ${context.issues.length}개
- 오류: ${context.issues.filter(i => i.type === 'error').length}개
- 경고: ${context.issues.filter(i => i.type === 'warning').length}개
- 정보: ${context.issues.filter(i => i.type === 'info').length}개`
    };

    let response = mockResponses.default;
    
    if (message.includes('이미지') || message.includes('대체 텍스트')) {
      response = mockResponses['이미지 대체 텍스트'];
    } else if (message.includes('버튼') || message.includes('터치')) {
      response = mockResponses['버튼 터치 영역'];
    } else if (message.includes('색상') || message.includes('대비')) {
      response = mockResponses['색상 대비'];
    }

    return {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date()
    };
  }

  getChatHistory(): ChatMessage[] {
    return this.chatHistory;
  }

  clearChatHistory(): void {
    this.chatHistory = [];
  }

  async generateAccessibilityResponse(): Promise<ChatMessage> {
    const message = "현재 Flutter 앱의 접근성 이슈를 분석하고 개선 방안을 제시해주세요.";
    const context = { issues: [], components: [] };
    return this.generateResponse(message, context);
  }
} 