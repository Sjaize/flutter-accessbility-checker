import xml.etree.ElementTree as ET
import json
import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enhanced_rule_engine import EnhancedAccessibilityRuleEngine, UIElement

class CompleteAccessibilitySystem:
    """완전한 접근성 텍스트 개선 시스템"""
    
    def __init__(self):
        self.rule_engine = EnhancedAccessibilityRuleEngine()
        self.element_parents = {}
    
    def analyze_xml_layout(self, xml_content: str) -> List[Dict]:
        """XML 레이아웃을 분석하여 접근성 개선 제안을 생성합니다."""
        try:
            # XML 파싱
            root = ET.fromstring(xml_content)
            self._build_parent_relationships(root)
            
            # UI 요소 추출
            ui_elements = []
            for element in root.iter():
                ui_element = self._parse_element(element, root)
                if ui_element:
                    ui_elements.append(ui_element)
            
            # 접근성 텍스트 생성
            results = []
            for element in ui_elements:
                result = self._generate_accessibility_result(element)
                results.append(result)
            
            return results
            
        except ET.ParseError as e:
            print(f"XML 파싱 오류: {e}")
            return []
    
    def _build_parent_relationships(self, root: ET.Element):
        """부모-자식 관계를 구축합니다."""
        self.element_parents = {}
        
        def traverse(element, parent=None):
            if parent is not None:
                self.element_parents[element] = parent
            
            for child in element:
                traverse(child, element)
        
        traverse(root)
    
    def _parse_element(self, element: ET.Element, root: ET.Element) -> Optional[UIElement]:
        """XML 요소를 UIElement로 파싱합니다."""
        
        # UI 요소가 아닌 경우 스킵
        if not self._is_ui_element(element):
            return None
        
        # 기본 정보 추출
        resource_id = self._normalize_resource_id(element.get('android:id', ''))
        class_name = element.tag
        text = element.get('android:text', '')
        content_description = element.get('android:contentDescription', '')
        
        # 속성 추출
        clickable = element.get('android:clickable', 'false').lower() == 'true'
        focusable = element.get('android:focusable', 'false').lower() == 'true'
        enabled = element.get('android:enabled', 'true').lower() == 'true'
        
        # 컨텍스트 정보 추출
        parent_context = self._get_parent_context(element, root)
        sibling_context = self._get_sibling_context(element, root)
        app_context = self._extract_app_context(element)
        
        return UIElement(
            resource_id=resource_id,
            class_name=class_name,
            text=text,
            content_description=content_description,
            clickable=clickable,
            focusable=focusable,
            enabled=enabled,
            parent_context=parent_context,
            sibling_context=sibling_context,
            app_context=app_context
        )
    
    def _is_ui_element(self, element: ET.Element) -> bool:
        """UI 요소인지 판단합니다."""
        ui_classes = [
            'Button', 'ImageButton', 'TextView', 'EditText', 'ImageView',
            'CheckBox', 'RadioButton', 'Switch', 'SeekBar', 'ToggleButton',
            'FloatingActionButton', 'Toolbar', 'BottomNavigationView',
            'TabLayout', 'RecyclerView', 'ListView', 'Spinner', 'ProgressBar'
        ]
        
        class_name = element.tag.split('.')[-1]
        return class_name in ui_classes
    
    def _normalize_resource_id(self, resource_id: str) -> str:
        """리소스 ID를 정규화합니다."""
        if not resource_id:
            return ""
        
        if resource_id.startswith('@+id/') or resource_id.startswith('@id/'):
            return resource_id[5:]
        
        return resource_id
    
    def _get_parent_context(self, element: ET.Element, root: ET.Element) -> str:
        """부모 컨텍스트를 추출합니다."""
        parent = self.element_parents.get(element)
        if parent is not None:
            parent_id = self._normalize_resource_id(parent.get('android:id', ''))
            parent_class = parent.tag.split('.')[-1]
            return f"{parent_class}:{parent_id}"
        return ""
    
    def _get_sibling_context(self, element: ET.Element, root: ET.Element) -> str:
        """형제 컨텍스트를 추출합니다."""
        parent = self.element_parents.get(element)
        if parent is None:
            return ""
        
        sibling_contexts = []
        for sibling in parent:
            if sibling != element:
                sibling_id = self._normalize_resource_id(sibling.get('android:id', ''))
                sibling_class = sibling.tag.split('.')[-1]
                sibling_text = sibling.get('android:text', '')
                if sibling_text:
                    sibling_contexts.append(f"{sibling_class}:{sibling_text}")
                elif sibling_id:
                    sibling_contexts.append(f"{sibling_class}:{sibling_id}")
                else:
                    sibling_contexts.append(sibling_class)
        
        return " ".join(sibling_contexts)
    
    def _extract_app_context(self, element: ET.Element) -> str:
        """앱 컨텍스트를 추출합니다."""
        # 실제로는 매니페스트나 다른 소스에서 앱 정보를 가져와야 하지만,
        # 여기서는 예시로 하드코딩된 앱 컨텍스트를 사용
        return "com.example.app.MainActivity"
    
    def _generate_accessibility_result(self, element: UIElement) -> Dict:
        """접근성 결과를 생성합니다."""
        alt_text = self.rule_engine.generate_alt_text(element)
        alternatives = self.rule_engine.get_alternatives(element)
        confidence_type, confidence_score = self.rule_engine.get_matching_confidence(element)
        
        # 개선 제안 생성
        suggestions = self._generate_suggestions(element, alt_text, confidence_score)
        
        return {
            'resource_id': element.resource_id,
            'class_name': element.class_name,
            'text': element.text,
            'current_content_description': element.content_description,
            'generated_alt_text': alt_text,
            'alternatives': alternatives,
            'confidence_type': confidence_type,
            'confidence_score': confidence_score,
            'clickable': element.clickable,
            'focusable': element.focusable,
            'enabled': element.enabled,
            'suggestions': suggestions,
            'priority': self._calculate_priority(element, confidence_score)
        }
    
    def _generate_suggestions(self, element: UIElement, alt_text: str, confidence_score: float) -> List[Dict]:
        """개선 제안을 생성합니다."""
        suggestions = []
        
        # contentDescription이 없는 경우
        if not element.content_description:
            suggestion = {
                'type': 'missing_content_description',
                'description': 'contentDescription 속성이 없습니다.',
                'current': '없음',
                'suggested': alt_text,
                'confidence': confidence_score,
                'priority': 'high' if element.clickable else 'medium'
            }
            suggestions.append(suggestion)
        
        # contentDescription이 있지만 개선 가능한 경우
        elif element.content_description and confidence_score > 0.7:
            suggestion = {
                'type': 'improvement_suggestion',
                'description': '더 명확한 접근성 텍스트로 개선할 수 있습니다.',
                'current': element.content_description,
                'suggested': alt_text,
                'confidence': confidence_score,
                'priority': 'medium'
            }
            suggestions.append(suggestion)
        
        # 클릭 가능한 요소에 대한 추가 제안
        if element.clickable and not element.content_description:
            suggestion = {
                'type': 'clickable_without_description',
                'description': '클릭 가능한 요소에 접근성 설명이 필요합니다.',
                'current': '없음',
                'suggested': alt_text,
                'confidence': confidence_score,
                'priority': 'high'
            }
            suggestions.append(suggestion)
        
        return suggestions
    
    def _calculate_priority(self, element: UIElement, confidence_score: float) -> str:
        """우선순위를 계산합니다."""
        if element.clickable and confidence_score > 0.8:
            return 'high'
        elif element.clickable or confidence_score > 0.6:
            return 'medium'
        else:
            return 'low'
    
    def generate_report(self, results: List[Dict]) -> Dict:
        """분석 결과 리포트를 생성합니다."""
        total_elements = len(results)
        elements_with_content_description = len([r for r in results if r['current_content_description']])
        elements_without_content_description = total_elements - elements_with_content_description
        
        high_priority_suggestions = []
        medium_priority_suggestions = []
        low_priority_suggestions = []
        
        for result in results:
            for suggestion in result['suggestions']:
                if suggestion['priority'] == 'high':
                    high_priority_suggestions.append({
                        'resource_id': result['resource_id'],
                        'type': suggestion['type'],
                        'suggested': suggestion['suggested'],
                        'confidence': suggestion['confidence']
                    })
                elif suggestion['priority'] == 'medium':
                    medium_priority_suggestions.append({
                        'resource_id': result['resource_id'],
                        'type': suggestion['type'],
                        'suggested': suggestion['suggested'],
                        'confidence': suggestion['confidence']
                    })
                else:
                    low_priority_suggestions.append({
                        'resource_id': result['resource_id'],
                        'type': suggestion['type'],
                        'suggested': suggestion['suggested'],
                        'confidence': suggestion['confidence']
                    })
        
        return {
            'summary': {
                'total_elements': total_elements,
                'elements_with_content_description': elements_with_content_description,
                'elements_without_content_description': elements_without_content_description,
                'coverage_percentage': (elements_with_content_description / total_elements * 100) if total_elements > 0 else 0
            },
            'suggestions': {
                'high_priority': high_priority_suggestions,
                'medium_priority': medium_priority_suggestions,
                'low_priority': low_priority_suggestions
            },
            'statistics': {
                'high_priority_count': len(high_priority_suggestions),
                'medium_priority_count': len(medium_priority_suggestions),
                'low_priority_count': len(low_priority_suggestions)
            }
        }

# 사용 예시
if __name__ == "__main__":
    # 테스트용 XML
    test_xml = '''
    <LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical">
        
        <Button
            android:id="@+id/backBtn"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="뒤로"
            android:clickable="true" />
        
        <EditText
            android:id="@+id/searchInput"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:hint="검색어를 입력하세요" />
        
        <ImageView
            android:id="@+id/likeIcon"
            android:layout_width="24dp"
            android:layout_height="24dp"
            android:src="@drawable/ic_like"
            android:clickable="true" />
        
        <CheckBox
            android:id="@+id/agreeCheckbox"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="약관에 동의합니다" />
        
        <Button
            android:id="@+id/tab_activity"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="활동"
            android:clickable="true" />
    </LinearLayout>
    '''
    
    system = CompleteAccessibilitySystem()
    results = system.analyze_xml_layout(test_xml)
    report = system.generate_report(results)
    
    print("=== 완전한 접근성 시스템 테스트 ===")
    
    print(f"\n📊 분석 결과 요약:")
    print(f"  • 총 UI 요소: {report['summary']['total_elements']}개")
    print(f"  • contentDescription 있음: {report['summary']['elements_with_content_description']}개")
    print(f"  • contentDescription 없음: {report['summary']['elements_without_content_description']}개")
    print(f"  • 커버리지: {report['summary']['coverage_percentage']:.1f}%")
    
    print(f"\n🔴 높은 우선순위 제안: {report['statistics']['high_priority_count']}개")
    for suggestion in report['suggestions']['high_priority']:
        print(f"  • {suggestion['resource_id']}: {suggestion['suggested']} (신뢰도: {suggestion['confidence']:.2f})")
    
    print(f"\n🟡 중간 우선순위 제안: {report['statistics']['medium_priority_count']}개")
    for suggestion in report['suggestions']['medium_priority']:
        print(f"  • {suggestion['resource_id']}: {suggestion['suggested']} (신뢰도: {suggestion['confidence']:.2f})")
    
    print(f"\n🟢 낮은 우선순위 제안: {report['statistics']['low_priority_count']}개")
    for suggestion in report['suggestions']['low_priority']:
        print(f"  • {suggestion['resource_id']}: {suggestion['suggested']} (신뢰도: {suggestion['confidence']:.2f})")
    
    print(f"\n📋 상세 결과:")
    for i, result in enumerate(results, 1):
        print(f"\n{i}. {result['resource_id'] or result['text']}")
        print(f"   클래스: {result['class_name']}")
        print(f"   현재: {result['current_content_description'] or '없음'}")
        print(f"   제안: {result['generated_alt_text']}")
        print(f"   신뢰도: {result['confidence_type']} ({result['confidence_score']:.2f})")
        print(f"   우선순위: {result['priority']}")
        if result['alternatives']:
            print(f"   대안: {result['alternatives']}") 