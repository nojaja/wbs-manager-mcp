//シングルトンで動作する Logger クラス
//vscode.window.createOutputChannel('MCP-WBS')を使ってログ出力チャネルを作成し、ログメッセージを出力する
import * as vscode from 'vscode';
/**
 *
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;

    /**
     *
     */
    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MCP-WBS');
    }

    /**
     * Loggerクラスのシングルトンインスタンスを取得します
     * @returns {Logger} Loggerインスタンス
     */
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * ログを出力します
     * @param {string} message ログに出力するメッセージ
     */
    public log(message: string) {
        this.outputChannel.appendLine(message);
    }

    /**
     * 出力チャネルを表示します
     */
    public show() {
        this.outputChannel.show();
    }
}