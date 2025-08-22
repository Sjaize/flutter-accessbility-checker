# Flutter Accessibility Checker - 기능별 클래스/파일 구조 정리

## 📁 전체 파일 구조

```
react-app/
├── public/                          # 정적 파일
│   ├── index.html                  # 메인 HTML 템플릿
│   ├── env-config.js              # 환경변수 설정
│   └── favicon.ico                # 앱 아이콘
├── src/
│   ├── App.tsx                    # 🎯 메인 앱 컴포넌트
│   ├── index.tsx                  # React 앱 진입점
│   ├── components/                # 📱 UI 컴포넌트들
│   ├── services/                  # ⚙️ 비즈니스 로직 서비스
│   ├── lib/                       # 🔧 유틸리티 함수
│   └── styles/                    # 🎨 스타일링
├── package.json                   # 프로젝트 설정 및 의존성
└── tailwind.config.js            # Tailwind CSS 설정
```

## 🎯 핵심 기능별 파일 매핑

### 1. 메인 애플리케이션 (`App.tsx`)

| 기능 | 담당 코드 섹션 | 주요 상태/인터페이스 |
|------|---------------|-------------------|
| **전체 레이아웃** | `return` JSX 구조 | `ready`, `iframeSrc` |
| **접근성 이슈 관리** | `analyze()`, `detectAccessibilityIssues()` | `AccessibilityIssue[]` |
| **프로젝트 분석** | `analyzeProject()`, `projectAnalyzer` | `FlutterComponent[]` |
| **모달 상태 관리** | 각종 `handle*Open/Close()` 함수들 | 8개의 모달 상태 변수 |
| **AI 채팅 통합** | `handleGenerateReport()`, `updateUMLFromChat()` | `ChatMessage[]` |

#### 주요 인터페이스 정의:
```typescript
interface AccessibilityIssue {
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

interface FlutterComponent {
  name: string;
  file: string;
  line: number;
  type: 'widget' | 'screen' | 'service' | 'model' | 'util';
  accessibilityScore: number;
  issues: string[];
  content?: string;
  dependencies?: string[];
}
```

### 2. AI 채팅 시스템

| 파일 | 클래스/컴포넌트 | 주요 기능 |
|------|----------------|----------|
| `ChatModal.tsx` | `ChatModal` | • 채팅 UI 인터페이스<br>• 메시지 히스토리 관리<br>• PlantUML 다이어그램 생성 |
| `ChatFloatingButton.tsx` | `ChatFloatingButton` | • 플로팅 채팅 버튼<br>• 호버 툴팁 표시 |
| `ChatService.ts` | `ChatService` 클래스 | • LLM API 통합 (OpenAI, Anthropic, Google)<br>• Flutter 프로젝트 분석<br>• 대화 컨텍스트 관리 |
| `LLMConfigModal.tsx` | `LLMConfigModal` | • AI 모델 선택 UI<br>• API 키 설정 관리<br>• 환경변수 통합 |

#### ChatService 주요 메서드:
```typescript
class ChatService {
  // AI 모델 설정
  setConfig(config: LLMConfig): void
  
  // Flutter 프로젝트 분석
  analyzeFlutterProject(projectPath: string): Promise<void>
  
  // AI와 대화하기
  generateResponse(message: string, context: AnalysisContext): Promise<ChatMessage>
  
  // 접근성 이슈 생성
  generateAccessibilityResponse(): Promise<ChatMessage>
}
```

### 3. 프로젝트 분석 시스템

| 파일 | 클래스/컴포넌트 | 주요 기능 |
|------|----------------|----------|
| `ProjectAnalyzer.ts` | `ProjectAnalyzer` 클래스 | • Flutter 프로젝트 구조 분석<br>• Dart 파일 파싱<br>• 접근성 점수 계산 |
| `CodeStructureViewer.tsx` | `CodeStructureViewer` | • 코드 구조 시각화<br>• 컴포넌트 필터링<br>• 접근성 점수 표시 |

#### ProjectAnalyzer 주요 메서드:
```typescript
class ProjectAnalyzer {
  // 프로젝트 전체 분석
  analyzeProject(): Promise<ProjectStructure>
  
  // 새 프로젝트 분석 (간소화)
  analyzeNewProject(path: string): Promise<ProjectStructure>
  
  // Flutter 컴포넌트 추출
  extractComponents(): Promise<FlutterComponent[]>
  
  // 접근성 점수 계산
  calculateAccessibilityScore(content: string): number
}
```

### 4. 리포트 및 문서 생성

| 파일 | 클래스/컴포넌트 | 주요 기능 |
|------|----------------|----------|
| `ReportGenerator.tsx` | `ReportGenerator` | • 채팅 기반 리포트 생성<br>• 이슈 추출 및 정리<br>• 다운로드 기능 |
| `Dashboard.tsx` | `Dashboard` | • WCAG 2.2 기준 분석<br>• HTML/Markdown 리포트 생성<br>• 사용자 저니 시각화 |
| `MarkdownDocumentation.tsx` | `MarkdownDocumentation` | • 프로젝트 문서 자동 생성<br>• 접근성 가이드 포함<br>• 실시간 미리보기 |

#### 리포트 데이터 구조:
```typescript
interface ReportData {
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
}
```

### 5. UML 다이어그램 시스템

| 파일 | 클래스/컴포넌트 | 주요 기능 |
|------|----------------|----------|
| `UMLDiagramViewer.tsx` | `UMLDiagramViewer` | • PlantUML 다이어그램 렌더링<br>• 줌/팬 기능<br>• 다이어그램 타입 전환 |

#### PlantUML 기능:
```typescript
// PlantUML 인코딩 및 렌더링
const encodePlantUML = (code: string): string => { /* 압축 알고리즘 */ }

// 다이어그램 타입별 템플릿 생성
const generateDiagramTemplate = (type: DiagramType): string => {
  // 'user-journey' | 'class' | 'sequence' | 'activity'
}
```

## 🎨 스타일링 시스템

| 파일 | 용도 | 주요 클래스 |
|------|------|------------|
| `index.css` | 글로벌 스타일 | • CSS 변수 정의<br>• 파스텔 그라데이션<br>• 글래스 효과 |
| `App.css` | 레거시 스타일 | • 기본 App 컴포넌트 스타일 |
| `tailwind.config.js` | Tailwind 설정 | • 커스텀 컬러 팔레트<br>• 애니메이션 정의<br>• 폰트 설정 |

#### 주요 CSS 클래스:
```css
/* 배경 그라데이션 */
.gradient-bg { 
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 25%, #fef3c7 50%, #fce7f3 75%, #f3e8ff 100%);
}

/* 글래스 효과 카드 */
.card-pastel {
  @apply bg-white/80 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg;
}

/* 파스텔 버튼들 */
.btn-pastel-primary { @apply btn-pastel bg-gradient-to-r from-blue-400 to-purple-400; }
.btn-pastel-success { @apply btn-pastel bg-gradient-to-r from-emerald-400 to-teal-400; }
.btn-pastel-warning { @apply btn-pastel bg-gradient-to-r from-amber-400 to-orange-400; }
```

## 🔧 유틸리티 및 공통 기능

| 파일 | 함수/클래스 | 용도 |
|------|------------|------|
| `lib/utils.ts` | `cn()` | Tailwind 클래스 병합 (clsx + twMerge) |
| `services/` | 각종 Service 클래스 | 비즈니스 로직 분리 |

## 📦 의존성 관리

### 주요 외부 라이브러리

| 라이브러리 | 용도 | 사용 위치 |
|-----------|------|----------|
| `@anthropic-ai/sdk` | Claude AI 연동 | `ChatService.ts` |
| `@google/generative-ai` | Gemini AI 연동 | `ChatService.ts` |
| `openai` | GPT 연동 | `ChatService.ts` |
| `lucide-react` | 아이콘 | 모든 컴포넌트 |
| `react-markdown` | 마크다운 렌더링 | `MarkdownDocumentation.tsx` |
| `plantuml-encoder` | PlantUML 인코딩 | `UMLDiagramViewer.tsx` |
| `tailwindcss` | CSS 프레임워크 | 전역 스타일링 |
| `class-variance-authority` | 조건부 클래스 | 컴포넌트 변형 |

## 🔄 데이터 플로우

### 1. 프로젝트 분석 플로우
```
VS Code Extension → ProjectAnalyzer.analyzeNewProject() 
→ FlutterComponent[] → App.detectAccessibilityIssues() 
→ AccessibilityIssue[] → UI 렌더링
```

### 2. AI 채팅 플로우
```
사용자 입력 → ChatModal → ChatService.generateResponse() 
→ LLM API 호출 → ChatMessage → App.handleGenerateReport() 
→ 이슈 업데이트
```

### 3. 리포트 생성 플로우
```
ChatMessage[] → ReportGenerator.extractIssuesFromChat() 
→ ReportData → HTML/Markdown 생성 → 다운로드
```

## 🎯 확장 포인트

### 새로운 기능 추가 시 참고사항

1. **새 모달 추가**: `App.tsx`에 상태 변수와 핸들러 추가
2. **새 AI 모델 지원**: `ChatService.ts`의 LLM 설정 확장
3. **새 다이어그램 타입**: `UMLDiagramViewer.tsx`의 타입 및 템플릿 추가
4. **새 리포트 형식**: `Dashboard.tsx`의 생성 함수 추가
5. **새 분석 규칙**: `ProjectAnalyzer.ts`의 분석 로직 확장

이 구조를 통해 각 기능이 독립적으로 동작하면서도 서로 유기적으로 연결되어 강력한 Flutter 접근성 분석 도구를 제공합니다. 