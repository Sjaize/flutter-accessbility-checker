// VS Code 확장 프로그램과 공유하는 타입 정의
export interface AccessibilityIssue {
  id: string;
  severity: 'error' | 'warning' | 'info' | 'high' | 'medium' | 'low';
  type: 'missing_label' | 'wrong_label' | 'missing_alt_text' | 'inappropriate_label' | 'missing_semantic_label';
  description: string;
  elementType: string;
  file: string;
  line: number;
  column: number;
  rect: { left: number; top: number; width: number; height: number };
  suggestedLabel?: string;
  suggestedCode?: string;
  context?: string;
  impact?: string;
  userJourney?: string;
  detailedDescription?: string;
  confidence?: number;
  alternatives?: string[];
}

export interface ProjectAnalysis {
  projectName: string;
  totalFiles: number;
  totalClasses: number;
  totalWidgets: number;
  accessibilityIssues: AccessibilityIssue[];
  userJourneys: UserJourney[];
  analysisDate: string;
}

export interface UserJourney {
  id: string;
  persona: string;
  steps: JourneyStep[];
  issues: string[];
}

export interface JourneyStep {
  id: string;
  action: string;
  target: string;
  expected: string;
  actual: string;
  issues: string[];
}

export interface CodeSuggestion {
  id: string;
  issueId: string;
  file: string;
  line: number;
  originalCode: string;
  suggestedCode: string;
  explanation: string;
  timestamp?: string;
}




