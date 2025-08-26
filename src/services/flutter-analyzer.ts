// src/services/flutter-analyzer.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DartClass, DartWidget, AccessibilityIssue, ProjectAnalysis, UserJourney, JourneyStep } from '../types/accessibility';

export class FlutterAnalyzer {
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;
  private openaiApiKey1: string;
  private openaiApiKey2: string;
  private currentKeyIndex: number = 0;

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
    
    // 환경 변수에서 API 키 로드
    this.openaiApiKey1 = process.env.OPENAI_API_KEY || '';
    this.openaiApiKey2 = process.env.OPENAI_API_KEY2 || '';
    
    if (!this.openaiApiKey1 && !this.openaiApiKey2) {
      this.log('⚠️ OpenAI API 키가 설정되지 않았습니다. env.example 파일을 참고하여 .env 파일을 생성하세요.');
    }
  }

  async analyzeProject(personaCount: number = 3): Promise<ProjectAnalysis> {
    this.log('🔍 Flutter 프로젝트 분석 시작...');
    
    try {
      // 1. Dart 파일들 찾기
      const dartFiles = await this.findDartFiles();
      this.log(`📁 발견된 Dart 파일: ${dartFiles.length}개`);

      // 2. 클래스와 위젯 분석
      const classes: DartClass[] = [];
      for (const file of dartFiles) {
        const fileClasses = await this.analyzeDartFile(file);
        classes.push(...fileClasses);
      }

      // 3. 접근성 이슈 분석
      const accessibilityIssues = await this.analyzeAccessibilityIssues(classes);

      // 4. 사용자 저니 생성 (실제 LLM 사용)
      const userJourneys = await this.generateUserJourneys(classes, personaCount);

      // 5. 프로젝트 분석 결과 생성
      const analysis: ProjectAnalysis = {
        projectName: path.basename(this.workspaceRoot),
        totalFiles: dartFiles.length,
        totalClasses: classes.length,
        totalWidgets: classes.reduce((sum, cls) => sum + cls.widgets.length, 0),
        accessibilityIssues,
        userJourneys,
        analysisDate: new Date().toISOString()
      };

      await this.saveAnalysisToJson(analysis);
      
      this.log('✅ 프로젝트 분석 완료');
      return analysis;

    } catch (error) {
      this.log(`❌ 분석 중 오류 발생: ${error}`);
      throw error;
    }
  }

  private async findDartFiles(): Promise<string[]> {
    const dartFiles: string[] = [];
    
    const findFiles = async (dir: string) => {
      try {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
        
        for (const [name, type] of entries) {
          const fullPath = path.join(dir, name);
          
          if (type === vscode.FileType.Directory) {
            // lib 폴더만 분석
            if (name === 'lib' || dir.includes('lib')) {
              await findFiles(fullPath);
            }
          } else if (name.endsWith('.dart')) {
            dartFiles.push(fullPath);
          }
        }
      } catch (error) {
        this.log(`⚠️ 디렉토리 읽기 실패: ${dir}`);
      }
    };

    await findFiles(this.workspaceRoot);
    return dartFiles;
  }

  private async analyzeDartFile(filePath: string): Promise<DartClass[]> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      const code = content.toString();
      const classes: DartClass[] = [];

      // 클래스 정의 찾기
      const classRegex = /class\s+(\w+)\s+extends\s+(StatefulWidget|StatelessWidget)/g;
      let match;

      while ((match = classRegex.exec(code)) !== null) {
        const className = match[1];
        const classLine = this.getLineNumber(code, match.index);
        
        const classInfo: DartClass = {
          name: className,
          file: path.relative(this.workspaceRoot, filePath),
          line: classLine,
          methods: await this.extractMethods(code, classLine),
          widgets: await this.extractWidgets(code, classLine)
        };

        classes.push(classInfo);
      }

      return classes;
    } catch (error) {
      this.log(`❌ 파일 분석 실패: ${filePath}`);
      return [];
    }
  }

  private async extractMethods(code: string, classStartLine: number): Promise<any[]> {
    const methods: any[] = [];
    
    // 메서드 정의 찾기
    const methodRegex = /(\w+)\s+(\w+)\s*\([^)]*\)\s*\{/g;
    let match;

    while ((match = methodRegex.exec(code)) !== null) {
      const methodLine = this.getLineNumber(code, match.index);
      if (methodLine >= classStartLine) {
        methods.push({
          name: match[2],
          line: methodLine,
          column: match.index - code.lastIndexOf('\n', match.index),
          returnType: match[1],
          parameters: []
        });
      }
    }

    return methods;
  }

  private async extractWidgets(code: string, classStartLine: number): Promise<DartWidget[]> {
    const widgets: DartWidget[] = [];
    
    // 위젯 패턴들
    const widgetPatterns = [
      { type: 'Text', regex: /Text\s*\(\s*['"`]([^'"`]+)['"`]/g },
      { type: 'Image', regex: /Image\.(?:network|asset)\s*\(/g },
      { type: 'Button', regex: /(?:ElevatedButton|TextButton|IconButton)\s*\(/g },
      { type: 'Icon', regex: /Icon\s*\(\s*Icons\./g }
    ];

    for (const pattern of widgetPatterns) {
      let match;
      while ((match = pattern.regex.exec(code)) !== null) {
        const widgetLine = this.getLineNumber(code, match.index);
        if (widgetLine >= classStartLine) {
          const hasSemanticLabel = this.hasSemanticLabel(code, match.index);
          const hasAltText = this.hasAltText(code, match.index);
          
          widgets.push({
            name: pattern.type,
            line: widgetLine,
            column: match.index - code.lastIndexOf('\n', match.index),
            hasSemanticLabel,
            semanticLabel: hasSemanticLabel ? this.extractSemanticLabel(code, match.index) : undefined,
            hasAltText,
            altText: hasAltText ? this.extractAltText(code, match.index) : undefined
          });
        }
      }
    }

    return widgets;
  }

  private hasSemanticLabel(code: string, index: number): boolean {
    const beforeCode = code.substring(Math.max(0, index - 200), index);
    return beforeCode.includes('semanticLabel:') || beforeCode.includes('Semantics(');
  }

  private hasAltText(code: string, index: number): boolean {
    const beforeCode = code.substring(Math.max(0, index - 200), index);
    return beforeCode.includes('alt:') || beforeCode.includes('altText:');
  }

  private extractSemanticLabel(code: string, index: number): string | undefined {
    const afterCode = code.substring(index, index + 500);
    const match = afterCode.match(/semanticLabel:\s*['"`]([^'"`]+)['"`]/);
    return match ? match[1] : undefined;
  }

  private extractAltText(code: string, index: number): string | undefined {
    const afterCode = code.substring(index, index + 500);
    const match = afterCode.match(/(?:alt|altText):\s*['"`]([^'"`]+)['"`]/);
    return match ? match[1] : undefined;
  }

  private async analyzeAccessibilityIssues(classes: DartClass[]): Promise<AccessibilityIssue[]> {
    const issues: AccessibilityIssue[] = [];
    let issueId = 1;

    for (const cls of classes) {
      for (const widget of cls.widgets) {
        // 접근성 라벨 누락 체크
        if (!widget.hasSemanticLabel) {
          issues.push({
            id: `issue_${issueId++}`,
            severity: 'error',
            type: 'missing_label',
            description: `${widget.name} 위젯에 접근성 라벨이 없습니다.`,
            elementType: widget.name,
            file: cls.file,
            line: widget.line,
            column: widget.column,
            rect: { left: 0, top: 0, width: 100, height: 50 },
            suggestedLabel: this.generateSuggestedLabel(widget),
            suggestedCode: this.generateSuggestedCode(widget)
          });
        }

        // 이미지 대체 텍스트 누락 체크
        if (widget.name === 'Image' && !widget.hasAltText) {
          issues.push({
            id: `issue_${issueId++}`,
            severity: 'error',
            type: 'missing_alt_text',
            description: '이미지에 대체 텍스트가 없습니다.',
            elementType: 'Image',
            file: cls.file,
            line: widget.line,
            column: widget.column,
            rect: { left: 0, top: 0, width: 200, height: 150 },
            suggestedLabel: '이미지 설명',
            suggestedCode: this.generateImageAltText(widget)
          });
        }

        // 부적절한 라벨 체크
        if (widget.hasSemanticLabel && widget.semanticLabel && this.isInappropriateLabel(widget.semanticLabel)) {
          issues.push({
            id: `issue_${issueId++}`,
            severity: 'warning',
            type: 'inappropriate_label',
            description: '부적절한 접근성 라벨입니다.',
            elementType: widget.name,
            file: cls.file,
            line: widget.line,
            column: widget.column,
            rect: { left: 0, top: 0, width: 100, height: 50 },
            suggestedLabel: this.generateSuggestedLabel(widget),
            suggestedCode: this.generateSuggestedCode(widget)
          });
        }
      }
    }

    return issues;
  }

  private isInappropriateLabel(label: string): boolean {
    // 부적절한 라벨 패턴들
    const inappropriatePatterns = [
      /^\d+$/, // 숫자만
      /^[a-zA-Z]+$/, // 영문만
      /^[!@#$%^&*()]+$/, // 특수문자만
      /^(button|click|tap|press)$/i, // 일반적인 동사
      /^(image|img|pic|photo)$/i // 일반적인 이미지 관련 단어
    ];

    return inappropriatePatterns.some(pattern => pattern.test(label.trim()));
  }

  private generateSuggestedLabel(widget: DartWidget): string {
    switch (widget.name) {
      case 'Text':
        return '텍스트 내용';
      case 'Image':
        return '이미지 설명';
      case 'Button':
        return '버튼 기능';
      case 'Icon':
        return '아이콘 의미';
      default:
        return '위젯 설명';
    }
  }

  private generateSuggestedCode(widget: DartWidget): string {
    switch (widget.name) {
      case 'Image':
        return `Image.network(
  'image_url',
  semanticLabel: "${this.generateSuggestedLabel(widget)}",
)`;
      case 'Icon':
        return `Icon(
  Icons.icon_name,
  semanticLabel: "${this.generateSuggestedLabel(widget)}",
)`;
      case 'Button':
        return `ElevatedButton(
  onPressed: () {},
  child: Text("버튼 텍스트"),
  semanticLabel: "${this.generateSuggestedLabel(widget)}",
)`;
      default:
        return `Semantics(
  label: "${this.generateSuggestedLabel(widget)}",
  child: ${widget.name}(),
)`;
    }
  }

  private generateImageAltText(widget: DartWidget): string {
    return `Image.network(
  'image_url',
  semanticLabel: "이미지 설명",
)`;
  }

  private async generateUserJourneys(classes: DartClass[], personaCount: number): Promise<UserJourney[]> {
    if (!this.openaiApiKey1 && !this.openaiApiKey2) {
      this.log('⚠️ OpenAI API 키가 없어 기본 사용자 저니를 생성합니다.');
      return this.generateDefaultUserJourneys(personaCount);
    }

    try {
      this.log('🤖 OpenAI API로 사용자 저니 생성 중...');
      
      const journeys: UserJourney[] = [];
      const personas = this.getPersonas(personaCount);

      for (let i = 0; i < personas.length; i++) {
        const persona = personas[i];
        const apiKey = this.getNextApiKey();
        
        const journey = await this.generateJourneyWithOpenAI(classes, persona, apiKey);
        journeys.push(journey);
        
        // API 호출 간격 조절 (병목 방지)
        if (i < personas.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return journeys;
    } catch (error) {
      this.log(`❌ OpenAI API 호출 실패: ${error}`);
      this.log('⚠️ 기본 사용자 저니로 대체합니다.');
      return this.generateDefaultUserJourneys(personaCount);
    }
  }

  private getPersonas(count: number): string[] {
    const allPersonas = [
      '시각 장애인', '청각 장애인', '운동 장애인', '인지 장애인', 
      '노년층 사용자', '어린이 사용자', '색약자', '키보드 전용 사용자',
      '스크린 리더 사용자', '음성 인식 사용자'
    ];
    
    return allPersonas.slice(0, Math.min(count, allPersonas.length));
  }

  private getNextApiKey(): string {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % 2;
    return this.currentKeyIndex === 0 ? this.openaiApiKey1 : this.openaiApiKey2;
  }

  private async generateJourneyWithOpenAI(classes: DartClass[], persona: string, apiKey: string): Promise<UserJourney> {
    const prompt = this.buildJourneyPrompt(classes, persona);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '당신은 접근성 전문가입니다. Flutter 앱의 사용자 여정을 분석하고 접근성 이슈를 식별해주세요.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API 오류: ${response.status}`);
      }

      const data = await response.json() as any;
      const content = data.choices[0].message.content;
      
      return this.parseJourneyResponse(content, persona);
    } catch (error) {
      throw new Error(`OpenAI API 호출 실패: ${error}`);
    }
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

  private parseJourneyResponse(content: string, persona: string): UserJourney {
    try {
      // JSON 추출 시도
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          id: `journey_${Date.now()}_${Math.random()}`,
          persona: parsed.persona || persona,
          steps: parsed.steps || [],
          issues: parsed.issues || []
        };
      }
    } catch (error) {
      this.log(`⚠️ JSON 파싱 실패: ${error}`);
    }

    // 파싱 실패 시 기본 구조 반환
    return {
      id: `journey_${Date.now()}_${Math.random()}`,
      persona,
      steps: [
        {
          id: `step_1`,
          action: '앱 실행',
          target: '메인 화면',
          expected: '홈 화면 표시',
          actual: '화면 로드됨',
          issues: ['접근성 라벨 부족']
        }
      ],
      issues: ['전반적인 접근성 개선 필요']
    };
  }

  private generateDefaultUserJourneys(personaCount: number): UserJourney[] {
    const personas = this.getPersonas(personaCount);
    const journeys: UserJourney[] = [];

    for (const persona of personas) {
      journeys.push({
        id: `journey_${Date.now()}_${Math.random()}`,
        persona,
        steps: [
          {
            id: `step_1`,
            action: '앱 실행',
            target: '메인 화면',
            expected: '홈 화면 표시',
            actual: '화면 로드됨',
            issues: ['접근성 라벨 부족']
          },
          {
            id: `step_2`,
            action: '메뉴 탐색',
            target: '메뉴 목록',
            expected: '메뉴 목록 표시',
            actual: '메뉴 표시됨',
            issues: ['키보드 네비게이션 부족']
          }
        ],
        issues: ['전반적인 접근성 개선 필요']
      });
    }

    return journeys;
  }

  private async saveAnalysisToJson(analysis: ProjectAnalysis): Promise<void> {
    const outputPath = path.join(this.workspaceRoot, 'accessibility-analysis.json');
    const jsonContent = JSON.stringify(analysis, null, 2);
    
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(outputPath),
      Buffer.from(jsonContent, 'utf8')
    );
    
    this.log(`📄 분석 결과 저장: ${outputPath}`);
  }

  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[FlutterAnalyzer] ${message}`);
  }
}
