// src/services/icon-analyzer.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AIService } from './ai-service';
import { Logger } from '../utils/logger';

export interface IconAnalysis {
  iconName: string;
  iconType: 'flutter_icon' | 'custom_icon' | 'image_icon';
  filePath?: string;
  suggestedLabel: string;
  confidence: number;
  context: string;
  alternatives: string[];
}

export interface ImageAnalysis {
  imagePath: string;
  imageType: 'network' | 'asset' | 'file';
  suggestedAltText: string;
  confidence: number;
  context: string;
  alternatives: string[];
}

export class IconAnalyzer {
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;
  private aiService: AIService;
  private flutterIconMap: Map<string, string>;
  private customIconCache: Map<string, string>;

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel, aiService: AIService) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
    this.aiService = aiService;
    this.flutterIconMap = new Map();
    this.customIconCache = new Map();
    
    this.initializeFlutterIconMap();
  }

  private initializeFlutterIconMap(): void {
    // Flutter 기본 아이콘들의 의미를 매핑
    const iconMeanings: Record<string, string> = {
      // 네비게이션 아이콘
      'arrow_back': '뒤로가기',
      'arrow_forward': '앞으로가기',
      'home': '홈',
      'menu': '메뉴',
      'close': '닫기',
      'cancel': '취소',
      
      // 액션 아이콘
      'add': '추가',
      'edit': '편집',
      'delete': '삭제',
      'save': '저장',
      'search': '검색',
      'filter': '필터',
      'sort': '정렬',
      'refresh': '새로고침',
      'download': '다운로드',
      'upload': '업로드',
      'share': '공유',
      'print': '인쇄',
      
      // 상태 아이콘
      'favorite': '좋아요',
      'favorite_border': '좋아요 해제',
      'star': '별점',
      'star_border': '별점 해제',
      'check': '확인',
      'check_circle': '완료',
      'error': '오류',
      'warning': '경고',
      'info': '정보',
      'help': '도움말',
      
      // 통신 아이콘
      'email': '이메일',
      'phone': '전화',
      'message': '메시지',
      'notifications': '알림',
      'notifications_none': '알림 없음',
      
      // 미디어 아이콘
      'play_arrow': '재생',
      'pause': '일시정지',
      'stop': '정지',
      'skip_next': '다음',
      'skip_previous': '이전',
      'volume_up': '볼륨 높이기',
      'volume_down': '볼륨 낮추기',
      'volume_off': '음소거',
      
      // 설정 아이콘
      'settings': '설정',
      'account_circle': '계정',
      'person': '사용자',
      'lock': '잠금',
      'lock_open': '잠금 해제',
      'visibility': '보기',
      'visibility_off': '숨기기',
      
      // 상거래 아이콘
      'shopping_cart': '장바구니',
      'payment': '결제',
      'credit_card': '신용카드',
      'local_shipping': '배송',
      'store': '상점',
      
      // 위치 아이콘
      'location_on': '위치',
      'map': '지도',
      'directions': '길찾기',
      'navigation': '네비게이션',
      
      // 시간 아이콘
      'schedule': '일정',
      'event': '이벤트',
      'today': '오늘',
      'date_range': '날짜 범위',
      'access_time': '시간',
      
      // 파일 아이콘
      'folder': '폴더',
      'file_copy': '파일',
      'image': '이미지',
      'video_library': '비디오',
      'music_note': '음악',
      'description': '문서',
      
      // 기타 아이콘
      'link': '링크',
      'code': '코드',
      'bug_report': '버그 신고',
      'feedback': '피드백',
      'support': '지원',
      'language': '언어',
      'brightness_4': '다크 모드',
      'brightness_7': '라이트 모드',
      'wifi': 'Wi-Fi',
      'bluetooth': '블루투스',
      'battery_full': '배터리',
      'signal_cellular_4_bar': '신호',
    };

    for (const [iconName, meaning] of Object.entries(iconMeanings)) {
      this.flutterIconMap.set(iconName, meaning);
    }
  }

  async analyzeIcon(iconCode: string, context: string, filePath: string, lineNumber: number): Promise<IconAnalysis> {
    Logger.info(`아이콘 분석 시작: ${iconCode}`, 'IconAnalyzer');

    try {
      // 1. Flutter 기본 아이콘인지 확인
      const flutterIconMatch = iconCode.match(/Icons\.(\w+)/);
      if (flutterIconMatch) {
        return await this.analyzeFlutterIcon(flutterIconMatch[1], context, filePath, lineNumber);
      }

      // 2. 커스텀 아이콘인지 확인
      const customIconMatch = iconCode.match(/['"`]([^'"`]+\.(?:png|jpg|jpeg|svg|ico))['"`]/);
      if (customIconMatch) {
        return await this.analyzeCustomIcon(customIconMatch[1], context, filePath, lineNumber);
      }

      // 3. 이미지 아이콘인지 확인
      const imageMatch = iconCode.match(/Image\.(?:asset|network)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (imageMatch) {
        return await this.analyzeImageIcon(imageMatch[1], context, filePath, lineNumber);
      }

      // 4. 기타 아이콘 패턴
      return await this.analyzeGenericIcon(iconCode, context, filePath, lineNumber);

    } catch (error) {
      Logger.error(`아이콘 분석 실패: ${error}`, 'IconAnalyzer');
      return this.createDefaultIconAnalysis(iconCode, context);
    }
  }

  private async analyzeFlutterIcon(iconName: string, context: string, filePath: string, lineNumber: number): Promise<IconAnalysis> {
    const predefinedMeaning = this.flutterIconMap.get(iconName);
    
    if (predefinedMeaning) {
      return {
        iconName,
        iconType: 'flutter_icon',
        suggestedLabel: predefinedMeaning,
        confidence: 0.9,
        context,
        alternatives: [predefinedMeaning, `${iconName} 아이콘`]
      };
    }

    // AI 서비스를 사용하여 새로운 Flutter 아이콘 분석
    try {
      const aiDescription = await this.aiService.generateIconDescription(
        `Flutter 아이콘: Icons.${iconName} - ${context}`,
        filePath,
        lineNumber
      );

      return {
        iconName,
        iconType: 'flutter_icon',
        suggestedLabel: aiDescription,
        confidence: 0.7,
        context,
        alternatives: [aiDescription, `${iconName} 아이콘`, '아이콘']
      };
    } catch (error) {
      return {
        iconName,
        iconType: 'flutter_icon',
        suggestedLabel: `${iconName} 아이콘`,
        confidence: 0.5,
        context,
        alternatives: [`${iconName} 아이콘`, '아이콘']
      };
    }
  }

  private async analyzeCustomIcon(iconPath: string, context: string, filePath: string, lineNumber: number): Promise<IconAnalysis> {
    // 캐시된 결과가 있는지 확인
    if (this.customIconCache.has(iconPath)) {
      const cachedLabel = this.customIconCache.get(iconPath)!;
      return {
        iconName: path.basename(iconPath),
        iconType: 'custom_icon',
        filePath: iconPath,
        suggestedLabel: cachedLabel,
        confidence: 0.8,
        context,
        alternatives: [cachedLabel, path.basename(iconPath, path.extname(iconPath))]
      };
    }

    // 아이콘 파일이 실제로 존재하는지 확인
    const fullPath = this.resolveIconPath(iconPath);
    if (fullPath && fs.existsSync(fullPath)) {
      // 파일명에서 의미 추출
      const fileName = path.basename(iconPath, path.extname(iconPath));
      const suggestedLabel = this.extractMeaningFromFileName(fileName);

      // AI 서비스를 사용하여 더 정확한 분석
      try {
        const aiDescription = await this.aiService.generateIconDescription(
          `커스텀 아이콘: ${iconPath} - 파일명: ${fileName} - ${context}`,
          filePath,
          lineNumber
        );

        const finalLabel = aiDescription !== '아이콘 기능 설명' ? aiDescription : suggestedLabel;
        
        // 캐시에 저장
        this.customIconCache.set(iconPath, finalLabel);

        return {
          iconName: fileName,
          iconType: 'custom_icon',
          filePath: iconPath,
          suggestedLabel: finalLabel,
          confidence: 0.8,
          context,
          alternatives: [finalLabel, suggestedLabel, fileName]
        };
      } catch (error) {
        return {
          iconName: fileName,
          iconType: 'custom_icon',
          filePath: iconPath,
          suggestedLabel,
          confidence: 0.6,
          context,
          alternatives: [suggestedLabel, fileName]
        };
      }
    }

    // 파일이 존재하지 않는 경우
    const fileName = path.basename(iconPath, path.extname(iconPath));
    return {
      iconName: fileName,
      iconType: 'custom_icon',
      filePath: iconPath,
      suggestedLabel: this.extractMeaningFromFileName(fileName),
      confidence: 0.4,
      context,
      alternatives: [fileName, '아이콘']
    };
  }

  private async analyzeImageIcon(imagePath: string, context: string, filePath: string, lineNumber: number): Promise<IconAnalysis> {
    // 이미지 파일명에서 의미 추출
    const fileName = path.basename(imagePath, path.extname(imagePath));
    const suggestedLabel = this.extractMeaningFromFileName(fileName);

    // AI 서비스를 사용하여 더 정확한 분석
    try {
      const aiDescription = await this.aiService.generateImageDescription(
        `이미지 아이콘: ${imagePath} - 파일명: ${fileName} - ${context}`,
        filePath,
        lineNumber
      );

      return {
        iconName: fileName,
        iconType: 'image_icon',
        filePath: imagePath,
        suggestedLabel: aiDescription !== '이미지 설명' ? aiDescription : suggestedLabel,
        confidence: 0.7,
        context,
        alternatives: [suggestedLabel, fileName, '이미지']
      };
    } catch (error) {
      return {
        iconName: fileName,
        iconType: 'image_icon',
        filePath: imagePath,
        suggestedLabel,
        confidence: 0.5,
        context,
        alternatives: [suggestedLabel, fileName]
      };
    }
  }

  private async analyzeGenericIcon(iconCode: string, context: string, filePath: string, lineNumber: number): Promise<IconAnalysis> {
    // AI 서비스를 사용하여 일반적인 아이콘 분석
    try {
      const aiDescription = await this.aiService.generateIconDescription(
        `일반 아이콘: ${iconCode} - ${context}`,
        filePath,
        lineNumber
      );

      return {
        iconName: 'unknown',
        iconType: 'custom_icon',
        suggestedLabel: aiDescription !== '아이콘 기능 설명' ? aiDescription : '아이콘',
        confidence: 0.5,
        context,
        alternatives: ['아이콘', '버튼']
      };
    } catch (error) {
      return {
        iconName: 'unknown',
        iconType: 'custom_icon',
        suggestedLabel: '아이콘',
        confidence: 0.3,
        context,
        alternatives: ['아이콘', '버튼']
      };
    }
  }

  async analyzeImage(imageCode: string, context: string, filePath: string, lineNumber: number): Promise<ImageAnalysis> {
    Logger.info(`이미지 분석 시작: ${imageCode}`, 'IconAnalyzer');

    try {
      // 이미지 경로 추출
      const imageMatch = imageCode.match(/Image\.(?:asset|network)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (!imageMatch) {
        throw new Error('이미지 경로를 찾을 수 없습니다.');
      }

      const imagePath = imageMatch[1];
      const imageType = imageCode.includes('Image.asset') ? 'asset' : 'network';
      const fileName = path.basename(imagePath, path.extname(imagePath));

      // AI 서비스를 사용하여 이미지 분석
      try {
        const aiDescription = await this.aiService.generateImageDescription(
          `이미지: ${imagePath} - 타입: ${imageType} - 파일명: ${fileName} - ${context}`,
          filePath,
          lineNumber
        );

        return {
          imagePath,
          imageType,
          suggestedAltText: aiDescription !== '이미지 설명' ? aiDescription : this.extractMeaningFromFileName(fileName),
          confidence: 0.8,
          context,
          alternatives: [this.extractMeaningFromFileName(fileName), fileName, '이미지']
        };
      } catch (error) {
        return {
          imagePath,
          imageType,
          suggestedAltText: this.extractMeaningFromFileName(fileName),
          confidence: 0.6,
          context,
          alternatives: [fileName, '이미지']
        };
      }
    } catch (error) {
      Logger.error(`이미지 분석 실패: ${error}`, 'IconAnalyzer');
      return {
        imagePath: 'unknown',
        imageType: 'asset',
        suggestedAltText: '이미지',
        confidence: 0.3,
        context,
        alternatives: ['이미지']
      };
    }
  }

  private resolveIconPath(iconPath: string): string | null {
    // 상대 경로를 절대 경로로 변환
    const possiblePaths = [
      path.join(this.workspaceRoot, iconPath),
      path.join(this.workspaceRoot, 'assets', iconPath),
      path.join(this.workspaceRoot, 'assets', 'icons', iconPath),
      path.join(this.workspaceRoot, 'assets', 'images', iconPath),
      path.join(this.workspaceRoot, 'lib', 'assets', iconPath),
      path.join(this.workspaceRoot, 'pubspec.yaml').replace('pubspec.yaml', 'assets/' + iconPath)
    ];

    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        return possiblePath;
      }
    }

    return null;
  }

  private extractMeaningFromFileName(fileName: string): string {
    // 파일명에서 의미 추출
    const cleanName = fileName
      .replace(/[_-]/g, ' ') // 언더스코어와 하이픈을 공백으로 변환
      .replace(/\s+/g, ' ') // 여러 공백을 하나로
      .trim();

    // 일반적인 패턴 매칭
    const patterns: Record<string, string> = {
      'back': '뒤로가기',
      'forward': '앞으로가기',
      'next': '다음',
      'prev': '이전',
      'close': '닫기',
      'cancel': '취소',
      'add': '추가',
      'edit': '편집',
      'delete': '삭제',
      'save': '저장',
      'search': '검색',
      'filter': '필터',
      'sort': '정렬',
      'refresh': '새로고침',
      'download': '다운로드',
      'upload': '업로드',
      'share': '공유',
      'print': '인쇄',
      'favorite': '좋아요',
      'like': '좋아요',
      'star': '별점',
      'check': '확인',
      'error': '오류',
      'warning': '경고',
      'info': '정보',
      'help': '도움말',
      'email': '이메일',
      'phone': '전화',
      'message': '메시지',
      'notification': '알림',
      'play': '재생',
      'pause': '일시정지',
      'stop': '정지',
      'volume': '볼륨',
      'settings': '설정',
      'account': '계정',
      'user': '사용자',
      'lock': '잠금',
      'visibility': '보기',
      'cart': '장바구니',
      'payment': '결제',
      'shipping': '배송',
      'store': '상점',
      'location': '위치',
      'map': '지도',
      'schedule': '일정',
      'event': '이벤트',
      'folder': '폴더',
      'file': '파일',
      'image': '이미지',
      'video': '비디오',
      'music': '음악',
      'document': '문서',
      'link': '링크',
      'code': '코드',
      'bug': '버그',
      'feedback': '피드백',
      'support': '지원',
      'language': '언어',
      'wifi': 'Wi-Fi',
      'bluetooth': '블루투스',
      'battery': '배터리',
      'signal': '신호'
    };

    const lowerName = cleanName.toLowerCase();
    for (const [pattern, meaning] of Object.entries(patterns)) {
      if (lowerName.includes(pattern)) {
        return meaning;
      }
    }

    // 패턴이 없으면 파일명을 그대로 사용하되 첫 글자를 대문자로
    return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  }

  private createDefaultIconAnalysis(iconCode: string, context: string): IconAnalysis {
    return {
      iconName: 'unknown',
      iconType: 'custom_icon',
      suggestedLabel: '아이콘',
      confidence: 0.3,
      context,
      alternatives: ['아이콘', '버튼']
    };
  }

  async findIconFiles(): Promise<string[]> {
    const iconFiles: string[] = [];
    
    const findFiles = async (dir: string) => {
      try {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
        
        for (const [name, type] of entries) {
          const fullPath = path.join(dir, name);
          
          if (type === vscode.FileType.Directory) {
            // assets 폴더와 그 하위 폴더만 검색
            if (name === 'assets' || dir.includes('assets')) {
              await findFiles(fullPath);
            }
          } else if (this.isIconFile(name)) {
            iconFiles.push(fullPath);
          }
        }
      } catch (error) {
        Logger.warning(`아이콘 파일 검색 실패: ${dir}`, 'IconAnalyzer');
      }
    };

    await findFiles(this.workspaceRoot);
    return iconFiles;
  }

  private isIconFile(fileName: string): boolean {
    const iconExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif'];
    const lowerFileName = fileName.toLowerCase();
    
    return iconExtensions.some(ext => lowerFileName.endsWith(ext)) ||
           lowerFileName.includes('icon') ||
           lowerFileName.includes('ico');
  }

  async generateIconReport(): Promise<void> {
    try {
      const iconFiles = await this.findIconFiles();
      Logger.info(`발견된 아이콘 파일: ${iconFiles.length}개`, 'IconAnalyzer');

      const report = {
        projectName: path.basename(this.workspaceRoot),
        generatedAt: new Date().toISOString(),
        totalIconFiles: iconFiles.length,
        iconFiles: iconFiles.map(file => ({
          path: path.relative(this.workspaceRoot, file),
          name: path.basename(file),
          suggestedLabel: this.extractMeaningFromFileName(path.basename(file, path.extname(file))),
          type: path.extname(file)
        })),
        flutterIcons: Array.from(this.flutterIconMap.entries()).map(([name, meaning]) => ({
          name,
          meaning
        }))
      };

      const outputPath = path.join(this.workspaceRoot, 'icon-analysis.json');
      const jsonContent = JSON.stringify(report, null, 2);
      
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(outputPath),
        Buffer.from(jsonContent, 'utf8')
      );
      
      Logger.info(`아이콘 분석 보고서 생성: ${outputPath}`, 'IconAnalyzer');
      
    } catch (error) {
      Logger.error(`아이콘 보고서 생성 실패: ${error}`, 'IconAnalyzer');
      throw error;
    }
  }

}
