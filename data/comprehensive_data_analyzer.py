import pandas as pd
import json
import re
from collections import defaultdict, Counter
from typing import Dict, List, Tuple, Set
import matplotlib.pyplot as plt
import seaborn as sns

class ComprehensiveDataAnalyzer:
    """데이터를 체계적으로 분석하여 모든 가능한 정보를 활용하는 분석기"""
    
    def __init__(self):
        self.processed_data = None
        self.widget_captions_data = None
        self.quality_data = None
        self.analysis_results = {}
        
    def load_all_data(self):
        """모든 데이터를 로드합니다."""
        print("=== 데이터 로드 시작 ===")
        
        # 1. 처리된 아이콘 데이터
        try:
            self.processed_data = pd.read_csv('Data/Our Data/output_MMT_icon.csv')
            print(f"✅ 처리된 아이콘 데이터: {len(self.processed_data)} 개")
        except Exception as e:
            print(f"❌ 처리된 아이콘 데이터 로드 실패: {e}")
        
        # 2. 위젯 캡션 데이터
        try:
            self.widget_captions_data = pd.read_csv('Data/WC20/widget_captions.csv')
            print(f"✅ 위젯 캡션 데이터: {len(self.widget_captions_data)} 개")
        except Exception as e:
            print(f"❌ 위젯 캡션 데이터 로드 실패: {e}")
        
        # 3. 품질 평가 데이터
        try:
            self.quality_data = pd.read_csv('Additional materials/Alt-Text Quality (Responses)-final.csv')
            print(f"✅ 품질 평가 데이터: {len(self.quality_data)} 개")
        except Exception as e:
            print(f"❌ 품질 평가 데이터 로드 실패: {e}")
        
        print("=== 데이터 로드 완료 ===\n")
    
    def analyze_processed_data(self):
        """처리된 데이터를 상세 분석합니다."""
        if self.processed_data is None:
            return
        
        print("=== 처리된 데이터 상세 분석 ===")
        
        # 1. 기본 통계
        print(f"총 레코드: {len(self.processed_data)}")
        print(f"컬럼: {self.processed_data.columns.tolist()}")
        
        # 2. icon_context 구조 분석
        context_analysis = self._analyze_icon_context()
        
        # 3. reference_captions 분석
        caption_analysis = self._analyze_reference_captions()
        
        # 4. generated_caption 분석
        generated_analysis = self._analyze_generated_captions()
        
        # 5. 앱별 분석
        app_analysis = self._analyze_by_app()
        
        self.analysis_results['processed_data'] = {
            'context_analysis': context_analysis,
            'caption_analysis': caption_analysis,
            'generated_analysis': generated_analysis,
            'app_analysis': app_analysis
        }
        
        print("✅ 처리된 데이터 분석 완료\n")
    
    def _analyze_icon_context(self):
        """icon_context 구조를 분석합니다."""
        print("--- icon_context 구조 분석 ---")
        
        resource_ids = []
        class_names = []
        app_names = []
        parent_classes = []
        sibling_classes = []
        
        for _, row in self.processed_data.iterrows():
            try:
                context = json.loads(row['icon_context'])
                
                # UI element info
                ui_info = context.get('UI element info', {})
                resource_id = ui_info.get('resource_id', '')
                class_name = ui_info.get('class_name', '')
                
                if resource_id:
                    resource_ids.append(resource_id)
                if class_name:
                    class_names.append(class_name)
                
                # app activity name
                app_name = context.get('app activity name', '')
                if app_name:
                    app_names.append(app_name)
                
                # parent nodes
                parent_nodes = context.get('parent node', [])
                for parent in parent_nodes:
                    parent_class = parent.get('class', '')
                    if parent_class:
                        parent_classes.append(parent_class)
                
                # sibling nodes
                sibling_nodes = context.get('sibling nodes', [])
                for sibling in sibling_nodes:
                    sibling_class = sibling.get('class', '')
                    if sibling_class:
                        sibling_classes.append(sibling_class)
                        
            except Exception as e:
                continue
        
        analysis = {
            'resource_ids': {
                'total': len(resource_ids),
                'unique': len(set(resource_ids)),
                'top_10': Counter(resource_ids).most_common(10)
            },
            'class_names': {
                'total': len(class_names),
                'unique': len(set(class_names)),
                'top_10': Counter(class_names).most_common(10)
            },
            'app_names': {
                'total': len(app_names),
                'unique': len(set(app_names)),
                'top_10': Counter(app_names).most_common(10)
            },
            'parent_classes': {
                'total': len(parent_classes),
                'unique': len(set(parent_classes)),
                'top_10': Counter(parent_classes).most_common(10)
            },
            'sibling_classes': {
                'total': len(sibling_classes),
                'unique': len(set(sibling_classes)),
                'top_10': Counter(sibling_classes).most_common(10)
            }
        }
        
        print(f"리소스 ID: {analysis['resource_ids']['unique']}개 고유값")
        print(f"클래스명: {analysis['class_names']['unique']}개 고유값")
        print(f"앱명: {analysis['app_names']['unique']}개 고유값")
        print(f"부모 클래스: {analysis['parent_classes']['unique']}개 고유값")
        print(f"형제 클래스: {analysis['sibling_classes']['unique']}개 고유값")
        
        return analysis
    
    def _analyze_reference_captions(self):
        """reference_captions를 분석합니다."""
        print("--- reference_captions 분석 ---")
        
        all_captions = []
        caption_lengths = []
        unique_captions = set()
        
        for _, row in self.processed_data.iterrows():
            captions = row['reference_captions'].split('|')
            all_captions.extend(captions)
            caption_lengths.append(len(captions))
            unique_captions.update(captions)
        
        # 액션 단어 분석
        action_words = Counter()
        for caption in all_captions:
            words = caption.lower().split()
            for word in words:
                if word in ['go', 'open', 'click', 'enter', 'type', 'search', 'add', 'get', 'toggle', 'select', 'view', 'show', 'hide', 'save', 'delete', 'edit', 'share', 'like', 'favorite', 'bookmark', 'call', 'message', 'email', 'camera', 'photo', 'video', 'location', 'map', 'notification', 'settings', 'menu', 'back', 'forward', 'close', 'cancel', 'confirm', 'submit']:
                    action_words[word] += 1
        
        analysis = {
            'total_captions': len(all_captions),
            'unique_captions': len(unique_captions),
            'avg_captions_per_element': sum(caption_lengths) / len(caption_lengths),
            'caption_length_distribution': Counter(caption_lengths),
            'action_words': dict(action_words.most_common(20)),
            'top_captions': Counter(all_captions).most_common(20)
        }
        
        print(f"총 캡션: {analysis['total_captions']}개")
        print(f"고유 캡션: {analysis['unique_captions']}개")
        print(f"요소당 평균 캡션: {analysis['avg_captions_per_element']:.2f}개")
        print(f"액션 단어: {len(analysis['action_words'])}개")
        
        return analysis
    
    def _analyze_generated_captions(self):
        """generated_caption을 분석합니다."""
        print("--- generated_caption 분석 ---")
        
        generated_captions = self.processed_data['generated_caption'].dropna().tolist()
        unique_generated = set(generated_captions)
        
        analysis = {
            'total_generated': len(generated_captions),
            'unique_generated': len(unique_generated),
            'top_generated': Counter(generated_captions).most_common(20)
        }
        
        print(f"생성된 캡션: {analysis['total_generated']}개")
        print(f"고유 생성 캡션: {analysis['unique_generated']}개")
        
        return analysis
    
    def _analyze_by_app(self):
        """앱별로 분석합니다."""
        print("--- 앱별 분석 ---")
        
        app_data = defaultdict(list)
        
        for _, row in self.processed_data.iterrows():
            try:
                context = json.loads(row['icon_context'])
                app_name = context.get('app activity name', '')
                if app_name:
                    app_data[app_name].append({
                        'resource_id': context.get('UI element info', {}).get('resource_id', ''),
                        'class_name': context.get('UI element info', {}).get('class_name', ''),
                        'captions': row['reference_captions'].split('|'),
                        'generated': row['generated_caption']
                    })
            except:
                continue
        
        analysis = {}
        for app_name, data in app_data.items():
            analysis[app_name] = {
                'total_elements': len(data),
                'unique_resource_ids': len(set([d['resource_id'] for d in data if d['resource_id']])),
                'unique_class_names': len(set([d['class_name'] for d in data if d['class_name']])),
                'total_captions': len([caption for d in data for caption in d['captions']]),
                'unique_captions': len(set([caption for d in data for caption in d['captions']]))
            }
        
        print(f"분석된 앱: {len(analysis)}개")
        
        return analysis
    
    def analyze_widget_captions(self):
        """위젯 캡션 데이터를 분석합니다."""
        if self.widget_captions_data is None:
            return
        
        print("=== 위젯 캡션 데이터 분석 ===")
        
        # 1. 기본 통계
        print(f"총 레코드: {len(self.widget_captions_data)}")
        print(f"컬럼: {self.widget_captions_data.columns.tolist()}")
        
        # 2. 캡션 패턴 분석
        all_captions = []
        for caption in self.widget_captions_data['captions'].head(1000):  # 성능 고려
            captions = caption.split('|')
            all_captions.extend(captions)
        
        # 3. 액션 단어 분석
        action_words = Counter()
        for caption in all_captions:
            words = caption.lower().split()
            for word in words:
                if word in ['go', 'open', 'click', 'enter', 'type', 'search', 'add', 'get', 'toggle', 'select', 'view', 'show', 'hide', 'save', 'delete', 'edit', 'share', 'like', 'favorite', 'bookmark', 'call', 'message', 'email', 'camera', 'photo', 'video', 'location', 'map', 'notification', 'settings', 'menu', 'back', 'forward', 'close', 'cancel', 'confirm', 'submit']:
                    action_words[word] += 1
        
        # 4. 패턴 분석
        patterns = self._extract_caption_patterns(all_captions)
        
        analysis = {
            'total_captions': len(all_captions),
            'unique_captions': len(set(all_captions)),
            'action_words': dict(action_words.most_common(20)),
            'patterns': patterns,
            'top_captions': Counter(all_captions).most_common(20)
        }
        
        self.analysis_results['widget_captions'] = analysis
        
        print(f"총 캡션: {analysis['total_captions']}개")
        print(f"고유 캡션: {analysis['unique_captions']}개")
        print(f"액션 단어: {len(analysis['action_words'])}개")
        print(f"패턴: {len(analysis['patterns'])}개")
        print("✅ 위젯 캡션 데이터 분석 완료\n")
    
    def _extract_caption_patterns(self, captions: List[str]) -> Dict[str, List[str]]:
        """캡션에서 패턴을 추출합니다."""
        patterns = defaultdict(list)
        
        # 일반적인 패턴들
        pattern_keywords = {
            'navigation': ['go', 'back', 'forward', 'next', 'previous'],
            'action': ['click', 'tap', 'press', 'select', 'choose'],
            'input': ['enter', 'type', 'input', 'write'],
            'search': ['search', 'find', 'look', 'browse'],
            'media': ['camera', 'photo', 'video', 'image', 'picture'],
            'communication': ['call', 'message', 'email', 'chat', 'send'],
            'social': ['share', 'like', 'favorite', 'bookmark', 'follow'],
            'settings': ['settings', 'config', 'options', 'preferences'],
            'creation': ['add', 'create', 'new', 'make'],
            'modification': ['edit', 'modify', 'change', 'update'],
            'deletion': ['delete', 'remove', 'clear', 'erase'],
            'confirmation': ['confirm', 'save', 'submit', 'ok'],
            'cancellation': ['cancel', 'close', 'dismiss', 'exit']
        }
        
        for caption in captions:
            caption_lower = caption.lower()
            for category, keywords in pattern_keywords.items():
                for keyword in keywords:
                    if keyword in caption_lower:
                        patterns[category].append(caption)
                        break
        
        return dict(patterns)
    
    def generate_comprehensive_rules(self):
        """종합적인 규칙을 생성합니다."""
        print("=== 종합 규칙 생성 ===")
        
        rules = {
            'resource_id_rules': {},
            'class_name_rules': {},
            'text_pattern_rules': {},
            'app_specific_rules': {},
            'context_rules': {},
            'action_rules': {}
        }
        
        # 1. 리소스 ID 규칙 생성
        if 'processed_data' in self.analysis_results:
            context_analysis = self.analysis_results['processed_data']['context_analysis']
            caption_analysis = self.analysis_results['processed_data']['caption_analysis']
            
            # 리소스 ID와 캡션 매핑
            resource_caption_map = defaultdict(list)
            for _, row in self.processed_data.iterrows():
                try:
                    context = json.loads(row['icon_context'])
                    resource_id = context.get('UI element info', {}).get('resource_id', '')
                    captions = row['reference_captions'].split('|')
                    
                    if resource_id:
                        resource_caption_map[resource_id].extend(captions)
                except:
                    continue
            
            # 상위 빈도 캡션 선택
            for resource_id, captions in resource_caption_map.items():
                caption_counts = Counter(captions)
                top_captions = [caption for caption, _ in caption_counts.most_common(3)]
                rules['resource_id_rules'][resource_id] = top_captions
        
        # 2. 클래스명 규칙 생성
        class_caption_map = defaultdict(list)
        for _, row in self.processed_data.iterrows():
            try:
                context = json.loads(row['icon_context'])
                class_name = context.get('UI element info', {}).get('class_name', '')
                captions = row['reference_captions'].split('|')
                
                if class_name:
                    class_caption_map[class_name].extend(captions)
            except:
                continue
        
        for class_name, captions in class_caption_map.items():
            caption_counts = Counter(captions)
            top_captions = [caption for caption, _ in caption_counts.most_common(3)]
            rules['class_name_rules'][class_name] = top_captions
        
        # 3. 텍스트 패턴 규칙 생성
        if 'widget_captions' in self.analysis_results:
            patterns = self.analysis_results['widget_captions']['patterns']
            for category, captions in patterns.items():
                caption_counts = Counter(captions)
                top_captions = [caption for caption, _ in caption_counts.most_common(3)]
                rules['text_pattern_rules'][category] = top_captions
        
        # 4. 앱별 규칙 생성
        if 'processed_data' in self.analysis_results:
            app_analysis = self.analysis_results['processed_data']['app_analysis']
            for app_name, data in app_analysis.items():
                if data['total_elements'] >= 5:  # 충분한 데이터가 있는 앱만
                    app_captions = []
                    for _, row in self.processed_data.iterrows():
                        try:
                            context = json.loads(row['icon_context'])
                            if context.get('app activity name', '') == app_name:
                                captions = row['reference_captions'].split('|')
                                app_captions.extend(captions)
                        except:
                            continue
                    
                    if app_captions:
                        caption_counts = Counter(app_captions)
                        top_captions = [caption for caption, _ in caption_counts.most_common(5)]
                        rules['app_specific_rules'][app_name] = top_captions
        
        # 5. 액션 규칙 생성
        if 'processed_data' in self.analysis_results:
            action_words = self.analysis_results['processed_data']['caption_analysis']['action_words']
            rules['action_rules'] = action_words
        
        # 규칙 파일 저장
        import os
        os.makedirs('comprehensive_rules', exist_ok=True)
        
        for rule_type, rule_data in rules.items():
            with open(f'comprehensive_rules/{rule_type}.json', 'w', encoding='utf-8') as f:
                json.dump(rule_data, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 종합 규칙 생성 완료: {len(rules)}개 규칙 타입")
        print(f"📁 규칙 파일 저장: comprehensive_rules/ 디렉토리")
        
        return rules
    
    def print_summary(self):
        """분석 결과 요약을 출력합니다."""
        print("\n" + "="*50)
        print("📊 종합 데이터 분석 결과 요약")
        print("="*50)
        
        if 'processed_data' in self.analysis_results:
            pd = self.analysis_results['processed_data']
            print(f"\n📱 처리된 데이터:")
            print(f"  • 총 레코드: {len(self.processed_data)}개")
            print(f"  • 고유 리소스 ID: {pd['context_analysis']['resource_ids']['unique']}개")
            print(f"  • 고유 클래스명: {pd['context_analysis']['class_names']['unique']}개")
            print(f"  • 고유 앱: {pd['context_analysis']['app_names']['unique']}개")
            print(f"  • 고유 캡션: {pd['caption_analysis']['unique_captions']}개")
        
        if 'widget_captions' in self.analysis_results:
            wc = self.analysis_results['widget_captions']
            print(f"\n🏷️ 위젯 캡션 데이터:")
            print(f"  • 총 캡션: {wc['total_captions']}개")
            print(f"  • 고유 캡션: {wc['unique_captions']}개")
            print(f"  • 액션 단어: {len(wc['action_words'])}개")
            print(f"  • 패턴 카테고리: {len(wc['patterns'])}개")
        
        print("\n" + "="*50)

def main():
    """메인 실행 함수"""
    analyzer = ComprehensiveDataAnalyzer()
    
    # 1. 모든 데이터 로드
    analyzer.load_all_data()
    
    # 2. 처리된 데이터 분석
    analyzer.analyze_processed_data()
    
    # 3. 위젯 캡션 데이터 분석
    analyzer.analyze_widget_captions()
    
    # 4. 종합 규칙 생성
    rules = analyzer.generate_comprehensive_rules()
    
    # 5. 요약 출력
    analyzer.print_summary()
    
    return analyzer, rules

if __name__ == "__main__":
    analyzer, rules = main() 