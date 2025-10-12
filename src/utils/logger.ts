// src/utils/logger.ts
import * as vscode from 'vscode';

export class Logger {
  private static outputChannel: vscode.OutputChannel | null = null;
  private static instance: Logger | null = null;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  static initialize(outputChannel: vscode.OutputChannel): void {
    Logger.outputChannel = outputChannel;
  }

  static log(message: string, prefix?: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const prefixedMessage = prefix ? `[${prefix}] ${message}` : message;
    const logMessage = `[${timestamp}] ${prefixedMessage}`;
    
    if (Logger.outputChannel) {
      Logger.outputChannel.appendLine(logMessage);
    }
    console.log(logMessage);
  }

  static error(message: string, prefix?: string): void {
    Logger.log(`❌ ${message}`, prefix);
  }

  static warning(message: string, prefix?: string): void {
    Logger.log(`⚠️ ${message}`, prefix);
  }

  static success(message: string, prefix?: string): void {
    Logger.log(`✅ ${message}`, prefix);
  }

  static info(message: string, prefix?: string): void {
    Logger.log(`ℹ️ ${message}`, prefix);
  }

  static debug(message: string, prefix?: string): void {
    Logger.log(`🐛 ${message}`, prefix);
  }
}
