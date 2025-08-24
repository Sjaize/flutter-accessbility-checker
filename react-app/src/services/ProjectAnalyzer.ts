import * as fs from 'fs';
import * as path from 'path';

export interface FlutterComponent {
  name: string;
  file: string;
  line: number;
  type: 'widget' | 'screen' | 'service' | 'model' | 'util';
  accessibilityScore: number;
  issues: string[];
  content?: string;
  dependencies?: string[];
}

export interface ProjectStructure {
  projectPath: string;
  components: FlutterComponent[];
  totalScore: number;
  userJourneyUML: string;
  summary: {
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

export class ProjectAnalyzer {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async analyzeProject(): Promise<ProjectStructure> {
    console.log('프로젝트 분석 시작...');
    
    const components = await this.extractComponents();
    const userJourneyUML = this.generateUserJourneyUML(components);
    const summary = this.calculateSummary(components);

    return {
      projectPath: this.projectPath,
      components,
      totalScore: Math.round(summary.totalIssues === 0 ? 100 : Math.max(0, 100 - (summary.totalIssues * 10))),
      userJourneyUML,
      summary
    };
  }

  private async extractComponents(): Promise<FlutterComponent[]> {
    const components: FlutterComponent[] = [];
    const libPath = path.join(this.projectPath, 'lib');

    if (!fs.existsSync(libPath)) {
      console.log('lib 폴더를 찾을 수 없습니다.');
      return components;
    }

    const files = this.getAllDartFiles(libPath);
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const component = this.analyzeDartFile(file, content);
        if (component) {
          components.push(component);
        }
      } catch (error) {
        console.error(`파일 읽기 오류: ${file}`, error);
      }
    }

    return components;
  }

  private getAllDartFiles(dir: string): string[] {
    const files: string[] = [];
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getAllDartFiles(fullPath));
      } else if (item.endsWith('.dart')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private analyzeDartFile(filePath: string, content: string): FlutterComponent | null {
    const fileName = path.basename(filePath, '.dart');
    const relativePath = path.relative(this.projectPath, filePath);
    
    // 위젯 타입 판별
    let type: FlutterComponent['type'] = 'util';
    if (content.includes('class') && content.includes('extends StatelessWidget')) {
      type = 'widget';
    } else if (content.includes('class') && content.includes('extends StatefulWidget')) {
      type = 'widget';
    } else if (content.includes('class') && content.includes('extends State')) {
      type = 'widget';
    } else if (content.includes('class') && content.includes('extends ConsumerWidget')) {
      type = 'widget';
    } else if (content.includes('class') && content.includes('extends ConsumerStatefulWidget')) {
      type = 'widget';
    } else if (content.includes('class') && content.includes('extends ConsumerState')) {
      type = 'widget';
    } else if (content.includes('class') && content.includes('extends GetView')) {
      type = 'screen';
    } else if (content.includes('class') && content.includes('extends GetxController')) {
      type = 'service';
    } else if (content.includes('class') && content.includes('extends ChangeNotifier')) {
      type = 'service';
    } else if (content.includes('class') && content.includes('extends Bloc')) {
      type = 'service';
    }

    // 접근성 이슈 분석
    const issues = this.analyzeAccessibilityIssues(content);
    const accessibilityScore = this.calculateAccessibilityScore(content);

    return {
      name: fileName,
      file: relativePath,
      line: 1,
      type,
      accessibilityScore,
      issues,
      content,
      dependencies: this.extractDependencies(content)
    };
  }

  private analyzeAccessibilityIssues(content: string): string[] {
    const issues: string[] = [];
    
    // WCAG 2.2 기준 분석
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 1. 이미지에 alt 텍스트 없음
      if (line.includes('Image.asset(') && !line.includes('semanticsLabel')) {
        issues.push(`Line ${i + 1}: 이미지에 접근성 라벨이 없습니다.`);
      }
      
      // 2. 버튼에 라벨 없음
      if ((line.includes('ElevatedButton(') || line.includes('TextButton(') || line.includes('IconButton(')) && 
          !line.includes('semanticsLabel') && !line.includes('tooltip')) {
        issues.push(`Line ${i + 1}: 버튼에 접근성 라벨이 없습니다.`);
      }
      
      // 3. 텍스트 필드에 힌트 없음
      if (line.includes('TextField(') && !line.includes('hintText') && !line.includes('labelText')) {
        issues.push(`Line ${i + 1}: 텍스트 필드에 힌트나 라벨이 없습니다.`);
      }
      
      // 4. 색상만으로 정보 전달
      if (line.includes('color:') && (line.includes('Colors.red') || line.includes('Colors.green'))) {
        issues.push(`Line ${i + 1}: 색상만으로 정보를 전달하고 있습니다.`);
      }
      
      // 5. 충분한 색상 대비 없음
      if (line.includes('color:') && line.includes('Colors.grey')) {
        issues.push(`Line ${i + 1}: 색상 대비가 부족할 수 있습니다.`);
      }
    }
    
    return issues;
  }

  private calculateAccessibilityScore(content: string): number {
    let score = 100;
    const issues = this.analyzeAccessibilityIssues(content);
    
    // 이슈당 10점 감점
    score -= issues.length * 10;
    
    // 접근성 개선 요소 보너스
    if (content.includes('Semantics(')) score += 5;
    if (content.includes('semanticsLabel')) score += 5;
    if (content.includes('tooltip')) score += 5;
    if (content.includes('hintText')) score += 5;
    if (content.includes('labelText')) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const importRegex = /import\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }
    
    return dependencies;
  }

  private generateUserJourneyUML(components: FlutterComponent[]): string {
    const screens = components.filter(c => c.type === 'screen' || c.type === 'widget');
    
    let uml = '@startuml\n';
    uml += 'title Flutter App User Journey\n\n';
    
    for (const screen of screens) {
      uml += `rectangle "${screen.name}" as ${screen.name.replace(/[^a-zA-Z0-9]/g, '')}\n`;
    }
    
    uml += '\n';
    
    // 기본 플로우 (첫 번째 화면에서 마지막 화면으로)
    for (let i = 0; i < screens.length - 1; i++) {
      const current = screens[i].name.replace(/[^a-zA-Z0-9]/g, '');
      const next = screens[i + 1].name.replace(/[^a-zA-Z0-9]/g, '');
      uml += `${current} --> ${next} : Navigate\n`;
    }
    
    uml += '@enduml';
    
    return uml;
  }

  private calculateSummary(components: FlutterComponent[]): ProjectStructure['summary'] {
    let totalIssues = 0;
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    
    for (const component of components) {
      totalIssues += component.issues.length;
      
      for (const issue of component.issues) {
        if (issue.includes('이미지에 접근성 라벨이 없습니다') || issue.includes('버튼에 접근성 라벨이 없습니다')) {
          errorCount++;
        } else if (issue.includes('색상 대비가 부족할 수 있습니다')) {
          warningCount++;
        } else {
          infoCount++;
        }
      }
    }
    
    return {
      totalIssues,
      errorCount,
      warningCount,
      infoCount
    };
  }
} 