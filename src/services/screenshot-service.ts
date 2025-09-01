// src/services/screenshot-service.ts
import * as vscode from 'vscode';
import * as puppeteer from 'puppeteer';
import { AccessibilityIssue } from '../types/accessibility';

export class ScreenshotService {
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;
  private outputChannel: vscode.OutputChannel;
  private appUrl: string;
  private isRunning = false;
  private resolvedIssues: Set<string> = new Set(); // 해결된 이슈 추적

  constructor(appUrl: string, outputChannel: vscode.OutputChannel) {
    this.appUrl = appUrl;
    this.outputChannel = outputChannel;
  }

  // 이슈 해결 상태 업데이트
  updateIssueResolution(issueId: string, resolved: boolean): void {
    if (resolved) {
      this.resolvedIssues.add(issueId);
    } else {
      this.resolvedIssues.delete(issueId);
    }
    this.log(`이슈 해결 상태 업데이트: ${issueId} - ${resolved ? '해결됨' : '미해결'}`);
  }

  async initialize(): Promise<void> {
    try {
      this.log('🔧 스크린샷 서비스 초기화 중...');
      
      // Puppeteer 브라우저 시작
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      // 새 페이지 생성
      this.page = await this.browser.newPage();
      
      // 페이지 크기 설정
      await this.page.setViewport({ width: 1280, height: 720 });

      // 고정 포트에서 Flutter 앱 연결
      const url = `http://localhost:64022`;
      this.log(`🔍 포트 64022에서 Flutter 앱 연결 중...`);
      
      try {
        await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 });
        this.log(`✅ 포트 64022에서 Flutter 앱 연결 성공`);
        this.appUrl = url;
      } catch (error) {
        this.log(`❌ 포트 64022 연결 실패: ${error}`);
        throw new Error('Flutter 앱에 연결할 수 없습니다. 포트 64022에서 실행 중인지 확인하세요.');
      }

      // 상호작용 감지 설정
      await this.setupInteractionDetection();
      
      this.log('✅ 스크린샷 서비스 초기화 완료');
      
    } catch (error) {
      this.log(`❌ 스크린샷 서비스 초기화 실패: ${error}`);
      throw error;
    }
  }

  async startScreenshotCapture(issues: AccessibilityIssue[], onScreenshot: (imageBase64: string, boundingBoxes: any[]) => void): Promise<void> {
    if (!this.page) {
      throw new Error('브라우저가 초기화되지 않았습니다.');
    }

    this.isRunning = true;
    this.log('📸 스크린샷 캡처 시작...');

    // 5초마다 스크린샷 캡처
    const captureInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(captureInterval);
        return;
      }

      try {
        const screenshot = await this.captureScreenshot();
        const boundingBoxes = this.generateBoundingBoxes(issues);
        
        onScreenshot(screenshot, boundingBoxes);
        
      } catch (error) {
        this.log(`⚠️ 스크린샷 캡처 오류: ${error}`);
      }
    }, 5000);

    // 사용자 상호작용 감지
    await this.setupInteractionDetection();
  }

  async stopScreenshotCapture(): Promise<void> {
    this.isRunning = false;
    this.log('🛑 스크린샷 캡처 중지');
  }

  private async captureScreenshot(): Promise<string> {
    if (!this.page) {
      throw new Error('페이지가 초기화되지 않았습니다.');
    }

    const screenshot = await this.page.screenshot({
      type: 'png',
      fullPage: false,
      encoding: 'base64'
    });

    return screenshot as string;
  }

  private generateBoundingBoxes(issues: AccessibilityIssue[]): any[] {
    const boundingBoxes = [];

    for (const issue of issues) {
      // 해결된 이슈도 바운딩 박스 유지 (색상만 변경)
      const isResolved = this.resolvedIssues.has(issue.id);
      
      const box = {
        id: issue.id,
        severity: issue.severity,
        type: issue.type,
        description: issue.description,
        resolved: isResolved,
        rect: {
          left: issue.rect.left,
          top: issue.rect.top,
          width: issue.rect.width,
          height: issue.rect.height
        },
        color: isResolved ? this.getResolvedBoundingBoxColor() : this.getBoundingBoxColor(issue.severity)
      };

      boundingBoxes.push(box);
    }

    return boundingBoxes;
  }

  private getBoundingBoxColor(severity: string): string {
    switch (severity) {
      case 'error':
        return '#ff4444'; // 빨간색
      case 'warning':
        return '#ffaa00'; // 주황색
      case 'info':
        return '#44aaff'; // 파란색
      default:
        return '#888888'; // 회색
    }
  }

  private getResolvedBoundingBoxColor(): string {
    return '#00ff00'; // 해결된 이슈는 초록색
  }

  private async setupInteractionDetection(): Promise<void> {
    if (!this.page) return;

    // 클릭 이벤트 감지
    await this.page.evaluate(() => {
      (globalThis as any).document?.addEventListener('click', (event: any) => {
        // 클릭 이벤트를 서비스로 전달
        (globalThis as any).window?.postMessage({
          type: 'USER_INTERACTION',
          action: 'click',
          x: event.clientX,
          y: event.clientY,
          target: event.target?.tagName || 'unknown'
        }, '*');
      });

      // 키보드 이벤트 감지
      (globalThis as any).document?.addEventListener('keydown', (event: any) => {
        (globalThis as any).window?.postMessage({
          type: 'USER_INTERACTION',
          action: 'keydown',
          key: event.key,
          target: event.target?.tagName || 'unknown'
        }, '*');
      });
    });

    // 메시지 리스너 설정
    this.page.on('console', (msg) => {
      if (msg.type() === 'log' && msg.text().includes('USER_INTERACTION')) {
        this.log(`사용자 상호작용 감지: ${msg.text()}`);
        // 여기서 즉시 스크린샷 캡처 트리거
        this.triggerImmediateCapture();
      }
    });
  }

  private async triggerImmediateCapture(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // 즉시 스크린샷 캡처
      const screenshot = await this.captureScreenshot();
      // 이벤트 콜백 호출
      this.log('사용자 상호작용으로 인한 즉시 캡처');
      
    } catch (error) {
      this.log(`즉시 캡처 오류: ${error}`);
    }
  }

  // 바운딩 박스 추가 기능은 Puppeteer에서 직접 처리하므로 제거
  // 실제로는 React 앱에서 이미지와 바운딩 박스를 함께 렌더링

  async cleanup(): Promise<void> {
    this.isRunning = false;
    
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    this.log('🧹 스크린샷 서비스 정리 완료');
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[ScreenshotService] ${message}`);
  }
}
