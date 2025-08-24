import { FlutterComponent, AccessibilityIssue, Suggestion } from '../lib/types';

export class ProjectAnalyzer {
  private components: FlutterComponent[] = [];
  private issues: AccessibilityIssue[] = [];

  async analyzeProject(): Promise<{
    components: FlutterComponent[];
    issues: AccessibilityIssue[];
    accessibilityScore: number;
  }> {
    // Mock 데이터 기반 분석 (실제로는 Flutter 프로젝트 파일을 분석)
    this.components = await this.extractComponents();
    this.issues = await this.detectAccessibilityIssues();
    
    const accessibilityScore = this.calculateOverallAccessibilityScore();
    
    return {
      components: this.components,
      issues: this.issues,
      accessibilityScore
    };
  }

  async analyzeNewProject(path: string): Promise<{
    components: FlutterComponent[];
    issues: AccessibilityIssue[];
    accessibilityScore: number;
  }> {
    // 새 프로젝트 분석 (간소화된 버전)
    return this.analyzeProject();
  }

  private async extractComponents(): Promise<FlutterComponent[]> {
    // Mock Flutter 컴포넌트 데이터
    return [
      {
        name: 'HomeScreen',
        file: 'lib/screens/home_screen.dart',
        line: 1,
        type: 'screen',
        accessibilityScore: 75,
        issues: ['이미지 대체 텍스트 누락', '버튼 터치 영역 부족'],
        content: 'class HomeScreen extends StatelessWidget',
        dependencies: ['flutter/material.dart']
      },
      {
        name: 'CustomButton',
        file: 'lib/widgets/custom_button.dart',
        line: 15,
        type: 'widget',
        accessibilityScore: 85,
        issues: ['색상 대비 부족'],
        content: 'class CustomButton extends StatelessWidget',
        dependencies: ['flutter/material.dart']
      },
      {
        name: 'UserService',
        file: 'lib/services/user_service.dart',
        line: 8,
        type: 'service',
        accessibilityScore: 90,
        issues: [],
        content: 'class UserService',
        dependencies: ['dart:convert']
      }
    ];
  }

  private async detectAccessibilityIssues(): Promise<AccessibilityIssue[]> {
    // WCAG 2.2 규칙 기반 이슈 감지
    const issues: AccessibilityIssue[] = [
      // 기존 3개 이슈 (좌측)
      {
        id: '1',
        type: 'error',
        title: '이미지 대체 텍스트 누락',
        description: '전통 한복 인물 이미지에 대한 대체 텍스트가 없습니다.',
        position: { x: 50, y: 30 },
        element: '전통 한복 인물 이미지',
        side: 'left',
        bubblePosition: { x: -280, y: 25 },
        suggestions: [
          {
            id: '1-1',
            file: 'lib/home.dart',
            line: 42,
            column: 4,
            text: `Image.asset(\n  'assets/traditional_man.png',\n  semanticLabel: '전통 한복을 입고 갓을 쓴 남성 인물',\n)`,
            message: '이미지에 구체적인 semanticLabel 추가',
            type: 'error',
            element: '전통 한복 인물 이미지',
            position: { x: 50, y: 30 }
          }
        ]
      },
      {
        id: '2',
        type: 'warning',
        title: '버튼 터치 영역 부족',
        description: '"지금 시작하기" 버튼의 터치 영역이 44x44dp 미만입니다.',
        position: { x: 50, y: 85 },
        element: '"지금 시작하기" 버튼',
        side: 'left',
        bubblePosition: { x: -280, y: 80 },
        suggestions: [
          {
            id: '2-1',
            file: 'lib/home.dart',
            line: 88,
            column: 12,
            text: `Container(\n  constraints: BoxConstraints(minWidth: 44, minHeight: 44),\n  child: ElevatedButton(...),\n)`,
            message: '버튼에 최소 터치 영역(44x44dp) 보장',
            type: 'warning',
            element: '"지금 시작하기" 버튼',
            position: { x: 50, y: 85 }
          }
        ]
      },
      {
        id: '3',
        type: 'info',
        title: '제목 텍스트 대비 개선',
        description: '"나랏말싸미" 텍스트의 색상 대비를 개선할 수 있습니다.',
        position: { x: 50, y: 50 },
        element: '"나랏말싸미" 제목 텍스트',
        side: 'left',
        bubblePosition: { x: -280, y: 50 },
        suggestions: [
          {
            id: '3-1',
            file: 'lib/home.dart',
            line: 65,
            column: 8,
            text: `Text(\n  '나랏말싸미',\n  style: TextStyle(color: Colors.black87),\n)`,
            message: '텍스트 색상을 더 진하게 변경하여 대비 개선',
            type: 'info',
            element: '"나랏말싸미" 제목 텍스트',
            position: { x: 50, y: 50 }
          }
        ]
      },
      // 새로 발견된 5개 이슈 (우측)
      {
        id: '4',
        type: 'error',
        title: '시맨틱 정보 누락',
        description: '메뉴 버튼에 적절한 시맨틱 라벨이 없습니다.',
        position: { x: 80, y: 20 },
        element: '메뉴 버튼',
        side: 'right',
        bubblePosition: { x: 280, y: 20 },
        suggestions: [
          {
            id: '4-1',
            file: 'lib/widgets/menu_button.dart',
            line: 25,
            column: 6,
            text: `IconButton(\n  icon: Icon(Icons.menu),\n  onPressed: onPressed,\n  tooltip: '메뉴 열기',\n  semanticLabel: '메뉴 버튼',\n)`,
            message: 'IconButton에 semanticLabel과 tooltip 추가',
            type: 'error',
            element: '메뉴 버튼',
            position: { x: 80, y: 20 }
          }
        ]
      },
      {
        id: '5',
        type: 'warning',
        title: '포커스 순서 문제',
        description: '탭 순서가 논리적이지 않습니다.',
        position: { x: 80, y: 60 },
        element: '입력 필드들',
        side: 'right',
        bubblePosition: { x: 280, y: 60 },
        suggestions: [
          {
            id: '5-1',
            file: 'lib/screens/form_screen.dart',
            line: 45,
            column: 10,
            text: `TextField(\n  autofocus: false,\n  focusNode: _emailFocusNode,\n  // ...\n)`,
            message: 'TextField에 적절한 focusNode 설정',
            type: 'warning',
            element: '입력 필드들',
            position: { x: 80, y: 60 }
          }
        ]
      },
      {
        id: '6',
        type: 'info',
        title: '색상 의존성 경고',
        description: '색상만으로 정보를 전달하고 있습니다.',
        position: { x: 80, y: 80 },
        element: '상태 표시 아이콘',
        side: 'right',
        bubblePosition: { x: 280, y: 80 },
        suggestions: [
          {
            id: '6-1',
            file: 'lib/widgets/status_indicator.dart',
            line: 32,
            column: 8,
            text: `Container(\n  decoration: BoxDecoration(\n    color: isActive ? Colors.green : Colors.red,\n  ),\n  child: Icon(\n    isActive ? Icons.check_circle : Icons.error,\n    semanticLabel: isActive ? '활성 상태' : '비활성 상태',\n  ),\n)`,
            message: '색상 외에 아이콘과 라벨로 상태 표시',
            type: 'info',
            element: '상태 표시 아이콘',
            position: { x: 80, y: 80 }
          }
        ]
      },
      {
        id: '7',
        type: 'warning',
        title: '애니메이션 자동 재생',
        description: '자동 재생 애니메이션이 사용자 경험을 방해할 수 있습니다.',
        position: { x: 80, y: 40 },
        element: '로딩 애니메이션',
        side: 'right',
        bubblePosition: { x: 280, y: 40 },
        suggestions: [
          {
            id: '7-1',
            file: 'lib/widgets/loading_animation.dart',
            line: 18,
            column: 12,
            text: `AnimationController(\n  duration: Duration(seconds: 2),\n  vsync: this,\n)..repeat();`,
            message: '애니메이션에 일시정지 옵션 추가',
            type: 'warning',
            element: '로딩 애니메이션',
            position: { x: 80, y: 40 }
          }
        ]
      },
      {
        id: '8',
        type: 'error',
        title: '키보드 접근성 부족',
        description: '키보드로 접근할 수 없는 인터랙티브 요소가 있습니다.',
        position: { x: 80, y: 70 },
        element: '제스처 전용 버튼',
        side: 'right',
        bubblePosition: { x: 280, y: 70 },
        suggestions: [
          {
            id: '8-1',
            file: 'lib/widgets/gesture_button.dart',
            line: 28,
            column: 6,
            text: `GestureDetector(\n  onTap: onTap,\n  child: Container(\n    // ...\n  ),\n)\n// 대신 ElevatedButton 사용 권장`,
            message: 'GestureDetector 대신 키보드 접근 가능한 ElevatedButton 사용',
            type: 'error',
            element: '제스처 전용 버튼',
            position: { x: 80, y: 70 }
          }
        ]
      }
    ];

    return issues;
  }

  private calculateOverallAccessibilityScore(): number {
    if (this.components.length === 0) return 0;
    
    const totalScore = this.components.reduce((sum, component) => {
      return sum + component.accessibilityScore;
    }, 0);
    
    return Math.round(totalScore / this.components.length);
  }

  calculateAccessibilityScore(content: string): number {
    // 간단한 접근성 점수 계산 로직
    let score = 100;
    
    // 이미지 대체 텍스트 체크
    if (content.includes('Image.asset') && !content.includes('semanticLabel')) {
      score -= 15;
    }
    
    // 버튼 최소 크기 체크
    if (content.includes('ElevatedButton') && !content.includes('minWidth')) {
      score -= 10;
    }
    
    // 색상 대비 체크
    if (content.includes('Colors.grey') || content.includes('Colors.lightGrey')) {
      score -= 5;
    }
    
    // 시맨틱 정보 체크
    if (content.includes('IconButton') && !content.includes('semanticLabel')) {
      score -= 10;
    }
    
    return Math.max(0, score);
  }

  generateUserJourneyUML(): string {
    // 사용자 저니 UML 다이어그램 생성 (PlantUML 형식)
    return `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam activity {
  BackgroundColor LightBlue
  BorderColor DarkBlue
  FontColor Black
}

start
:사용자가 앱 실행;
:홈 화면 로드;
if (접근성 이슈 있음?) then (yes)
  :이슈 감지;
  :시각적 피드백 제공;
  :개선 제안 표시;
else (no)
  :정상 동작;
endif
:사용자 상호작용;
:접근성 검사 완료;
stop
@enduml`;
  }
} 