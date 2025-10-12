// src/services/ai-service.ts
import * as vscode from 'vscode';
import { DartClass, UserJourney } from '../types/accessibility';

export interface AIModelConfig {
  type: 'openai' | 'ollama' | 'local';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens: number;
  temperature: number;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class AIService {
  private config: AIModelConfig;
  private outputChannel: vscode.OutputChannel;

  constructor(config: AIModelConfig, outputChannel: vscode.OutputChannel) {
    this.config = config;
    this.outputChannel = outputChannel;
  }

  async generateUserJourney(classes: DartClass[], persona: string): Promise<UserJourney> {
    const prompt = this.buildJourneyPrompt(classes, persona);
    
    try {
      const response = await this.callAI(prompt);
      return this.parseJourneyResponse(response.content, persona);
    } catch (error) {
      this.outputChannel.appendLine(`❌ AI 모델 호출 실패: ${error}`);
      throw error;
    }
  }

  async generateCodeSuggestion(issue: any, context: string): Promise<string> {
    const prompt = this.buildCodeSuggestionPrompt(issue, context);
    
    try {
      const response = await this.callAI(prompt);
      return this.extractCodeFromResponse(response.content);
    } catch (error) {
      this.outputChannel.appendLine(`❌ 코드 제안 생성 실패: ${error}`);
      throw error;
    }
  }

  // 새로운 메서드: 접근성 이슈에 대한 구체적인 설명 생성
  async generateAccessibilityDescription(issue: any, context: string): Promise<{
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
  }> {
    const prompt = this.buildAccessibilityDescriptionPrompt(issue, context);
    
    try {
      const response = await this.callAI(prompt);
      return this.parseAccessibilityDescription(response.content);
    } catch (error) {
      this.outputChannel.appendLine(`❌ 접근성 설명 생성 실패: ${error}`);
      // 기본값 반환
      return {
        suggestedLabel: `${issue.elementType} 상세한 설명`,
        impact: '시각장애인 사용자가 이 요소의 기능을 이해하기 어려울 수 있습니다.',
        userJourney: '스크린 리더가 이 요소를 읽을 때 명확한 설명이 필요합니다.',
        detailedDescription: '이 요소에 접근성 라벨을 추가하여 사용자가 기능을 이해할 수 있도록 개선해야 합니다.'
      };
    }
  }

  // 새로운 메서드: 아이콘에 대한 구체적인 설명 생성
  async generateIconDescription(iconContext: string, filePath: string, lineNumber: number): Promise<string> {
    const prompt = this.buildIconDescriptionPrompt(iconContext, filePath, lineNumber);
    
    try {
      const response = await this.callAI(prompt);
      return this.extractDescriptionFromResponse(response.content);
    } catch (error) {
      this.outputChannel.appendLine(`❌ 아이콘 설명 생성 실패: ${error}`);
      return '아이콘 기능 설명';
    }
  }

  // 새로운 메서드: 텍스트에 대한 구체적인 설명 생성
  async generateTextDescription(textContext: string, filePath: string, lineNumber: number): Promise<string> {
    const prompt = this.buildTextDescriptionPrompt(textContext, filePath, lineNumber);
    
    try {
      const response = await this.callAI(prompt);
      return this.extractDescriptionFromResponse(response.content);
    } catch (error) {
      this.outputChannel.appendLine(`❌ 텍스트 설명 생성 실패: ${error}`);
      return '텍스트 내용 설명';
    }
  }

  // 새로운 메서드: 버튼에 대한 구체적인 설명 생성
  async generateButtonDescription(buttonContext: string, filePath: string, lineNumber: number): Promise<string> {
    const prompt = this.buildButtonDescriptionPrompt(buttonContext, filePath, lineNumber);
    
    try {
      const response = await this.callAI(prompt);
      return this.extractDescriptionFromResponse(response.content);
    } catch (error) {
      this.outputChannel.appendLine(`❌ 버튼 설명 생성 실패: ${error}`);
      return '버튼 기능 설명';
    }
  }

  // 새로운 메서드: 이미지에 대한 구체적인 설명 생성
  async generateImageDescription(imageContext: string, filePath: string, lineNumber: number): Promise<string> {
    const prompt = this.buildImageDescriptionPrompt(imageContext, filePath, lineNumber);
    
    try {
      const response = await this.callAI(prompt);
      return this.extractDescriptionFromResponse(response.content);
    } catch (error) {
      this.outputChannel.appendLine(`❌ 이미지 설명 생성 실패: ${error}`);
      return '이미지 설명';
    }
  }

  // 새로운 메서드: 입력 필드에 대한 구체적인 설명 생성
  async generateInputDescription(inputContext: string, filePath: string, lineNumber: number): Promise<{
    hasHintText: boolean;
    hintText?: string;
    actualLabel: string;
    accessibilityType: 'hint_only' | 'label_only' | 'both' | 'neither';
    suggestedCode: string;
  }> {
    const prompt = this.buildInputDescriptionPrompt(inputContext, filePath, lineNumber);
    
    try {
      const response = await this.callAI(prompt);
      return this.parseInputDescriptionResponse(response.content);
    } catch (error) {
      this.outputChannel.appendLine(`❌ 입력 필드 설명 생성 실패: ${error}`);
      return {
        hasHintText: false,
        actualLabel: '입력 필드 목적',
        accessibilityType: 'neither',
        suggestedCode: 'Semantics(label: "입력 필드 목적", child: TextField())'
      };
    }
  }

  // 새로운 메서드: 리스트에 대한 구체적인 설명 생성
  async generateListDescription(listContext: string, filePath: string, lineNumber: number): Promise<string> {
    const prompt = this.buildListDescriptionPrompt(listContext, filePath, lineNumber);
    
    try {
      const response = await this.callAI(prompt);
      return this.extractDescriptionFromResponse(response.content);
    } catch (error) {
      this.outputChannel.appendLine(`❌ 리스트 설명 생성 실패: ${error}`);
      return '리스트 아이템 내용';
    }
  }

  private async callAI(prompt: string): Promise<AIResponse> {
    switch (this.config.type) {
      case 'openai':
        return this.callOpenAI(prompt);
      case 'ollama':
        return this.callOllama(prompt);
      case 'local':
        return this.callLocalModel(prompt);
      default:
        throw new Error(`지원하지 않는 AI 모델 타입: ${this.config.type}`);
    }
  }

  private async callOpenAI(prompt: string): Promise<AIResponse> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: '당신은 Flutter 접근성 전문가입니다. 접근성 개선을 위한 구체적이고 실용적인 제안을 제공해주세요. 한국어로 응답해주세요.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API 오류: ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage
    };
  }

  private async callOllama(prompt: string): Promise<AIResponse> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API 오류: ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.response
    };
  }

  private async callLocalModel(prompt: string): Promise<AIResponse> {
    // 로컬 모델 호출 구현 (예: Transformers.js, ONNX Runtime 등)
    // 현재는 기본 구현만 제공
    throw new Error('로컬 모델 호출은 아직 구현되지 않았습니다.');
  }

  private buildJourneyPrompt(classes: DartClass[], persona: string): string {
    const widgetTypes = classes.flatMap(cls => cls.widgets.map(w => w.name));
    const uniqueWidgets = [...new Set(widgetTypes)];
    
    return `
다음 Flutter 앱을 ${persona} 관점에서 분석해주세요:

발견된 위젯들: ${uniqueWidgets.join(', ')}

${persona}가 이 앱을 사용할 때 겪을 수 있는 접근성 문제와 개선 방안을 JSON 형태로 응답해주세요:

{
  "persona": "${persona}",
  "steps": [
    {
      "action": "사용자 행동",
      "target": "대상 요소", 
      "expected": "기대 결과",
      "actual": "실제 결과",
      "issues": ["발견된 문제들"]
    }
  ],
  "issues": ["전체적인 접근성 문제들"]
}
`;
  }

  private buildCodeSuggestionPrompt(issue: any, context: string): string {
    return `
다음 접근성 이슈를 해결하기 위한 Flutter 코드를 제안해주세요:

이슈: ${issue.description}
파일: ${issue.file}
라인: ${issue.line}
요소 타입: ${issue.elementType}

현재 코드 컨텍스트:
${context}

개선된 코드를 제안해주세요. Semantics 위젯이나 적절한 접근성 속성을 사용하여 해결해주세요.
`;
  }

  private buildAccessibilityDescriptionPrompt(issue: any, context: string): string {
    return `
다음 Flutter 접근성 이슈에 대한 구체적인 설명을 생성해주세요:

이슈 정보:
- 요소 타입: ${issue.elementType}
- 파일: ${issue.file}
- 라인: ${issue.line}
- 설명: ${issue.description}

코드 컨텍스트:
${context}

다음 JSON 형태로 응답해주세요:

{
  "suggestedLabel": "구체적이고 명확한 접근성 라벨 (예: '장바구니에 추가 버튼', '좋아요 아이콘')",
  "impact": "이 접근성 이슈가 시각장애인 사용자에게 미치는 구체적인 영향",
  "userJourney": "사용자 경험 관점에서의 개선 방향",
  "detailedDescription": "이 이슈를 해결하는 방법에 대한 상세한 설명"
}

모든 내용은 한국어로 작성하고, 구체적이고 실용적인 내용으로 작성해주세요.
`;
  }

  private buildIconDescriptionPrompt(iconContext: string, filePath: string, lineNumber: number): string {
    return `
다음 Flutter 아이콘에 대한 구체적인 접근성 설명을 생성해주세요:

파일: ${filePath}
라인: ${lineNumber}
코드 컨텍스트:
${iconContext}

이 아이콘이 어떤 기능을 나타내는지 구체적으로 설명해주세요. 
예시: "좋아요 버튼", "장바구니 아이콘", "뒤로가기 버튼" 등

한국어로 간결하고 명확하게 응답해주세요.
`;
  }

  private buildTextDescriptionPrompt(textContext: string, filePath: string, lineNumber: number): string {
    return `
다음 Flutter 텍스트에 대한 구체적인 접근성 설명을 생성해주세요:

파일: ${filePath}
라인: ${lineNumber}
코드 컨텍스트:
${textContext}

이 텍스트가 어떤 내용을 나타내는지 구체적으로 설명해주세요.
예시: "메뉴 가격 표시", "주문 상태 안내", "사용자 이름 표시" 등

한국어로 간결하고 명확하게 응답해주세요.
`;
  }

  private buildButtonDescriptionPrompt(buttonContext: string, filePath: string, lineNumber: number): string {
    return `
다음 Flutter 버튼에 대한 구체적인 접근성 설명을 생성해주세요:

파일: ${filePath}
라인: ${lineNumber}
코드 컨텍스트:
${buttonContext}

이 버튼이 어떤 기능을 나타내는지 구체적으로 설명해주세요. 
예시: "로그인 버튼", "검색 버튼", "취소 버튼" 등

한국어로 간결하고 명확하게 응답해주세요.
`;
  }

  private buildImageDescriptionPrompt(imageContext: string, filePath: string, lineNumber: number): string {
    return `
다음 Flutter 이미지에 대한 구체적인 접근성 설명을 생성해주세요:

파일: ${filePath}
라인: ${lineNumber}
코드 컨텍스트:
${imageContext}

이 이미지가 어떤 내용을 나타내는지 구체적으로 설명해주세요. 
예시: "로고 이미지", "사용자 프로필 이미지", "카테고리 아이콘" 등

한국어로 간결하고 명확하게 응답해주세요.
`;
  }

  private buildInputDescriptionPrompt(inputContext: string, filePath: string, lineNumber: number): string {
    return `
다음 Flutter 입력 필드에 대한 구체적인 접근성 분석을 수행해주세요:

파일: ${filePath}
라인: ${lineNumber}
코드 컨텍스트:
${inputContext}

다음 JSON 형태로 응답해주세요:

{
  "hasHintText": true/false,
  "hintText": "hintText 속성에 있는 텍스트 (있다면)",
  "actualLabel": "입력 필드의 실제 목적/라벨",
  "accessibilityType": "hint_only" | "label_only" | "both" | "neither",
  "suggestedCode": "개선된 접근성 코드"
}

분석 기준:
1. hintText가 있는 경우: 일시적인 안내 텍스트로, hint 속성으로 처리
2. 실제 라벨이 필요한 경우: 영구적인 식별자로, label 속성으로 처리
3. 둘 다 있는 경우: hint와 label을 모두 포함
4. 둘 다 없는 경우: 적절한 라벨 생성

코드 제안 예시:
- hintText만 있는 경우: Semantics(hint: "hintText 내용", child: TextField(...))
- 라벨만 필요한 경우: Semantics(label: "실제 라벨", child: TextField(...))
- 둘 다 있는 경우: Semantics(label: "실제 라벨", hint: "hintText 내용", child: TextField(...))

한국어로 응답해주세요.
`;
  }

  private buildListDescriptionPrompt(listContext: string, filePath: string, lineNumber: number): string {
    return `
다음 Flutter 리스트에 대한 구체적인 접근성 설명을 생성해주세요:

파일: ${filePath}
라인: ${lineNumber}
코드 컨텍스트:
${listContext}

이 리스트가 어떤 내용을 나타내는지 구체적으로 설명해주세요. 
예시: "카테고리 목록", "최근 본 상품 목록", "주문 내역 목록" 등

한국어로 간결하고 명확하게 응답해주세요.
`;
  }

  private parseJourneyResponse(content: string, persona: string): UserJourney {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          id: `journey_${Date.now()}_${Math.random()}`,
          persona: parsed.persona || persona,
          steps: parsed.steps || [],
          issues: parsed.issues || [],
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      this.outputChannel.appendLine(`⚠️ JSON 파싱 실패, 기본 구조 사용: ${error}`);
    }

    // 기본 구조 반환
    return {
      id: `journey_${Date.now()}_${Math.random()}`,
      persona: persona,
      steps: [],
      issues: [],
      timestamp: new Date().toISOString()
    };
  }

  private parseAccessibilityDescription(content: string): {
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          suggestedLabel: parsed.suggestedLabel || '접근성 라벨',
          impact: parsed.impact || '시각장애인 사용자에게 영향을 미칠 수 있습니다.',
          userJourney: parsed.userJourney || '사용자 경험 개선이 필요합니다.',
          detailedDescription: parsed.detailedDescription || '접근성 개선이 필요합니다.'
        };
      }
    } catch (error) {
      this.outputChannel.appendLine(`⚠️ 접근성 설명 JSON 파싱 실패: ${error}`);
    }

    // 기본값 반환
    return {
      suggestedLabel: '접근성 라벨',
      impact: '시각장애인 사용자에게 영향을 미칠 수 있습니다.',
      userJourney: '사용자 경험 개선이 필요합니다.',
      detailedDescription: '접근성 개선이 필요합니다.'
    };
  }

  private extractCodeFromResponse(content: string): string {
    // 코드 블록 추출
    const codeMatch = content.match(/```dart\n([\s\S]*?)\n```/);
    if (codeMatch) {
      return codeMatch[1];
    }

    // 백틱으로 감싸진 코드 추출
    const backtickMatch = content.match(/`([^`]+)`/);
    if (backtickMatch) {
      return backtickMatch[1];
    }

    return content;
  }

  private extractDescriptionFromResponse(content: string): string {
    // 따옴표로 감싸진 내용 추출
    const quoteMatch = content.match(/"([^"]+)"/);
    if (quoteMatch) {
      return quoteMatch[1];
    }

    // 첫 번째 줄 반환 (줄바꿈 제거)
    return content.split('\n')[0].trim();
  }

  private parseInputDescriptionResponse(content: string): {
    hasHintText: boolean;
    hintText?: string;
    actualLabel: string;
    accessibilityType: 'hint_only' | 'label_only' | 'both' | 'neither';
    suggestedCode: string;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          hasHintText: parsed.hasHintText || false,
          hintText: parsed.hintText,
          actualLabel: parsed.actualLabel || '입력 필드 목적',
          accessibilityType: parsed.accessibilityType || 'neither',
          suggestedCode: parsed.suggestedCode || 'Semantics(label: "입력 필드 목적", child: TextField())'
        };
      }
    } catch (error) {
      this.outputChannel.appendLine(`⚠️ 입력 필드 설명 JSON 파싱 실패: ${error}`);
    }

    // 기본값 반환
    return {
      hasHintText: false,
      actualLabel: '입력 필드 목적',
      accessibilityType: 'neither',
      suggestedCode: 'Semantics(label: "입력 필드 목적", child: TextField())'
    };
  }
}
