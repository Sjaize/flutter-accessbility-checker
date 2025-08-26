# Flutter Accessibility Checker

VS Code 확장 프로그램으로 Flutter 앱의 접근성을 실시간으로 분석하고 개선 제안을 제공합니다.

## 🚀 주요 기능

- **실시간 접근성 분석**: Flutter 앱의 접근성 이슈를 실시간으로 감지
- **스크린샷 & 바운딩 박스**: 문제가 있는 요소를 시각적으로 표시
- **코드 제안**: 접근성 개선을 위한 코드 제안 및 자동 적용
- **사용자 저니 분석**: 다양한 페르소나 관점에서 접근성 검토
- **React 대시보드**: 실시간 모니터링을 위한 웹 대시보드

## 📋 시스템 요구사항

- VS Code 1.80.0 이상
- Flutter SDK
- Node.js 16 이상
- Chrome 브라우저

## 🛠️ 설치 및 설정

### 1. 확장 프로그램 설치

```bash
# 프로젝트 클론
git clone <repository-url>
cd flutter-accessbility-checker

# 의존성 설치
npm install

# TypeScript 컴파일
npm run compile
```

### 2. 환경 변수 설정

```bash
# env.example을 .env로 복사
cp env.example .env

# .env 파일 편집
nano .env
```

`.env` 파일에 다음 내용을 설정하세요:

```env
# OpenAI API Keys (병목 방지를 위해 2개 키 분리)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_API_KEY2=your_openai_api_key2_here

# Flutter App Configuration
FLUTTER_PORT=64022
REACT_APP_PORT=3000
WEBSOCKET_PORT=3001

# Analysis Configuration
MAX_PERSONA_COUNT=10
SCREENSHOT_INTERVAL=5000
MAX_RETRY_ATTEMPTS=3
```

### 3. React 앱 설정

```bash
# React 앱 디렉토리로 이동
cd react-app

# 의존성 설치
npm install
```

## 🎯 사용 방법

### 1. VS Code에서 분석 시작

1. Flutter 프로젝트를 VS Code에서 열기
2. Command Palette (`Ctrl+Shift+P`) 열기
3. `Flutter Accessibility: Start Analysis` 실행
4. 페르소나 수 입력 (1-10)

### 2. 자동 실행되는 것들

- **Flutter 앱**: 포트 64022에서 실행
- **React 대시보드**: 포트 3000에서 실행
- **WebSocket 서버**: 포트 3001에서 실행
- **브라우저**: React 대시보드 자동 열기

### 3. 접근성 이슈 확인

- React 대시보드에서 실시간 스크린샷 확인
- 바운딩 박스로 문제 요소 시각화
- 이슈 클릭하여 코드 제안 요청
- VS Code에서 코드 프리뷰 및 적용

## 📁 프로젝트 구조

```
flutter-accessbility-checker/
├── src/
│   ├── extension.ts              # VS Code 확장 메인
│   ├── services/
│   │   ├── flutter-analyzer.ts   # Flutter 코드 분석
│   │   ├── flutter-runner.ts     # Flutter 앱 실행 관리
│   │   ├── screenshot-service.ts # 스크린샷 캡처
│   │   └── websocket-service.ts  # WebSocket 통신
│   └── types/
│       └── accessibility.ts      # 타입 정의
├── react-app/                    # React 대시보드
│   ├── src/
│   │   ├── App.tsx              # 메인 React 컴포넌트
│   │   ├── index.tsx            # 앱 진입점
│   │   └── types.ts             # 타입 정의
│   └── package.json
├── package.json                  # VS Code 확장 설정
├── env.example                   # 환경 변수 예시
└── README.md
```

## 🔧 설정 옵션

### 포트 설정
- `FLUTTER_PORT`: Flutter 앱 실행 포트 (기본: 64022)
- `REACT_APP_PORT`: React 대시보드 포트 (기본: 3000)
- `WEBSOCKET_PORT`: WebSocket 서버 포트 (기본: 3001)

### 분석 설정
- `MAX_PERSONA_COUNT`: 최대 페르소나 수 (기본: 10)
- `SCREENSHOT_INTERVAL`: 스크린샷 캡처 간격 (기본: 5000ms)
- `MAX_RETRY_ATTEMPTS`: 재시도 횟수 (기본: 3)

## 🚨 이슈 분류

### 심각도별 분류
- **Error (위험)**: 접근성 라벨 누락, 이미지 대체 텍스트 누락
- **Warning (경고)**: 부적절한 라벨, 개선 권장사항
- **Info (정보)**: 참고사항, 추가 정보

### 이슈 타입
- `missing_label`: 접근성 라벨 누락
- `wrong_label`: 잘못된 라벨
- `missing_alt_text`: 이미지 대체 텍스트 누락
- `inappropriate_label`: 부적절한 라벨

## 🔄 워크플로우

1. **분석 시작**: VS Code 명령어 실행
2. **Flutter 앱 실행**: 포트 64022에서 자동 실행
3. **코드 분석**: Dart 파일에서 접근성 이슈 검출
4. **사용자 저니 생성**: OpenAI API로 페르소나별 분석
5. **실시간 모니터링**: 스크린샷 캡처 및 바운딩 박스 표시
6. **코드 제안**: 이슈 클릭 시 VS Code에서 프리뷰
7. **코드 적용**: 제안된 코드를 실제 파일에 적용

## 🛠️ 개발

### VS Code 확장 개발
```bash
# TypeScript 컴파일
npm run compile

# 개발 모드 실행
npm run watch
```

### React 앱 개발
```bash
cd react-app
npm start
```

## 📝 라이선스

MIT License

## 🤝 기여

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 지원

문제가 발생하거나 질문이 있으시면 이슈를 생성해주세요.
