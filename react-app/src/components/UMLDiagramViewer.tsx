import React, { useState, useEffect } from 'react';

interface UMLDiagramViewerProps {
  isOpen: boolean;
  onClose: () => void;
  pumlCode: string;
  title?: string;
}

export default function UMLDiagramViewer({ 
  isOpen, 
  onClose, 
  pumlCode, 
  title = "사용자 저니 다이어그램" 
}: UMLDiagramViewerProps) {
  const [diagramType, setDiagramType] = useState<'user-journey' | 'class' | 'sequence' | 'activity'>('user-journey');
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPumlCode, setCurrentPumlCode] = useState(pumlCode);
  const [error, setError] = useState<string | null>(null);

  // PlantUML 인코딩 함수
  const encodePlantUML = (code: string): string => {
    // PlantUML 압축 알고리즘 (PlantUML 공식 문서 기반)
    const compress = (s: string): string => {
      const encode6bit = (b: number): string => {
        if (b < 10) return String.fromCharCode(48 + b);
        b -= 10;
        if (b < 26) return String.fromCharCode(65 + b);
        b -= 26;
        if (b < 26) return String.fromCharCode(97 + b);
        b -= 26;
        if (b === 0) return '-';
        if (b === 1) return '_';
        return '?';
      };

      let r = '';
      let i = 0;
      while (i < s.length) {
        const c1 = s.charCodeAt(i++);
        r += encode6bit(c1 & 0x3f);
        if (i < s.length) {
          const c2 = s.charCodeAt(i++);
          r += encode6bit((c1 >> 6) & 0x3f | (c2 & 0xf) << 2);
          if (i < s.length) {
            const c3 = s.charCodeAt(i++);
            r += encode6bit((c2 >> 4) & 0x3f | (c3 & 0x3) << 4);
            if (i < s.length) {
              r += encode6bit((c3 >> 2) & 0x3f);
            }
          }
        }
      }
      return r;
    };

    return compress(code);
  };

  const encodedPuml = encodePlantUML(currentPumlCode);
  // 여러 PlantUML 서버 URL을 시도
  const diagramUrls = [
    `https://www.plantuml.com/plantuml/png/${encodedPuml}`,
    `https://plantuml.com/plantuml/png/${encodedPuml}`,
    `https://www.plantuml.com/plantuml/svg/${encodedPuml}`,
    `https://plantuml.com/plantuml/svg/${encodedPuml}`
  ];

  useEffect(() => {
    if (pumlCode) {
      setCurrentPumlCode(pumlCode);
      setIsLoading(true);
      setError(null);
    }
  }, [pumlCode]);

  const getDiagramTemplates = () => {
    switch (diagramType) {
      case 'user-journey':
        return `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam roundcorner 5
skinparam shadowing false

title Flutter App User Journey

start
:사용자 앱 실행;
:온보딩 화면 표시;

if (첫 방문?) then (yes)
  :온보딩 가이드 표시;
  :"지금 시작하기" 버튼;
else (no)
  :메인 화면으로 이동;
endif

:메인 화면 로드;
:홈 화면 표시;

if (접근성 이슈 감지) then (있음)
  :접근성 경고 표시;
  :수정 제안 표시;
else (없음)
  :정상 화면 표시;
endif

stop
@enduml`;

      case 'class':
        return `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam roundcorner 5
skinparam shadowing false

title Flutter App Class Structure

class HomeScreen {
  +build(BuildContext context): Widget
  +_handleButtonPress(): void
  +_checkAccessibility(): void
}

class OnboardingScreen {
  +build(BuildContext context): Widget
  +_nextStep(): void
  +_skipOnboarding(): void
}

class CustomButton {
  +build(BuildContext context): Widget
  +_onPressed(): void
}

class AuthService {
  +login(String email, String password): Future<bool>
  +logout(): void
  +isLoggedIn(): bool
}

HomeScreen --> CustomButton
OnboardingScreen --> CustomButton
HomeScreen --> AuthService
@enduml`;

      case 'sequence':
        return `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam roundcorner 5
skinparam shadowing false

title Flutter App Sequence Flow

actor User
participant "HomeScreen" as HS
participant "CustomButton" as CB
participant "AuthService" as AS

User -> HS: 앱 실행
HS -> HS: 화면 초기화
HS -> CB: 버튼 렌더링
User -> CB: 버튼 클릭
CB -> HS: 이벤트 전달
HS -> AS: 인증 확인
AS -> HS: 인증 결과
HS -> User: 화면 업데이트
@enduml`;

      case 'activity':
        return `@startuml
!theme plain
skinparam backgroundColor transparent
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam roundcorner 5
skinparam shadowing false

title Flutter App Activity Flow

start
:앱 시작;
:메인 화면 로드;

if (사용자 인증됨?) then (yes)
  :홈 화면 표시;
else (no)
  :로그인 화면 표시;
  :사용자 로그인;
endif

:화면 상호작용;
if (접근성 검사) then (이슈 발견)
  :경고 표시;
  :수정 제안;
else (정상)
  :정상 동작;
endif

stop
@enduml`;

      default:
        return pumlCode;
    }
  };

  const handleDiagramTypeChange = (type: typeof diagramType) => {
    setDiagramType(type);
    const newPumlCode = getDiagramTemplates();
    setCurrentPumlCode(newPumlCode);
    setIsLoading(true);
    setError(null);
  };

  const handleImageError = () => {
    setError('다이어그램을 불러올 수 없습니다. PlantUML 서버를 확인해주세요.');
    setIsLoading(false);
  };

  const handleImageLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-90 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-11/12 h-5/6 max-w-6xl flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-600">PlantUML 기반 다이어그램 뷰어</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 컨트롤 패널 */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">다이어그램 타입:</span>
            <select
              value={diagramType}
              onChange={(e) => handleDiagramTypeChange(e.target.value as typeof diagramType)}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="user-journey">사용자 저니</option>
              <option value="class">클래스 다이어그램</option>
              <option value="sequence">시퀀스 다이어그램</option>
              <option value="activity">액티비티 다이어그램</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">확대/축소:</span>
            <input
              type="range"
              min="50"
              max="200"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-gray-600 w-12">{zoom}%</span>
          </div>

          <button
            onClick={() => setZoom(100)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            리셋
          </button>
        </div>

        {/* 다이어그램 영역 */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="flex justify-center items-center min-h-full">
            {isLoading ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">다이어그램을 생성하는 중...</p>
              </div>
            ) : error ? (
              <div className="text-center">
                <div className="text-red-500 mb-4">⚠️</div>
                <p className="text-red-600 mb-4">{error}</p>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">PlantUML 코드:</p>
                  <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-w-2xl max-h-64">
                    {currentPumlCode}
                  </pre>
                </div>
              </div>
            ) : (
              <div 
                className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-auto"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center top' }}
              >
                <img
                  src={diagramUrls[0]}
                  alt="UML Diagram"
                  className="max-w-none"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              </div>
            )}
          </div>
        </div>

        {/* 하단 정보 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div>
              <span className="font-medium">다이어그램 타입:</span> {diagramType}
              <span className="mx-2">•</span>
              <span className="font-medium">확대율:</span> {zoom}%
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = diagramUrls[0];
                  link.download = `${diagramType}-diagram.png`;
                  link.click();
                }}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                다운로드
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(currentPumlCode);
                  alert('PlantUML 코드가 클립보드에 복사되었습니다.');
                }}
                className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                코드 복사
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 