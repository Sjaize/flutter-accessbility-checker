// src/services/flutter-runner.ts
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TARGET_PORT = 64022;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000;

export class FlutterRunner {
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;
  private flutterProcess: ChildProcess | null = null;
  private isRunning: boolean = false;

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
    return new Promise((resolve, reject) => {
      const flutterCheck = spawn('flutter', ['--version'], {
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

      this.outputChannel.appendLine(`🚀 Flutter 명령어: flutter ${flutterArgs.join(' ')}`);

      this.flutterProcess = spawn('flutter', flutterArgs, {
        cwd: this.workspaceRoot,
        stdio: 'pipe'
      });

      let hasStarted = false;
      let startupTimeout: NodeJS.Timeout;

      // 시작 타임아웃 설정
      startupTimeout = setTimeout(() => {
        if (!hasStarted) {
          this.flutterProcess?.kill();
          reject(new Error('Flutter 앱 시작 타임아웃 (30초)'));
        }
      }, 30000);

      this.flutterProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        this.outputChannel.appendLine(`[Flutter] ${output.trim()}`);

        // Flutter 앱이 성공적으로 시작되었는지 확인 (다양한 패턴)
        if (output.includes('Flutter run key commands') || 
            output.includes('Running with sound null safety') ||
            output.includes('An Observatory debugger and profiler') ||
            output.includes('The Flutter DevTools debugger and profiler') ||
            output.includes('Debug service listening') ||
            output.includes('Flutter run key commands')) {
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
