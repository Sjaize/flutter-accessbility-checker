# Flutter Accessibility Checker

Flutter 개발자를 위한 접근성 검사 VS Code 확장입니다. Flutter 웹 앱의 접근성 이슈를 실시간으로 감지하고 수정 제안을 제공합니다.

## 주요 기능

- 🔍 **실시간 접근성 검사**: Flutter 웹 앱의 접근성 이슈를 자동으로 감지
- 💡 **스마트 수정 제안**: 감지된 이슈에 대한 구체적인 코드 수정 제안
- 🎯 **시각적 피드백**: 앱 화면에 직접 오버레이로 이슈 위치 표시
- 🔄 **원클릭 적용**: 제안된 수정사항을 VS Code에서 바로 적용
- 🌐 **브라우저 연동**: React 웹 인터페이스를 통한 직관적인 사용자 경험

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
cd react-app && npm install
cd ..
```

### 2. TypeScript 컴파일
```bash
npm run compile
```

### 3. VS Code에서 실행
1. **F5 키**를 눌러 디버그 모드로 실행
2. 새 VS Code 창에서 `Cmd+Shift+P` (또는 `Ctrl+Shift+P`)를 눌러 명령 팔레트 열기
3. `"Flutter Accessibility Checker: Open Panel"` 입력 후 실행
4. `🌐 외부 브라우저에서 열기 (Recommended)` 선택

### 4. 사용법
- Flutter 앱이 워크스페이스에 있어야 합니다
- 확장 실행 시 Flutter 서버(포트 60778)와 React 앱(포트 3000)이 자동으로 시작됩니다
- 브라우저에서 접근성 이슈를 확인하고 수정 제안을 적용할 수 있습니다

## 시스템 요구사항

- VS Code 1.80.0 이상
- Node.js 16.0.0 이상
- Flutter SDK (Flutter 앱 개발용)
- npm 또는 yarn

## 포트 사용

- **Flutter 서버**: 60778
- **React 앱**: 3000

포트가 이미 사용 중인 경우 충돌이 발생할 수 있습니다.

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
>>>>>>> 78bfbb5 (Initial commit)
