// src/types/accessibility.ts

// 접근성 이슈 타입
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
}

// 사용자 여정 타입
export interface UserJourney {
  id: string;
  persona: string;
  steps: JourneyStep[];
  issues: string[];
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

// WebSocket 메시지 타입
export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
  timestamp: number;
}

// WebSocket 메시지 타입 열거형
export enum WebSocketMessageType {
  // 클라이언트 -> 서버
  REQUEST_CODE_SUGGESTION = 'REQUEST_CODE_SUGGESTION',
  APPLY_CODE_SUGGESTION = 'APPLY_CODE_SUGGESTION',
  REQUEST_SCREENSHOT = 'REQUEST_SCREENSHOT',
  
  // 서버 -> 클라이언트
  SCREENSHOT_DATA = 'SCREENSHOT_DATA',
  ACCESSIBILITY_ISSUES = 'ACCESSIBILITY_ISSUES',
  PROJECT_ANALYSIS = 'PROJECT_ANALYSIS',
  CODE_SUGGESTION = 'CODE_SUGGESTION',
  ERROR = 'ERROR',
  CONNECTION_STATUS = 'CONNECTION_STATUS'
}

// WebSocket 메시지 데이터 타입들
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

export interface BoundingBox {
  issueId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  severity: 'error' | 'warning' | 'info';
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
