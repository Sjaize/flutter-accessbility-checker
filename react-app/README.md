# Flutter Accessibility Checker

Flutter 앱의 접근성을 분석하고 개선하는 AI 기반 도구입니다.

## 🚀 시작하기

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 설정
프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```bash
# OpenAI API 키 (필수)
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here

# Anthropic API 키 (선택사항)
REACT_APP_ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Google AI API 키 (선택사항)
REACT_APP_GOOGLE_API_KEY=your_google_api_key_here
```

**중요:** `.env` 파일은 `.gitignore`에 포함되어 있으므로 Git에 커밋되지 않습니다.

### 3. 개발 서버 실행
```bash
npm start
```

앱이 [http://localhost:3000](http://localhost:3000)에서 실행됩니다.

## 🔧 환경변수 주입

이 프로젝트는 빌드 시점에 환경변수를 자동으로 주입합니다:

- `npm start` 실행 시 `prestart` 스크립트가 자동으로 실행됩니다
- 환경변수가 `public/env-config.js` 파일에 주입됩니다
- 브라우저에서 `window._env_` 객체로 접근할 수 있습니다

## 📁 프로젝트 구조

```
react-app/
├── public/
│   ├── env-config.js     # 환경변수 주입 파일
│   └── index.html
├── scripts/
│   └── env.js           # 환경변수 주입 스크립트
├── src/
│   ├── components/      # React 컴포넌트
│   ├── services/        # API 서비스
│   └── ...
└── package.json
```

## 🎯 주요 기능

- **AI 기반 접근성 분석**: GPT-4, Claude, Gemini 모델 지원
- **실시간 채팅**: AI와 대화하며 접근성 개선 방안 논의
- **코드 제안**: 구체적인 Flutter 코드 수정 제안
- **사용자 저니 분석**: PlantUML 다이어그램으로 시각화
- **WCAG 2.2 준수**: 최신 접근성 가이드라인 적용

## 🔍 사용법

1. **AI 모델 설정**: 우측 상단의 설정 버튼에서 API 키와 모델을 선택
2. **프로젝트 분석**: 채팅 버튼을 클릭하여 AI와 대화 시작
3. **접근성 개선**: AI의 제안을 바탕으로 코드 수정
4. **레포트 생성**: 분석 결과를 PDF로 다운로드

## 🛠️ 개발

### 빌드
```bash
npm run build
```

### 테스트
```bash
npm test
```

## �� 라이선스

MIT License
