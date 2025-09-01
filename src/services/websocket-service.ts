import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';

export class WebSocketService {
  private server: http.Server | null = null;
  private port: number = 3001;
  private dataStore: any = {};

  constructor(private outputChannel: any) {}

  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, 'localhost', () => {
        this.outputChannel.appendLine(`✅ HTTP API 서버가 포트 ${this.port}에서 시작되었습니다.`);
        resolve();
      });

      this.server.on('error', (error) => {
        this.outputChannel.appendLine(`❌ HTTP 서버 시작 실패: ${error}`);
        reject(error);
      });
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsedUrl = url.parse(req.url!, true);
    const pathname = parsedUrl.pathname;

    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      switch (pathname) {
        case '/api/data':
          this.handleDataEndpoint(req, res);
          break;
        case '/api/status':
          this.handleStatusEndpoint(req, res);
          break;
        case '/api/update':
          this.handleUpdateEndpoint(req, res);
          break;
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  private handleDataEndpoint(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.dataStore));
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
  }

  private handleStatusEndpoint(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      timestamp: new Date().toISOString(),
      dataAvailable: Object.keys(this.dataStore).length > 0
    }));
  }

  private handleUpdateEndpoint(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          this.dataStore = { ...this.dataStore, ...data };
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Data updated successfully' }));
          
          this.outputChannel.appendLine('✅ 데이터가 API 서버를 통해 업데이트되었습니다.');
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
  }

  updateData(data: any): void {
    this.dataStore = { ...this.dataStore, ...data };
    this.outputChannel.appendLine('✅ 데이터가 업데이트되었습니다.');
  }

  getData(): any {
    return this.dataStore;
  }

  async stopServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.outputChannel.appendLine('🛑 HTTP API 서버가 중지되었습니다.');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getServerUrl(): string {
    return `http://localhost:${this.port}`;
  }
}
