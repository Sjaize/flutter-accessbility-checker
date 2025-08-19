// src/location-resolver.ts
import { ProposalRequest } from './types/proposal';

export class LocationResolver {
  private activeFile: string | null = null;

  constructor(activeFile?: string | null) {
    this.activeFile = activeFile || null;
  }

  setActiveFile(file: string | null) {
    this.activeFile = file;
  }

  // ── 위치 해결 (M5 + activeFile + issue.source) ──
  async resolveLocation(issue: ProposalRequest['issue']): Promise<{ file: string; line: number; column: number } | null> {
    // M5 매칭 결과 우선 사용
    if (issue.m5Location) {
      return {
        file: issue.m5Location.file,
        line: issue.m5Location.line,
        column: issue.m5Location.column
      };
    }
    
    // issue.source 사용
    if (issue.source) {
      return {
        file: issue.source.file,
        line: issue.source.line,
        column: issue.source.column
      };
    }
    
    // activeFile 폴백
    if (this.activeFile) {
      return {
        file: this.activeFile,
        line: 1,
        column: 1
      };
    }
    
    return null;
  }

  // ── 언어 추측 ──
  guessLanguage(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'dart': return 'dart';
      case 'tsx': return 'tsx';
      case 'ts': return 'ts';
      case 'js': return 'js';
      case 'kt': return 'kotlin';
      case 'java': return 'java';
      case 'swift': return 'swift';
      default: return 'dart';
    }
  }
}
