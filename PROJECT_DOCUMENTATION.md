# Flutter Accessibility Checker - 프로젝트 문서

## 📋 프로젝트 개요

Flutter Accessibility Checker는 VS Code 확장 프로그램으로, Flutter 앱의 접근성을 실시간으로 분석하고 개선 제안을 제공하는 도구입니다.

### 주요 기능
- 🔍 **실시간 접근성 분석**: Flutter 앱의 접근성 이슈를 자동으로 감지
- 📸 **스크린샷 캡처**: 앱 화면을 실시간으로 캡처하여 시각적 피드백 제공
- 🤖 **AI 기반 코드 제안**: OpenAI API를 활용한 지능적인 코드 개선 제안
- 🎯 **사용자 저니 분석**: 다양한 페르소나 관점에서의 사용자 경험 분석
- 🔧 **원클릭 코드 적용**: 제안된 코드를 VS Code에서 바로 적용

---

## 📁 파일 구조 및 기능

### 🏗️ 루트 디렉토리

#### `package.json`
- **기능**: VS Code 확장 프로그램의 메타데이터 및 설정
- **주요 내용**:
  - 확장 프로그램 정보 (이름, 버전, 설명)
  - 활성화 이벤트 및 명령어 정의
  - 의존성 패키지 목록
  - 빌드 스크립트 설정

#### `tsconfig.json`
- **기능**: TypeScript 컴파일러 설정
- **주요 내용**:
  - 컴파일 옵션 및 타겟 설정
  - 파일 포함/제외 패턴
  - 모듈 해석 설정

#### `eslint.config.mjs`
- **기능**: ESLint 코드 품질 검사 설정
- **주요 내용**:
  - 코드 스타일 규칙
  - TypeScript 관련 규칙
  - VS Code 확장 프로그램 특화 규칙

---

### 🔧 소스 코드 (`src/`)

#### `src/extension.ts` - 메인 확장 프로그램
- **기능**: VS Code 확장 프로그램의 진입점 및 핵심 로직
- **주요 기능**:
  - 확장 프로그램 활성화/비활성화 처리
  - 명령어 등록 및 처리
  - 서비스 초기화 및 관리
  - 사용자 인터페이스 (진행률 표시, 알림)
  - 분석 리포트 생성

#### `src/types/accessibility.ts` - 타입 정의
- **기능**: 프로젝트 전체에서 사용되는 TypeScript 타입 정의
- **주요 타입들**:
  - `AccessibilityIssue`: 접근성 이슈 정보
  - `DartClass`, `DartWidget`: Dart 코드 구조
  - `UserJourney`, `JourneyStep`: 사용자 여정 분석
  - `WebSocketMessage`: WebSocket 통신 메시지
  - `CodeSuggestion`: 코드 제안 정보

---

### 🛠️ 서비스 레이어 (`src/services/`)

#### `src/services/flutter-analyzer.ts` - Flutter 분석기
- **기능**: Flutter 프로젝트의 접근성 분석을 담당
- **주요 기능**:
  - Dart 파일 스캔 및 파싱
  - 위젯 및 클래스 구조 분석
  - 접근성 이슈 감지 (라벨 누락, 부적절한 라벨 등)
  - OpenAI API를 활용한 사용자 저니 생성
  - 분석 결과 JSON 파일 저장

#### `src/services/flutter-runner.ts` - Flutter 실행기
- **기능**: Flutter 앱의 실행 및 관리
- **주요 기능**:
  - Flutter 프로젝트 검증
  - Chrome 브라우저에서 Flutter 앱 실행 (포트 64022)
  - 프로세스 관리 및 재시도 로직
  - 포트 사용 가능성 확인
  - 앱 종료 및 정리

#### `src/services/screenshot-service.ts` - 스크린샷 서비스
- **기능**: Flutter 앱의 실시간 스크린샷 캡처
- **주요 기능**:
  - Puppeteer를 활용한 브라우저 자동화
  - 5초마다 자동 스크린샷 캡처
  - 사용자 상호작용 감지 (클릭, 키보드)
  - 바운딩 박스 생성 (접근성 이슈 표시)
  - 이슈 해결 상태 추적

#### `src/services/websocket-service.ts` - WebSocket 서비스
- **기능**: React 앱과의 실시간 통신
- **주요 기능**:
  - WebSocket 서버 관리 (포트 3001)
  - 클라이언트 연결 관리
  - 메시지 라우팅 및 처리
  - 코드 제안 생성 및 VS Code 연동
  - 스크린샷 데이터 브로드캐스트

---

### 🎨 React 대시보드 (`react-app/`)

#### `react-app/src/App.tsx` - 메인 React 앱
- **기능**: 접근성 분석 결과를 시각화하는 웹 대시보드
- **주요 기능**:
  - WebSocket 연결 관리
  - 실시간 스크린샷 표시
  - 접근성 이슈 목록 및 상세 정보
  - 바운딩 박스 오버레이
  - 코드 제안 모달
  - 이슈 클릭 시 VS Code 연동

#### `react-app/src/types.ts` - React 앱 타입 정의
- **기능**: React 앱에서 사용하는 TypeScript 타입
- **주요 내용**:
  - WebSocket 메시지 타입
  - UI 상태 관리 타입
  - 컴포넌트 props 타입

#### `react-app/package.json` - React 앱 의존성
- **기능**: React 앱의 패키지 관리
- **주요 내용**:
  - React, TypeScript 의존성
  - Tailwind CSS 설정
  - 개발 서버 설정

---

## 🔄 데이터 흐름

### 1. 분석 시작
```
사용자 명령 → extension.ts → flutter-runner.ts → flutter-analyzer.ts
```

### 2. 실시간 모니터링
```
screenshot-service.ts → websocket-service.ts → React App
```

### 3. 코드 제안
```
React App → websocket-service.ts → VS Code (파일 수정)
```

---

## 🚀 실행 환경

### 필수 요구사항
- Node.js 18+
- Flutter SDK
- Chrome 브라우저
- VS Code

### 환경 변수
- `OPENAI_API_KEY`: OpenAI API 키 (선택사항)
- `OPENAI_API_KEY2`: 백업 OpenAI API 키 (선택사항)

### 포트 사용
- **64022**: Flutter 앱 실행 포트
- **3001**: WebSocket 서버 포트
- **3000**: React 앱 개발 서버 포트

---

## 📊 주요 데이터 구조

### AccessibilityIssue
```typescript
{
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
```

### ProjectAnalysis
```typescript
{
  projectName: string;
  totalFiles: number;
  totalClasses: number;
  totalWidgets: number;
  accessibilityIssues: AccessibilityIssue[];
  userJourneys: UserJourney[];
  analysisDate: string;
}
```

---

## 🔧 개발 가이드

### 확장 프로그램 빌드
```bash
npm run compile
```

### React 앱 실행
```bash
cd react-app
npm start
```

### 테스트 실행
```bash
npm test
```

---

## 📝 노트

이 문서는 프로젝트의 전체적인 구조와 각 파일의 역할을 이해하는 데 도움이 됩니다. 각 서비스는 독립적으로 동작하면서도 WebSocket을 통해 실시간으로 데이터를 교환하여 통합된 접근성 분석 환경을 제공합니다.
