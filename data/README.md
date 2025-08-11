# 접근성 텍스트 개선 시스템

## 📋 프로젝트 개요

이 프로젝트는 Android XML 레이아웃 코드를 분석하여 접근성 텍스트(alt-text)를 자동으로 개선하는 규칙 기반 시스템입니다. 실제 데이터에서 추출한 규칙을 활용하여 정확하고 일관된 접근성 텍스트를 생성합니다.

## 🎯 주요 특징

- **실제 데이터 기반**: 1,635개의 처리된 아이콘 데이터와 61,285개의 위젯 캡션 데이터 활용
- **다층적 분석**: 리소스 ID, 클래스명, 텍스트 패턴, 앱별 컨텍스트 등 다양한 요소 분석
- **신뢰도 기반**: 매칭 신뢰도에 따른 우선순위 결정
- **실용적 제안**: 개발자가 바로 적용할 수 있는 구체적인 개선 제안

## 📁 파일 구조

```
accessibility_system/
├── README.md                           # 프로젝트 설명
├── accessibility_system_results.md     # 시스템 실행 결과 및 분석
├── comprehensive_data_analyzer.py      # 데이터 분석 및 규칙 추출
├── enhanced_rule_engine.py             # 개선된 규칙 엔진
├── complete_accessibility_system.py    # 완전한 접근성 시스템
├── code_parser.py                      # XML 파싱
├── comprehensive_rules/                # 추출된 규칙 파일들
│   ├── resource_id_rules.json         # 717개 리소스 ID 규칙
│   ├── class_name_rules.json          # 42개 클래스명 규칙
│   ├── text_pattern_rules.json        # 13개 텍스트 패턴 규칙
│   ├── app_specific_rules.json        # 99개 앱별 규칙
│   └── action_rules.json              # 20개 액션 규칙
├── Data/                               # 원본 데이터
│   ├── Our Data/
│   │   └── output_MMT_icon.csv        # 1,635개 아이콘 데이터
│   └── WC20/
│       └── widget_captions.csv        # 61,285개 위젯 캡션 데이터
└── Additional materials/
    └── Alt-Text Quality (Responses)-final.csv  # 품질 평가 데이터
```

## 🚀 사용 방법

### 1. 시스템 초기화
```python
from complete_accessibility_system import CompleteAccessibilitySystem

system = CompleteAccessibilitySystem()
```

### 2. XML 레이아웃 분석
```python
xml_content = '''
<Button android:id="@+id/backBtn" android:text="뒤로" />
'''

results = system.analyze_xml_layout(xml_content)
report = system.generate_report(results)
```

### 3. 결과 활용
```python
# 높은 우선순위 제안 확인
high_priority = report['suggestions']['high_priority']
for suggestion in high_priority:
    print(f"{suggestion['resource_id']}: {suggestion['suggested']}")
```

## 📊 시스템 성능

### 정확도 분석
- **리소스 ID 정확 매칭**: 95% 신뢰도
- **리소스 ID 부분 매칭**: 80% 신뢰도
- **앱별 컨텍스트 매칭**: 70% 신뢰도
- **텍스트 패턴 매칭**: 60% 신뢰도
- **클래스명 정확 매칭**: 50% 신뢰도

### 규칙 커버리지
- **리소스 ID 규칙**: 717개 고유 패턴
- **클래스명 규칙**: 42개 UI 클래스 지원
- **텍스트 패턴**: 13개 카테고리
- **앱별 규칙**: 99개 앱 지원
- **액션 단어**: 20개 일반 액션

## 🔧 데이터 분석 결과

### 처리된 아이콘 데이터
- 총 레코드: 1,635개
- 고유 리소스 ID: 717개
- 고유 클래스명: 42개
- 고유 앱: 428개
- 고유 캡션: 2,890개

### 위젯 캡션 데이터
- 총 레코드: 61,285개
- 고유 캡션: 1,856개
- 액션 단어: 20개
- 패턴 카테고리: 13개

## 💡 주요 개선 사항

1. **데이터 기반 접근**: 실제 사용된 캡션에서 규칙 추출
2. **다층적 매칭 시스템**: 우선순위 기반 매칭 (7단계)
3. **실용적 제안**: contentDescription 부족 요소 식별
4. **확장 가능한 구조**: 새로운 규칙 자동 추가 지원

## 📋 요구사항

- Python 3.7+
- pandas
- xml.etree.ElementTree (기본 라이브러리)
- json (기본 라이브러리)

## 🎯 결론

이 접근성 텍스트 개선 시스템은 실제 데이터를 기반으로 구축되어 높은 정확도와 실용성을 제공합니다. 717개의 리소스 ID 규칙과 42개의 클래스명 규칙을 통해 다양한 UI 요소에 대한 적절한 접근성 텍스트를 자동으로 생성할 수 있습니다.

시스템의 핵심 장점:
- **데이터 기반 정확성**: 실제 사용된 캡션에서 학습
- **신뢰도 기반 우선순위**: 매칭 품질에 따른 제안 순서
- **실용적 제안**: 개발자가 바로 적용 가능한 구체적 내용
- **확장 가능성**: 새로운 규칙 자동 추가 지원

이 시스템을 통해 Android 앱의 접근성을 크게 향상시킬 수 있으며, 개발자들이 접근성 텍스트 작성에 소요하는 시간을 대폭 단축할 수 있습니다. 