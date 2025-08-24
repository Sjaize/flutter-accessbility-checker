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



# Flutter Accessibility Checker - React App 레이아웃, 디자인, 기능 정리

## 📱 전체 애플리케이션 개요

### 애플리케이션 목적
- Flutter 앱의 접근성을 실시간으로 분석하고 개선 방안을 제시하는 AI 기반 도구
- WCAG 2.2 기준 준수 여부를 체크하고 코드 수정 제안을 제공
- 개발자가 접근성 이슈를 쉽게 발견하고 해결할 수 있도록 지원

## 🎨 디자인 시스템

### 색상 체계
- **배경**: 파스텔톤 그라데이션 (`gradient-bg`)
  - 색상: `#f0f9ff → #e0f2fe → #fef3c7 → #fce7f3 → #f3e8ff`
- **카드**: 반투명 글래스 효과 (`card-pastel`)
  - 배경: `bg-white/80` + `backdrop-blur-sm`
- **버튼**: 그라데이션 파스텔 버튼
  - Primary: `from-blue-400 to-purple-400`
  - Success: `from-emerald-400 to-teal-400`
  - Warning: `from-amber-400 to-orange-400`

### 타이포그래피
- 기본 폰트: **Inter** (Google Fonts)
- 폰트 가중치: 300, 400, 500, 600, 700
- 제목: `bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent`

### 애니메이션
- **fade-in**: 0.5초 부드러운 페이드인
- **slide-up**: 0.3초 위로 슬라이드
- **slide-down**: 0.3초 아래로 슬라이드
- **hover effects**: `hover:scale-105`, `hover:shadow-xl`

## 📐 레이아웃 구조

### 메인 레이아웃
```
[헤더 영역]
┌─────────────────────────────────────────────────────────┐
│ 🎯 Flutter Accessibility Checker                        │
│ AI 기반 접근성 분석 도구                                   │
│                                          [실시간 분석] │
└─────────────────────────────────────────────────────────┘

[메인 콘텐츠 영역 - 2열 레이아웃]
┌─────────────────────────┬───────────────────────────────┐
│                         │                               │
│    모바일 프레임         │      리포트 패널               │
│  ┌─────────────────┐    │  ┌─────────────────────────┐  │
│  │                 │    │  │  접근성 평가             │  │
│  │   Flutter 앱    │ ←──→  │  [오류/경고/정보 카운트]  │  │
│  │   미리보기      │    │  └─────────────────────────┘  │
│  │                 │    │                               │
│  │  [말풍선 이슈]   │    │  ┌─────────────────────────┐  │
│  └─────────────────┘    │  │  분석 도구              │  │
│                         │  │  - 코드 구조 분석        │  │
│                         │  │  - UML 다이어그램       │  │
│                         │  │  - 문서 생성            │  │
│                         │  └─────────────────────────┘  │
│                         │                               │
│                         │  ┌─────────────────────────┐  │
│                         │  │  발견된 이슈            │  │
│                         │  │  [이슈 목록 스크롤]      │  │
│                         │  └─────────────────────────┘  │
└─────────────────────────┴───────────────────────────────┘

[플로팅 요소]
                                           [💬 채팅 버튼]
```

### 반응형 설계
- **데스크톱**: 2열 레이아웃 (모바일 프레임 + 리포트 패널)
- **태블릿**: 스택 레이아웃으로 전환
- **모바일**: 풀스크린 모달로 각 기능 표시

## ⚡ 주요 기능

### 1. 실시간 접근성 분석
- **기능**: Flutter 앱의 접근성 이슈를 실시간으로 감지
- **표시 방법**: 모바일 프레임 위에 말풍선으로 이슈 위치 및 내용 표시
- **이슈 타입**: 오류(빨강), 경고(주황), 정보(파랑)
- **제안 시스템**: 각 이슈마다 구체적인 코드 수정 제안 제공

### 2. AI 채팅 분석
- **위치**: 우하단 플로팅 버튼
- **기능**: 
  - 자연어로 접근성 관련 질문 가능
  - AI가 코드 분석 후 개선방안 제시
  - 사용자 저니 기반 접근성 격차 분석
- **지원 모델**: GPT-4, Claude-3, Gemini Pro

### 3. 대시보드 및 리포트
- **접근성 평가 요약**: 오류/경고/정보 개수 시각화
- **WCAG 2.2 기준**: 표준 준수 여부 체크
- **사용자 저니 분석**: AI가 분석한 주요 시나리오 표시
- **리포트 다운로드**: HTML, Markdown 형식 지원

### 4. 코드 구조 분석
- **Flutter 컴포넌트 분석**: Widget, Screen, Service, Model 등 분류
- **접근성 점수**: 각 컴포넌트별 0-100점 접근성 점수 제공
- **의존성 분석**: 컴포넌트 간 관계 시각화

### 5. UML 다이어그램
- **사용자 저니 다이어그램**: PlantUML 기반 플로우차트
- **접근성 이슈 하이라이트**: 문제가 있는 플로우 강조 표시
- **실시간 업데이트**: AI 분석 결과에 따라 다이어그램 자동 갱신

### 6. 문서 자동 생성
- **Markdown 문서**: 프로젝트 접근성 현황 문서 자동 생성
- **코드 예제**: 수정 전후 코드 비교 포함
- **개선 로드맵**: 단계별 접근성 개선 계획 제시

## 🎯 사용자 경험 (UX) 특징

### 직관적 시각화
- **말풍선 연결선**: 이슈 위치를 점선으로 연결하여 명확한 위치 표시
- **색상 코딩**: 이슈 심각도에 따른 일관된 색상 체계
- **실시간 피드백**: 로딩 상태, 진행률 표시로 사용자 대기 경험 개선

### 접근성 친화적 설계
- **키보드 네비게이션**: 모든 인터랙션 요소에 키보드 접근 가능
- **스크린 리더 지원**: `aria-label`, 의미론적 HTML 구조 사용
- **고대비 모드**: 시각적 구별이 어려운 사용자를 위한 명확한 대비

### 효율적 워크플로우
1. **자동 프로젝트 감지**: VS Code 확장과 연동하여 현재 프로젝트 자동 인식
2. **원클릭 수정**: 제안된 코드를 바로 VS Code에 적용 가능
3. **컨텍스트 유지**: 채팅 기록과 분석 결과가 연동되어 일관된 분석 경험

## 🔧 기술적 구현 특징

### 성능 최적화
- **가상화**: 대량의 이슈 목록을 효율적으로 렌더링
- **지연 로딩**: 모달과 복잡한 컴포넌트는 필요시에만 로드
- **메모이제이션**: React.memo와 useMemo로 불필요한 리렌더링 방지

### 상태 관리
- **로컬 상태**: 각 컴포넌트의 독립적인 상태 관리
- **전역 상태**: localStorage를 활용한 설정 및 캐시 관리
- **실시간 동기화**: 서비스 클래스를 통한 데이터 일관성 유지

### 모듈화 설계
- **컴포넌트 기반**: 재사용 가능한 독립적 컴포넌트 구조
- **서비스 분리**: 비즈니스 로직과 UI 로직 분리
- **타입 안전성**: TypeScript를 활용한 타입 기반 개발

이 React 앱은 Flutter 개발자들이 접근성을 쉽게 이해하고 개선할 수 있도록 설계된 종합적인 분석 도구입니다. 직관적인 UI/UX와 강력한 AI 분석 기능을 통해 개발 생산성과 앱 품질을 동시에 향상시킬 수 있습니다. 