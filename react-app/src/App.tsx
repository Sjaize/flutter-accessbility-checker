// react-app/src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  AccessibilityIssue,
  ProjectAnalysis,
  CodeSuggestion
} from './types';

// VS Code API 타입 선언
declare global {
  interface Window {
    acquireVsCodeApi?: () => {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

// AI 서비스 클래스 (속도 제한 포함)
class SimpleAIService {
  private apiKey: string;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessing: boolean = false;
  private lastRequestTime: number = 0;
  private minInterval: number = 1000; // 1초 간격으로 요청 제한
  private maxRetries: number = 3;
  private retryDelay: number = 2000; // 2초 대기 후 재시도

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // 대기열에 요청 추가하고 순차 처리
  async generateAccessibilityDescription(issue: any, context: string): Promise<{
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
  }> {
    if (!this.apiKey) {
      return this.getDefaultDescription(issue);
    }

    return new Promise((resolve) => {
      this.requestQueue.push(async () => {
        try {
          const result = await this.makeAPIRequestWithRetry(issue, context);
          resolve(result);
        } catch (error) {
          console.error(`AI 설명 생성 실패 (이슈 ${issue.id}):`, error);
          resolve(this.getDefaultDescription(issue));
        }
      });

      this.processQueue();
    });
  }

  // Flutter 코드 제안 생성
  async generateFlutterCodeSuggestion(issue: any, context: string): Promise<{
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
    originalCode: string;
    suggestedCode: string;
    codeExplanation: string;
  }> {
    if (!this.apiKey) {
      return this.getDefaultCodeSuggestion(issue, context);
    }

    return new Promise((resolve) => {
      this.requestQueue.push(async () => {
        try {
          const result = await this.makeCodeSuggestionRequest(issue, context);
          resolve(result);
        } catch (error) {
          console.error(`Flutter 코드 제안 생성 실패 (이슈 ${issue.id}):`, error);
          resolve(this.getDefaultCodeSuggestion(issue, context));
        }
      });

      this.processQueue();
    });
  }

  // 대기열 처리
  private async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      // 최소 간격 보장
      if (timeSinceLastRequest < this.minInterval) {
        await this.delay(this.minInterval - timeSinceLastRequest);
      }

      const request = this.requestQueue.shift();
      if (request) {
        this.lastRequestTime = Date.now();
        await request();
      }
    }

    this.isProcessing = false;
  }

  // 재시도 로직이 포함된 API 요청
  private async makeAPIRequestWithRetry(issue: any, context: string, retryCount: number = 0): Promise<{
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
  }> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '당신은 Flutter 접근성 전문가입니다. 접근성 개선을 위한 구체적이고 실용적인 제안을 제공해주세요. 한국어로 응답해주세요.'
            },
            {
              role: 'user',
              content: `
다음 Flutter 접근성 이슈에 대한 구체적인 설명을 생성해주세요:

이슈 정보:
- 요소 타입: ${issue.elementType}
- 파일: ${issue.file}
- 라인: ${issue.line}
- 설명: ${issue.description}

코드 컨텍스트:
${context}

다음 JSON 형태로 응답해주세요:

{
  "suggestedLabel": "구체적이고 명확한 접근성 라벨 (예: '장바구니에 추가 버튼', '좋아요 아이콘')",
  "impact": "이 접근성 이슈가 시각장애인 사용자에게 미치는 구체적인 영향",
  "userJourney": "사용자 경험 관점에서의 개선 방향",
  "detailedDescription": "이 이슈를 해결하는 방법에 대한 상세한 설명"
}

모든 내용은 한국어로 작성하고, 구체적이고 실용적인 내용으로 작성해주세요.
`
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (response.status === 429) {
        // 429 에러 시 재시도
        if (retryCount < this.maxRetries) {
          console.warn(`API 요청 제한 초과. ${this.retryDelay}ms 후 재시도... (${retryCount + 1}/${this.maxRetries})`);
          await this.delay(this.retryDelay * (retryCount + 1)); // 지수 백오프
          return this.makeAPIRequestWithRetry(issue, context, retryCount + 1);
        } else {
          throw new Error(`API 요청 제한 초과 - 최대 재시도 횟수 도달`);
        }
      }

      if (!response.ok) {
        throw new Error(`OpenAI API 오류: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      return this.parseAccessibilityDescription(content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (retryCount < this.maxRetries && errorMessage.includes('429')) {
        console.warn(`네트워크 오류로 재시도... (${retryCount + 1}/${this.maxRetries})`);
        await this.delay(this.retryDelay * (retryCount + 1));
        return this.makeAPIRequestWithRetry(issue, context, retryCount + 1);
      }
      throw error;
    }
  }

  // Flutter 코드 제안 API 요청
  private async makeCodeSuggestionRequest(issue: any, context: string, retryCount: number = 0): Promise<{
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
    originalCode: string;
    suggestedCode: string;
    codeExplanation: string;
  }> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '당신은 Flutter 접근성 전문가입니다. 주어진 Flutter 코드를 분석하고 접근성을 개선한 구체적인 코드를 제안해주세요. 한국어로 응답해주세요.'
            },
            {
              role: 'user',
              content: `
다음 Flutter 접근성 이슈에 대한 구체적인 코드 제안을 생성해주세요:

이슈 정보:
- 요소 타입: ${issue.elementType}
- 파일: ${issue.file}
- 라인: ${issue.line}
- 설명: ${issue.description}
- 심각도: ${issue.severity}

코드 컨텍스트:
${context}

다음 JSON 형태로 응답해주세요:

{
  "suggestedLabel": "구체적이고 명확한 접근성 라벨 (예: '장바구니에 추가 버튼', '좋아요 아이콘')",
  "impact": "이 접근성 이슈가 시각장애인 사용자에게 미치는 구체적인 영향",
  "userJourney": "사용자 경험 관점에서의 개선 방향",
  "detailedDescription": "이 이슈를 해결하는 방법에 대한 상세한 설명",
  "originalCode": "현재 코드 (수정 전)",
  "suggestedCode": "접근성이 개선된 코드 (수정 후)",
  "codeExplanation": "코드 변경 사항에 대한 상세한 설명"
}

중요한 요구사항:
1. suggestedCode는 실제로 Flutter에서 작동하는 완전한 코드여야 합니다
2. Semantics, Tooltip, ExcludeSemantics 등의 접근성 위젯을 적절히 사용해야 합니다
3. 모든 내용은 한국어로 작성하고, 구체적이고 실용적인 내용으로 작성해주세요
4. 코드는 실제 Flutter 프로젝트에서 바로 사용할 수 있어야 합니다
`
            }
          ],
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (response.status === 429) {
        if (retryCount < this.maxRetries) {
          console.warn(`API 요청 제한 초과. ${this.retryDelay}ms 후 재시도... (${retryCount + 1}/${this.maxRetries})`);
          await this.delay(this.retryDelay * (retryCount + 1));
          return this.makeCodeSuggestionRequest(issue, context, retryCount + 1);
        } else {
          throw new Error(`API 요청 제한 초과 - 최대 재시도 횟수 도달`);
        }
      }

      if (!response.ok) {
        throw new Error(`OpenAI API 오류: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      return this.parseCodeSuggestion(content, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (retryCount < this.maxRetries && errorMessage.includes('429')) {
        console.warn(`네트워크 오류로 재시도... (${retryCount + 1}/${this.maxRetries})`);
        await this.delay(this.retryDelay * (retryCount + 1));
        return this.makeCodeSuggestionRequest(issue, context, retryCount + 1);
      }
      throw error;
    }
  }

  // 지연 함수
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseAccessibilityDescription(content: string): {
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          suggestedLabel: parsed.suggestedLabel || '접근성 라벨',
          impact: parsed.impact || '시각장애인 사용자에게 영향을 미칠 수 있습니다.',
          userJourney: parsed.userJourney || '사용자 경험 개선이 필요합니다.',
          detailedDescription: parsed.detailedDescription || '접근성 개선이 필요합니다.'
        };
      }
    } catch (error) {
      console.error('JSON 파싱 실패:', error);
    }

    return this.getDefaultDescription({ elementType: 'Unknown' });
  }

  private parseCodeSuggestion(content: string, context: string): {
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
    originalCode: string;
    suggestedCode: string;
    codeExplanation: string;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          suggestedLabel: parsed.suggestedLabel || '접근성 라벨',
          impact: parsed.impact || '시각장애인 사용자에게 영향을 미칠 수 있습니다.',
          userJourney: parsed.userJourney || '사용자 경험 개선이 필요합니다.',
          detailedDescription: parsed.detailedDescription || '접근성 개선이 필요합니다.',
          originalCode: parsed.originalCode || context || '원본 코드를 불러올 수 없습니다.',
          suggestedCode: parsed.suggestedCode || this.generateDefaultSuggestedCode(context),
          codeExplanation: parsed.codeExplanation || '접근성 개선을 위한 코드 수정이 필요합니다.'
        };
      }
    } catch (error) {
      console.error('JSON 파싱 실패:', error);
    }

    return this.getDefaultCodeSuggestion({ elementType: 'Unknown' }, context);
  }

  private getDefaultDescription(issue: any): {
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
  } {
    return {
      suggestedLabel: `${issue.elementType} 상세한 설명`,
      impact: '시각장애인 사용자가 이 요소의 기능을 이해하기 어려울 수 있습니다.',
      userJourney: '스크린 리더가 이 요소를 읽을 때 명확한 설명이 필요합니다.',
      detailedDescription: '이 요소에 접근성 라벨을 추가하여 사용자가 기능을 이해할 수 있도록 개선해야 합니다.'
    };
  }

  private getDefaultCodeSuggestion(issue: any, context: string): {
    suggestedLabel: string;
    impact: string;
    userJourney: string;
    detailedDescription: string;
    originalCode: string;
    suggestedCode: string;
    codeExplanation: string;
  } {
    return {
      suggestedLabel: `${issue.elementType} 상세한 설명`,
      impact: '시각장애인 사용자가 이 요소의 기능을 이해하기 어려울 수 있습니다.',
      userJourney: '스크린 리더가 이 요소를 읽을 때 명확한 설명이 필요합니다.',
      detailedDescription: '이 요소에 접근성 라벨을 추가하여 사용자가 기능을 이해할 수 있도록 개선해야 합니다.',
      originalCode: context || '원본 코드를 불러올 수 없습니다.',
      suggestedCode: this.generateDefaultSuggestedCode(context),
      codeExplanation: 'Semantics 위젯을 추가하여 접근성을 개선했습니다.'
    };
  }

  private generateDefaultSuggestedCode(context: string): string {
    // 기본적인 접근성 개선 코드 생성
    if (context.includes('ElevatedButton') || context.includes('TextButton') || context.includes('IconButton')) {
      return context.replace(
        /(ElevatedButton|TextButton|IconButton)(\s*\([^)]*\))/,
        'Semantics(\n        label: "접근성 라벨",\n        child: $1$2\n      )'
      );
    } else if (context.includes('Image') || context.includes('Icon')) {
      return context.replace(
        /(Image|Icon)(\s*\([^)]*\))/,
        'Semantics(\n        label: "이미지 설명",\n        child: $1$2\n      )'
      );
    } else {
      return `Semantics(\n      label: "접근성 라벨",\n      child: ${context}\n    )`;
    }
  }
}

function App() {
  // 상태 관리
  const [accessibilityIssues, setAccessibilityIssues] = useState<AccessibilityIssue[]>([]);
  const [flutterAppUrl, setFlutterAppUrl] = useState<string>('http://localhost:64022');
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [jsonData, setJsonData] = useState<any>(null);
  const [selectedIssue, setSelectedIssue] = useState<AccessibilityIssue | null>(null);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [codeSuggestion, setCodeSuggestion] = useState<CodeSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [projectAnalysis, setProjectAnalysis] = useState<ProjectAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiService, setAiService] = useState<SimpleAIService | null>(null);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [simpleView, setSimpleView] = useState<boolean>(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [aiProcessingStatus, setAiProcessingStatus] = useState<string>('');
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [resolvedIssues, setResolvedIssues] = useState<string[]>([]);

  useEffect(() => {
    // 먼저 public 폴더에서 JSON 파일을 로드하고, 실패하면 로컬 스토리지에서 로드
    loadDataFromPublic().catch(() => {
      loadJsonDataFromStorage();
    });
    initializeAIService();
  }, []);

  // 해결된 이슈 목록 로드
  useEffect(() => {
    const loadResolvedIssuesData = async () => {
      try {
        const response = await fetch('/resolved-issues.json');
        if (response.ok) {
          const resolved = await response.json();
          setResolvedIssues(resolved);
        }
      } catch (error) {
        console.log('해결된 이슈 목록 로드 실패:', error);
      }
    };

    loadResolvedIssuesData();
    
    // 주기적으로 해결된 이슈 목록 업데이트
    const interval = setInterval(loadResolvedIssuesData, 5000);
    return () => clearInterval(interval);
  }, []);

  // 데이터가 로드된 후에만 주기적 새로고침 시작
  useEffect(() => {
    if (!jsonData) return;

    const interval = setInterval(() => {
      // AI 처리 중이 아니면 새로고침 수행
      if (!aiProcessingStatus) {
        loadDataFromPublic().catch(() => {
          // 실패해도 에러를 표시하지 않음 (백그라운드 새로고침)
        });
      }
    }, 10000); // 10초로 연장하여 API 부하 감소

    return () => clearInterval(interval);
  }, [jsonData, aiProcessingStatus]);

  // AI 서비스 초기화
  const initializeAIService = () => {
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY || 
                   process.env.REACT_APP_OPENAI_API_KEY2 || 
                   localStorage.getItem('openai_api_key') || '';
    if (apiKey) {
      setAiService(new SimpleAIService(apiKey));
      console.log('✅ AI 서비스가 초기화되었습니다.');
    } else {
      console.log('⚠️ OpenAI API 키가 설정되지 않았습니다.');
    }
  };

  // public 폴더에서 JSON 파일 로드
  const loadDataFromPublic = async () => {
    try {
      // public 폴더의 JSON 파일들을 로드
      const jsonFiles = ['accessibility-analysis.json', 'label-analysis.json'];
      let loadedData: any = {};
      
      for (const jsonFile of jsonFiles) {
        try {
          const response = await fetch(`/${jsonFile}`);
          if (response.ok) {
            const data = await response.json();
            if (jsonFile === 'accessibility-analysis.json') {
              loadedData.accessibilityAnalysis = data;
            } else if (jsonFile === 'label-analysis.json') {
              loadedData.labelAnalysis = data;
            }
            console.log(`✅ ${jsonFile} 로드 성공`);
          }
        } catch (fileError) {
          console.log(`⚠️ ${jsonFile} 로드 실패: ${fileError}`);
        }
      }
      
      if (Object.keys(loadedData).length > 0) {
        setJsonData(loadedData);
        
        // 접근성 이슈 데이터 추출 및 AI 설명 생성
        if (loadedData.accessibilityAnalysis?.accessibilityIssues) {
          await enhanceIssuesWithAI(loadedData.accessibilityAnalysis.accessibilityIssues);
        }
        
        // 프로젝트 분석 데이터 추출
        if (loadedData.accessibilityAnalysis) {
          setProjectAnalysis(loadedData.accessibilityAnalysis);
        }
        
        console.log('✅ public 폴더에서 데이터 로드됨');
        setError(null);
        
        // 로컬 스토리지에 저장
        saveJsonDataToStorage(loadedData);
      } else {
        console.log('⚠️ public 폴더에 JSON 파일이 없습니다.');
        setError('JSON 파일을 찾을 수 없습니다. VS Code에서 접근성 분석을 실행하고 JSON 파일을 복사해주세요.');
      }
    } catch (error) {
      console.error('❌ public 폴더 데이터 로드 실패:', error);
      setError('JSON 파일을 로드할 수 없습니다. VS Code에서 분석을 실행해주세요.');
    }
  };

  // 로컬 스토리지에서 JSON 데이터 로드 (폴백)
  const loadJsonDataFromStorage = () => {
    try {
      const storedData = localStorage.getItem('flutterAccessibilityData');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setJsonData(parsedData);
        
        // 접근성 이슈 데이터 추출 및 AI 설명 생성
        if (parsedData.accessibilityIssues) {
          enhanceIssuesWithAI(parsedData.accessibilityIssues);
        }
        
        // 프로젝트 분석 데이터 추출
        if (parsedData.projectAnalysis) {
          setProjectAnalysis(parsedData.projectAnalysis);
        }
        
        console.log('✅ 로컬 스토리지에서 데이터 로드됨');
      }
    } catch (error) {
      console.error('❌ 로컬 스토리지 데이터 로드 실패:', error);
      setError('저장된 데이터를 로드할 수 없습니다.');
    }
  };

  // AI를 사용하여 이슈 설명 강화 (속도 제한 및 진행 상황 표시)
  const enhanceIssuesWithAI = async (issues: AccessibilityIssue[]) => {
    if (!aiService) {
      setAccessibilityIssues(issues);
      return;
    }

    // 이미 AI 분석이 완료된 이슈들은 스킵
    const needsProcessing = issues.filter(issue => 
      !issue.suggestedLabel || 
      !issue.impact || 
      !issue.userJourney || 
      !issue.detailedDescription
    );

    if (needsProcessing.length === 0) {
      setAccessibilityIssues(issues);
      return;
    }

    // 초기 상태 설정
    setTotalCount(needsProcessing.length);
    setProcessedCount(0);
    setAiProcessingStatus('학습 준비 중...');
    
    // 기본 이슈 먼저 표시
    setAccessibilityIssues(issues);

    const enhancedIssues: AccessibilityIssue[] = [];
    let processedIssues = 0;

    // 순차적으로 처리하여 API 요청 속도 제한
    for (const issue of issues) {
      // 이미 처리된 이슈는 스킵
      if (issue.suggestedLabel && issue.impact && issue.userJourney && issue.detailedDescription) {
        enhancedIssues.push(issue);
        continue;
      }

      try {
        setAiProcessingStatus(`AI 분석 중... (${processedIssues + 1}/${needsProcessing.length})`);
        
        const aiDescription = await aiService.generateAccessibilityDescription(issue, issue.context || '');
        
        const enhancedIssue = {
          ...issue,
          suggestedLabel: aiDescription.suggestedLabel,
          impact: aiDescription.impact,
          userJourney: aiDescription.userJourney,
          detailedDescription: aiDescription.detailedDescription
        };
        
        enhancedIssues.push(enhancedIssue);
        processedIssues++;
        setProcessedCount(processedIssues);
        
        // 실시간으로 갱신된 이슈 표시
        setAccessibilityIssues([...enhancedIssues, ...issues.slice(enhancedIssues.length)]);
        
      } catch (error) {
        console.error(`AI 설명 생성 실패 (이슈 ${issue.id}):`, error);
        enhancedIssues.push(issue); // 실패한 경우 원본 이슈 유지
        processedIssues++;
        setProcessedCount(processedIssues);
      }
    }

    setAiProcessingStatus('분석 완료!');
    setAccessibilityIssues(enhancedIssues);
    
    // 3초 후 상태 메시지 숨김
    setTimeout(() => {
      setAiProcessingStatus('');
    }, 3000);
  };

  // JSON 데이터를 로컬 스토리지에 저장
  const saveJsonDataToStorage = (data: any) => {
    try {
      localStorage.setItem('flutterAccessibilityData', JSON.stringify(data));
      console.log('✅ 데이터가 로컬 스토리지에 저장됨');
    } catch (error) {
      console.error('❌ 로컬 스토리지 저장 실패:', error);
      setError('데이터를 저장할 수 없습니다.');
    }
  };

  // 파일 업로드로 JSON 데이터 로드
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData = JSON.parse(content);
        setJsonData(parsedData);
        saveJsonDataToStorage(parsedData);
        
        // 접근성 이슈 데이터 추출 및 AI 설명 생성
        if (parsedData.accessibilityIssues) {
          await enhanceIssuesWithAI(parsedData.accessibilityIssues);
        }
        
        // 프로젝트 분석 데이터 추출
        if (parsedData.projectAnalysis) {
          setProjectAnalysis(parsedData.projectAnalysis);
        }
        
        setError(null);
        console.log('✅ JSON 파일 로드 성공');
      } catch (error) {
        console.error('❌ JSON 파싱 실패:', error);
        setError('유효하지 않은 JSON 파일입니다.');
      }
    };
    reader.readAsText(file);
  };

  // 접근성 검사 수행 (iframe 로드 후)
  const performAccessibilityCheck = () => {
    console.log('🔍 접근성 검사 수행');
    // 여기서 실제 접근성 검사 로직을 구현할 수 있습니다
  };

  // 코드 제안 요청
  const requestCodeSuggestion = async (issue: AccessibilityIssue) => {
    console.log('💡 코드 제안 요청:', issue);
    
    if (!aiService) {
      alert('AI 서비스가 초기화되지 않았습니다.');
      return;
    }

    setIsLoading(true);
    
    try {
      // AI 서비스를 통해 실제 Flutter 코드 제안 생성
      const aiResult = await aiService.generateFlutterCodeSuggestion(
        issue, 
        issue.context || '코드 컨텍스트를 불러올 수 없습니다.'
      );
      
      // 코드 제안 객체 생성
      const suggestion: CodeSuggestion = {
        id: `suggestion-${issue.id}`,
        issueId: issue.id,
        file: issue.file,
        line: issue.line,
        originalCode: aiResult.originalCode,
        suggestedCode: aiResult.suggestedCode,
        explanation: generateExplanation(issue, aiResult),
        timestamp: new Date().toISOString()
      };
      
      setCodeSuggestion(suggestion);
      setSelectedIssue(issue);
      setShowCodePreview(true);
      
      console.log('✅ AI 코드 제안 생성 완료:', suggestion);
    } catch (error) {
      console.error('❌ AI 코드 제안 생성 실패:', error);
      alert('코드 제안 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  // 설명 생성
  const generateExplanation = (issue: AccessibilityIssue, aiResult?: any): string => {
    let explanation = '';
    
    // AI 결과가 있으면 AI 결과를 우선 사용
    if (aiResult) {
      if (aiResult.impact) {
        explanation += `**영향**: ${aiResult.impact}\n\n`;
      }
      
      if (aiResult.userJourney) {
        explanation += `**사용자 경험**: ${aiResult.userJourney}\n\n`;
      }
      
      if (aiResult.detailedDescription) {
        explanation += `**상세 설명**: ${aiResult.detailedDescription}\n\n`;
      }
      
      if (aiResult.codeExplanation) {
        explanation += `**코드 변경 설명**: ${aiResult.codeExplanation}\n\n`;
      }
      
      if (aiResult.suggestedLabel) {
        explanation += `**제안 라벨**: ${aiResult.suggestedLabel}\n\n`;
      }
    } else {
      // 기존 로직 (하위 호환성)
      if (issue.impact) {
        explanation += `**영향**: ${issue.impact}\n\n`;
      }
      
      if (issue.userJourney) {
        explanation += `**사용자 경험**: ${issue.userJourney}\n\n`;
      }
      
      if (issue.detailedDescription) {
        explanation += `**상세 설명**: ${issue.detailedDescription}\n\n`;
      }
    }
    
    explanation += `**해결 방법**: Semantics 위젯을 추가하여 스크린 리더가 "${aiResult?.suggestedLabel || issue.suggestedLabel || '접근성 라벨'}"라고 명시적으로 읽을 수 있도록 개선했습니다.`;
    
    return explanation;
  };

  // VS Code 명령어 시뮬레이션 (개발 환경용)
  const simulateVSCodeCommand = async (commandData: any): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('🔄 VS Code 명령어 시뮬레이션 시작:', commandData);
      
      // 실제로는 VS Code에서 실행되어야 하지만, 개발 환경에서는 시뮬레이션
      // 여기서는 로컬 스토리지에 코드 변경사항을 저장하고 사용자에게 안내
      
      const changeRecord = {
        id: `change_${Date.now()}`,
        timestamp: new Date().toISOString(),
        file: commandData.file,
        line: commandData.line,
        originalCode: commandData.originalCode,
        suggestedCode: commandData.suggestedCode,
        status: 'pending',
        note: 'VS Code에서 수동으로 적용 필요'
      };
      
      // 변경사항을 로컬 스토리지에 저장
      const pendingChanges = JSON.parse(localStorage.getItem('pendingCodeChanges') || '[]');
      pendingChanges.push(changeRecord);
      localStorage.setItem('pendingCodeChanges', JSON.stringify(pendingChanges));
      
      console.log('✅ 코드 변경사항이 로컬에 저장되었습니다:', changeRecord);
      
      return { success: true };
    } catch (error) {
      console.error('❌ VS Code 명령어 시뮬레이션 실패:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  };

  // 코드 제안 적용
  const applyCodeSuggestion = async () => {
    if (!codeSuggestion) return;
    
    console.log('✅ 코드 제안 적용:', codeSuggestion);
    
    try {
      // VS Code 확장 프로그램 명령어 호출
      const vscodeCommand = `flutter-accessibility.applyCodeSuggestion`;
      const commandData = {
        file: codeSuggestion.file,
        line: codeSuggestion.line,
        originalCode: codeSuggestion.originalCode,
        suggestedCode: codeSuggestion.suggestedCode,
        issueId: codeSuggestion.issueId
      };
      
      // VS Code 명령어 실행
      if (typeof window.acquireVsCodeApi !== 'undefined') {
        // VS Code 웹뷰 내부에서 실행 중인 경우
        const vscode = window.acquireVsCodeApi();
        vscode.postMessage({
          command: vscodeCommand,
          data: commandData
        });
        
        // 성공 메시지 표시
        setNotification('✅ VS Code 명령어가 실행되었습니다!');
        setTimeout(() => setNotification(null), 3000);
        
        // 모달 닫기
        setShowCodePreview(false);
        setCodeSuggestion(null);
        
        // 로컬 스토리지에 저장
        const appliedSuggestions = JSON.parse(localStorage.getItem('appliedSuggestions') || '[]');
        appliedSuggestions.push({
          ...codeSuggestion,
          appliedAt: new Date().toISOString(),
          vsCodeApplied: true
        });
        localStorage.setItem('appliedSuggestions', JSON.stringify(appliedSuggestions));
        
      } else {
        // 일반 브라우저에서 실행 중인 경우 (개발/테스트용)
        console.log('VS Code 웹뷰가 아닌 환경에서 실행 중입니다.');
        console.log('명령어:', vscodeCommand);
        console.log('데이터:', commandData);
        
        // 만약 상위 컨텍스트가 VS Code 웹뷰인 경우 메시지 브리지 시도
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ command: vscodeCommand, data: commandData }, '*');
            setNotification('✅ VS Code로 적용 요청을 전송했습니다.');
            setTimeout(() => setNotification(null), 3000);
          }
        } catch (bridgeError) {
          console.warn('웹뷰 브리지 전송 실패:', bridgeError);
        }

        // 개발 환경에서도 VS Code 명령어 실행 시도
        try {
          // VS Code 명령어를 시뮬레이션하여 실제 코드 수정 시도
          const result = await simulateVSCodeCommand(commandData);
          
          if (result.success) {
            setNotification('✅ 코드가 성공적으로 수정되었습니다! (시뮬레이션)');
            setTimeout(() => setNotification(null), 3000);
          } else {
            throw new Error(result.error);
          }
        } catch (simulationError) {
          console.log('VS Code 시뮬레이션 실패, 로컬 저장으로 대체');
          
          // 로컬 저장
          const appliedSuggestions = JSON.parse(localStorage.getItem('appliedSuggestions') || '[]');
          appliedSuggestions.push({
            ...codeSuggestion,
            appliedAt: new Date().toISOString(),
            vsCodeApplied: false,
            note: 'VS Code 웹뷰가 아닌 환경에서 실행됨'
          });
          localStorage.setItem('appliedSuggestions', JSON.stringify(appliedSuggestions));
          
          setNotification('💡 개발 환경에서 실행 중입니다. VS Code에서 수동으로 적용해주세요.');
          setTimeout(() => setNotification(null), 5000);
        }
        
        setShowCodePreview(false);
        setCodeSuggestion(null);
      }
      
    } catch (error) {
      console.error('❌ 코드 적용 실패:', error);
      
      // 에러 시 로컬 저장
      const appliedSuggestions = JSON.parse(localStorage.getItem('appliedSuggestions') || '[]');
      appliedSuggestions.push({
        ...codeSuggestion,
        appliedAt: new Date().toISOString(),
        vsCodeApplied: false,
        error: error instanceof Error ? error.message : String(error)
      });
      localStorage.setItem('appliedSuggestions', JSON.stringify(appliedSuggestions));
      
      setShowCodePreview(false);
      setCodeSuggestion(null);
      
      setNotification('❌ 코드 적용에 실패했습니다. 로컬에 저장되었습니다.');
      setTimeout(() => setNotification(null), 5000);
    }
  };

  // 심각도별 색상 반환
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high': return 'red';
      case 'medium': return 'yellow';
      case 'low': return 'green';
      default: return 'gray';
    }
  };

  // 심각도별 텍스트 반환
  const getSeverityText = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high': return '높음';
      case 'medium': return '보통';
      case 'low': return '낮음';
      default: return '알 수 없음';
    }
  };

  // 간소화된 이슈 카드 렌더링
  const renderSimpleIssueCard = (issue: AccessibilityIssue) => {
    const severityColors = {
      error: 'border-red-500',
      warning: 'border-yellow-500',
      info: 'border-blue-500',
      high: 'border-red-500',
      medium: 'border-yellow-500',
      low: 'border-blue-500'
    };

    const severityBadgeColors = {
      error: 'bg-red-100 text-red-800',
      warning: 'bg-yellow-100 text-yellow-800',
      info: 'bg-blue-100 text-blue-800',
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800'
    };

    return (
      <div key={issue.id} className={`p-4 border-l-4 bg-white rounded-lg shadow-sm mb-3 ${severityColors[issue.severity as keyof typeof severityColors] || 'border-gray-500'}`}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityBadgeColors[issue.severity as keyof typeof severityBadgeColors] || 'bg-gray-100 text-gray-800'}`}>
              {getSeverityText(issue.severity)}
            </span>
            <span className="text-sm font-medium text-gray-900">{issue.elementType}</span>
          </div>
          <span className="text-xs text-gray-500">{issue.file}:{issue.line}</span>
        </div>

        {issue.suggestedLabel && (
          <div className="mb-3">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-green-700">💡 제안:</span>
              <span className="text-sm text-green-800 bg-green-50 px-2 py-1 rounded font-medium">
                {issue.suggestedLabel}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {issue.confidence && (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-gray-500">신뢰도:</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map(star => (
                    <span
                      key={star}
                      className={`text-xs ${star <= (issue.confidence! * 5) ? 'text-yellow-400' : 'text-gray-300'}`}
                    >
                      ⭐
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <button
            onClick={() => {
              // 간단 보기에서도 모달 열기 + 코드 제안 요청 실행
              setSelectedIssue(issue);
              requestCodeSuggestion(issue);
            }}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
          >
            개선하기
          </button>
        </div>

        {showDetails[issue.id] && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-3">
              {issue.impact && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-1">⚠️ 영향:</h4>
                  <p className="text-sm text-gray-700">{issue.impact}</p>
                </div>
              )}
              
              {issue.suggestedCode && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-1">📋 개선 코드:</h4>
                  <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                    <code>{issue.suggestedCode}</code>
                  </pre>
                </div>
              )}

              {issue.alternatives && issue.alternatives.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-1">🔄 대안:</h4>
                  <div className="flex flex-wrap gap-1">
                    {issue.alternatives.map((alt: string, index: number) => (
                      <span key={index} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {alt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowDetails(prev => ({ ...prev, [issue.id]: !prev[issue.id] }))}
          className="mt-2 text-xs text-gray-500 hover:text-gray-700"
        >
          {showDetails[issue.id] ? '▲ 간단히 보기' : '▼ 자세히 보기'}
        </button>
      </div>
    );
  };

  // 개선 적용 함수
  const applyFix = async (issue: AccessibilityIssue) => {
    try {
      // 제안 코드를 클립보드에 복사
      if (issue.suggestedCode) {
        await navigator.clipboard.writeText(issue.suggestedCode);
        setNotification('개선 코드가 클립보드에 복사되었습니다!');
        
        // 알림 3초 후 제거
        setTimeout(() => setNotification(null), 3000);
      }
      
      // 이슈 파일 위치 출력
      console.log(`📁 파일: ${issue.file}:${issue.line}:${issue.column}`);
      console.log(`💡 제안: ${issue.suggestedLabel}`);
      
    } catch (error) {
      console.error('개선 적용 실패:', error);
      setNotification('개선 적용에 실패했습니다.');
      setTimeout(() => setNotification(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Flutter 접근성 체커</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* JSON 파일 업로드 */}
              <label className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                JSON 파일 업로드
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              
              {/* 데이터 새로고침 */}
              <button
                onClick={loadDataFromPublic}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                새로고침
              </button>
              
              {/* 뷰 전환 버튼 */}
              <button
                onClick={() => setSimpleView(!simpleView)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  simpleView 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                }`}
              >
                {simpleView ? '간단 보기' : '상세 보기'}
              </button>
              
              {/* 상태 표시 */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${jsonData ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {jsonData ? 'JSON 데이터 로드됨' : 'JSON 데이터 없음'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
              <p className="text-xs text-red-600 mt-1">
                💡 해결 방법: VS Code에서 "Flutter 접근성 분석 시작" 명령어를 실행해주세요.
              </p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600"
              >
                <span className="sr-only">닫기</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Flutter 앱 미러링 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b">
                <h2 className="text-lg font-medium text-gray-900">Flutter 앱 미러링</h2>
                <p className="text-sm text-gray-500">실시간 스크린샷과 바운딩 박스</p>
              </div>

              <div className="relative flex justify-center p-4">
                {/* Flutter 앱 iframe - 모바일 사이즈 */}
                <div className="relative" style={{ width: '375px', height: '667px' }}>
                  <div className="relative w-full h-full bg-gray-900 rounded-3xl p-2 shadow-2xl">
                    <div className="w-full h-full bg-white rounded-2xl overflow-hidden">
                      <iframe
                        key={iframeKey}
                        src={flutterAppUrl}
                        className="w-full h-full border-0"
                        title="Flutter 앱"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        allow="fullscreen; camera; microphone; geolocation"
                        onLoad={() => {
                          console.log('✅ Flutter 앱 iframe 로드 완료');
                          // iframe 로드 후 접근성 검사 수행
                          performAccessibilityCheck();
                        }}
                        onError={() => {
                          console.error('❌ Flutter 앱 iframe 로드 실패');
                          setError('Flutter 앱을 로드할 수 없습니다. 앱이 실행 중인지 확인해주세요.');
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-center mt-2 text-sm text-gray-500">📱 모바일 뷰 (375x667)</div>
                </div>
              </div>
            </div>
          </div>

          {/* 접근성 이슈 목록 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b">
                <h2 className="text-lg font-medium text-gray-900">접근성 이슈</h2>
                <p className="text-sm text-gray-500">
                  {accessibilityIssues.filter(issue => !resolvedIssues.includes(issue.id)).length}개 미해결 
                  {resolvedIssues.length > 0 && `, ${resolvedIssues.length}개 해결됨`}
                </p>
                
                {/* AI 처리 상태 표시 */}
                {aiProcessingStatus && (
                  <div className="mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm text-blue-700">{aiProcessingStatus}</span>
                    </div>
                    {totalCount > 0 && (
                      <div className="mt-1">
                        <div className="w-full bg-blue-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(processedCount / totalCount) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-blue-600">{processedCount}/{totalCount}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {jsonData && (
                  <div className="mt-2 flex space-x-2">
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">데이터 로드됨</span>
                    <button
                      onClick={() => {
                        setJsonData(null);
                        setAccessibilityIssues([]);
                        setProjectAnalysis(null);
                        setAiProcessingStatus('');
                        setProcessedCount(0);
                        setTotalCount(0);
                      }}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200"
                    >
                      초기화
                    </button>
                  </div>
                )}
              </div>
              
              <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                {accessibilityIssues.filter(issue => !resolvedIssues.includes(issue.id)).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">
                      {accessibilityIssues.length === 0 ? '발견된 이슈가 없습니다.' : '모든 이슈가 해결되었습니다! 🎉'}
                    </p>
                    {!jsonData && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400">JSON 파일을 업로드하여 접근성 이슈를 확인하세요.</p>
                        <label className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium inline-block">
                          JSON 파일 선택
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  simpleView ? (
                    accessibilityIssues
                      .filter(issue => !resolvedIssues.includes(issue.id))
                      .map((issue) => renderSimpleIssueCard(issue))
                  ) : (
                    accessibilityIssues
                      .filter(issue => !resolvedIssues.includes(issue.id))
                      .map((issue) => (
                    <div
                      key={issue.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedIssue?.id === issue.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedIssue(issue)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className={`px-2 py-1 text-xs rounded-full text-white bg-${getSeverityColor(issue.severity)}-500`}>
                              {getSeverityText(issue.severity)}
                            </span>
                            <span className="text-xs text-gray-500">{issue.elementType}</span>
                          </div>
                          <p className="text-sm text-gray-900 mb-1">{issue.description}</p>
                          <p className="text-xs text-gray-500">{issue.file}:{issue.line}</p>
                          
                          {/* 구체적인 접근성 정보 표시 */}
                          {issue.impact && (
                            <div className="mt-2 p-2 bg-red-50 rounded border-l-4 border-red-400">
                              <p className="text-xs text-red-700 font-medium">시각장애인 영향:</p>
                              <p className="text-xs text-red-600">{issue.impact}</p>
                            </div>
                          )}
                          
                          {issue.userJourney && (
                            <div className="mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                              <p className="text-xs text-blue-700 font-medium">개선 방향:</p>
                              <p className="text-xs text-blue-600">{issue.userJourney}</p>
                            </div>
                          )}
                          
                          {issue.suggestedLabel && (
                            <div className="mt-2 p-2 bg-green-50 rounded border-l-4 border-green-400">
                              <p className="text-xs text-green-700 font-medium">제안 라벨:</p>
                              <p className="text-xs text-green-600">{issue.suggestedLabel}</p>
                            </div>
                          )}

                          {issue.detailedDescription && (
                            <div className="mt-2 p-2 bg-purple-50 rounded border-l-4 border-purple-400">
                              <p className="text-xs text-purple-700 font-medium">상세 설명:</p>
                              <p className="text-xs text-purple-600">{issue.detailedDescription}</p>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            requestCodeSuggestion(issue);
                          }}
                          disabled={isLoading}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            isLoading 
                              ? 'bg-gray-400 cursor-not-allowed' 
                              : 'bg-green-500 hover:bg-green-600 text-white'
                          }`}
                        >
                          {isLoading ? 'AI 분석 중...' : '개선하기'}
                        </button>
                      </div>
                    </div>
                  ))
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 알림 표시 */}
      {notification && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
            <span className="text-sm">{notification}</span>
            <button
              onClick={() => setNotification(null)}
              className="text-white hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 코드 제안 모달 */}
      {showCodePreview && codeSuggestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">코드 제안</h3>
                <button
                  onClick={() => setShowCodePreview(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
              {selectedIssue && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">선택된 이슈</h4>
                  <p className="text-sm text-gray-700">{selectedIssue.description}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedIssue.file}:{selectedIssue.line}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">📊 코드 변경사항 비교</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="font-medium text-red-700 mb-2 flex items-center">
                        <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                        수정 전 코드
                      </h5>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <pre className="text-sm overflow-x-auto text-red-800">
                          <code>{codeSuggestion.originalCode}</code>
                        </pre>
                      </div>
                      <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700">
                        <p><strong>문제점:</strong> 접근성 라벨 부족</p>
                        <p><strong>영향:</strong> 스크린 리더 사용자가 기능을 이해하기 어려움</p>
                      </div>
                    </div>

                    <div>
                      <h5 className="font-medium text-green-700 mb-2 flex items-center">
                        <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                        수정 후 코드
                      </h5>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <pre className="text-sm overflow-x-auto text-green-800">
                          <code>{codeSuggestion.suggestedCode}</code>
                        </pre>
                      </div>
                      <div className="mt-2 p-2 bg-green-100 rounded text-xs text-green-700">
                        <p><strong>개선사항:</strong> Semantics 위젯 추가</p>
                        <p><strong>효과:</strong> 스크린 리더가 명확한 설명 제공</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 변경사항 요약 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h5 className="font-medium text-blue-800 mb-3 flex items-center">
                    <span className="text-blue-500 mr-2">📝</span>
                    변경사항 요약
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-red-600 text-xs font-bold">-</span>
                      </div>
                      <p className="text-red-700 font-medium">제거된 부분</p>
                      <p className="text-red-600 text-xs">접근성 문제가 있는 원본 코드</p>
                    </div>
                    <div className="text-center">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-blue-600 text-xs font-bold">→</span>
                      </div>
                      <p className="text-blue-700 font-medium">변경 방향</p>
                      <p className="text-blue-600 text-xs">AI 기반 접근성 개선</p>
                    </div>
                    <div className="text-center">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-green-600 text-xs font-bold">+</span>
                      </div>
                      <p className="text-green-700 font-medium">추가된 부분</p>
                      <p className="text-green-600 text-xs">Semantics, Tooltip 등 접근성 위젯</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI 분석 결과 섹션 제거 */}
            </div>

            <div className="p-6 border-t bg-gray-50">
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-600">
                  💡 이 코드 제안을 VS Code에서 직접 적용할 수 있습니다
                </div>
                <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  🔄 수정 전후 비교 가능
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="text-xs text-gray-500">
                  📋 백업 파일이 자동으로 생성되어 안전하게 코드를 수정할 수 있습니다
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowCodePreview(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={applyCodeSuggestion}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 flex items-center"
                  >
                    <span className="mr-2">🚀</span>
                    VS Code에 적용
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
