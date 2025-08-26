// VS Code 확장 프로그램과 공유하는 타입 정의
export interface AccessibilityIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  type: 'missing_label' | 'wrong_label' | 'missing_alt_text' | 'inappropriate_label';
  description: string;
  elementType: string;
  file: string;
  line: number;
  column: number;
  rect: { left: number; top: number; width: number; height: number };
  suggestedLabel?: string;
  suggestedCode?: string;
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
}

export interface BoundingBox {
  issueId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  severity: 'error' | 'warning' | 'info';
}

// WebSocket 메시지 타입
export enum WebSocketMessageType {
  REQUEST_CODE_SUGGESTION = 'REQUEST_CODE_SUGGESTION',
  APPLY_CODE_SUGGESTION = 'APPLY_CODE_SUGGESTION',
  REQUEST_SCREENSHOT = 'REQUEST_SCREENSHOT',
  SCREENSHOT_DATA = 'SCREENSHOT_DATA',
  ACCESSIBILITY_ISSUES = 'ACCESSIBILITY_ISSUES',
  PROJECT_ANALYSIS = 'PROJECT_ANALYSIS',
  CODE_SUGGESTION = 'CODE_SUGGESTION',
  ERROR = 'ERROR',
  CONNECTION_STATUS = 'CONNECTION_STATUS'
}

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
  timestamp: number;
}

export interface RequestCodeSuggestionData {
  issueId: string;
  file: string;
  line: number;
}

export interface ApplyCodeSuggestionData {
  suggestionId: string;
  file: string;
  line: number;
  code: string;
}

export interface ScreenshotData {
  imageBase64: string;
  boundingBoxes: BoundingBox[];
  timestamp: number;
}

export interface ErrorData {
  message: string;
  code: string;
  details?: any;
}

export interface ConnectionStatusData {
  status: 'connected' | 'disconnected' | 'error';
  message?: string;
}
