// src/services/flutter-runner.ts
import * as vscode from 'vscode';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TARGET_PORT = 64022;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000;
const STARTUP_TIMEOUT = 60000; // 60초로 증가

export class FlutterRunner {
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;
  private flutterProcess: ChildProcess | null = null;
  private isRunning: boolean = false;
  private flutterSdkPath: string | null = null;

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
  }

  async startFlutterApp(): Promise<void> {
    try {
      this.outputChannel.appendLine('🚀 Flutter 앱 시작 중...');

      // 1. Flutter 프로젝트 확인
      await this.validateFlutterProject();

      // 2. 기존 프로세스 종료
      await this.killExistingProcesses();

      // 3. Flutter 앱 실행 (재시도 로직 포함)
      await this.runFlutterAppWithRetry();

      // 4. 포트 사용 가능 확인
      await this.waitForPortAvailability();

      this.isRunning = true;
      this.outputChannel.appendLine(`✅ Flutter 앱이 포트 ${TARGET_PORT}에서 실행 중입니다.`);

    } catch (error) {
      this.outputChannel.appendLine(`❌ Flutter 앱 시작 실패: ${error}`);
      throw new Error(`Flutter 앱 시작 실패: ${error}`);
    }
  }

  private async validateFlutterProject(): Promise<void> {
    try {
      // pubspec.yaml 파일 확인
      const pubspecPath = path.join(this.workspaceRoot, 'pubspec.yaml');
      if (!fs.existsSync(pubspecPath)) {
        throw new Error('pubspec.yaml 파일을 찾을 수 없습니다. Flutter 프로젝트인지 확인해주세요.');
      }

      // Flutter 명령어 사용 가능 확인
      await this.checkFlutterCommand();

    } catch (error) {
      this.outputChannel.appendLine(`❌ Flutter 프로젝트 검증 실패: ${error}`);
      throw error;
    }
  }

  private async checkFlutterCommand(): Promise<void> {
    // 먼저 Flutter SDK 경로를 찾아보기
    this.flutterSdkPath = await this.findFlutterSdkPath();
    
    if (!this.flutterSdkPath) {
      throw new Error('Flutter SDK를 찾을 수 없습니다. Flutter SDK가 설치되어 있는지 확인해주세요.');
    }

    this.outputChannel.appendLine(`✅ Flutter SDK 경로 발견: ${this.flutterSdkPath}`);

    return new Promise((resolve, reject) => {
      const flutterExecutable = this.getFlutterExecutablePath();
      const flutterCheck = spawn(flutterExecutable, ['--version'], {
        cwd: this.workspaceRoot,
        stdio: 'pipe'
      });

      flutterCheck.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Flutter 명령어를 찾을 수 없습니다. Flutter SDK가 설치되어 있는지 확인해주세요.'));
        }
      });

      flutterCheck.on('error', (error) => {
        reject(new Error(`Flutter 명령어 실행 실패: ${error.message}`));
      });
    });
  }

  private async findFlutterSdkPath(): Promise<string | null> {
    // 1. 환경 변수에서 flutter 명령어 찾기
    let flutterPath = await this.findFlutterInPath();
    if (flutterPath) {
      return flutterPath;
    }

    // 2. 일반적인 설치 경로에서 찾기
    flutterPath = this.findFlutterInCommonPaths();
    if (flutterPath) {
      return flutterPath;
    }

    return null;
  }

  private async findFlutterInPath(): Promise<string | null> {
    try {
      const platform = process.platform;
      const command = platform === 'win32' ? 'where flutter' : 'which flutter';
      
      // 환경 변수를 명시적으로 설정
      const env = { ...process.env };
      if (platform === 'darwin') {
        // macOS에서 일반적인 PATH 추가
        const commonPaths = [
          '/usr/local/bin',
          '/usr/local/share/flutter/bin',
          '/opt/homebrew/bin',
          '/Users/' + os.userInfo().username + '/development/flutter/bin',
          '/Users/' + os.userInfo().username + '/flutter/bin'
        ];
        env.PATH = commonPaths.join(':') + ':' + (env.PATH || '');
      }
      
      const result = execSync(command, { 
        encoding: 'utf8', 
        timeout: 5000,
        env: env
      });
      const flutterExecutable = result.trim().split('\n')[0];
      
      if (flutterExecutable && fs.existsSync(flutterExecutable)) {
        this.outputChannel.appendLine(`🔍 PATH에서 Flutter 발견: ${flutterExecutable}`);
        // flutter 실행 파일의 디렉토리에서 bin 폴더를 제거하여 SDK 루트 경로 얻기
        const flutterDir = path.dirname(flutterExecutable);
        if (path.basename(flutterDir) === 'bin') {
          return path.dirname(flutterDir);
        }
        return flutterDir;
      }
    } catch (error) {
      this.outputChannel.appendLine(`⚠️ PATH에서 Flutter 찾기 실패: ${error}`);
    }
    
    return null;
  }

  private findFlutterInCommonPaths(): string | null {
    const platform = process.platform;
    const homeDir = os.homedir();
    const username = os.userInfo().username;
    
    const commonPaths: string[] = [];
    
    if (platform === 'darwin') { // macOS
      commonPaths.push(
        path.join(homeDir, 'flutter'),
        '/usr/local/flutter',
        '/opt/flutter',
        path.join(homeDir, 'development', 'flutter'),
        path.join(homeDir, 'tools', 'flutter'),
        '/usr/local/share/flutter', // 추가된 경로
        '/opt/homebrew/share/flutter', // Homebrew 경로
        path.join('/Users', username, 'development', 'flutter'),
        path.join('/Users', username, 'flutter')
      );
    } else if (platform === 'win32') { // Windows
      commonPaths.push(
        'C:\\flutter',
        'C:\\src\\flutter',
        path.join(homeDir, 'flutter'),
        path.join('C:\\', 'tools', 'flutter'),
        path.join(homeDir, 'development', 'flutter')
      );
    } else { // Linux
      commonPaths.push(
        path.join(homeDir, 'flutter'),
        '/usr/local/flutter',
        '/opt/flutter',
        path.join(homeDir, 'development', 'flutter'),
        path.join(homeDir, 'tools', 'flutter')
      );
    }

    this.outputChannel.appendLine(`🔍 일반적인 경로에서 Flutter SDK 검색 중...`);
    
    for (const flutterPath of commonPaths) {
      this.outputChannel.appendLine(`  - 확인 중: ${flutterPath}`);
      if (this.isValidFlutterSdkPath(flutterPath)) {
        this.outputChannel.appendLine(`✅ Flutter SDK 발견: ${flutterPath}`);
        return flutterPath;
      }
    }

    this.outputChannel.appendLine(`❌ 일반적인 경로에서 Flutter SDK를 찾을 수 없습니다.`);
    return null;
  }

  private isValidFlutterSdkPath(flutterPath: string): boolean {
    try {
      // Flutter SDK 루트에 있는 필수 파일/폴더들 확인
      const requiredItems = [
        'bin',
        'packages',
        'version'
      ];

      for (const item of requiredItems) {
        const itemPath = path.join(flutterPath, item);
        if (!fs.existsSync(itemPath)) {
          return false;
        }
      }

      // bin 폴더에 flutter 실행 파일이 있는지 확인
      const flutterExecutable = this.getFlutterExecutablePath(flutterPath);
      return fs.existsSync(flutterExecutable);
    } catch (error) {
      return false;
    }
  }

  private getFlutterExecutablePath(sdkPath?: string): string {
    const flutterSdk = sdkPath || this.flutterSdkPath;
    if (!flutterSdk) {
      return 'flutter'; // 기본값 (PATH에서 찾기)
    }

    const platform = process.platform;
    const executableName = platform === 'win32' ? 'flutter.bat' : 'flutter';
    return path.join(flutterSdk, 'bin', executableName);
  }

  private async killExistingProcesses(): Promise<void> {
    try {
      this.outputChannel.appendLine('🔍 기존 프로세스 확인 중...');

      const platform = process.platform;
      let command: string;
      let args: string[];

      if (platform === 'win32') {
        // Windows
        command = 'netstat';
        args = ['-ano'];
      } else {
        // macOS/Linux
        command = 'lsof';
        args = ['-ti', `:${TARGET_PORT}`];
      }

      const processCheck = spawn(command, args, { stdio: 'pipe' });

      return new Promise((resolve, reject) => {
        let output = '';

        processCheck.stdout?.on('data', (data) => {
          output += data.toString();
        });

        processCheck.on('close', async (code) => {
          if (code === 0 && output.trim()) {
            // 포트를 사용하는 프로세스가 있음
            await this.killProcessesOnPort(output, platform);
          }
          resolve();
        });

        processCheck.on('error', (error) => {
          this.outputChannel.appendLine(`⚠️ 프로세스 확인 실패: ${error.message}`);
          resolve(); // 에러가 있어도 계속 진행
        });
      });

    } catch (error) {
      this.outputChannel.appendLine(`⚠️ 기존 프로세스 종료 실패: ${error}`);
      // 에러가 있어도 계속 진행
    }
  }

  private async killProcessesOnPort(output: string, platform: string): Promise<void> {
    try {
      const pids: string[] = [];

      if (platform === 'win32') {
        // Windows: netstat 출력에서 PID 추출
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes(`:${TARGET_PORT}`)) {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 4) {
              pids.push(parts[4]);
            }
          }
        }
      } else {
        // macOS/Linux: lsof 출력에서 PID 추출
        pids.push(...output.trim().split('\n').filter(pid => pid));
      }

      if (pids.length > 0) {
        this.outputChannel.appendLine(`🔄 포트 ${TARGET_PORT}를 사용하는 프로세스 종료 중: ${pids.join(', ')}`);

        for (const pid of pids) {
          await this.killProcess(pid, platform);
        }

        // 프로세스 종료 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      this.outputChannel.appendLine(`⚠️ 프로세스 종료 실패: ${error}`);
    }
  }

  private async killProcess(pid: string, platform: string): Promise<void> {
    return new Promise((resolve) => {
      const killCommand = platform === 'win32' ? 'taskkill' : 'kill';
      const killArgs = platform === 'win32' ? ['/PID', pid, '/F'] : ['-9', pid];

      const killProcess = spawn(killCommand, killArgs, { stdio: 'pipe' });

      killProcess.on('close', (code) => {
        if (code === 0) {
          this.outputChannel.appendLine(`✅ 프로세스 ${pid} 종료 완료`);
        } else {
          this.outputChannel.appendLine(`⚠️ 프로세스 ${pid} 종료 실패`);
        }
        resolve();
      });

      killProcess.on('error', () => {
        this.outputChannel.appendLine(`⚠️ 프로세스 ${pid} 종료 명령 실패`);
        resolve();
      });
    });
  }

  private async runFlutterAppWithRetry(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        this.outputChannel.appendLine(`🔄 Flutter 앱 실행 시도 ${attempt}/${MAX_RETRY_ATTEMPTS}...`);

        await this.runFlutterApp();
        return; // 성공하면 함수 종료

      } catch (error) {
        lastError = error as Error;
        this.outputChannel.appendLine(`❌ 시도 ${attempt} 실패: ${error}`);

        if (attempt < MAX_RETRY_ATTEMPTS) {
          this.outputChannel.appendLine(`${RETRY_DELAY}ms 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    // 모든 시도 실패
    throw new Error(`Flutter 앱 실행 실패 (${MAX_RETRY_ATTEMPTS}회 시도): ${lastError?.message}`);
  }

  private async runFlutterApp(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 고정 포트 사용 (환경 변수에서 설정한 포트)
      const flutterArgs = [
        'run',
        '-d', 'chrome',
        '--web-port', TARGET_PORT.toString()
      ];

      const flutterExecutable = this.getFlutterExecutablePath();
      this.outputChannel.appendLine(`🚀 Flutter 명령어: ${flutterExecutable} ${flutterArgs.join(' ')}`);

      this.flutterProcess = spawn(flutterExecutable, flutterArgs, {
        cwd: this.workspaceRoot,
        stdio: 'pipe'
      });

      let hasStarted = false;
      let startupTimeout: NodeJS.Timeout;
      let outputBuffer = '';

      // 시작 타임아웃 설정 (30초로 수정)
      startupTimeout = setTimeout(() => {
        if (!hasStarted) {
          this.flutterProcess?.kill();
          reject(new Error(`Flutter 앱 시작 타임아웃 (30초)`));
        }
      }, 30000);

      this.flutterProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;
        this.outputChannel.appendLine(`[Flutter] ${output.trim()}`);

        // Flutter 앱이 성공적으로 시작되었는지 확인 (더 정확한 패턴)
        if (output.includes('Flutter run key commands') || 
            output.includes('Running with sound null safety') ||
            output.includes('An Observatory debugger and profiler') ||
            output.includes('The Flutter DevTools debugger and profiler') ||
            output.includes('Debug service listening') ||
            output.includes('Waiting for connection from debug service') ||
            output.includes('Flutter is taking longer than expected') ||
            output.includes('Application finished') ||
            output.includes('Hot reload performed') ||
            output.includes('Hot restart performed') ||
            output.includes('Chrome is taking longer than expected') ||
            output.includes('Flutter is ready')) {
          hasStarted = true;
          clearTimeout(startupTimeout);
          resolve();
        }
      });

      this.flutterProcess.stderr?.on('data', (data) => {
        const error = data.toString();
        this.outputChannel.appendLine(`[Flutter Error] ${error.trim()}`);

        // 치명적인 오류인지 확인
        if (error.includes('Error:') || error.includes('Exception:') || error.includes('Could not find')) {
          hasStarted = true;
          clearTimeout(startupTimeout);
          reject(new Error(`Flutter 실행 오류: ${error}`));
        }
      });

      this.flutterProcess.on('close', (code) => {
        if (!hasStarted) {
          clearTimeout(startupTimeout);
          reject(new Error(`Flutter 프로세스가 종료되었습니다 (코드: ${code})`));
        }
      });

      this.flutterProcess.on('error', (error) => {
        hasStarted = true;
        clearTimeout(startupTimeout);
        reject(new Error(`Flutter 프로세스 오류: ${error.message}`));
      });
    });
  }

  private async waitForPortAvailability(): Promise<void> {
    const maxWaitTime = 30000; // 30초
    const checkInterval = 1000; // 1초마다 확인
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // 고정 포트만 확인
        const isPortAvailable = await this.checkPortAvailability(TARGET_PORT);
        if (isPortAvailable) {
          this.outputChannel.appendLine(`✅ 포트 ${TARGET_PORT}에서 Flutter 앱 실행 확인`);
          return;
        }
      } catch (error) {
        this.outputChannel.appendLine(`⚠️ 포트 확인 실패: ${error}`);
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error(`포트 ${TARGET_PORT} 사용 가능 대기 타임아웃`);
  }

  private async checkPortAvailability(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();

      socket.setTimeout(2000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, 'localhost');
    });
  }

  async stopFlutterApp(): Promise<void> {
    try {
      if (this.flutterProcess) {
        this.outputChannel.appendLine('🛑 Flutter 앱 종료 중...');
        
        this.flutterProcess.kill('SIGTERM');
        
        // 프로세스가 종료될 때까지 대기
        await new Promise<void>((resolve) => {
          if (this.flutterProcess) {
            this.flutterProcess.on('close', () => {
              this.flutterProcess = null;
              this.isRunning = false;
              resolve();
            });
          } else {
            resolve();
          }
        });

        this.outputChannel.appendLine('✅ Flutter 앱이 종료되었습니다.');
      }

      // 포트를 사용하는 다른 프로세스도 정리
      await this.killExistingProcesses();

    } catch (error) {
      this.outputChannel.appendLine(`❌ Flutter 앱 종료 실패: ${error}`);
      throw error;
    }
  }

  isAppRunning(): boolean {
    return this.isRunning && this.flutterProcess !== null;
  }

  getFlutterProcess(): ChildProcess | null {
    return this.flutterProcess;
  }
}
