export interface SourceLoc {
  line: number;
  column: number;
  file: string;
}

export interface FlutterComponent {
  name: string;
  type: string;
  location: SourceLoc;
  properties: Record<string, any>;
  children: FlutterComponent[];
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  location: SourceLoc;
  category: string;
  suggestions: Suggestion[];
  elementType?: string;
  element?: string;
  position?: { x: number; y: number };
  rectPct?: { left: number; top: number; width: number; height: number };
  label?: string;
  type?: string;
  source?: SourceLoc;
  m5Location?: SourceLoc;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface AccessibilityIssue extends Issue {
  wcagGuideline?: string;
  impact: 'high' | 'medium' | 'low';
  userGroups: string[];
}

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  code: string;
  location: SourceLoc;
  file?: string;
  line?: number;
  column?: number;
  text?: string;
  message?: string;
  type?: string;
  element?: string;
  position?: { x: number; y: number };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  relatedIssues?: string[];
}

export interface AnalysisResult {
  components: FlutterComponent[];
  issues: AccessibilityIssue[];
  suggestions: Suggestion[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface ReportData {
  projectName: string;
  analysisDate: Date;
  results: AnalysisResult;
  recommendations: string[];
}
