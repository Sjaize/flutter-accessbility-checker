// Minimal extension to test NLS issue
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Minimal extension activated');
    
    const disposable = vscode.commands.registerCommand('flutter-accessibility.test', () => {
        vscode.window.showInformationMessage('Test command executed');
    });
    
    context.subscriptions.push(disposable);
}

export function deactivate() {
    console.log('Minimal extension deactivated');
}
