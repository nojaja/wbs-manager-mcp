import * as vscode from 'vscode';
import { ExtensionController } from './ExtensionController';

let controller: ExtensionController | undefined;

/**
 * activate は極力薄く保ち、ExtensionController に起動責務を委譲します
 * @param context VSCode 拡張機能のコンテキスト
 */
export async function activate(context: vscode.ExtensionContext) {
    controller = new ExtensionController(context);
    await controller.start();
}

/**
 * deactivate はコントローラの停止を呼ぶだけにします
 */
export function deactivate() {
    controller?.stop();
}
