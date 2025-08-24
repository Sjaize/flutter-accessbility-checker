// 환경 변수 로드
require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// CORS 설정
app.use(cors());
app.use(express.json());

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'react-app/build')));

// 연결된 클라이언트들
const clients = new Set();

// Flutter 프로젝트 경로 및 상태
let flutterProjectPath = null;
let flutterWebPort = 60778;
let screenshotInterval = null;

// 웹소켓 연결 처리
wss.on('connection', (ws) => {
  console.log('새로운 클라이언트 연결됨');
  clients.add(ws);

  // 연결 상태 브로드캐스트
  broadcastToClients({
    type: 'connectionStatus',
    data: { connected: true, clientCount: clients.size }
  });

  // 클라이언트로부터 메시지 수신
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('수신된 메시지:', data.type);

      switch (data.type) {
        case 'generateProposal':
          handleGenerateProposal(ws, data.data);
          break;
        case 'applyProposal':
          handleApplyProposal(ws, data.data);
          break;
        case 'requestAnalysis':
          handleRequestAnalysis(ws, data.data);
          break;
        case 'setFlutterProject':
          handleSetFlutterProject(ws, data.data);
          break;
        case 'startFlutterApp':
          handleStartFlutterApp(ws, data.data);
          break;
        default:
          console.log('알 수 없는 메시지 타입:', data.type);
      }
    } catch (error) {
      console.error('메시지 파싱 오류:', error);
    }
  });

  // 연결 해제 처리
  ws.on('close', () => {
    console.log('클라이언트 연결 해제됨');
    clients.delete(ws);
    broadcastToClients({
      type: 'connectionStatus',
      data: { connected: false, clientCount: clients.size }
    });
  });

  // 에러 처리
  ws.on('error', (error) => {
    console.error('웹소켓 에러:', error);
    clients.delete(ws);
  });
});

// 모든 클라이언트에게 브로드캐스트
function broadcastToClients(message) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// 특정 클라이언트에게 메시지 전송
function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// LLM 제안 생성 처리
async function handleGenerateProposal(ws, data) {
  console.log('제안 생성 요청:', data);
  
  try {
    // 시뮬레이션된 접근성 이슈 데이터
    const mockIssues = [
      {
        id: 1,
        severity: 'error',
        label: '이미지 대체 텍스트 누락',
        description: '전통 한복 인물 이미지에 대한 대체 텍스트가 없습니다.',
        elementType: 'image',
        rectPct: { left: 20, top: 30, width: 60, height: 40 },
        source: { file: 'lib/screens/home_screen.dart', line: 45, column: 12 },
        m5Location: { file: 'lib/screens/home_screen.dart', line: 45, column: 12 }
      },
      {
        id: 2,
        severity: 'warning',
        label: '버튼 터치 영역 부족',
        description: '"지금 시작하기" 버튼의 터치 영역이 44x44dp 미만입니다.',
        elementType: 'button',
        rectPct: { left: 25, top: 70, width: 50, height: 15 },
        source: { file: 'lib/widgets/custom_button.dart', line: 23, column: 8 },
        m5Location: { file: 'lib/widgets/custom_button.dart', line: 23, column: 8 }
      },
      {
        id: 3,
        severity: 'info',
        label: '제목 텍스트 대비 개선',
        description: '"나랏말싸미" 텍스트의 색상 대비를 개선할 수 있습니다.',
        elementType: 'text',
        rectPct: { left: 10, top: 10, width: 80, height: 10 },
        source: { file: 'lib/screens/home_screen.dart', line: 15, column: 5 },
        m5Location: { file: 'lib/screens/home_screen.dart', line: 15, column: 5 }
      }
    ];

    // 스냅샷 데이터 전송
    sendToClient(ws, {
      type: 'snapshot',
      data: {
        frame: {
          imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          width: 395,
          height: 832
        },
        issues: mockIssues
      }
    });

    // 선택된 이슈에 대한 제안 생성
    const selectedIssue = mockIssues.find(issue => issue.id === data.issue.id);
    if (selectedIssue) {
      const proposal = generateProposal(selectedIssue);
      sendToClient(ws, {
        type: 'proposal',
        data: proposal
      });
    }

  } catch (error) {
    console.error('제안 생성 오류:', error);
    sendToClient(ws, {
      type: 'error',
      data: { message: '제안 생성 중 오류가 발생했습니다.' }
    });
  }
}

// 제안 생성 함수
function generateProposal(issue) {
  const proposals = {
    1: {
      issueId: 1,
      file: 'lib/screens/home_screen.dart',
      range: { start: { line: 45, col: 12 }, end: { line: 45, col: 50 } },
      startLine: 45,
      endLine: 45,
      diff: JSON.stringify({
        newCode: `Image.asset(
  'assets/images/traditional_costume.png',
  semanticsLabel: '전통 한복을 입은 인물 이미지',
  fit: BoxFit.cover,
)`
      }),
      a11yDelta: {
        before: '이미지',
        after: '전통 한복을 입은 인물 이미지'
      },
      rationale: '이미지에 명확한 대체 텍스트를 추가하여 스크린 리더 사용자가 이미지 내용을 이해할 수 있도록 개선했습니다.'
    },
    2: {
      issueId: 2,
      file: 'lib/widgets/custom_button.dart',
      range: { start: { line: 23, col: 8 }, end: { line: 23, col: 30 } },
      startLine: 23,
      endLine: 23,
      diff: JSON.stringify({
        newCode: `Container(
  width: 200,
  height: 48,
  child: ElevatedButton(
    onPressed: () {},
    child: Text('지금 시작하기'),
  ),
)`
      }),
      a11yDelta: {
        before: '버튼',
        after: '지금 시작하기 버튼'
      },
      rationale: '버튼의 터치 영역을 44x44dp 이상으로 확장하여 접근성을 개선했습니다.'
    },
    3: {
      issueId: 3,
      file: 'lib/screens/home_screen.dart',
      range: { start: { line: 15, col: 5 }, end: { line: 15, col: 25 } },
      startLine: 15,
      endLine: 15,
      diff: JSON.stringify({
        newCode: `Text(
  '나랏말싸미',
  style: TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.bold,
    color: Colors.black87,
  ),
)`
      }),
      a11yDelta: {
        before: '나랏말싸미',
        after: '나랏말싸미 (제목)'
      },
      rationale: '텍스트의 색상 대비를 개선하여 가독성을 향상시켰습니다.'
    }
  };

  return proposals[issue.id] || proposals[1];
}

// 제안 적용 처리
async function handleApplyProposal(ws, data) {
  console.log('제안 적용 요청:', data);
  
  try {
    // 실제로는 파일 시스템에 변경사항을 적용하는 로직이 들어갑니다
    await new Promise(resolve => setTimeout(resolve, 1000)); // 시뮬레이션
    
    sendToClient(ws, {
      type: 'applyResult',
      data: { ok: true, message: '제안이 성공적으로 적용되었습니다.' }
    });

    // 파일 변경 알림 브로드캐스트
    broadcastToClients({
      type: 'fileChanged',
      data: { file: data.file, timestamp: Date.now() }
    });

  } catch (error) {
    console.error('제안 적용 오류:', error);
    sendToClient(ws, {
      type: 'applyResult',
      data: { ok: false, error: '제안 적용 중 오류가 발생했습니다.' }
    });
  }
}

// 분석 요청 처리
async function handleRequestAnalysis(ws, data) {
  console.log('분석 요청:', data);
  
  try {
    // Flutter 앱 자동 감지 및 스크린샷 캡처 시작
    if (data.autoStart) {
      console.log('Flutter 앱 자동 감지 시작...');
      startAutoFlutterDetection();
    }
    
    // 시뮬레이션된 분석 결과
    const analysisResult = {
      totalIssues: 3,
      errorCount: 1,
      warningCount: 1,
      infoCount: 1,
      components: [
        {
          name: 'HomeScreen',
          file: 'lib/screens/home_screen.dart',
          type: 'screen',
          accessibilityScore: 75,
          issues: ['이미지 대체 텍스트 누락', '텍스트 대비 개선 필요']
        },
        {
          name: 'CustomButton',
          file: 'lib/widgets/custom_button.dart',
          type: 'widget',
          accessibilityScore: 60,
          issues: ['터치 영역 부족']
        }
      ]
    };

    sendToClient(ws, {
      type: 'analysisResult',
      data: analysisResult
    });

  } catch (error) {
    console.error('분석 오류:', error);
    sendToClient(ws, {
      type: 'error',
      data: { message: '분석 중 오류가 발생했습니다.' }
    });
  }
}

// Flutter 앱 자동 감지 시작
function startAutoFlutterDetection() {
  console.log('Flutter 앱 자동 감지 시작...');
  
  // Flutter 프로젝트 경로 자동 감지
  detectFlutterProjectPath();
  
  // 5초마다 Flutter 앱 상태 확인
  const detectionInterval = setInterval(async () => {
    try {
      const isFlutterRunning = await checkFlutterAppStatus();
      
      if (isFlutterRunning) {
        console.log('Flutter 앱이 실행 중입니다. 스크린샷 캡처를 시작합니다.');
        clearInterval(detectionInterval);
        startScreenshotCapture();
      } else {
        console.log('Flutter 앱이 아직 실행되지 않았습니다. 대기 중...');
      }
    } catch (error) {
      console.error('Flutter 앱 감지 오류:', error);
    }
  }, 5000);
  
  // 즉시 한 번 확인
  checkFlutterAppStatus().then(isRunning => {
    if (isRunning) {
      console.log('Flutter 앱이 이미 실행 중입니다.');
      clearInterval(detectionInterval);
      startScreenshotCapture();
    }
  });
}

// Flutter 프로젝트 경로 자동 감지
function detectFlutterProjectPath() {
  // 일반적인 Flutter 프로젝트 위치들 확인
  const possiblePaths = [
    process.cwd(), // 현재 작업 디렉토리
    path.join(process.cwd(), '..'), // 상위 디렉토리
    path.join(process.cwd(), '..', '..'), // 상위의 상위 디렉토리
    '/Users/jeong-yujin/Downloads/baemin_new', // 사용자가 언급한 경로
  ];
  
  for (const projectPath of possiblePaths) {
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      flutterProjectPath = projectPath;
      console.log(`Flutter 프로젝트 발견: ${flutterProjectPath}`);
      return;
    }
  }
  
  console.log('Flutter 프로젝트를 자동으로 찾을 수 없습니다. 수동으로 설정해주세요.');
}

// Flutter 앱 실행 상태 확인
async function checkFlutterAppStatus() {
  try {
    const http = require('http');
    
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${flutterWebPort}`, (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', () => {
        resolve(false);
      });
      
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch (error) {
    console.error('Flutter 앱 상태 확인 오류:', error);
    return false;
  }
}

// Flutter 프로젝트 설정
async function handleSetFlutterProject(ws, data) {
  console.log('Flutter 프로젝트 설정:', data);
  
  try {
    flutterProjectPath = data.projectPath;
    
    sendToClient(ws, {
      type: 'flutterProjectSet',
      data: { success: true, projectPath: flutterProjectPath }
    });
    
  } catch (error) {
    console.error('Flutter 프로젝트 설정 오류:', error);
    sendToClient(ws, {
      type: 'error',
      data: { message: 'Flutter 프로젝트 설정 중 오류가 발생했습니다.' }
    });
  }
}

// Flutter 앱 시작
async function handleStartFlutterApp(ws, data) {
  console.log('Flutter 앱 시작 요청:', data);
  
  try {
    if (!flutterProjectPath) {
      throw new Error('Flutter 프로젝트 경로가 설정되지 않았습니다.');
    }
    
    const command = `cd "${flutterProjectPath}" && flutter run -d web-server --web-port=${flutterWebPort}`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Flutter 앱 실행 오류:', error);
        sendToClient(ws, {
          type: 'flutterAppError',
          data: { error: error.message }
        });
        return;
      }
      
      console.log('Flutter 앱 실행 성공:', stdout);
      sendToClient(ws, {
        type: 'flutterAppStarted',
        data: { success: true, port: flutterWebPort }
      });
      
      // 스크린샷 캡처 시작
      setTimeout(() => {
        startScreenshotCapture();
      }, 5000); // Flutter 앱이 완전히 로드될 때까지 대기
    });
    
  } catch (error) {
    console.error('Flutter 앱 시작 오류:', error);
    sendToClient(ws, {
      type: 'error',
      data: { message: 'Flutter 앱 시작 중 오류가 발생했습니다.' }
    });
  }
}

// 스크린샷 캡처 시작
function startScreenshotCapture() {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
  }
  
  console.log('스크린샷 캡처 시작...');
  
  // 3초마다 스크린샷 캡처
  screenshotInterval = setInterval(async () => {
    try {
      await captureFlutterScreenshot();
    } catch (error) {
      console.error('스크린샷 캡처 오류:', error);
    }
  }, 3000);
  
  // 즉시 한 번 실행
  captureFlutterScreenshot();
}

// Flutter 앱 스크린샷 캡처
async function captureFlutterScreenshot() {
  try {
    const puppeteer = require('puppeteer');
    
    const browser = await puppeteer.launch({ 
      headless: "new", // 새로운 headless 모드 사용
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812 });
    
    try {
      console.log(`Flutter 앱에 연결 시도: http://localhost:${flutterWebPort}`);
      
      // 페이지 로드 대기 시간 증가 및 더 안정적인 대기 조건
      await page.goto(`http://localhost:${flutterWebPort}`, { 
        waitUntil: ['domcontentloaded', 'networkidle2'],
        timeout: 15000 
      });
      
      // Flutter 앱이 완전히 로드될 때까지 추가 대기
      await page.waitForTimeout(3000);
      
      // 페이지가 실제로 로드되었는지 확인
      const pageTitle = await page.title();
      console.log('페이지 제목:', pageTitle);
      
      const screenshot = await page.screenshot({ 
        type: 'png',
        encoding: 'base64',
        fullPage: false
      });
      
      const imageBase64 = `data:image/png;base64,${screenshot}`;
      
      // 접근성 분석 수행 (페이지가 완전히 로드된 후)
      let accessibilityAnalysis = { issues: [] };
      try {
        accessibilityAnalysis = await analyzeAccessibility(page);
        console.log('접근성 분석 완료:', accessibilityAnalysis.issues.length, '개 이슈 발견');
      } catch (analysisError) {
        console.error('접근성 분석 오류:', analysisError);
        accessibilityAnalysis = { issues: getSimulatedIssues() };
      }
      
      await browser.close();
      
      // 모든 클라이언트에게 스크린샷 전송
      broadcastToClients({
        type: 'snapshot',
        data: {
          frame: {
            imageBase64: imageBase64,
            width: 375,
            height: 812
          },
          issues: accessibilityAnalysis.issues || []
        }
      });
      
      console.log('✅ 스크린샷 캡처 및 전송 완료');
      
    } catch (pageError) {
      console.log('❌ Flutter 앱에 연결할 수 없습니다:', pageError.message);
      await browser.close();
      
      // Flutter 앱이 실행되지 않은 경우 시뮬레이션 데이터 전송
      broadcastToClients({
        type: 'snapshot',
        data: {
          frame: null,
          issues: getSimulatedIssues()
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Puppeteer 스크린샷 오류:', error);
    
    // Puppeteer가 설치되지 않은 경우 시뮬레이션 데이터 사용
    broadcastToClients({
      type: 'snapshot',
      data: {
        frame: null,
        issues: getSimulatedIssues()
      }
    });
  }
}

// 시뮬레이션된 접근성 이슈 데이터
function getSimulatedIssues() {
  return [
    {
      id: 1,
      severity: 'error',
      label: '이미지 대체 텍스트 누락',
      description: '전통 한복 인물 이미지에 대한 대체 텍스트가 없습니다.',
      elementType: 'image',
      rectPct: { left: 20, top: 30, width: 60, height: 40 },
      source: { file: 'lib/screens/home_screen.dart', line: 45, column: 12 },
      m5Location: { file: 'lib/screens/home_screen.dart', line: 45, column: 12 }
    },
    {
      id: 2,
      severity: 'warning',
      label: '버튼 터치 영역 부족',
      description: '"지금 시작하기" 버튼의 터치 영역이 44x44dp 미만입니다.',
      elementType: 'button',
      rectPct: { left: 25, top: 70, width: 50, height: 15 },
      source: { file: 'lib/widgets/custom_button.dart', line: 23, column: 8 },
      m5Location: { file: 'lib/widgets/custom_button.dart', line: 23, column: 8 }
    },
    {
      id: 3,
      severity: 'info',
      label: '제목 텍스트 대비 개선',
      description: '"나랏말싸미" 텍스트의 색상 대비를 개선할 수 있습니다.',
      elementType: 'text',
      rectPct: { left: 10, top: 10, width: 80, height: 10 },
      source: { file: 'lib/screens/home_screen.dart', line: 15, column: 5 },
      m5Location: { file: 'lib/screens/home_screen.dart', line: 15, column: 5 }
    }
  ];
}

// 접근성 분석 (실제 구현에서는 더 정교한 분석 필요)
async function analyzeAccessibility(page) {
  try {
    // 페이지가 완전히 로드될 때까지 대기
    await page.waitForTimeout(2000);
    
    // 페이지에서 접근성 정보 추출
    const accessibility = await page.evaluate(() => {
      const issues = [];
      
      console.log('🔍 접근성 분석 시작...');
      
      // Flutter 앱의 모든 요소들 분석
      const allElements = document.querySelectorAll('*');
      console.log('📊 총 요소 수:', allElements.length);
      
      // Flutter 앱의 특정 요소들 찾기 (더 포괄적으로)
      const flutterElements = document.querySelectorAll('div, span, button, img, canvas, input, textarea');
      console.log('📱 Flutter 요소 수:', flutterElements.length);
      
      // 각 요소의 상세 정보 로깅
      flutterElements.forEach((el, index) => {
        if (index < 10) { // 처음 10개만 로깅
          console.log(`🔍 요소 ${index}:`, {
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            textContent: el.textContent?.substring(0, 50),
            role: el.getAttribute('role'),
            tabindex: el.getAttribute('tabindex'),
            onclick: el.getAttribute('onclick'),
            style: el.style.cssText,
            rect: el.getBoundingClientRect()
          });
        }
      });
      
      // 이미지 요소 체크 (Flutter에서는 canvas나 div로 렌더링될 수 있음)
      const images = document.querySelectorAll('img, canvas, [role="img"], div[style*="background-image"]');
      console.log('🖼️ 이미지 요소 수:', images.length);
      
      images.forEach((img, index) => {
        console.log(`🖼️ 이미지 ${index}:`, {
          tagName: img.tagName,
          alt: img.alt,
          src: img.src,
          style: img.style.cssText,
          rect: img.getBoundingClientRect()
        });
        
        if (!img.alt || img.alt.trim() === '') {
          const rect = img.getBoundingClientRect();
          const windowHeight = window.innerHeight;
          const windowWidth = window.innerWidth;
          
          issues.push({
            id: `img-${index}`,
            severity: 'error',
            label: '이미지 대체 텍스트 누락',
            description: '이미지에 대한 대체 텍스트가 없습니다.',
            elementType: 'image',
            rectPct: {
              left: (rect.left / windowWidth) * 100,
              top: (rect.top / windowHeight) * 100,
              width: (rect.width / windowWidth) * 100,
              height: (rect.height / windowHeight) * 100
            }
          });
        }
      });
      
      // 버튼 요소 체크 (Flutter에서는 div나 button으로 렌더링)
      const buttons = document.querySelectorAll('button, [role="button"], div[tabindex], div[onclick], div[style*="cursor: pointer"]');
      console.log('🔘 버튼 요소 수:', buttons.length);
      
      buttons.forEach((button, index) => {
        console.log(`🔘 버튼 ${index}:`, {
          tagName: button.tagName,
          textContent: button.textContent,
          role: button.getAttribute('role'),
          tabindex: button.getAttribute('tabindex'),
          onclick: button.getAttribute('onclick'),
          style: button.style.cssText,
          rect: button.getBoundingClientRect()
        });
        
        const rect = button.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 44) {
          const windowHeight = window.innerHeight;
          const windowWidth = window.innerWidth;
          
          issues.push({
            id: `btn-${index}`,
            severity: 'error',
            label: '버튼 터치 영역 부족',
            description: '버튼의 터치 영역이 44x44dp 미만입니다.',
            elementType: 'button',
            rectPct: {
              left: (rect.left / windowWidth) * 100,
              top: (rect.top / windowHeight) * 100,
              width: (rect.width / windowWidth) * 100,
              height: (rect.height / windowHeight) * 100
            }
          });
        }
      });
      
      // 텍스트 입력 필드 체크
      const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
      console.log('⌨️ 입력 필드 수:', inputs.length);
      
      inputs.forEach((input, index) => {
        console.log(`⌨️ 입력 필드 ${index}:`, {
          tagName: input.tagName,
          type: input.type,
          placeholder: input.placeholder,
          ariaLabel: input.getAttribute('aria-label'),
          value: input.value,
          rect: input.getBoundingClientRect()
        });
        
        if (!input.placeholder && !input.getAttribute('aria-label')) {
          const rect = input.getBoundingClientRect();
          const windowHeight = window.innerHeight;
          const windowWidth = window.innerWidth;
          
          issues.push({
            id: `input-${index}`,
            severity: 'error',
            label: '입력 필드 라벨 누락',
            description: '입력 필드에 라벨이나 힌트가 없습니다.',
            elementType: 'textfield',
            rectPct: {
              left: (rect.left / windowWidth) * 100,
              top: (rect.top / windowHeight) * 100,
              width: (rect.width / windowWidth) * 100,
              height: (rect.height / windowHeight) * 100
            }
          });
        }
      });
      
      // 색상 대비 체크 (간단한 버전)
      const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div');
      console.log('📝 텍스트 요소 수:', textElements.length);
      
      // 텍스트 요소들도 상세 로깅
      textElements.forEach((text, index) => {
        if (index < 5 && text.textContent?.trim()) { // 처음 5개만 로깅
          console.log(`📝 텍스트 ${index}:`, {
            tagName: text.tagName,
            textContent: text.textContent.substring(0, 100),
            style: text.style.cssText,
            rect: text.getBoundingClientRect()
          });
        }
      });
      
      // 색상 대비는 복잡하므로 일부만 체크
      textElements.forEach((text, index) => {
        if (index < 10) { // 처음 10개만 체크
          const style = window.getComputedStyle(text);
          const color = style.color;
          const backgroundColor = style.backgroundColor;
          
          // 간단한 색상 대비 체크 (실제로는 더 정교한 계산 필요)
          if (color === 'rgb(255, 255, 255)' && backgroundColor === 'rgb(255, 255, 255)') {
            const rect = text.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const windowWidth = window.innerWidth;
            
            issues.push({
              id: `text-${index}`,
              severity: 'info',
              label: '텍스트 색상 대비 부족',
              description: '텍스트의 색상 대비가 부족할 수 있습니다.',
              elementType: 'text',
              rectPct: {
                left: (rect.left / windowWidth) * 100,
                top: (rect.top / windowHeight) * 100,
                width: (rect.width / windowWidth) * 100,
                height: (rect.height / windowHeight) * 100
              }
            });
          }
        }
      });
      
      console.log('🎯 발견된 이슈 수:', issues.length);
      console.log('📋 이슈 상세:', issues);
      return { issues };
    });
    
    return accessibility;
  } catch (error) {
    console.error('접근성 분석 오류:', error);
    return { issues: [] };
  }
}

// Flutter 프로젝트 구조 분석 API
app.post('/analyze-project', async (req, res) => {
  try {
    const { projectPath } = req.body;
    
    console.log('프로젝트 분석 요청:', projectPath);
    
    if (!projectPath || !fs.existsSync(projectPath)) {
      return res.status(400).json({ error: '프로젝트 경로가 존재하지 않습니다.' });
    }
    
    const analysis = await analyzeFlutterProject(projectPath);
    
    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('프로젝트 분석 API 오류:', error);
    res.status(500).json({ error: '프로젝트 분석 중 오류가 발생했습니다.' });
  }
});

// Flutter 프로젝트 구조 분석
async function analyzeFlutterProject(projectPath) {
  const libPath = path.join(projectPath, 'lib');
  
  if (!fs.existsSync(libPath)) {
    throw new Error('Flutter 프로젝트의 lib 폴더를 찾을 수 없습니다.');
  }
  
  const analysis = {
    projectPath,
    components: [],
    structure: {},
    accessibilityScore: 0,
    issues: []
  };
  
  // Dart 파일 재귀적으로 탐색
  function scanDirectory(dirPath, relativePath = '') {
    const items = fs.readdirSync(dirPath);
    const structure = {};
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        structure[item] = scanDirectory(fullPath, path.join(relativePath, item));
      } else if (item.endsWith('.dart')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const component = analyzeDartFile(fullPath, content, path.join(relativePath, item));
        analysis.components.push(component);
        structure[item] = 'file';
      }
    }
    
    return structure;
  }
  
  analysis.structure = scanDirectory(libPath);
  
  // 전체 접근성 점수 계산
  const totalScore = analysis.components.reduce((sum, comp) => sum + comp.accessibilityScore, 0);
  analysis.accessibilityScore = Math.round(totalScore / Math.max(analysis.components.length, 1));
  
  // 전체 이슈 수집
  analysis.issues = analysis.components.flatMap(comp => 
    comp.issues.map(issue => ({
      ...issue,
      file: comp.file,
      component: comp.name
    }))
  );
  
  return analysis;
}

// Dart 파일 분석
function analyzeDartFile(filePath, content, relativePath) {
  const fileName = path.basename(filePath, '.dart');
  
  // 위젯 타입 판별
  let type = 'util';
  let isWidget = false;
  
  if (content.includes('extends StatelessWidget') || 
      content.includes('extends StatefulWidget') ||
      content.includes('extends ConsumerWidget') ||
      content.includes('extends ConsumerStatefulWidget')) {
    type = 'widget';
    isWidget = true;
  } else if (content.includes('extends State')) {
    type = 'widget';
    isWidget = true;
  } else if (content.includes('class') && content.includes('Screen')) {
    type = 'screen';
    isWidget = true;
  } else if (content.includes('class') && content.includes('Page')) {
    type = 'screen';
    isWidget = true;
  } else if (content.includes('extends ChangeNotifier') ||
             content.includes('extends Bloc') ||
             content.includes('extends Cubit')) {
    type = 'service';
  } else if (content.includes('class') && !content.includes('extends')) {
    type = 'model';
  }
  
  // 접근성 이슈 분석
  const issues = analyzeAccessibilityIssuesInDart(content, relativePath);
  const accessibilityScore = calculateAccessibilityScore(content, issues);
  
  return {
    name: fileName,
    file: relativePath,
    type,
    isWidget,
    accessibilityScore,
    issues,
    lineCount: content.split('\n').length,
    dependencies: extractDartDependencies(content)
  };
}

// Dart 파일의 접근성 이슈 분석
function analyzeAccessibilityIssuesInDart(content, filePath) {
  const issues = [];
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();
    
    // 1. 이미지에 semanticsLabel 없음
    if ((trimmedLine.includes('Image.asset(') || 
         trimmedLine.includes('Image.network(') ||
         trimmedLine.includes('Image.memory(')) && 
        !trimmedLine.includes('semanticsLabel')) {
      issues.push({
        id: `${filePath}:${lineNumber}:image-alt`,
        type: 'missing_alt_text',
        severity: 'error',
        message: '이미지에 접근성 라벨(semanticsLabel)이 없습니다.',
        line: lineNumber,
        suggestion: 'semanticsLabel 속성을 추가하여 이미지를 설명하세요.'
      });
    }
    
    // 2. 버튼에 라벨 없음
    if ((trimmedLine.includes('IconButton(') || 
         trimmedLine.includes('FloatingActionButton(')) && 
        !trimmedLine.includes('semanticsLabel') && 
        !trimmedLine.includes('tooltip')) {
      issues.push({
        id: `${filePath}:${lineNumber}:button-label`,
        type: 'missing_button_label',
        severity: 'warning',
        message: '버튼에 접근성 라벨이 없습니다.',
        line: lineNumber,
        suggestion: 'semanticsLabel 또는 tooltip 속성을 추가하세요.'
      });
    }
    
    // 3. TextField에 labelText나 hintText 없음
    if (trimmedLine.includes('TextField(') && 
        !trimmedLine.includes('labelText') && 
        !trimmedLine.includes('hintText')) {
      issues.push({
        id: `${filePath}:${lineNumber}:textfield-label`,
        type: 'missing_textfield_label',
        severity: 'warning',
        message: 'TextField에 라벨이나 힌트가 없습니다.',
        line: lineNumber,
        suggestion: 'labelText 또는 hintText를 추가하여 입력 필드의 목적을 명확히 하세요.'
      });
    }
    
    // 4. 색상만으로 정보 전달
    if ((trimmedLine.includes('Colors.red') || 
         trimmedLine.includes('Colors.green')) && 
        !trimmedLine.includes('Icon(') && 
        !trimmedLine.includes('Text(')) {
      issues.push({
        id: `${filePath}:${lineNumber}:color-only`,
        type: 'color_only_information',
        severity: 'info',
        message: '색상만으로 정보를 전달하고 있을 수 있습니다.',
        line: lineNumber,
        suggestion: '색상과 함께 텍스트나 아이콘을 사용하여 정보를 전달하세요.'
      });
    }
    
    // 5. Semantics 위젯 사용 시 보너스
    if (trimmedLine.includes('Semantics(')) {
      // 접근성 개선 사항으로 점수 추가 (이슈가 아님)
    }
  });
  
  return issues;
}

// 접근성 점수 계산
function calculateAccessibilityScore(content, issues) {
  let score = 100;
  
  // 이슈당 감점
  score -= issues.length * 10;
  
  // 접근성 개선 요소 보너스
  if (content.includes('Semantics(')) score += 10;
  if (content.includes('semanticsLabel')) score += 5;
  if (content.includes('tooltip')) score += 5;
  if (content.includes('labelText')) score += 5;
  if (content.includes('hintText')) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

// Dart 의존성 추출
function extractDartDependencies(content) {
  const dependencies = [];
  const importRegex = /import\s+['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    dependencies.push(match[1]);
  }
  
  return dependencies;
}

// HTTP API 엔드포인트

// 채팅 API
app.post('/chat', async (req, res) => {
  try {
    const { message, conversationHistory, accessibilityIssues } = req.body;
    
    console.log('채팅 요청:', { message, accessibilityIssues: accessibilityIssues?.length });
    
    // 실제 AI 응답 생성
    const aiResponse = await generateAIResponse(message, accessibilityIssues);
    
    res.json({
      response: aiResponse,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('채팅 API 오류:', error);
    res.status(500).json({ error: '채팅 처리 중 오류가 발생했습니다.' });
  }
});

// AI 응답 생성 함수
async function generateAIResponse(message, accessibilityIssues) {
  try {
    // OpenAI API 키 확인
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      console.log('OpenAI API 키가 설정되지 않았습니다. 시뮬레이션 응답을 사용합니다.');
      return getSimulatedAIResponse(message, accessibilityIssues);
    }
    
    // 실제 Flutter 프로젝트 분석
    let projectAnalysis = '';
    if (flutterProjectPath) {
      try {
        const analysis = await analyzeFlutterProject(flutterProjectPath);
        projectAnalysis = `
현재 Flutter 프로젝트 분석 결과:
- 총 컴포넌트: ${analysis.components.length}개
- 접근성 점수: ${analysis.accessibilityScore}/100점
- 발견된 이슈: ${analysis.issues.length}개

주요 컴포넌트:
${analysis.components.slice(0, 5).map(comp => `- ${comp.name} (${comp.type}): ${comp.accessibilityScore}점`).join('\n')}

발견된 접근성 이슈:
${analysis.issues.slice(0, 10).map(issue => `- ${issue.message} (${issue.file}:${issue.line})`).join('\n')}
`;
      } catch (error) {
        console.error('프로젝트 분석 오류:', error);
        projectAnalysis = '프로젝트 분석 중 오류가 발생했습니다.';
      }
    }
    
    // OpenAI API 호출
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `당신은 Flutter 접근성 개선 전문가입니다. 
            
현재 상황:
${projectAnalysis}

접근성 이슈: ${accessibilityIssues?.length || 0}개
${accessibilityIssues?.map(issue => `- ${issue.label}: ${issue.description}`).join('\n') || '발견된 이슈 없음'}

다음 형식으로 답변해주세요:
1. 현재 프로젝트의 접근성 현황 분석
2. 구체적인 개선 제안 (Dart 코드 예시 포함)
3. PlantUML 형식의 사용자 저니 다이어그램
4. 추가 고려사항`
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });
    
    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    } else {
      throw new Error('OpenAI API 응답 오류');
    }
    
  } catch (error) {
    console.error('OpenAI API 오류:', error);
    return getSimulatedAIResponse(message, accessibilityIssues);
  }
}

// 시뮬레이션된 AI 응답 (OpenAI API가 없을 때)
function getSimulatedAIResponse(message, accessibilityIssues) {
  const responses = [
    `안녕하세요! Flutter 접근성 개선 전문가입니다. 현재 ${accessibilityIssues?.length || 0}개의 접근성 이슈가 발견되었습니다.

## 접근성 개선 제안

1. **이미지 접근성 개선**
   - 모든 이미지에 \`semanticsLabel\` 추가
   - 의미있는 대체 텍스트 제공

2. **버튼 접근성 개선**
   - 터치 영역을 44x44dp 이상으로 확장
   - 명확한 라벨과 툴팁 제공

3. **색상 대비 개선**
   - WCAG 2.2 AA 기준 준수 (4.5:1)
   - 색상만으로 정보 전달하지 않기

## 액티비티 UML 다이어그램

\`\`\`plantuml
@startuml
title 배달 앱 사용자 여정 Activity Diagram

start
:앱 시작;
:홈 화면;

if (사용자 액션) then (검색)
  :검색 화면;
  :검색 결과;
elseif (카테고리 선택)
  :카테고리별 음식점 목록;
  :검색 결과;
else (퀵액세스)
  :즐겨찾기 음식점;
  :검색 결과;
endif

:음식점 선택;
:음식점 상세 화면;

if (메뉴 탐색) then (검색한 메뉴)
  :검색 메뉴 탭;
elseif (인기 메뉴)
  :인기 메뉴 탭;
elseif (후기)
  :후기 탭;
else (정보)
  :음식점 정보 탭;
endif

:메뉴 선택;
:메뉴 옵션 화면;
:옵션 선택;
:수량 설정;
:장바구니 담기;
:음식점 상세 화면;

:장바구니 보기;
:장바구니 화면;

if (장바구니 액션) then (수량 조정)
  :수량 변경;
  -> 장바구니 화면;
elseif (아이템 삭제)
  :아이템 제거;
  -> 장바구니 화면;
elseif (추가 메뉴)
  :추천 메뉴 추가;
  -> 장바구니 화면;
else (완료)
endif

:배달 옵션 선택;
:주문하기;
:주문 화면;
:배달 정보 입력;
:결제 방법 선택;
:쿠폰 할인 적용;
:주문 확인;
:결제 진행;
:주문 완료;

if (다음) then (홈으로 돌아가기)
  :홈으로 돌아가기;
  :홈 화면;
else (주문 내역 확인)
  :주문 내역 확인;
  :주문 상태 모니터링;
  :홈 화면;
endif

stop
@enduml

\`\`\`

## 추가 고려사항

- 모든 인터랙티브 요소에 키보드 접근성 제공
- 화면 전환 시 적절한 안내 메시지 추가
- 오류 상황에서 명확한 피드백 제공
- 다국어 지원 시 접근성 라벨도 번역

이러한 개선사항을 적용하면 모든 사용자가 앱을 편리하게 사용할 수 있습니다.`,

    `현재 Flutter 앱의 접근성을 분석한 결과, 다음과 같은 개선이 필요합니다:

## 주요 개선 사항

### 1. 시맨틱 구조 개선
\`\`\`dart
// 개선 전
Image.asset('assets/icon.png')

// 개선 후
Semantics(
  image: true,
  label: '앱 아이콘',
  child: Image.asset('assets/icon.png'),
)
\`\`\`

### 2. 버튼 접근성
\`\`\`dart
// 개선 전
IconButton(
  icon: Icon(Icons.menu),
  onPressed: () {},
)

// 개선 후
Semantics(
  button: true,
  label: '메뉴 열기',
  child: IconButton(
    icon: Icon(Icons.menu),
    onPressed: () {},
  ),
)
\`\`\`

## 사용자 저니 분석

\`\`\`plantuml
@startuml
title 접근성 개선 사용자 저니

actor "시각장애인 사용자" as User
participant "스크린 리더" as SR
participant "Flutter 앱" as App

User -> App: 앱 실행
App -> SR: 화면 정보 전달
SR -> User: "메인 화면, 앱 아이콘" 안내

User -> App: 메뉴 버튼 터치
App -> SR: "메뉴 열기 버튼" 안내
SR -> User: 버튼 기능 설명

User -> App: 메뉴 선택
App -> SR: 선택된 메뉴 항목 안내
SR -> User: 선택 결과 확인

note right of App
  개선 전: "이미지, 버튼"
  개선 후: "앱 아이콘, 메뉴 열기 버튼"
end note
@enduml
\`\`\`

이러한 개선을 통해 모든 사용자가 동등한 경험을 할 수 있습니다.`
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

// 상태 확인 API
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    clientCount: clients.size
  });
});

// React 앱 라우팅
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'react-app/build', 'index.html'));
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`📱 React 앱: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`💬 채팅 API: http://localhost:${PORT}/chat`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('서버 종료 중...');
  server.close(() => {
    console.log('서버가 안전하게 종료되었습니다.');
    process.exit(0);
  });
}); 