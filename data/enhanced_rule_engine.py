import json
import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from collections import defaultdict
import os

@dataclass
class UIElement:
    """UI 요소 정보를 담는 데이터 클래스"""
    resource_id: str
    class_name: str
    text: str = ""
    content_description: str = ""
    bounds: str = ""
    clickable: bool = False
    focusable: bool = False
    enabled: bool = True
    parent_context: str = ""
    sibling_context: str = ""
    app_context: str = ""

class EnhancedAccessibilityRuleEngine:
    """실제 데이터에서 추출한 규칙을 활용하는 개선된 접근성 규칙 엔진"""
    
    def __init__(self, rules_dir: str = "comprehensive_rules"):
        self.rules_dir = rules_dir
        self.resource_rules = {}
        self.class_rules = {}
        self.text_pattern_rules = {}
        self.app_specific_rules = {}
        self.action_rules = {}
        self.context_rules = {}
        
        self.load_rules()
    
    def load_rules(self):
        """추출된 규칙들을 로드합니다."""
        try:
            # 리소스 ID 규칙
            with open(f"{self.rules_dir}/resource_id_rules.json", 'r', encoding='utf-8') as f:
                self.resource_rules = json.load(f)
            
            # 클래스명 규칙
            with open(f"{self.rules_dir}/class_name_rules.json", 'r', encoding='utf-8') as f:
                self.class_rules = json.load(f)
            
            # 텍스트 패턴 규칙
            with open(f"{self.rules_dir}/text_pattern_rules.json", 'r', encoding='utf-8') as f:
                self.text_pattern_rules = json.load(f)
            
            # 앱별 규칙
            with open(f"{self.rules_dir}/app_specific_rules.json", 'r', encoding='utf-8') as f:
                self.app_specific_rules = json.load(f)
            
            # 액션 규칙
            with open(f"{self.rules_dir}/action_rules.json", 'r', encoding='utf-8') as f:
                self.action_rules = json.load(f)
            
            print(f"✅ 규칙 로드 완료:")
            print(f"  • 리소스 ID 규칙: {len(self.resource_rules)}개")
            print(f"  • 클래스명 규칙: {len(self.class_rules)}개")
            print(f"  • 텍스트 패턴 규칙: {len(self.text_pattern_rules)}개")
            print(f"  • 앱별 규칙: {len(self.app_specific_rules)}개")
            print(f"  • 액션 규칙: {len(self.action_rules)}개")
            
        except Exception as e:
            print(f"❌ 규칙 로드 실패: {e}")
    
    def generate_alt_text(self, element: UIElement) -> str:
        """UI 요소에 대한 접근성 텍스트를 생성합니다."""
        
        # 1. 우선순위: content_description이 있으면 사용
        if element.content_description and element.content_description.strip():
            return element.content_description
        
        # 2. 리소스 ID 기반 매칭 (가장 정확)
        if element.resource_id:
            alt_text = self._match_resource_id(element.resource_id)
            if alt_text:
                return alt_text
        
        # 3. 앱별 컨텍스트 기반 매칭
        if element.app_context:
            alt_text = self._match_app_context(element)
            if alt_text:
                return alt_text
        
        # 4. 텍스트 기반 매칭
        if element.text:
            alt_text = self._match_text_pattern(element.text)
            if alt_text:
                return alt_text
        
        # 5. 클래스명 기반 매칭
        if element.class_name:
            alt_text = self._match_class_name(element.class_name)
            if alt_text:
                return alt_text
        
        # 6. 컨텍스트 기반 추론
        alt_text = self._infer_from_context(element)
        if alt_text:
            return alt_text
        
        # 7. 기본값
        return self._get_default_alt_text(element)
    
    def _match_resource_id(self, resource_id: str) -> Optional[str]:
        """리소스 ID 기반 매칭"""
        # 정확한 매칭
        if resource_id in self.resource_rules:
            return self.resource_rules[resource_id][0]
        
        # 부분 매칭 (가장 긴 매칭 선택)
        resource_lower = resource_id.lower()
        matching_patterns = []
        
        for pattern, alternatives in self.resource_rules.items():
            if pattern.lower() in resource_lower:
                matching_patterns.append((len(pattern), pattern, alternatives))
        
        if matching_patterns:
            matching_patterns.sort(reverse=True)
            return matching_patterns[0][2][0]
        
        return None
    
    def _match_app_context(self, element: UIElement) -> Optional[str]:
        """앱별 컨텍스트 기반 매칭"""
        if not element.app_context:
            return None
        
        # 앱별 규칙에서 매칭
        for app_name, rules in self.app_specific_rules.items():
            if app_name in element.app_context:
                # 해당 앱의 규칙 중에서 가장 적합한 것 선택
                return rules[0] if rules else None
        
        return None
    
    def _match_text_pattern(self, text: str) -> Optional[str]:
        """텍스트 패턴 기반 매칭"""
        if not text:
            return None
        
        text_lower = text.lower()
        
        # 텍스트 패턴 규칙에서 매칭
        for category, patterns in self.text_pattern_rules.items():
            for pattern in patterns:
                if pattern.lower() in text_lower:
                    return pattern
        
        # 액션 단어 기반 매칭
        words = text_lower.split()
        for word in words:
            if word in self.action_rules:
                # 해당 액션과 관련된 패턴 찾기
                for category, patterns in self.text_pattern_rules.items():
                    if any(word in pattern.lower() for pattern in patterns):
                        return patterns[0]
        
        return None
    
    def _match_class_name(self, class_name: str) -> Optional[str]:
        """클래스명 기반 매칭"""
        # 정확한 매칭
        if class_name in self.class_rules:
            return self.class_rules[class_name][0]
        
        # 패키지명 제거 후 매칭
        simple_name = class_name.split('.')[-1]
        if simple_name in self.class_rules:
            return self.class_rules[simple_name][0]
        
        # 부분 매칭
        class_lower = class_name.lower()
        for pattern, alternatives in self.class_rules.items():
            if pattern.lower() in class_lower:
                return alternatives[0]
        
        return None
    
    def _infer_from_context(self, element: UIElement) -> Optional[str]:
        """컨텍스트 정보를 기반으로 추론"""
        context = f"{element.parent_context} {element.sibling_context}".lower()
        
        # 텍스트 패턴에서 컨텍스트 매칭
        for category, patterns in self.text_pattern_rules.items():
            for pattern in patterns:
                if pattern.lower() in context:
                    return pattern
        
        # 액션 단어 기반 추론
        for word, count in self.action_rules.items():
            if word in context:
                # 해당 액션과 관련된 패턴 반환
                for category, patterns in self.text_pattern_rules.items():
                    if any(word in pattern.lower() for pattern in patterns):
                        return patterns[0]
        
        return None
    
    def _get_default_alt_text(self, element: UIElement) -> str:
        """기본 접근성 텍스트 생성"""
        class_name = element.class_name.lower()
        
        if "button" in class_name:
            return "버튼"
        elif "image" in class_name:
            return "이미지"
        elif "edittext" in class_name:
            return "입력 필드"
        elif "textview" in class_name:
            return "텍스트"
        elif "checkbox" in class_name:
            return "체크박스"
        elif "radio" in class_name:
            return "라디오 버튼"
        elif "switch" in class_name:
            return "스위치"
        elif "seekbar" in class_name:
            return "슬라이더"
        else:
            return "UI 요소"
    
    def get_alternatives(self, element: UIElement) -> List[str]:
        """대안 접근성 텍스트들을 반환합니다."""
        alternatives = []
        
        # 리소스 ID 기반 대안
        if element.resource_id and element.resource_id in self.resource_rules:
            alternatives.extend(self.resource_rules[element.resource_id])
        
        # 클래스명 기반 대안
        if element.class_name and element.class_name in self.class_rules:
            alternatives.extend(self.class_rules[element.class_name])
        
        # 앱별 대안
        if element.app_context:
            for app_name, rules in self.app_specific_rules.items():
                if app_name in element.app_context:
                    alternatives.extend(rules)
        
        # 중복 제거 및 정렬
        unique_alternatives = list(dict.fromkeys(alternatives))
        return unique_alternatives[:5]  # 최대 5개
    
    def get_matching_confidence(self, element: UIElement) -> Tuple[str, float]:
        """매칭 신뢰도를 반환합니다."""
        if element.content_description:
            return "content_description", 1.0
        
        if element.resource_id and element.resource_id in self.resource_rules:
            return "resource_id_exact", 0.95
        
        if element.resource_id:
            resource_lower = element.resource_id.lower()
            for pattern in self.resource_rules.keys():
                if pattern.lower() in resource_lower:
                    return "resource_id_partial", 0.8
        
        if element.app_context:
            for app_name in self.app_specific_rules.keys():
                if app_name in element.app_context:
                    return "app_context", 0.7
        
        if element.text and self._match_text_pattern(element.text):
            return "text_pattern", 0.6
        
        if element.class_name and element.class_name in self.class_rules:
            return "class_name_exact", 0.5
        
        if element.class_name:
            simple_name = element.class_name.split('.')[-1]
            if simple_name in self.class_rules:
                return "class_name_simple", 0.4
        
        if self._infer_from_context(element):
            return "context_inference", 0.3
        
        return "default", 0.1

# 사용 예시
if __name__ == "__main__":
    engine = EnhancedAccessibilityRuleEngine()
    
    # 테스트 케이스들
    test_elements = [
        UIElement("backBtn", "ImageView", clickable=True, app_context="com.ak.app.firehouse.activity.Tabbars"),
        UIElement("search_button", "Button", text="검색", clickable=True),
        UIElement("", "EditText", text="이메일 입력"),
        UIElement("ic_like", "ImageView", clickable=True),
        UIElement("", "CheckBox", text="약관 동의"),
        UIElement("tab_activity", "ImageView", clickable=True, app_context="com.canvsly.android.app.activities.ArtistsHomeActivity")
    ]
    
    print("\n=== 개선된 규칙 엔진 테스트 ===")
    for i, element in enumerate(test_elements, 1):
        alt_text = engine.generate_alt_text(element)
        alternatives = engine.get_alternatives(element)
        confidence_type, confidence_score = engine.get_matching_confidence(element)
        
        print(f"\n{i}. Element: {element.resource_id or element.text}")
        print(f"   클래스: {element.class_name}")
        print(f"   앱: {element.app_context}")
        print(f"   Alt Text: {alt_text}")
        print(f"   대안: {alternatives}")
        print(f"   신뢰도: {confidence_type} ({confidence_score:.2f})")
        print("-" * 50) 