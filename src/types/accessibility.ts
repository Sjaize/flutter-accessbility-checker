// src/types/accessibility.ts

// 접근성 이슈 타입
export interface AccessibilityIssue {
  id: string;
  severity: 'error' | 'warning' | 'info' | 'high' | 'medium' | 'low';
  type: 'missing_label' | 'wrong_label' | 'missing_alt_text' | 'inappropriate_label' | 'missing_semantic_label';
  description: string;
  elementType: string;
  file: string;
  line: number;
  column: number;
  suggestedLabel?: string;
  suggestedCode?: string;
  originalCode?: string;  // 원본 코드 추가
  context?: string;
  impact?: string;
  userJourney?: string;
  detailedDescription?: string;
  confidence?: number;
  alternatives?: string[];
}

// Dart 클래스 타입
export interface DartClass {
  name: string;
  file: string;
  line: number;
  methods: DartMethod[];
  widgets: DartWidget[];
}

// Dart 메서드 타입
export interface DartMethod {
  name: string;
  line: number;
  column: number;
  returnType?: string;
  parameters: string[];
}

// Dart 위젯 타입
export interface DartWidget {
  name: string;
  line: number;
  column: number;
  hasSemanticLabel: boolean;
  semanticLabel?: string;
  hasAltText: boolean;
  altText?: string;
  code?: string;
}

// 사용자 여정 타입
export interface UserJourney {
  id: string;
  persona: string;
  steps: JourneyStep[];
  issues: string[];
  timestamp?: string;
}

// 여정 단계 타입
export interface JourneyStep {
  id: string;
  action: string;
  target: string;
  expected: string;
  actual: string;
  issues: string[];
}

// 프로젝트 분석 결과 타입
export interface ProjectAnalysis {
  projectName: string;
  totalFiles: number;
  totalClasses: number;
  totalWidgets: number;
  accessibilityIssues: AccessibilityIssue[];
  userJourneys: UserJourney[];
  analysisDate: string;
}

// 코드 제안 타입
export interface CodeSuggestion {
  id: string;
  issueId: string;
  file: string;
  line: number;
  originalCode: string;
  suggestedCode: string;
  explanation: string;
}


