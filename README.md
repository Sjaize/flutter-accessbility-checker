# Flutter Accessibility Checker

VS Code 확장 프로그램으로 Flutter 앱의 접근성을 실시간으로 분석하고 개선 제안을 제공합니다.

## 🚀 주요 기능

- **실시간 접근성 분석**: Flutter 앱의 접근성 이슈를 실시간으로 감지
- **스크린샷 & 바운딩 박스**: 문제가 있는 요소를 시각적으로 표시
- **코드 제안**: 접근성 개선을 위한 코드 제안 및 자동 적용
- **사용자 저니 분석**: 다양한 페르소나 관점에서 접근성 검토
- **React 대시보드**: 실시간 모니터링을 위한 웹 대시보드
- **다중 AI 모델 지원**: OpenAI, Ollama, 로컬 모델 지원

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

# AI Model Configuration
AI_MODEL_TYPE=openai
AI_MODEL_NAME=gpt-3.5-turbo
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7

# Ollama Configuration (로컬 AI 모델)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=codellama:7b

# Flutter App Configuration
FLUTTER_PORT=64022
REACT_APP_PORT=3000
WEBSOCKET_PORT=3001

# Analysis Configuration
MAX_PERSONA_COUNT=10
SCREENSHOT_INTERVAL=5000
MAX_RETRY_ATTEMPTS=3
```

### 3. AI 모델 설정

#### OpenAI 사용 (기본)
```env
AI_MODEL_TYPE=openai
AI_MODEL_NAME=gpt-3.5-turbo
```

#### Ollama 사용 (로컬)
```bash
# Ollama 설치
curl -fsSL https://ollama.ai/install.sh | sh

# CodeLlama 모델 다운로드
ollama pull codellama:7b

# 환경 변수 설정
AI_MODEL_TYPE=ollama
AI_MODEL_NAME=codellama:7b
```

#### 다른 OSS 모델들
- **Llama 2**: `llama2:7b`, `llama2:13b`, `llama2:70b`
- **Mistral**: `mistral:7b`, `mistral:7b-instruct`
- **CodeLlama**: `codellama:7b`, `codellama:13b`, `codellama:34b`
- **WizardCoder**: `wizardcoder:7b`, `wizardcoder:13b`

### 4. React 앱 설정

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

## 🤖 AI 모델 비교

| 모델 | 장점 | 단점 | 추천 용도 |
|------|------|------|-----------|
| **GPT-3.5-turbo** | 빠른 응답, 높은 품질 | 비용, 토큰 제한 | 프로덕션 환경 |
| **GPT-4** | 최고 품질, 긴 컨텍스트 | 높은 비용 | 복잡한 분석 |
| **CodeLlama** | 코드 특화, 무료 | 느린 추론 | 개발 환경 |
| **Llama 2** | 무료, 긴 컨텍스트 | 설정 복잡 | 대용량 프로젝트 |
| **Mistral** | 빠른 추론, 효율적 | 제한된 모델 | 실시간 분석 |

## 🔧 고급 설정

### 긴 입력 토큰 활용
```env
# 대용량 프로젝트 분석
AI_MAX_TOKENS=8000
AI_MODEL_NAME=gpt-4-32k  # 또는 codellama:34b
```

### 추론 성능 최적화
```env
# 빠른 응답을 위한 설정
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=1000
```

### 로컬 GPU 활용
```bash
# CUDA 지원 Ollama 설치
docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama

# GPU 모델 사용
ollama pull codellama:7b-instruct-q4_K_M
```

## 📊 성능 최적화 팁

1. **모델 선택**: 프로젝트 크기에 따라 적절한 모델 선택
2. **토큰 관리**: 긴 코드는 청크 단위로 분할 분석
3. **캐싱**: 동일한 분석 결과 재사용
4. **병렬 처리**: 여러 페르소나 동시 분석

## 🚨 문제 해결

### Ollama 연결 실패
```bash
# Ollama 서비스 상태 확인
ollama list

# 서비스 재시작
sudo systemctl restart ollama
```

### 메모리 부족
```bash
# 더 작은 모델 사용
ollama pull codellama:7b-instruct-q4_K_M

# 환경 변수 조정
AI_MAX_TOKENS=1000
```

### 느린 응답
```env
# 빠른 모델 사용
AI_MODEL_NAME=codellama:7b-instruct-q4_K_M
AI_TEMPERATURE=0.1
```

## 📈 향후 계획

- [ ] 더 많은 OSS 모델 지원
- [ ] 모델 성능 비교 도구
- [ ] 자동 모델 선택 기능
- [ ] 분산 추론 지원
