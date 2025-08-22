interface FlutterComponent {
  name: string;
  file: string;
  line: number;
  type: 'widget' | 'screen' | 'service' | 'model' | 'util';
  accessibilityScore: number;
  issues: string[];
  content?: string;
  dependencies?: string[];
}

interface ProjectStructure {
  projectPath: string;
  components: FlutterComponent[];
  totalScore: number;
  userJourneyUML: string; // 사용자 저니 UML (학습용)
  summary: {
    totalFiles: number;
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

interface AccessibilityRule {
  id: string;
  name: string;
  wcagCriterion: string;
  severity: 'error' | 'warning' | 'info';
  pattern: RegExp;
  message: string;
  suggestion: string;
}

export class ProjectAnalyzer {
  private wcagRules: AccessibilityRule[] = [
    // WCAG 2.2 기준 규칙들
    {
      id: 'IMG_ALT_TEXT',
      name: '이미지 대체 텍스트',
      wcagCriterion: '1.1.1',
      severity: 'error',
      pattern: /Image\.(asset|network|file|memory)\([^)]*\)(?![^{]*semanticLabel)/g,
      message: '이미지에 대체 텍스트(semanticLabel)가 없습니다',
      suggestion: 'semanticLabel 속성을 추가하여 이미지 설명을 제공하세요'
    },
    {
      id: 'BTN_MIN_SIZE',
      name: '버튼 최소 크기',
      wcagCriterion: '2.5.5',
      severity: 'warning',
      pattern: /(ElevatedButton|TextButton|OutlinedButton|IconButton|FloatingActionButton)\([^)]*\)(?![^{]*constraints.*min)/g,
      message: '버튼의 최소 터치 영역이 44x44dp 미만일 수 있습니다',
      suggestion: 'Container로 감싸고 constraints: BoxConstraints(minWidth: 44, minHeight: 44)를 추가하세요'
    },
    {
      id: 'TEXT_CONTRAST',
      name: '텍스트 색상 대비',
      wcagCriterion: '1.4.3',
      severity: 'info',
      pattern: /Text\([^)]*style:[^)]*color:\s*Colors\.(grey|gray)(?:\[|\.|;)/g,
      message: '텍스트 색상 대비가 충분하지 않을 수 있습니다',
      suggestion: '더 어두운 색상을 사용하거나 배경과의 명도 대비를 4.5:1 이상으로 조정하세요'
    },
    {
      id: 'SEMANTIC_MISSING',
      name: '시맨틱 정보 누락',
      wcagCriterion: '4.1.2',
      severity: 'warning',
      pattern: /(GestureDetector|InkWell)\([^)]*onTap:[^)]*\)(?![^{]*Semantics)/g,
      message: '제스처 감지 위젯에 접근성 정보가 없습니다',
      suggestion: 'Semantics 위젯으로 감싸고 적절한 label을 제공하세요'
    },
    {
      id: 'FOCUS_ORDER',
      name: '포커스 순서',
      wcagCriterion: '2.4.3',
      severity: 'info',
      pattern: /TextField\([^)]*\)(?![^{]*focusNode)/g,
      message: '입력 필드의 포커스 순서가 명확하지 않습니다',
      suggestion: 'FocusNode를 사용하여 논리적인 포커스 순서를 제공하세요'
    }
  ];

  constructor() {
    // Mock 데이터로 시작 (실제로는 VS Code Extension에서 프로젝트 파일을 받아올 예정)
    console.log('ProjectAnalyzer 초기화');
  }

  // 프로젝트 전체 분석 (기존 하드코딩된 이슈 + 새로운 분석)
  async analyzeProject(): Promise<ProjectStructure> {
    console.log('프로젝트 분석 시작...');
    
    // 임시 Mock 데이터 (실제로는 VS Code Extension에서 Flutter 파일들을 읽어올 예정)
    const mockFlutterFiles = [
      {
        path: 'lib/main.dart',
        content: `
import 'package:flutter/material.dart';
import 'home.dart';

void main() {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      home: HomePage(),
    );
  }
}
        `
      },
      {
        path: 'lib/home.dart',
        content: `
import 'package:flutter/material.dart';

class HomePage extends StatefulWidget {
  @override
  _HomePageState createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('홈')),
      body: Column(
        children: [
          // 접근성 이슈: 이미지에 semanticLabel 없음
          Image.asset('assets/traditional_man.png'),
          
          Text(
            '나랏말싸미',
            style: TextStyle(
              fontSize: 24,
              color: Colors.grey[400], // 접근성 이슈: 대비 부족
            ),
          ),
          
          // 접근성 이슈: 최소 터치 영역 미달
          ElevatedButton(
            onPressed: () {},
            child: Text('지금 시작하기'),
          ),
          
          // 접근성 이슈: 시맨틱 정보 누락
          GestureDetector(
            onTap: () => print('탭됨'),
            child: Container(
              width: 100,
              height: 50,
              color: Colors.blue,
              child: Center(child: Text('커스텀 버튼')),
            ),
          ),
          
          // 접근성 이슈: 포커스 순서 불명확
          TextField(
            decoration: InputDecoration(hintText: '이름을 입력하세요'),
          ),
        ],
      ),
    );
  }
}
        `
      }
    ];

    const components = await this.extractComponents(mockFlutterFiles);
    const userJourneyUML = this.generateUserJourneyUML(components);
    
    const summary = this.calculateSummary(components);

    return {
      projectPath: '/mock/flutter/project',
      components,
      totalScore: Math.round(summary.totalIssues === 0 ? 100 : Math.max(0, 100 - (summary.totalIssues * 10))),
      userJourneyUML,
      summary
    };
  }

  // Flutter 컴포넌트 추출 및 분석
  private async extractComponents(files: Array<{path: string, content: string}>): Promise<FlutterComponent[]> {
    const components: FlutterComponent[] = [];

    for (const file of files) {
      const component = await this.analyzeFile(file);
      if (component) {
        components.push(component);
      }
    }

    return components;
  }

  // 개별 파일 분석
  private async analyzeFile(file: {path: string, content: string}): Promise<FlutterComponent | null> {
    const { path, content } = file;
    
    // 파일 타입 결정
    let type: FlutterComponent['type'] = 'util';
    if (path.includes('main.dart')) type = 'service';
    else if (content.includes('StatefulWidget') || content.includes('StatelessWidget')) type = 'widget';
    else if (content.includes('Scaffold')) type = 'screen';

    // 접근성 이슈 찾기
    const issues: string[] = [];
    let accessibilityScore = 100;

    for (const rule of this.wcagRules) {
      const matches = content.match(rule.pattern);
      if (matches) {
        issues.push(`${rule.message} (WCAG ${rule.wcagCriterion})`);
        accessibilityScore -= rule.severity === 'error' ? 20 : rule.severity === 'warning' ? 10 : 5;
      }
    }

    accessibilityScore = Math.max(0, accessibilityScore);

    // 컴포넌트명 추출
    const classMatch = content.match(/class\s+(\w+)\s+extends/);
    const componentName = classMatch ? classMatch[1] : path.split('/').pop()?.replace('.dart', '') || 'Unknown';

    return {
      name: componentName,
      file: path,
      line: 1,
      type,
      accessibilityScore,
      issues,
      content,
      dependencies: this.extractDependencies(content)
    };
  }

  // 의존성 추출
  private extractDependencies(content: string): string[] {
    const imports = content.match(/import\s+['"](.+)['"]/g) || [];
    return imports.map(imp => imp.replace(/import\s+['"](.+)['"]/, '$1'));
  }

  // 사용자 저니 UML 생성 (학습용, 비시각화)
  private generateUserJourneyUML(components: FlutterComponent[]): string {
    const screens = components.filter(c => c.type === 'screen' || c.type === 'widget');
    
    let uml = '@startuml\n!theme plain\ntitle 사용자 저니 - 접근성 관점\n\n';
    
    uml += 'actor "사용자" as User\n';
    uml += 'participant "스크린 리더" as SR\n\n';

    screens.forEach((screen, index) => {
      uml += `participant "${screen.name}" as S${index}\n`;
    });

    uml += '\nUser -> S0: 앱 시작\n';
    uml += 'activate S0\n';

    screens.forEach((screen, index) => {
      if (screen.issues.length > 0) {
        uml += `S${index} -> SR: 접근성 정보 요청\n`;
        uml += `SR -> User: 불완전한 정보 전달\n`;
        uml += `note right: ${screen.issues.length}개 이슈 존재\n`;
      } else {
        uml += `S${index} -> SR: 완전한 접근성 정보\n`;
        uml += `SR -> User: 명확한 정보 전달\n`;
      }
    });

    uml += 'deactivate S0\n';
    uml += '@enduml';

    return uml;
  }

  // 요약 정보 계산
  private calculateSummary(components: FlutterComponent[]) {
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    components.forEach(component => {
      component.issues.forEach(issue => {
        if (issue.includes('이미지') || issue.includes('시맨틱')) errorCount++;
        else if (issue.includes('버튼') || issue.includes('포커스')) warningCount++;
        else infoCount++;
      });
    });

    return {
      totalFiles: components.length,
      totalIssues: errorCount + warningCount + infoCount,
      errorCount,
      warningCount,
      infoCount
    };
  }

  // 접근성 점수 계산
  calculateAccessibilityScore(content: string): number {
    let score = 100;
    
    for (const rule of this.wcagRules) {
      const matches = content.match(rule.pattern);
      if (matches) {
        score -= rule.severity === 'error' ? 20 : rule.severity === 'warning' ? 10 : 5;
      }
    }

    return Math.max(0, score);
  }

  // 새 프로젝트 분석 (간소화 - 코드 변경 감지 시 사용)
  async analyzeNewProject(path: string): Promise<ProjectStructure> {
    console.log(`새 프로젝트 분석: ${path}`);
    // 실제로는 VS Code Extension에서 파일 변경을 감지하고 새 파일 내용을 전달받을 예정
    return this.analyzeProject();
  }
} 