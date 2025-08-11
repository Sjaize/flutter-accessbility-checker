interface LLMConfig {
  model: 'gpt-4' | 'claude-3' | 'gemini-pro';
  apiKey: string;
  provider: 'openai' | 'anthropic' | 'google';
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  highlightedElement?: string;
  pumlHighlight?: string;
  codeSuggestion?: string;
  fileReference?: string;
}

interface FlutterComponent {
  name: string;
  file: string;
  line: number;
  type: 'widget' | 'screen' | 'service' | 'model' | 'util';
  accessibilityScore: number;
  issues: string[];
  content?: string;
  dependencies?: string[];
  methods?: string[];
  properties?: string[];
}

interface AnalysisContext {
  projectStructure: string;
  components: FlutterComponent[];
  currentFocus: string;
  chatHistory: ChatMessage[];
  wcagVersion: '2.2';
  projectPath: string;
  dartFiles: string[];
}

export class ChatService {
  private config: LLMConfig | null = null;
  private context: AnalysisContext;
  private memory: Map<string, any> = new Map();

  constructor() {
    this.context = {
      projectStructure: '',
      components: [],
      currentFocus: '',
      chatHistory: [],
      wcagVersion: '2.2',
      projectPath: '',
      dartFiles: []
    };
  }

  setConfig(config: LLMConfig) {
    this.config = config;
  }

  async analyzeFlutterProject(projectPath: string): Promise<void> {
    this.context.projectPath = projectPath;
    this.context.projectStructure = await this.scanProjectStructure(projectPath);
    this.context.components = await this.extractComponents(projectPath);
    this.context.dartFiles = await this.findDartFiles(projectPath);
  }

  private async scanProjectStructure(projectPath: string): Promise<string> {
    try {
      const response = await fetch('/api/project-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath })
      });

      if (response.ok) {
        const data = await response.json();
        return data.tree;
      }
    } catch (error) {
      console.warn('프로젝트 구조 스캔 실패:', error);
    }

    // Fallback 구조
    return `
lib/
├── main.dart
├── screens/
│   ├── home_screen.dart
│   ├── onboarding_screen.dart
│   └── settings_screen.dart
├── widgets/
│   ├── custom_button.dart
│   └── accessibility_wrapper.dart
└── services/
    └── auth_service.dart
    `;
  }

  private async extractComponents(projectPath: string): Promise<FlutterComponent[]> {
    try {
      const response = await fetch('/api/analyze-dart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath })
      });

      if (response.ok) {
        const data = await response.json();
        return data.components;
      }
    } catch (error) {
      console.warn('Dart 컴포넌트 분석 실패:', error);
    }

    // Fallback 컴포넌트들
    return [
      {
        name: 'HomeScreen',
        file: 'lib/screens/home_screen.dart',
        line: 1,
        type: 'screen',
        accessibilityScore: 75,
        issues: ['버튼 터치 영역 부족', '색상 대비 개선 필요'],
        content: 'class HomeScreen extends StatelessWidget { ... }',
        methods: ['build', '_handleButtonPress', '_checkAccessibility'],
        properties: ['title', 'theme']
      },
      {
        name: 'CustomButton',
        file: 'lib/widgets/custom_button.dart',
        line: 15,
        type: 'widget',
        accessibilityScore: 60,
        issues: ['Semantics 래퍼 누락'],
        content: 'class CustomButton extends StatelessWidget { ... }',
        methods: ['build', '_onPressed'],
        properties: ['text', 'onPressed', 'style']
      }
    ];
  }

  private async findDartFiles(projectPath: string): Promise<string[]> {
    try {
      const response = await fetch('/api/dart-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath })
      });

      if (response.ok) {
        const data = await response.json();
        return data.files;
      }
    } catch (error) {
      console.warn('Dart 파일 검색 실패:', error);
    }

    return [
      'lib/main.dart',
      'lib/screens/home_screen.dart',
      'lib/screens/onboarding_screen.dart',
      'lib/widgets/custom_button.dart'
    ];
  }

  async readFileContent(filePath: string): Promise<string> {
    try {
      const response = await fetch('/api/file-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          path: this.context.projectPath,
          file: filePath 
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.content;
      }
    } catch (error) {
      console.warn('파일 내용 읽기 실패:', error);
    }

    return '// 파일 내용을 읽을 수 없습니다.';
  }

  async sendMessage(message: string): Promise<{
    content: string;
    highlightedElement?: string;
    pumlHighlight?: string;
    suggestions?: string[];
    codeSuggestion?: string;
    fileReference?: string;
  }> {
    if (!this.config) {
      throw new Error('LLM 설정이 필요합니다.');
    }

    // 파일 참조가 있는지 확인
    const fileMatch = message.match(/`([^`]+\.dart)`/);
    if (fileMatch) {
      const filePath = fileMatch[1];
      const fileContent = await this.readFileContent(filePath);
      this.context.currentFocus = filePath;
      
      // 파일 내용을 컨텍스트에 추가
      this.memory.set('currentFile', {
        path: filePath,
        content: fileContent
      });
    }

    const prompt = this.buildPrompt(message);
    const response = await this.callLLM(prompt);
    
    // 응답 검수 및 파싱
    const parsedResponse = this.parseResponse(response);
    
    // 메모리에 저장
    this.memory.set(`response_${Date.now()}`, {
      message,
      response: parsedResponse,
      timestamp: new Date()
    });

    return parsedResponse;
  }

  private buildPrompt(userMessage: string): string {
    const currentFile = this.memory.get('currentFile');
    const fileContext = currentFile ? `
현재 분석 중인 파일: ${currentFile.path}
파일 내용:
\`\`\`dart
${currentFile.content}
\`\`\`
` : '';

    const systemPrompt = `당신은 Flutter 앱의 접근성 전문가입니다. WCAG 2.2 기준에 따라 분석하고 개선 방안을 제시합니다.

현재 프로젝트 구조:
${this.context.projectStructure}

발견된 컴포넌트들:
${this.context.components.map(c => 
  `- ${c.name} (${c.file}:${c.line}): 점수 ${c.accessibilityScore}/100, 이슈: ${c.issues.join(', ')}`
).join('\n')}

${fileContext}

이전 대화 기록:
${this.context.chatHistory.slice(-5).map(msg => 
  `${msg.type === 'user' ? '사용자' : 'AI'}: ${msg.content}`
).join('\n')}

분석 규칙:
1. WCAG 2.2 기준 준수
2. 구체적인 파일명과 라인 번호 제시
3. 수정 가능한 코드 예시 제공
4. 우선순위 기반 개선 제안
5. 한국어로 응답
6. Flutter 위젯의 접근성 특성 고려
7. Semantics, ExcludeSemantics, MergeSemantics 등 접근성 위젯 활용

사용자 메시지: ${userMessage}

응답 형식:
{
  "content": "분석 결과 및 제안사항",
  "highlightedElement": "파일명:라인번호",
  "pumlHighlight": "PlantUML에서 하이라이트할 플로우",
  "suggestions": ["구체적인 수정 제안들"],
  "codeSuggestion": "수정된 코드 예시",
  "fileReference": "관련 파일명"
}`;

    return systemPrompt;
  }

  private async callLLM(prompt: string): Promise<string> {
    switch (this.config!.provider) {
      case 'openai':
        return this.callOpenAI(prompt);
      case 'anthropic':
        return this.callClaude(prompt);
      case 'google':
        return this.callGemini(prompt);
      default:
        throw new Error('지원하지 않는 LLM 제공자입니다.');
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config!.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: '당신은 Flutter 접근성 전문가입니다.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      throw new Error('OpenAI API 호출 실패');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config!.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error('Claude API 호출 실패');
    }

    const data = await response.json();
    return data.content[0].text;
  }

  private async callGemini(prompt: string): Promise<string> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.config!.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      throw new Error('Gemini API 호출 실패');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  private parseResponse(response: string): {
    content: string;
    highlightedElement?: string;
    pumlHighlight?: string;
    suggestions?: string[];
    codeSuggestion?: string;
    fileReference?: string;
  } {
    try {
      // JSON 응답 파싱 시도
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // JSON 파싱 실패 시 텍스트 분석
    }

    // 텍스트 기반 파싱
    const fileMatch = response.match(/`([^`]+):(\d+)`/);
    const highlightedElement = fileMatch ? `${fileMatch[1]}:${fileMatch[2]}` : undefined;

    const codeMatch = response.match(/```dart\s*([\s\S]*?)```/);
    const codeSuggestion = codeMatch ? codeMatch[1].trim() : undefined;

    return {
      content: response,
      highlightedElement,
      pumlHighlight: this.extractPumlHighlight(response),
      codeSuggestion
    };
  }

  private extractPumlHighlight(response: string): string | undefined {
    const flowKeywords = ['온보딩', '로그인', '메인', '설정', '버튼', '이미지', '접근성'];
    for (const keyword of flowKeywords) {
      if (response.includes(keyword)) {
        return keyword;
      }
    }
    return undefined;
  }

  // 메모리 관리
  getMemory(key: string): any {
    return this.memory.get(key);
  }

  setMemory(key: string, value: any): void {
    this.memory.set(key, value);
  }

  clearMemory(): void {
    this.memory.clear();
  }

  // 컨텍스트 업데이트
  updateContext(updates: Partial<AnalysisContext>): void {
    this.context = { ...this.context, ...updates };
  }

  getContext(): AnalysisContext {
    return this.context;
  }

  // 컴포넌트 분석 메서드들
  async analyzeComponent(componentName: string): Promise<FlutterComponent | null> {
    const component = this.context.components.find(c => c.name === componentName);
    if (!component) return null;

    // 실제 파일 내용 읽기
    const content = await this.readFileContent(component.file);
    return {
      ...component,
      content
    };
  }

  async generateUMLDiagram(type: 'user-journey' | 'class' | 'sequence' | 'activity'): Promise<string> {
    const basePuml = `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12

title Flutter App ${type.charAt(0).toUpperCase() + type.slice(1)} Diagram

`;

    switch (type) {
      case 'user-journey':
        return basePuml + this.generateUserJourneyPuml();
      case 'class':
        return basePuml + this.generateClassDiagramPuml();
      case 'sequence':
        return basePuml + this.generateSequenceDiagramPuml();
      case 'activity':
        return basePuml + this.generateActivityDiagramPuml();
      default:
        return basePuml;
    }
  }

  private generateUserJourneyPuml(): string {
    return `
start
:사용자 앱 실행;
:온보딩 화면 표시;

if (첫 방문?) then (yes)
  :온보딩 가이드 표시;
  :"지금 시작하기" 버튼;
else (no)
  :메인 화면으로 이동;
endif

:메인 화면 로드;
:홈 화면 표시;

if (접근성 이슈 감지) then (있음)
  :접근성 경고 표시;
  :수정 제안 표시;
else (없음)
  :정상 화면 표시;
endif

stop
@enduml`;
  }

  private generateClassDiagramPuml(): string {
    const classDefinitions = this.context.components.map(comp => `
class ${comp.name} {
  +build(BuildContext context): Widget
  +_handleAccessibility(): void
}`).join('\n');

    const relationships = this.context.components
      .filter(c => c.type === 'screen')
      .map(screen => 
        this.context.components
          .filter(c => c.type === 'widget')
          .map(widget => `${screen.name} --> ${widget.name}`)
          .join('\n')
      ).join('\n');

    return classDefinitions + '\n' + relationships + '\n@enduml';
  }

  private generateSequenceDiagramPuml(): string {
    return `
actor User
participant "HomeScreen" as HS
participant "CustomButton" as CB
participant "AuthService" as AS

User -> HS: 앱 실행
HS -> HS: 화면 초기화
HS -> CB: 버튼 렌더링
User -> CB: 버튼 클릭
CB -> HS: 이벤트 전달
HS -> AS: 인증 확인
AS -> HS: 인증 결과
HS -> User: 화면 업데이트
@enduml`;
  }

  private generateActivityDiagramPuml(): string {
    return `
start
:앱 시작;
:메인 화면 로드;

if (사용자 인증됨?) then (yes)
  :홈 화면 표시;
else (no)
  :로그인 화면 표시;
  :사용자 로그인;
endif

:화면 상호작용;
if (접근성 검사) then (이슈 발견)
  :경고 표시;
  :수정 제안;
else (정상)
  :정상 동작;
endif

stop
@enduml`;
  }
} 