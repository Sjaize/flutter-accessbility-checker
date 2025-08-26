# Flutter Accessibility Dashboard

Flutter 접근성 체커의 React 대시보드입니다. VS Code 확장 프로그램과 연동하여 실시간으로 접근성 이슈를 시각화하고 코드 개선을 제안합니다.

## 주요 기능

- **실시간 스크린샷**: Flutter 앱의 실시간 스크린샷 표시
- **바운딩 박스**: 접근성 이슈가 있는 요소에 시각적 표시
- **iframe 미러링**: 투명한 iframe으로 실제 앱과 상호작용
- **코드 제안**: 접근성 개선을 위한 코드 제안 및 VS Code 연동

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm start
```

## 기술 스택

- React 19
- TypeScript
- Tailwind CSS
- WebSocket (VS Code 확장 프로그램과 통신)

## 포트 설정

- **React 앱**: 3000 포트
- **WebSocket**: 3001 포트 (VS Code 확장 프로그램)
- **Flutter 앱**: 64022 포트

## 사용 방법

1. VS Code에서 Flutter 프로젝트를 열고 접근성 분석을 시작
2. 이 대시보드가 자동으로 브라우저에서 열림
3. 실시간 스크린샷과 바운딩 박스 확인
4. 이슈 클릭하여 코드 제안 요청
5. VS Code에서 코드 적용
