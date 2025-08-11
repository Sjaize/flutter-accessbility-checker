import xml.etree.ElementTree as ET
import re
from typing import List, Dict, Optional
from dataclasses import dataclass
from accessibility_rule_engine import UIElement, AccessibilityRuleEngine

@dataclass
class ParsedUIElement:
    """파싱된 UI 요소 정보"""
    resource_id: str
    class_name: str
    text: str
    content_description: str
    bounds: str
    clickable: bool
    focusable: bool
    enabled: bool
    parent_id: str
    sibling_ids: List[str]
    drawable_src: str
    background: str
    layout_width: str
    layout_height: str

class AndroidXMLParser:
    """Android XML 레이아웃 파일을 파싱하는 클래스"""
    
    def __init__(self):
        self.rule_engine = AccessibilityRuleEngine()
        self.element_parents = {}  # 부모-자식 관계 저장
    
    def parse_layout_file(self, xml_content: str) -> List[UIElement]:
        """XML 레이아웃 파일을 파싱하여 UI 요소들을 추출합니다."""
        try:
            root = ET.fromstring(xml_content)
            elements = []
            
            # 부모-자식 관계 먼저 구축
            self._build_parent_relationships(root)
            
            # 모든 UI 요소를 재귀적으로 탐색
            for element in root.iter():
                ui_element = self._parse_element(element, root)
                if ui_element:
                    elements.append(ui_element)
            
            return elements
            
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
        """개별 XML 요소를 파싱합니다."""
        
        # UI 요소가 아닌 경우 스킵
        if not self._is_ui_element(element):
            return None
        
        # 기본 정보 추출
        resource_id = element.get('android:id', '')
        class_name = element.tag
        text = element.get('android:text', '')
        content_description = element.get('android:contentDescription', '')
        bounds = self._extract_bounds(element)
        
        # 속성 추출
        clickable = element.get('android:clickable', 'false').lower() == 'true'
        focusable = element.get('android:focusable', 'false').lower() == 'true'
        enabled = element.get('android:enabled', 'true').lower() == 'true'
        
        # 부모/형제 정보 추출
        parent_id = self._get_parent_id(element, root)
        sibling_ids = self._get_sibling_ids(element, root)
        
        # 리소스 ID 정규화
        resource_id = self._normalize_resource_id(resource_id)
        
        # 컨텍스트 정보 생성
        parent_context = self._get_context_info([parent_id], root) if parent_id else ""
        sibling_context = self._get_context_info(sibling_ids, root)
        
        return UIElement(
            resource_id=resource_id,
            class_name=class_name,
            text=text,
            content_description=content_description,
            bounds=bounds,
            clickable=clickable,
            focusable=focusable,
            enabled=enabled,
            parent_context=parent_context,
            sibling_context=sibling_context
        )
    
    def _is_ui_element(self, element: ET.Element) -> bool:
        """UI 요소인지 판단합니다."""
        # 레이아웃 요소는 제외하고 실제 UI 요소만 포함
        ui_classes = [
            'Button', 'ImageButton', 'TextView', 'EditText', 'ImageView',
            'CheckBox', 'RadioButton', 'Switch', 'SeekBar', 'ToggleButton',
            'FloatingActionButton', 'Toolbar', 'BottomNavigationView',
            'TabLayout', 'RecyclerView', 'ListView', 'Spinner', 'ProgressBar'
        ]
        
        class_name = element.tag.split('.')[-1]
        return class_name in ui_classes
    
    def _extract_bounds(self, element: ET.Element) -> str:
        """요소의 bounds 정보를 추출합니다."""
        layout_width = element.get('android:layout_width', '')
        layout_height = element.get('android:layout_height', '')
        
        if layout_width and layout_height:
            return f"width={layout_width}, height={layout_height}"
        return ""
    
    def _normalize_resource_id(self, resource_id: str) -> str:
        """리소스 ID를 정규화합니다."""
        if not resource_id:
            return ""
        
        # @+id/ 또는 @id/ 제거
        if resource_id.startswith('@+id/') or resource_id.startswith('@id/'):
            return resource_id[5:]  # @+id/ 제거
        
        return resource_id
    
    def _get_parent_id(self, element: ET.Element, root: ET.Element) -> str:
        """부모 요소의 ID를 찾습니다."""
        parent = self.element_parents.get(element)
        if parent is not None:
            return self._normalize_resource_id(parent.get('android:id', ''))
        return ""
    
    def _get_sibling_ids(self, element: ET.Element, root: ET.Element) -> List[str]:
        """형제 요소들의 ID를 찾습니다."""
        parent = self.element_parents.get(element)
        if parent is None:
            return []
        
        sibling_ids = []
        for sibling in parent:
            if sibling != element and sibling.get('android:id'):
                sibling_id = self._normalize_resource_id(sibling.get('android:id', ''))
                if sibling_id:
                    sibling_ids.append(sibling_id)
        
        return sibling_ids
    
    def _get_context_info(self, element_ids: List[str], root: ET.Element) -> str:
        """요소들의 컨텍스트 정보를 추출합니다."""
        context_info = []
        
        for element_id in element_ids:
            element = self._find_element_by_id(element_id, root)
            if element:
                class_name = element.tag.split('.')[-1]
                text = element.get('android:text', '')
                if text:
                    context_info.append(f"{class_name}:{text}")
                else:
                    context_info.append(class_name)
        
        return " ".join(context_info)
    
    def _find_element_by_id(self, element_id: str, root: ET.Element) -> Optional[ET.Element]:
        """ID로 요소를 찾습니다."""
        for element in root.iter():
            if self._normalize_resource_id(element.get('android:id', '')) == element_id:
                return element
        return None

class AccessibilityTextGenerator:
    """접근성 텍스트 생성을 담당하는 클래스"""
    
    def __init__(self):
        self.parser = AndroidXMLParser()
        self.rule_engine = AccessibilityRuleEngine()
    
    def generate_from_xml(self, xml_content: str) -> List[Dict]:
        """XML에서 접근성 텍스트를 생성합니다."""
        ui_elements = self.parser.parse_layout_file(xml_content)
        results = []
        
        for element in ui_elements:
            alt_text = self.rule_engine.generate_alt_text(element)
            alternatives = self.rule_engine.get_alternatives(element)
            
            result = {
                'resource_id': element.resource_id,
                'class_name': element.class_name,
                'text': element.text,
                'current_content_description': element.content_description,
                'generated_alt_text': alt_text,
                'alternatives': alternatives,
                'clickable': element.clickable,
                'focusable': element.focusable,
                'bounds': element.bounds
            }
            
            results.append(result)
        
        return results
    
    def generate_improvement_suggestions(self, xml_content: str) -> List[Dict]:
        """개선 제안을 생성합니다."""
        results = self.generate_from_xml(xml_content)
        suggestions = []
        
        for result in results:
            if not result['current_content_description']:
                # contentDescription이 없는 경우
                suggestion = {
                    'type': 'missing_content_description',
                    'resource_id': result['resource_id'],
                    'current': '없음',
                    'suggested': result['generated_alt_text'],
                    'alternatives': result['alternatives'],
                    'priority': 'high' if result['clickable'] else 'medium'
                }
                suggestions.append(suggestion)
            
            elif result['current_content_description'] in ['', 'null', 'undefined']:
                # 빈 contentDescription인 경우
                suggestion = {
                    'type': 'empty_content_description',
                    'resource_id': result['resource_id'],
                    'current': result['current_content_description'],
                    'suggested': result['generated_alt_text'],
                    'alternatives': result['alternatives'],
                    'priority': 'high' if result['clickable'] else 'medium'
                }
                suggestions.append(suggestion)
            
            elif result['clickable'] and not result['current_content_description']:
                # 클릭 가능한 요소에 contentDescription이 없는 경우
                suggestion = {
                    'type': 'clickable_without_description',
                    'resource_id': result['resource_id'],
                    'current': '없음',
                    'suggested': result['generated_alt_text'],
                    'alternatives': result['alternatives'],
                    'priority': 'high'
                }
                suggestions.append(suggestion)
        
        return suggestions

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
    </LinearLayout>
    '''
    
    generator = AccessibilityTextGenerator()
    results = generator.generate_from_xml(test_xml)
    suggestions = generator.generate_improvement_suggestions(test_xml)
    
    print("=== 접근성 텍스트 생성 결과 ===")
    for result in results:
        print(f"ID: {result['resource_id']}")
        print(f"클래스: {result['class_name']}")
        print(f"텍스트: {result['text']}")
        print(f"현재: {result['current_content_description']}")
        print(f"생성: {result['generated_alt_text']}")
        print(f"대안: {result['alternatives']}")
        print(f"클릭가능: {result['clickable']}")
        print("-" * 30)
    
    print("\n=== 개선 제안 ===")
    for suggestion in suggestions:
        print(f"타입: {suggestion['type']}")
        print(f"ID: {suggestion['resource_id']}")
        print(f"현재: {suggestion['current']}")
        print(f"제안: {suggestion['suggested']}")
        print(f"우선순위: {suggestion['priority']}")
        print("-" * 30) 