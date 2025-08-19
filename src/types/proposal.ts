// src/types/proposal.ts
export interface Proposal {
  issueId: string | number;
  file: string;
  range: { start: { line: number; col: number }; end: { line: number; col: number } };
  diff?: string;
  edits?: Array<{ file: string; start: { line: number; col: number }; end: { line: number; col: number }; newText: string }>;
  a11yDelta?: { before?: string; after?: string };
  rationale?: string;
}

export interface ProposalRequest {
  issue: {
    id: string | number;
    severity: 'error' | 'warning' | 'info';
    label?: string;
    description?: string;
    elementType?: string;
    rect: { left: number; top: number; width: number; height: number };
    source?: { file: string; line: number; column: number };
    m5Location?: { file: string; line: number; column: number };
  };
}

export interface ProposalResponse {
  issueId: string | number;
  file: string;
  range?: { start: { line: number; col: number }; end: { line: number; col: number } };
  diff?: string;
  edits?: Array<{ file: string; start: { line: number; col: number }; end: { line: number; col: number }; newText: string }>;
  a11yDelta?: { before?: string; after?: string };
  rationale?: string;
}

export interface ApplyRequest {
  issueId: string | number;
  file: string;
  line?: number;
  column?: number;
  diff?: string;
  edits?: Array<{ file: string; start: { line: number; col: number }; end: { line: number; col: number }; newText: string }>;
}

export interface ApplyResponse {
  issueId: string | number;
  ok: boolean;
  error?: string;
}

export interface CodeScope {
  range: { start: { line: number; col: number }; end: { line: number; col: number } };
  code: string;
}

export interface A11yMeta {
  label?: string;
  elementType?: string;
  rect?: { left: number; top: number; width: number; height: number };
  srNow?: string;
}

export interface LLMInput {
  language: string;
  file: string;
  scope: CodeScope;
  issue: ProposalRequest['issue'];
  a11yMeta: A11yMeta;
}

export interface LLMOutput {
  diff: string;
  a11yDelta: { before: string; after: string };
  rationale: string;
}
