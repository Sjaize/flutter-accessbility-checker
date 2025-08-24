import { ChatMessage, AccessibilityIssue, Suggestion } from '../lib/types';

export class ChatService {
  private messages: ChatMessage[] = [];
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  checkApiConnection(): boolean {
    return !!this.apiKey;
  }

  async sendMessage(content: string, context?: any): Promise<ChatMessage> {
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    this.messages.push(userMessage);

    // 실제 AI API 호출 대신 시뮬레이션된 응답
    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: await this.generateResponse(content, context),
      timestamp: new Date()
    };

    this.messages.push(assistantMessage);
    return assistantMessage;
  }

  async generateResponse(userMessage: string, context?: any): Promise<string> {
    // OpenAI API가 설정된 경우 실제 API 호출
    if (this.apiKey) {
      try {
        return await this.callAIAPI(userMessage, context);
      } catch (error) {
        console.error('OpenAI API 호출 실패:', error);
        // API 호출 실패 시 기본 응답으로 폴백
      }
    }
    
    // 기본 키워드 기반 응답 (API 키가 없거나 실패한 경우)
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('접근성') || lowerMessage.includes('accessibility')) {
      return 'Flutter 앱의 접근성을 개선하기 위해서는 다음과 같은 사항들을 고려해야 합니다:\n\n' +
             '1. **시맨틱 레이블**: 모든 위젯에 적절한 시맨틱 레이블을 추가하세요.\n' +
             '2. **색상 대비**: 충분한 색상 대비를 확보하세요 (최소 4.5:1).\n' +
             '3. **키보드 네비게이션**: 모든 상호작용 요소가 키보드로 접근 가능한지 확인하세요.\n' +
             '4. **스크린 리더 지원**: TalkBack(VoiceOver)과 같은 스크린 리더를 테스트하세요.\n' +
             '5. **터치 타겟 크기**: 최소 48x48dp의 터치 타겟을 제공하세요.';
    }
    
    if (lowerMessage.includes('오류') || lowerMessage.includes('error')) {
      return '발견된 접근성 오류들을 해결하기 위한 단계별 가이드:\n\n' +
             '1. **우선순위 설정**: 높은 심각도의 오류부터 해결하세요.\n' +
             '2. **코드 수정**: 제안된 코드 예시를 참고하여 수정하세요.\n' +
             '3. **테스트**: 수정 후 실제 기기에서 접근성 기능을 테스트하세요.\n' +
             '4. **재분석**: 수정 완료 후 다시 분석을 실행하여 개선사항을 확인하세요.';
    }
    
    if (lowerMessage.includes('wcag') || lowerMessage.includes('가이드라인')) {
      return 'WCAG (Web Content Accessibility Guidelines) 2.1 가이드라인:\n\n' +
             '**수준 A (기본)**\n' +
             '- 모든 이미지에 대체 텍스트 제공\n' +
             '- 색상만으로 정보를 전달하지 않기\n' +
             '- 키보드로 모든 기능 접근 가능\n\n' +
             '**수준 AA (권장)**\n' +
             '- 충분한 색상 대비 (4.5:1)\n' +
             '- 텍스트 크기 조정 가능 (최대 200%)\n' +
             '- 일관된 네비게이션 구조\n\n' +
             '**수준 AAA (고급)**\n' +
             '- 매우 높은 색상 대비 (7:1)\n' +
             '- 모든 기능이 키보드로만 사용 가능';
    }
    
    if (lowerMessage.includes('테스트') || lowerMessage.includes('test')) {
      return 'Flutter 앱의 접근성 테스트 방법:\n\n' +
             '1. **시뮬레이터 테스트**:\n' +
             '   - iOS: VoiceOver 활성화\n' +
             '   - Android: TalkBack 활성화\n\n' +
             '2. **실제 기기 테스트**:\n' +
             '   - 다양한 접근성 도구 사용\n' +
             '   - 실제 사용자와의 테스트\n\n' +
             '3. **자동화 테스트**:\n' +
             '   - Flutter의 접근성 테스트 위젯 사용\n' +
             '   - CI/CD 파이프라인에 접근성 검사 포함';
    }

    return '안녕하세요! Flutter 접근성 분석 도구입니다. 다음과 같은 질문을 할 수 있습니다:\n\n' +
           '• "접근성 개선 방법 알려줘"\n' +
           '• "발견된 오류 해결 방법"\n' +
           '• "WCAG 가이드라인 설명"\n' +
           '• "접근성 테스트 방법"\n\n' +
           '어떤 도움이 필요하신가요?';
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 실제 AI API 연동을 위한 메서드
  private async callAIAPI(message: string, context?: any): Promise<string> {
    if (!this.apiKey) {
      throw new Error('API 키가 설정되지 않았습니다.');
    }

    try {
      // 컨텍스트 정보를 포함한 시스템 메시지 구성
      const systemMessage = `당신은 Flutter 앱의 접근성 전문가입니다. 
현재 분석 중인 이슈들: ${context?.issues?.length || 0}개
사용자 저니: ${context?.userJourney || '정보 없음'}

다음 원칙을 따라 답변해주세요:
1. Flutter 접근성 모범 사례를 제시
2. WCAG 가이드라인 준수 방안 제안
3. 구체적인 코드 예시 제공
4. 한국어로 답변`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: message }
          ],
          max_tokens: 1000,
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API 오류: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '응답을 생성할 수 없습니다.';
    } catch (error) {
      console.error('OpenAI API 호출 실패:', error);
      throw error;
    }
  }
}
