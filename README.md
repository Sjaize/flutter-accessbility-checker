# Flutter Accessibility Checker

Flutter 앱의 접근성을 실시간으로 검사하고 개선 제안을 제공하는 VS Code 확장 프로그램입니다.

## 주요 기능

### 🔍 실시간 접근성 모니터링
- Flutter 앱의 UI 요소를 실시간으로 분석
- 접근성 라벨 누락, 버튼 설명 부족 등 문제점 자동 감지
- 시각적 피드백과 함께 문제점 표시

### 🛠️ Widget Inspection 통합
- VS Code 디버그 세션을 통한 Flutter Inspector 연결
- 위젯의 소스 코드 위치로 직접 이동
- 접근성 개선 코드 자동 제안

### 📊 대시보드
- React 기반 웹 대시보드로 접근성 이슈 시각화
- 실시간 스크린샷과 문제점 오버레이
- 개선 제안 및 코드 삽입 기능

## 사용법

### 1. 전체 기능 사용 (UI Automator + 디버그 세션)
```bash
# VS Code 명령 팔레트에서 실행
Flutter Accessibility: Open Flutter Accessibility Checker
```

### 2. 디버그 세션만 연결 (Widget Inspection 전용)
```bash
# VS Code 명령 팔레트에서 실행
Flutter Accessibility: Connect Flutter Debug Session (Widget Inspection)
```

## 요구사항

- Flutter SDK 설치
- Android Studio 또는 Xcode (에뮬레이터용)
- VS Code Flutter 확장 프로그램
- Node.js (React 대시보드용)

## 설치 및 설정

1. **Flutter 환경 설정**
   ```bash
   flutter doctor
   ```

2. **에뮬레이터 준비**
   - Android Studio에서 Android 에뮬레이터 생성
   - 또는 Xcode에서 iOS 시뮬레이터 준비

3. **VS Code 확장 프로그램 설치**
   - 이 확장 프로그램을 VS Code에 설치
   - Flutter 확장 프로그램도 함께 설치

4. **OpenAI API 키 설정 (LLM 제안 기능용)**
   ```bash
   # 프로젝트 루트에 .env 파일 생성
   cp env.example .env
   
   # .env 파일에서 OpenAI API 키 설정
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4-turbo-preview  # 선택사항
   ```
   
   **OpenAI API 키 발급 방법:**
   1. [OpenAI Platform](https://platform.openai.com/)에 가입
   2. API Keys 섹션에서 새 키 생성
   3. 생성된 키를 `.env` 파일에 입력
   
   > **참고:** API 키가 설정되지 않으면 가짜 응답으로 동작합니다.

## 사용 시나리오

### 시나리오 1: 전체 접근성 검사
1. VS Code에서 Flutter 프로젝트 열기
2. `Flutter Accessibility: Open Flutter Accessibility Checker` 실행
3. 에뮬레이터 선택 (자동 부팅 지원)
4. 웹 대시보드에서 접근성 이슈 확인
5. 문제점 클릭하여 소스 코드 위치로 이동

### 시나리오 2: Widget Inspection만 사용
1. VS Code에서 Flutter 프로젝트 열기
2. `Flutter Accessibility: Connect Flutter Debug Session` 실행
3. 에뮬레이터 선택
4. Flutter Inspector를 통한 위젯 검사
5. 접근성 코드 자동 제안

## 접근성 개선 예시

### 버튼 접근성 개선
```dart
// 개선 전
ElevatedButton(
  onPressed: () {},
  child: Icon(Icons.add),
)

// 개선 후
Semantics(
  label: "추가 버튼",
  child: ElevatedButton(
    onPressed: () {},
    child: Icon(Icons.add),
  ),
)
```

### 이미지 접근성 개선
```dart
// 개선 전
Image.asset('profile.png')

// 개선 후
Semantics(
  label: "사용자 프로필 사진",
  child: Image.asset('profile.png'),
)
```

## 문제 해결

### VM Service 연결 실패
- Flutter 앱이 완전히 시작되었는지 확인
- 에뮬레이터가 정상 작동하는지 확인
- VS Code Flutter 확장 프로그램이 최신 버전인지 확인

### 접근성 이슈가 감지되지 않음
- Flutter Inspector가 활성화되었는지 확인
- 디버그 모드로 실행되었는지 확인
- 에뮬레이터에서 앱이 정상 표시되는지 확인

## 기술 스택

- **Backend**: TypeScript, VS Code Extension API
- **Frontend**: React, TypeScript
- **Flutter Integration**: VM Service Protocol, Flutter Inspector
- **UI Automation**: Android UIAutomator, iOS Accessibility

## 라이선스

MIT License

## 기여하기

버그 리포트나 기능 제안은 GitHub Issues를 통해 해주세요.

---

**Flutter 앱의 접근성을 쉽고 효율적으로 개선하세요! 🚀**
