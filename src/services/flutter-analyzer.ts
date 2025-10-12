// src/services/flutter-analyzer.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DartClass, DartWidget, AccessibilityIssue, ProjectAnalysis, UserJourney, JourneyStep } from '../types/accessibility';
import { AIService, AIModelConfig } from './ai-service';
import { IconAnalyzer, IconAnalysis, ImageAnalysis } from './icon-analyzer';
import { Logger } from '../utils/logger';

export class FlutterAnalyzer {
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;
  private aiService: AIService;
  private iconAnalyzer: IconAnalyzer;
  private openaiApiKey1: string;
  private openaiApiKey2: string;
  private currentKeyIndex: number = 0;
  private analysisCache: Map<string, ProjectAnalysis> = new Map();
  private dartFileCache: Map<string, DartClass[]> = new Map();

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
    
    // 환경 변수에서 API 키 로드
    this.openaiApiKey1 = process.env.OPENAI_API_KEY || '';
    this.openaiApiKey2 = process.env.OPENAI_API_KEY2 || '';
    
    // AI 서비스 초기화
    const aiConfig: AIModelConfig = {
      type: 'openai',
      model: 'gpt-3.5-turbo',
      apiKey: this.openaiApiKey1 || this.openaiApiKey2,
      maxTokens: 500,
      temperature: 0.7
    };
    
    this.aiService = new AIService(aiConfig, outputChannel);
    
    // 아이콘 분석기 초기화
    this.iconAnalyzer = new IconAnalyzer(workspaceRoot, outputChannel, this.aiService);
    
    if (!this.openaiApiKey1 && !this.openaiApiKey2) {
      Logger.warning('OpenAI API 키가 설정되지 않았습니다. 환경변수를 확인해주세요.', 'FlutterAnalyzer');
    } else {
      Logger.success('OpenAI API 키가 설정되었습니다.', 'FlutterAnalyzer');
    }
  }

  private switchApiKey(): void {
    if (this.openaiApiKey1 && this.openaiApiKey2) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % 2;
      const newApiKey = this.currentKeyIndex === 0 ? this.openaiApiKey1 : this.openaiApiKey2;
      
      // AI 서비스 재초기화
      const aiConfig: AIModelConfig = {
        type: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: newApiKey,
        maxTokens: 500,
        temperature: 0.7
      };
      
      this.aiService = new AIService(aiConfig, this.outputChannel);
      Logger.info(`API 키 교체: Key ${this.currentKeyIndex + 1} 사용 중`, 'FlutterAnalyzer');
    }
  }

  private getCacheKey(personaCount: number): string {
    return `${this.workspaceRoot}_${personaCount}`;
  }

  private isAnalysisCacheValid(cacheKey: string): boolean {
    const cached = this.analysisCache.get(cacheKey);
    if (!cached) return false;
    
    // 5분 이내의 분석 결과만 유효
    const cacheTime = new Date(cached.analysisDate).getTime();
    const now = new Date().getTime();
    return (now - cacheTime) < 5 * 60 * 1000;
  }

  async analyzeProject(personaCount: number = 3): Promise<ProjectAnalysis> {
    Logger.info('Flutter 프로젝트 분석 시작...', 'FlutterAnalyzer');
    
    try {
      // 캐시 확인
      const cacheKey = this.getCacheKey(personaCount);
      if (this.isAnalysisCacheValid(cacheKey)) {
        Logger.info('캐시된 분석 결과 사용', 'FlutterAnalyzer');
        return this.analysisCache.get(cacheKey)!;
      }

      // 1. Dart 파일들 찾기
      const dartFiles = await this.findDartFiles();
      Logger.info(`발견된 Dart 파일: ${dartFiles.length}개`, 'FlutterAnalyzer');

      // 2. 클래스와 위젯 분석 (캐싱 적용)
      const classes: DartClass[] = [];
      for (const file of dartFiles) {
        const fileClasses = await this.analyzeDartFileWithCache(file);
        classes.push(...fileClasses);
      }

      // 3. 접근성 이슈 분석 (AI 서비스 사용, 재시도 로직 포함)
      const accessibilityIssues = await this.analyzeAccessibilityIssuesWithRetry(classes);

      // 4. 라벨 관련 JSON 파일 생성
      await this.generateLabelJson(classes);

      // 5. 프로젝트 분석 결과 생성
      const analysis: ProjectAnalysis = {
        projectName: path.basename(this.workspaceRoot),
        totalFiles: dartFiles.length,
        totalClasses: classes.length,
        totalWidgets: classes.reduce((sum, cls) => sum + cls.widgets.length, 0),
        accessibilityIssues,
        userJourneys: [], // 빈 배열로 설정 (사용하지 않음)
        analysisDate: new Date().toISOString()
      };

      // 캐시에 저장
      this.analysisCache.set(cacheKey, analysis);
      
      await this.saveAnalysisToJson(analysis);
      
      Logger.success('프로젝트 분석 완료', 'FlutterAnalyzer');
      return analysis;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`분석 중 오류 발생: ${errorMessage}`, 'FlutterAnalyzer');
      
      // API 키 교체 후 재시도
      const errorStr = String(error);
      if (errorStr.includes('rate_limit') || errorStr.includes('quota')) {
        Logger.info('API 키 교체 후 재시도...', 'FlutterAnalyzer');
        this.switchApiKey();
      }
      
      throw error;
    }
  }

  private async analyzeDartFileWithCache(filePath: string): Promise<DartClass[]> {
    const fileKey = `file_${filePath}`;
    
    // 파일 수정 시간 확인
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      const lastModified = stat.mtime;
      
      const cached = this.dartFileCache.get(fileKey);
      if (cached && cached.length > 0) {
        // 캐시된 데이터가 있고 파일이 변경되지 않았으면 캐시 사용
        return cached;
      }
    } catch (error) {
      Logger.warning(`파일 상태 확인 실패: ${filePath}`, 'FlutterAnalyzer');
    }
    
    // 캐시가 없거나 파일이 변경되었으면 새로 분석
    const classes = await this.analyzeDartFile(filePath);
    this.dartFileCache.set(fileKey, classes);
    return classes;
  }

  private async analyzeAccessibilityIssuesWithRetry(classes: DartClass[], maxRetries: number = 3): Promise<AccessibilityIssue[]> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        Logger.info(`AI를 활용한 접근성 이슈 분석 (시도 ${attempt}/${maxRetries})`, 'FlutterAnalyzer');
        return await this.analyzeAccessibilityIssues(classes);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`AI 분석 실패 (시도 ${attempt}): ${errorMessage}`, 'FlutterAnalyzer');
        
        if (attempt < maxRetries) {
          // API 키 교체 시도
          this.switchApiKey();
          
          // 잠시 대기
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        } else {
          // 최대 재시도 횟수 도달 시 기본 분석으로 대체
          Logger.warning('AI 분석 실패, 기본 분석으로 대체', 'FlutterAnalyzer');
          return await this.basicAccessibilityAnalysis(classes);
        }
      }
    }
    return [];
  }

  private async basicAccessibilityAnalysis(classes: DartClass[]): Promise<AccessibilityIssue[]> {
    const issues: AccessibilityIssue[] = [];
    
    for (const cls of classes) {
      for (const widget of cls.widgets) {
        if (!widget.hasSemanticLabel && (widget.name === 'Image' || widget.name === 'Icon' || widget.name === 'Button')) {
          // 파일에서 주변 컨텍스트와 원본 코드 읽기
          const context = await this.extractContext(cls.file, widget.line);
          const originalCode = await this.extractOriginalCode(cls.file, widget.line);
          
          issues.push({
            id: `${cls.file}_${widget.line}`,
            severity: 'warning',
            type: 'missing_label',
            description: `${widget.name} 위젯에 접근성 라벨이 없습니다`,
            elementType: widget.name,
            file: cls.file,
            line: widget.line,
            column: widget.column,
            suggestedLabel: `${widget.name}에 대한 설명`,
            suggestedCode: this.generateSmartAccessibilityCode(widget, originalCode),
            context: context,
            // 원본 코드 추가 (매우 중요!)
            originalCode: originalCode
          });
        }
      }
    }
    
    return issues;
  }

  private async extractContext(filePath: string, lineNumber: number): Promise<string> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // 주변 3줄씩 추출
      const startLine = Math.max(0, lineNumber - 3);
      const endLine = Math.min(lines.length, lineNumber + 3);
      
      const contextLines = [];
      for (let i = startLine; i < endLine; i++) {
        contextLines.push(`${i + 1}: ${lines[i]}`);
      }
      
      return contextLines.join('\n');
    } catch (error) {
      return '';
    }
  }

  private async extractOriginalCode(filePath: string, lineNumber: number): Promise<string> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      if (lineNumber > 0 && lineNumber <= lines.length) {
        return lines[lineNumber - 1].trim();
      }
      
      return '';
    } catch (error) {
      return '';
    }
  }

  private generateSmartAccessibilityCode(widget: DartWidget, originalCode: string): string {
    // 적절한 라벨 생성
    const label = this.generateContextualLabel(widget, originalCode);
    
    // 원본 코드가 단순한 위젯 호출인지 확인
    const isSimpleWidget = /^(Text|Image|Icon|Button|ElevatedButton|TextButton|IconButton)\s*\(/.test(originalCode);
    
    if (isSimpleWidget && !originalCode.includes('semanticLabel')) {
      // 기존 위젯에 semanticLabel 속성 추가
      return `semanticLabel: "${label}"`;
    } else {
      // Semantics 위젯으로 래핑
      return `Semantics(\n  label: "${label}",\n  child: ${originalCode}\n)`;
    }
  }

  private generateContextualLabel(widget: DartWidget, originalCode: string): string {
    // 원본 코드에서 컨텍스트 힌트 추출
    const text = originalCode.match(/['"]([^'"]+)['"]/);
    const methodName = originalCode.match(/(\w+)\s*\(/)?.[1];
    
    switch (widget.name) {
      case 'Image':
        if (text) return `${text[1]} 이미지`;
        return '이미지';
      case 'Icon':
        if (originalCode.includes('Icons.')) {
          const iconName = originalCode.match(/Icons\.(\w+)/)?.[1];
          if (iconName) return `${iconName} 아이콘`;
        }
        return '아이콘';
      case 'Button':
      case 'ElevatedButton':
      case 'TextButton':
        if (text) return `${text[1]} 버튼`;
        if (methodName && methodName.startsWith('_')) {
          return `${methodName.replace('_', '')} 버튼`;
        }
        return '버튼';
      default:
        return `${widget.name} 위젯`;
    }
  }

  private generateBasicAccessibilityCode(widget: DartWidget): string {
    switch (widget.name) {
      case 'Image':
        return `semanticLabel: '이미지에 대한 설명'`;
      case 'Icon':
        return `semanticLabel: '아이콘에 대한 설명'`;
      case 'Button':
        return `semanticsLabel: '버튼 기능 설명'`;
      default:
        return `semanticLabel: '${widget.name}에 대한 설명'`;
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
        Logger.warning(`디렉토리 읽기 실패: ${dir}`, 'FlutterAnalyzer');
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
      Logger.error(`파일 분석 실패: ${filePath}`, 'FlutterAnalyzer');
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

    for (const cls of classes) {
      for (const widget of cls.widgets) {
        // 실제 위젯 내용과 컨텍스트 분석
        const context = await this.analyzeWidgetContext(widget, cls);
        
        // 1. 의미있는 텍스트 위젯 분석
        if (widget.name === 'Text' && !widget.hasSemanticLabel) {
          const textContent = this.extractTextContent(widget);
          const issue = await this.createTextAccessibilityIssue(widget, cls, textContent, context);
          if (issue) issues.push(issue);
        }

        // 2. 버튼 위젯 분석
        else if (widget.name === 'Button' || widget.name === 'ElevatedButton' || widget.name === 'TextButton') {
          const buttonContext = await this.analyzeButtonContext(widget, cls);
          const issue = await this.createButtonAccessibilityIssue(widget, cls, buttonContext);
          if (issue) issues.push(issue);
        }

        // 3. 이미지 위젯 분석
        else if (widget.name === 'Image' && !widget.hasAltText) {
          const imageContext = await this.analyzeImageContext(widget, cls);
          const issue = await this.createImageAccessibilityIssue(widget, cls, imageContext);
          if (issue) issues.push(issue);
        }

        // 4. 아이콘 위젯 분석
        else if (widget.name === 'Icon' && !widget.hasSemanticLabel) {
          const iconContext = await this.analyzeIconContext(widget, cls);
          const issue = await this.createIconAccessibilityIssue(widget, cls, iconContext);
          if (issue) issues.push(issue);
        }

        // 5. 입력 필드 분석
        else if (widget.name === 'TextField' || widget.name === 'TextFormField') {
          const inputContext = await this.analyzeInputContext(widget, cls);
          const issue = await this.createInputAccessibilityIssue(widget, cls, inputContext);
          if (issue) issues.push(issue);
        }

        // 6. 리스트 아이템 분석
        else if (widget.name === 'ListTile' || widget.name === 'Card') {
          const listContext = await this.analyzeListContext(widget, cls);
          const issue = await this.createListAccessibilityIssue(widget, cls, listContext);
          if (issue) issues.push(issue);
        }
      }
    }

    return issues;
  }

  private async analyzeWidgetContext(widget: DartWidget, cls: DartClass): Promise<string> {
    // 위젯 주변 코드 분석하여 컨텍스트 파악
    const surroundingCode = await this.getSurroundingCode(cls.file, widget.line);
    const methodContext = this.getMethodContext(cls, widget.line);
    
    return `${methodContext} - ${surroundingCode.substring(0, 200)}...`;
  }

  private async getSurroundingCode(filePath: string, line: number): Promise<string> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      const lines = content.toString().split('\n');
      const start = Math.max(0, line - 5);
      const end = Math.min(lines.length, line + 5);
      return lines.slice(start, end).join('\n');
    } catch (error) {
      return '';
    }
  }

  private getMethodContext(cls: DartClass, line: number): string {
    const method = cls.methods.find(m => m.line <= line && line <= m.line + 50);
    return method ? method.name : 'unknown_method';
  }

  private extractTextContent(widget: DartWidget): string {
    // Text 위젯의 실제 내용 추출
    const code = widget.code || '';
    const textMatch = code.match(/Text\s*\(\s*['"`]([^'"`]+)['"`]/);
    return textMatch ? textMatch[1] : '';
  }

  private async createTextAccessibilityIssue(widget: DartWidget, cls: DartClass, textContent: string, context: string): Promise<AccessibilityIssue | null> {
    // 텍스트가 실제로 의미있는 내용인지 확인
    if (!textContent || textContent.length < 2) return null;

    const textType = this.analyzeTextType(textContent, context);
    
    // AI 서비스를 사용하여 구체적인 설명 생성
    let suggestedLabel = this.generateContextualTextLabel(textContent, textType, context);
    let impact = this.getTextImpact(textType);
    let userJourney = this.getTextUserJourney(textType);
    
    try {
      const aiDescription = await this.aiService.generateTextDescription(textContent, cls.file, widget.line);
      if (aiDescription && aiDescription !== '텍스트 내용 설명') {
        suggestedLabel = aiDescription;
      }
    } catch (error) {
      Logger.warning(`AI 텍스트 설명 생성 실패: ${error}`, 'FlutterAnalyzer');
    }
    
    return {
      id: `issue_${Date.now()}_${Math.random()}`,
      severity: this.getTextSeverity(textType),
      type: 'missing_semantic_label',
      description: this.generateTextDescription(textContent, textType),
      elementType: 'Text',
      file: cls.file,
      line: widget.line,
      column: widget.column,
      suggestedLabel: suggestedLabel,
      suggestedCode: this.generateTextSemanticsCode(widget, suggestedLabel),
      context: context,
      impact: impact,
      userJourney: userJourney
    };
  }

  private analyzeTextType(textContent: string, context: string): string {
    // 텍스트 타입 분석
    if (textContent.match(/^\d+$/)) return 'number';
    if (textContent.match(/^\d+원$/)) return 'price';
    if (textContent.match(/^\d{4}-\d{2}-\d{2}$/)) return 'date';
    if (textContent.match(/^\d{2}:\d{2}$/)) return 'time';
    if (context.includes('error') || context.includes('Error')) return 'error';
    if (context.includes('success') || context.includes('Success')) return 'success';
    if (context.includes('loading') || context.includes('Loading')) return 'loading';
    if (textContent.length < 10) return 'label';
    return 'content';
  }

  private generateTextDescription(textContent: string, textType: string): string {
    const descriptions: Record<string, string> = {
      number: `숫자 "${textContent}"이지만 스크린 리더가 이를 숫자로 인식하지 못할 수 있습니다.`,
      price: `가격 "${textContent}"이지만 스크린 리더가 이를 가격으로 인식하지 못할 수 있습니다.`,
      date: `날짜 "${textContent}"이지만 스크린 리더가 이를 날짜로 인식하지 못할 수 있습니다.`,
      time: `시간 "${textContent}"이지만 스크린 리더가 이를 시간으로 인식하지 못할 수 있습니다.`,
      error: `오류 메시지 "${textContent}"이지만 스크린 리더가 이를 오류로 인식하지 못할 수 있습니다.`,
      success: `성공 메시지 "${textContent}"이지만 스크린 리더가 이를 성공으로 인식하지 못할 수 있습니다.`,
      loading: `로딩 메시지 "${textContent}"이지만 스크린 리더가 이를 로딩 상태로 인식하지 못할 수 있습니다.`,
      label: `라벨 "${textContent}"이지만 스크린 리더가 이를 라벨로 인식하지 못할 수 있습니다.`,
      content: `텍스트 "${textContent}"이지만 스크린 리더가 이를 적절히 읽지 못할 수 있습니다.`
    };
    return descriptions[textType] || descriptions.content;
  }

  private generateContextualTextLabel(textContent: string, textType: string, context: string): string {
    const labels: Record<string, string> = {
      number: `숫자: ${textContent}`,
      price: `가격: ${textContent}`,
      date: `날짜: ${textContent}`,
      time: `시간: ${textContent}`,
      error: `오류: ${textContent}`,
      success: `성공: ${textContent}`,
      loading: `로딩 중: ${textContent}`,
      label: `라벨: ${textContent}`,
      content: textContent
    };
    return labels[textType] || textContent;
  }

  private getTextSeverity(textType: string): 'error' | 'warning' | 'info' | 'high' | 'medium' | 'low' {
    const severities: Record<string, 'error' | 'warning' | 'info' | 'high' | 'medium' | 'low'> = {
      error: 'high',
      success: 'medium',
      loading: 'medium',
      price: 'high',
      date: 'high',
      time: 'high',
      number: 'medium',
      label: 'low',
      content: 'medium'
    };
    return severities[textType] || 'medium';
  }

  private getTextImpact(textType: string): string {
    const impacts: Record<string, string> = {
      error: '시각장애인이 오류 상황을 인식하지 못해 앱 사용에 어려움을 겪을 수 있습니다.',
      success: '시각장애인이 작업 완료 여부를 확인하기 어려울 수 있습니다.',
      loading: '시각장애인이 로딩 상태를 인식하지 못해 불안감을 느낄 수 있습니다.',
      price: '시각장애인이 가격 정보를 정확히 파악하기 어려울 수 있습니다.',
      date: '시각장애인이 날짜 정보를 정확히 파악하기 어려울 수 있습니다.',
      time: '시각장애인이 시간 정보를 정확히 파악하기 어려울 수 있습니다.',
      number: '시각장애인이 숫자 정보를 정확히 파악하기 어려울 수 있습니다.',
      label: '시각장애인이 라벨 정보를 파악하기 어려울 수 있습니다.',
      content: '시각장애인이 텍스트 내용을 적절히 인식하지 못할 수 있습니다.'
    };
    return impacts[textType] || impacts.content;
  }

  private getTextUserJourney(textType: string): string {
    const journeys: Record<string, string> = {
      error: '오류 발생 시 스크린 리더가 "오류"라고 명시하여 사용자가 즉시 인식할 수 있어야 합니다.',
      success: '작업 완료 시 스크린 리더가 "성공"이라고 명시하여 사용자가 안심할 수 있어야 합니다.',
      loading: '로딩 중일 때 스크린 리더가 "로딩 중"이라고 명시하여 사용자가 대기해야 함을 알 수 있어야 합니다.',
      price: '가격 정보는 "가격: 10,000원"과 같이 명시하여 사용자가 정확히 파악할 수 있어야 합니다.',
      date: '날짜 정보는 "날짜: 2024년 1월 1일"과 같이 명시하여 사용자가 정확히 파악할 수 있어야 합니다.',
      time: '시간 정보는 "시간: 오후 2시 30분"과 같이 명시하여 사용자가 정확히 파악할 수 있어야 합니다.',
      number: '숫자 정보는 "숫자: 42"와 같이 명시하여 사용자가 정확히 파악할 수 있어야 합니다.',
      label: '라벨은 "라벨: 사용자 이름"과 같이 명시하여 사용자가 이해할 수 있어야 합니다.',
      content: '텍스트 내용은 의미있는 방식으로 스크린 리더가 읽을 수 있어야 합니다.'
    };
    return journeys[textType] || journeys.content;
  }

  private generateTextSemanticsCode(widget: DartWidget, suggestedLabel: string): string {
    return `Semantics(
  label: "${suggestedLabel}",
  child: Text("${this.extractTextContent(widget)}"),
)`;
  }
 
  private extractIconCode(surroundingCode: string, lineNumber: number): string | null {
    // Icon 위젯 코드 추출
    const iconMatch = surroundingCode.match(/Icon\s*\(\s*Icons\.(\w+)/);
    if (iconMatch) {
      return `Icons.${iconMatch[1]}`;
    }

    // 커스텀 아이콘 파일 경로 추출
    const customIconMatch = surroundingCode.match(/Icon\s*\(\s*['"`]([^'"`]+\.(?:png|jpg|jpeg|svg|ico))['"`]/);
    if (customIconMatch) {
      return customIconMatch[1];
    }

    // 이미지 아이콘 추출
    const imageIconMatch = surroundingCode.match(/Image\.(?:asset|network)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (imageIconMatch) {
      return imageIconMatch[1];
    }

    return null;
  }

  private generateIconSemanticsCode(iconCode: string, suggestedLabel: string): string {
    if (iconCode.startsWith('Icons.')) {
      return `Icon(
  ${iconCode},
  semanticLabel: "${suggestedLabel}",
)`;
    } else if (iconCode.includes('.')) {
      // 커스텀 아이콘 파일
      return `Icon(
  Icons.image,
  semanticLabel: "${suggestedLabel}",
)`;
    } else {
      return `Semantics(
  label: "${suggestedLabel}",
  child: Icon(${iconCode}),
)`;
    }
  }

  private async analyzeButtonContext(widget: DartWidget, cls: DartClass): Promise<string> {
    const surroundingCode = await this.getSurroundingCode(cls.file, widget.line);
    const methodContext = this.getMethodContext(cls, widget.line);
    return `${methodContext} - ${surroundingCode.substring(0, 200)}...`;
  }

  private async createButtonAccessibilityIssue(widget: DartWidget, cls: DartClass, context: string): Promise<AccessibilityIssue | null> {
    // AI 서비스를 사용하여 구체적인 설명 생성
    let suggestedLabel = '버튼 기능';
    
    try {
      const aiDescription = await this.aiService.generateButtonDescription(context, cls.file, widget.line);
      if (aiDescription && aiDescription !== '버튼 기능 설명') {
        suggestedLabel = aiDescription;
      }
    } catch (error) {
      Logger.warning(`AI 버튼 설명 생성 실패: ${error}`, 'FlutterAnalyzer');
    }
    
    return {
      id: `issue_${Date.now()}_${Math.random()}`,
      severity: 'medium',
      type: 'missing_semantic_label',
      description: '버튼에 의미있는 라벨이 없어 시각장애인이 버튼의 기능을 이해하기 어려울 수 있습니다.',
      elementType: 'Button',
      file: cls.file,
      line: widget.line,
      column: widget.column,
      suggestedLabel: suggestedLabel,
      suggestedCode: `Semantics(
  label: "${suggestedLabel}",
  child: ${widget.name}(),
)`,
      context: context,
      impact: '시각장애인이 버튼의 기능을 이해하기 어려울 수 있습니다.',
      userJourney: '버튼은 명확한 라벨을 가지고 있어야 합니다.'
    };
  }

  private async analyzeImageContext(widget: DartWidget, cls: DartClass): Promise<string> {
    const surroundingCode = await this.getSurroundingCode(cls.file, widget.line);
    const methodContext = this.getMethodContext(cls, widget.line);
    return `${methodContext} - ${surroundingCode.substring(0, 200)}...`;
  }

  private async createImageAccessibilityIssue(widget: DartWidget, cls: DartClass, context: string): Promise<AccessibilityIssue | null> {
    // AI 서비스를 사용하여 구체적인 설명 생성
    let suggestedLabel = '이미지 설명';
    
    try {
      const aiDescription = await this.aiService.generateImageDescription(context, cls.file, widget.line);
      if (aiDescription && aiDescription !== '이미지 설명') {
        suggestedLabel = aiDescription;
      }
    } catch (error) {
      Logger.warning(`AI 이미지 설명 생성 실패: ${error}`, 'FlutterAnalyzer');
    }
    
    return {
      id: `issue_${Date.now()}_${Math.random()}`,
      severity: 'high',
      type: 'missing_alt_text',
      description: '이미지에 대체 텍스트가 없어 시각장애인이 이미지의 내용을 이해하기 어려울 수 있습니다.',
      elementType: 'Image',
      file: cls.file,
      line: widget.line,
      column: widget.column,
      suggestedLabel: suggestedLabel,
      suggestedCode: `Image.network(
  'image_url',
  semanticLabel: "${suggestedLabel}",
)`,
      context: context,
      impact: '시각장애인이 이미지의 내용을 이해하기 어려울 수 있습니다.',
      userJourney: '이미지는 명확한 라벨 또는 대체 텍스트를 가지고 있어야 합니다.'
    };
  }

  private async analyzeIconContext(widget: DartWidget, cls: DartClass): Promise<string> {
    const surroundingCode = await this.getSurroundingCode(cls.file, widget.line);
    const methodContext = this.getMethodContext(cls, widget.line);
    return `${methodContext} - ${surroundingCode.substring(0, 200)}...`;
  }

  private async createIconAccessibilityIssue(widget: DartWidget, cls: DartClass, context: string): Promise<AccessibilityIssue | null> {
    try {
      // 위젯 주변 코드에서 실제 아이콘 코드 추출
      const surroundingCode = await this.getSurroundingCode(cls.file, widget.line);
      const iconCode = this.extractIconCode(surroundingCode, widget.line);
      
      if (!iconCode) {
        return null;
      }

      // 아이콘 분석기 사용
      const iconAnalysis = await this.iconAnalyzer.analyzeIcon(iconCode, context, cls.file, widget.line);
      
      return {
        id: `issue_${Date.now()}_${Math.random()}`,
        severity: 'medium',
        type: 'missing_semantic_label',
        description: '아이콘에 의미있는 라벨이 없어 시각장애인이 아이콘의 의미를 이해하기 어려울 수 있습니다.',
        elementType: 'Icon',
        file: cls.file,
        line: widget.line,
        column: widget.column,
          suggestedLabel: iconAnalysis.suggestedLabel,
        suggestedCode: this.generateIconSemanticsCode(iconCode, iconAnalysis.suggestedLabel),
        context: context,
        impact: '시각장애인이 아이콘의 의미를 이해하기 어려울 수 있습니다.',
        userJourney: '아이콘은 명확한 라벨을 가지고 있어야 합니다.',
        confidence: iconAnalysis.confidence,
        alternatives: iconAnalysis.alternatives
      };
    } catch (error) {
      Logger.warning(`아이콘 분석 실패: ${error}`, 'FlutterAnalyzer');
      
      // 기본값 반환
      return {
        id: `issue_${Date.now()}_${Math.random()}`,
        severity: 'medium',
        type: 'missing_semantic_label',
        description: '아이콘에 의미있는 라벨이 없어 시각장애인이 아이콘의 의미를 이해하기 어려울 수 있습니다.',
        elementType: 'Icon',
        file: cls.file,
        line: widget.line,
        column: widget.column,
          suggestedLabel: '아이콘 의미',
        suggestedCode: `Icon(
  Icons.icon_name,
  semanticLabel: "아이콘 의미",
)`,
        context: context,
        impact: '시각장애인이 아이콘의 의미를 이해하기 어려울 수 있습니다.',
        userJourney: '아이콘은 명확한 라벨을 가지고 있어야 합니다.'
      };
    }
  }

  private async analyzeInputContext(widget: DartWidget, cls: DartClass): Promise<string> {
    const surroundingCode = await this.getSurroundingCode(cls.file, widget.line);
    const methodContext = this.getMethodContext(cls, widget.line);
    return `${methodContext} - ${surroundingCode.substring(0, 200)}...`;
  }

  private async createInputAccessibilityIssue(widget: DartWidget, cls: DartClass, context: string): Promise<AccessibilityIssue | null> {
    // AI 서비스를 사용하여 구체적인 설명 생성
    let aiAnalysis: {
      hasHintText: boolean;
      hintText?: string;
      actualLabel: string;
      accessibilityType: 'hint_only' | 'label_only' | 'both' | 'neither';
      suggestedCode: string;
    } = {
      hasHintText: false,
      actualLabel: '입력 필드 목적',
      accessibilityType: 'neither',
      suggestedCode: 'Semantics(label: "입력 필드 목적", child: TextField())'
    };
    
    try {
      const aiDescription = await this.aiService.generateInputDescription(context, cls.file, widget.line);
      aiAnalysis = aiDescription;
    } catch (error) {
      Logger.warning(`AI 입력 필드 설명 생성 실패: ${error}`, 'FlutterAnalyzer');
    }
    
    // 접근성 타입에 따른 설명 생성
    let description = '';
    let impact = '';
    let userJourney = '';
    
    switch (aiAnalysis.accessibilityType) {
      case 'hint_only':
        description = '입력 필드에 hintText만 있고 실제 라벨이 없어 시각장애인이 입력 필드의 목적을 이해하기 어려울 수 있습니다.';
        impact = 'hintText는 일시적인 안내 텍스트이므로 영구적인 라벨이 필요합니다.';
        userJourney = '입력 필드는 명확한 라벨과 함께 적절한 hint를 제공해야 합니다.';
        break;
      case 'label_only':
        description = '입력 필드에 라벨은 있지만 사용자 안내를 위한 hint가 부족할 수 있습니다.';
        impact = '사용자가 입력 필드의 목적을 더 잘 이해할 수 있도록 hint를 추가하는 것이 좋습니다.';
        userJourney = '입력 필드는 라벨과 함께 사용자 안내를 위한 hint를 제공해야 합니다.';
        break;
      case 'both':
        description = '입력 필드에 라벨과 hint가 모두 있지만 접근성 속성으로 명시되지 않았습니다.';
        impact = '접근성 도구가 라벨과 hint를 인식할 수 있도록 Semantics 위젯으로 래핑해야 합니다.';
        userJourney = '입력 필드는 접근성 속성을 통해 라벨과 hint를 명시해야 합니다.';
        break;
      case 'neither':
      default:
        description = '입력 필드에 의미있는 라벨이 없어 시각장애인이 입력 필드의 목적을 이해하기 어려울 수 있습니다.';
        impact = '시각장애인이 입력 필드의 목적을 이해하기 어려울 수 있습니다.';
        userJourney = '입력 필드는 명확한 라벨을 가지고 있어야 합니다.';
        break;
    }
    
    return {
      id: `issue_${Date.now()}_${Math.random()}`,
      severity: 'medium',
      type: 'missing_semantic_label',
      description: description,
      elementType: 'InputField',
      file: cls.file,
      line: widget.line,
      column: widget.column,
      suggestedLabel: aiAnalysis.actualLabel,
      suggestedCode: aiAnalysis.suggestedCode,
      context: context,
      impact: impact,
      userJourney: userJourney
    };
  }

  private async analyzeListContext(widget: DartWidget, cls: DartClass): Promise<string> {
    const surroundingCode = await this.getSurroundingCode(cls.file, widget.line);
    const methodContext = this.getMethodContext(cls, widget.line);
    return `${methodContext} - ${surroundingCode.substring(0, 200)}...`;
  }

  private async createListAccessibilityIssue(widget: DartWidget, cls: DartClass, context: string): Promise<AccessibilityIssue | null> {
    // AI 서비스를 사용하여 구체적인 설명 생성
    let suggestedLabel = '리스트 아이템 내용';
    
    try {
      const aiDescription = await this.aiService.generateListDescription(context, cls.file, widget.line);
      if (aiDescription && aiDescription !== '리스트 아이템 내용') {
        suggestedLabel = aiDescription;
      }
    } catch (error) {
      Logger.warning(`AI 리스트 설명 생성 실패: ${error}`, 'FlutterAnalyzer');
    }
    
    return {
      id: `issue_${Date.now()}_${Math.random()}`,
      severity: 'medium',
      type: 'missing_semantic_label',
      description: '리스트 아이템에 의미있는 라벨이 없어 시각장애인이 리스트 아이템의 내용을 이해하기 어려울 수 있습니다.',
      elementType: 'ListTile',
      file: cls.file,
      line: widget.line,
      column: widget.column,
      suggestedLabel: suggestedLabel,
      suggestedCode: `Semantics(
  label: "${suggestedLabel}",
  child: ${widget.name}(),
)`,
      context: context,
      impact: '시각장애인이 리스트 아이템의 내용을 이해하기 어려울 수 있습니다.',
      userJourney: '리스트 아이템은 명확한 라벨을 가지고 있어야 합니다.'
    };
  }

  private generateSuggestedLabel(widget: DartWidget): string {
    // AI 서비스에서 생성된 라벨을 사용하므로 기본값만 반환
    return 'AI 생성 라벨';
  }

  private generateSuggestedCode(widget: DartWidget): string {
    // AI 서비스에서 생성된 코드를 사용하므로 기본값만 반환
    return `Semantics(
  label: "AI 생성 라벨",
  child: ${widget.name}(),
)`;
  }

  private async generateUserJourneys(classes: DartClass[], personaCount: number): Promise<UserJourney[]> {
    if (!this.openaiApiKey1 && !this.openaiApiKey2) {
      Logger.warning('OpenAI API 키가 없어 기본 사용자 저니를 생성합니다.', 'FlutterAnalyzer');
      return this.generateDefaultUserJourneys(personaCount);
    }

    try {
      Logger.info('OpenAI API로 사용자 저니 생성 중...', 'FlutterAnalyzer');
      
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
      Logger.error(`OpenAI API 호출 실패: ${error}`, 'FlutterAnalyzer');
      Logger.warning('기본 사용자 저니로 대체합니다.', 'FlutterAnalyzer');
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
      Logger.warning(`JSON 파싱 실패: ${error}`, 'FlutterAnalyzer');
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

  private async generateLabelJson(classes: DartClass[]): Promise<void> {
    try {
      const labelData = {
        projectName: path.basename(this.workspaceRoot),
        generatedAt: new Date().toISOString(),
        totalClasses: classes.length,
        totalWidgets: classes.reduce((sum, cls) => sum + cls.widgets.length, 0),
        classes: classes.map(cls => ({
          name: cls.name,
          file: cls.file,
          line: cls.line,
          widgets: cls.widgets.map(widget => ({
            name: widget.name,
            line: widget.line,
            column: widget.column,
            hasSemanticLabel: widget.hasSemanticLabel,
            semanticLabel: widget.semanticLabel || null,
            hasAltText: widget.hasAltText,
            altText: widget.altText || null,
            suggestedLabel: this.generateSuggestedLabel(widget),
            suggestedCode: this.generateSuggestedCode(widget)
          }))
        }))
      };

      const outputPath = path.join(this.workspaceRoot, 'label-analysis.json');
      const jsonContent = JSON.stringify(labelData, null, 2);
      
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(outputPath),
        Buffer.from(jsonContent, 'utf8')
      );
      
      Logger.info(`라벨 분석 JSON 생성: ${outputPath}`, 'FlutterAnalyzer');
      Logger.info(`총 ${classes.length}개 클래스, ${labelData.totalWidgets}개 위젯 분석 완료`, 'FlutterAnalyzer');
      
    } catch (error) {
      Logger.error(`라벨 JSON 생성 실패: ${error}`, 'FlutterAnalyzer');
      throw error;
    }
  }

  private async saveAnalysisToJson(analysis: ProjectAnalysis): Promise<void> {
    const outputPath = path.join(this.workspaceRoot, 'accessibility-analysis.json');
    const jsonContent = JSON.stringify(analysis, null, 2);
    
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(outputPath),
      Buffer.from(jsonContent, 'utf8')
    );
    
    Logger.info(`분석 결과 저장: ${outputPath}`, 'FlutterAnalyzer');
  }

  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }

}
