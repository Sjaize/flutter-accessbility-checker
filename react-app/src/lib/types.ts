export interface Suggestion {
  id: string;
  file: string;
  line: number;
  column: number;
  text: string;
  message: string;
  type: 'error' | 'warning' | 'info';
  element: string;
  position: { x: number; y: number };
}

export interface AccessibilityIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  position: { x: number; y: number };
  element: string;
  side: 'left' | 'right';
  bubblePosition: { x: number; y: number };
  suggestions: Suggestion[];
}

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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  umlDiagram?: string;
}

export interface LLMConfig {
  apiKey: string;
  model: 'gpt-4' | 'gpt-3.5-turbo';
  temperature: number;
}

export interface ReportData {
  version: string;
  timestamp: string;
  summary: string;
  issues: Array<{
    id: string;
    type: 'error' | 'warning' | 'info';
    title: string;
    description: string;
    file?: string;
    line?: number;
    suggestion: string;
  }>;
  chatHistory: ChatMessage[];
  statistics: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
  };
} 