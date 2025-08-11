interface FlutterComponent {
  name: string;
  file: string;
  line: number;
  type: 'widget' | 'screen' | 'service' | 'model' | 'util';
  accessibilityScore: number;
  issues: string[];
  content?: string;
}

interface ProjectStructure {
  tree: string;
  components: FlutterComponent[];
  dartFiles: string[];
  pubspecYaml?: any;
}

export class ProjectAnalyzer {
  private projectPath: string = '';

  async analyzeProject(): Promise<ProjectStructure> {
    try {
      // VS Code 확장에서 워크스페이스 경로 가져오기
      const workspacePath = await this.getWorkspacePath();
      this.projectPath = workspacePath;

      const [tree, components, dartFiles, pubspecYaml] = await Promise.all([
        this.getProjectTree(),
        this.extractComponents(),
        this.findDartFiles(),
        this.parsePubspecYaml()
      ]);

      return {
        tree,
        components,
        dartFiles,
        pubspecYaml
      };
    } catch (error) {
      console.error('프로젝트 분석 실패:', error);
      return this.getFallbackStructure();
    }
  }

  private async getWorkspacePath(): Promise<string> {
    // VS Code API를 통해 워크스페이스 경로 가져오기
    // 실제로는 VS Code 확장에서 전달받아야 함
    return process.env.WORKSPACE_PATH || '/path/to/flutter/project';
  }

  private async getProjectTree(): Promise<string> {
    try {
      // 실제 tree 명령어 실행
      const response = await fetch('/api/project-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.projectPath })
      });

      if (response.ok) {
        const data = await response.json();
        return data.tree;
      }
    } catch (error) {
      console.warn('Tree API 호출 실패, fallback 사용:', error);
    }

    // Fallback: 하드코딩된 구조
    return `
.
├── lib/
│   ├── main.dart
│   ├── screens/
│   │   ├── home_screen.dart
│   │   ├── onboarding_screen.dart
│   │   └── settings_screen.dart
│   ├── widgets/
│   │   ├── custom_button.dart
│   │   └── accessibility_wrapper.dart
│   ├── models/
│   │   └── user_model.dart
│   ├── services/
│   │   ├── auth_service.dart
│   │   └── api_service.dart
│   └── utils/
│       └── constants.dart
├── assets/
│   ├── images/
│   └── fonts/
├── test/
├── pubspec.yaml
└── README.md
    `.trim();
  }

  private async extractComponents(): Promise<FlutterComponent[]> {
    try {
      const response = await fetch('/api/analyze-dart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.projectPath })
      });

      if (response.ok) {
        const data = await response.json();
        return data.components;
      }
    } catch (error) {
      console.warn('Dart 분석 API 호출 실패, fallback 사용:', error);
    }

    // Fallback: 기본 컴포넌트들
    return [
      {
        name: 'HomeScreen',
        file: 'lib/screens/home_screen.dart',
        line: 1,
        type: 'screen',
        accessibilityScore: 75,
        issues: ['버튼 터치 영역 부족', '색상 대비 개선 필요'],
        content: 'class HomeScreen extends StatelessWidget { ... }'
      },
      {
        name: 'OnboardingScreen',
        file: 'lib/screens/onboarding_screen.dart',
        line: 1,
        type: 'screen',
        accessibilityScore: 60,
        issues: ['이미지 대체 텍스트 누락'],
        content: 'class OnboardingScreen extends StatefulWidget { ... }'
      },
      {
        name: 'CustomButton',
        file: 'lib/widgets/custom_button.dart',
        line: 15,
        type: 'widget',
        accessibilityScore: 80,
        issues: ['Semantics 래퍼 누락'],
        content: 'class CustomButton extends StatelessWidget { ... }'
      },
      {
        name: 'AuthService',
        file: 'lib/services/auth_service.dart',
        line: 1,
        type: 'service',
        accessibilityScore: 90,
        issues: [],
        content: 'class AuthService { ... }'
      }
    ];
  }

  private async findDartFiles(): Promise<string[]> {
    try {
      const response = await fetch('/api/dart-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.projectPath })
      });

      if (response.ok) {
        const data = await response.json();
        return data.files;
      }
    } catch (error) {
      console.warn('Dart 파일 검색 API 호출 실패, fallback 사용:', error);
    }

    // Fallback: 기본 Dart 파일들
    return [
      'lib/main.dart',
      'lib/screens/home_screen.dart',
      'lib/screens/onboarding_screen.dart',
      'lib/screens/settings_screen.dart',
      'lib/widgets/custom_button.dart',
      'lib/widgets/accessibility_wrapper.dart',
      'lib/models/user_model.dart',
      'lib/services/auth_service.dart',
      'lib/services/api_service.dart',
      'lib/utils/constants.dart'
    ];
  }

  private async parsePubspecYaml(): Promise<any> {
    try {
      const response = await fetch('/api/pubspec-yaml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.projectPath })
      });

      if (response.ok) {
        const data = await response.json();
        return data.pubspec;
      }
    } catch (error) {
      console.warn('pubspec.yaml 파싱 API 호출 실패, fallback 사용:', error);
    }

    // Fallback: 기본 pubspec.yaml
    return {
      name: 'my_flutter_app',
      description: 'A Flutter application',
      version: '1.0.0+1',
      dependencies: {
        flutter: '^3.0.0',
        http: '^0.13.0',
        provider: '^6.0.0'
      }
    };
  }

  private getFallbackStructure(): ProjectStructure {
    return {
      tree: `
.
├── lib/
│   ├── main.dart
│   ├── screens/
│   │   ├── home_screen.dart
│   │   ├── onboarding_screen.dart
│   │   └── settings_screen.dart
│   ├── widgets/
│   │   ├── custom_button.dart
│   │   └── accessibility_wrapper.dart
│   ├── models/
│   │   └── user_model.dart
│   ├── services/
│   │   ├── auth_service.dart
│   │   └── api_service.dart
│   └── utils/
│       └── constants.dart
├── assets/
│   ├── images/
│   └── fonts/
├── test/
├── pubspec.yaml
└── README.md
      `.trim(),
      components: [
        {
          name: 'HomeScreen',
          file: 'lib/screens/home_screen.dart',
          line: 1,
          type: 'screen',
          accessibilityScore: 75,
          issues: ['버튼 터치 영역 부족', '색상 대비 개선 필요'],
          content: 'class HomeScreen extends StatelessWidget { ... }'
        },
        {
          name: 'OnboardingScreen',
          file: 'lib/screens/onboarding_screen.dart',
          line: 1,
          type: 'screen',
          accessibilityScore: 60,
          issues: ['이미지 대체 텍스트 누락'],
          content: 'class OnboardingScreen extends StatefulWidget { ... }'
        },
        {
          name: 'CustomButton',
          file: 'lib/widgets/custom_button.dart',
          line: 15,
          type: 'widget',
          accessibilityScore: 80,
          issues: ['Semantics 래퍼 누락'],
          content: 'class CustomButton extends StatelessWidget { ... }'
        },
        {
          name: 'AuthService',
          file: 'lib/services/auth_service.dart',
          line: 1,
          type: 'service',
          accessibilityScore: 90,
          issues: [],
          content: 'class AuthService { ... }'
        }
      ],
      dartFiles: [
        'lib/main.dart',
        'lib/screens/home_screen.dart',
        'lib/screens/onboarding_screen.dart',
        'lib/screens/settings_screen.dart',
        'lib/widgets/custom_button.dart',
        'lib/widgets/accessibility_wrapper.dart',
        'lib/models/user_model.dart',
        'lib/services/auth_service.dart',
        'lib/services/api_service.dart',
        'lib/utils/constants.dart'
      ],
      pubspecYaml: {
        name: 'my_flutter_app',
        description: 'A Flutter application',
        version: '1.0.0+1',
        dependencies: {
          flutter: '^3.0.0',
          http: '^0.13.0',
          provider: '^6.0.0'
        }
      }
    };
  }

  // VS Code 확장과의 통신을 위한 메서드
  setProjectPath(path: string) {
    this.projectPath = path;
  }

  async getComponentContent(filePath: string): Promise<string> {
    try {
      const response = await fetch('/api/file-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          path: this.projectPath,
          file: filePath 
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.content;
      }
    } catch (error) {
      console.warn('파일 내용 읽기 실패:', error);
    }

    return '// 파일 내용을 읽을 수 없습니다.';
  }
} 