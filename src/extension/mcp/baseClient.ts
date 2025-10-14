import * as vscode from 'vscode';

export interface JsonRpcRequest {
    jsonrpc: string;
    id: number;
    method: string;
    params?: unknown;
}

export interface JsonRpcResponse {
    jsonrpc: string;
    id?: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
}

type PendingRequest = {
    resolve: (value: JsonRpcResponse) => void;
    reject: (reason: Error) => void;
};

/**
 * 共通のJSON-RPC通信処理を担う基底クラス。
 * 送信キューとレスポンスのマッチング、通知送信、エラー処理を一元化する。
 */
export class MCPBaseClient {
    protected requestId = 0;
    protected readonly pendingRequests = new Map<number, PendingRequest>();
    protected writer: ((payload: string) => void) | null = null;

    /**
     * @param outputChannel ログ出力先となるVSCodeのOutputChannel
     */
    constructor(protected readonly outputChannel: vscode.OutputChannel) {}

    /**
     * ServerService から受け取った書き込み関数を登録する。
     *
     * @param writer サーバへJSON文字列を書き込む関数
     */
    public setWriter(writer: (payload: string) => void): void {
        this.writer = writer;
    }

    /**
     * サーバからの1行文字列レスポンスを受け取り、JSONに変換して処理する。
     *
     * @param rawLine サーバ標準出力の1行文字列
     */
    public handleResponseFromServer(rawLine: string): void {
        try {
            const parsed = JSON.parse(rawLine) as JsonRpcResponse;
            this.handleResponseInternal(parsed);
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to parse response: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * JSON化済みレスポンスを処理する。
     *
     * @param parsed ServerService 等から渡されたレスポンスオブジェクト
     */
    public handleResponse(parsed: unknown): void {
        try {
            this.handleResponseInternal(parsed as JsonRpcResponse);
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] handleResponse error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * サーバ終了時に保留リクエストを全て拒否する。
     *
     * @param code プロセス終了コード
     * @param signal 終了シグナル
     */
    public onServerExit(code: number | null, signal: NodeJS.Signals | null): void {
        this.outputChannel.appendLine(`[MCP Client] Server process exited with code ${code}, signal: ${signal}`);
        for (const [, pending] of this.pendingRequests.entries()) {
            pending.reject(new Error('Server process exited'));
        }
        this.pendingRequests.clear();
    }

    /**
     * MCPクライアントの停止処理。writerを解除し保留中リクエストを破棄する。
     */
    public stop(): void {
        this.outputChannel.appendLine('[MCP Client] Detaching from server (clearing writer and pending requests)');
        this.writer = null;
        for (const [, pending] of this.pendingRequests.entries()) {
            pending.reject(new Error('MCP client stopped'));
        }
        this.pendingRequests.clear();
    }

    /**
     * JSON-RPC経由でツールを呼び出す。
     *
     * @param toolName ツール識別子
     * @param args ツールに渡す引数
     * @returns ツールの実行結果
     */
    public async callTool(toolName: string, args: unknown): Promise<unknown> {
        const response = await this.sendRequest('tools/call', {
            name: toolName,
            arguments: args
        });

        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.result;
    }

    /**
     * JSON-RPCリクエストを送信しレスポンスを待つ。
     *
     * @param method JSON-RPCメソッド名
     * @param params メソッド引数
     * @returns JSON-RPCレスポンス
     */
    protected sendRequest(method: string, params?: unknown): Promise<JsonRpcResponse> {
        if (!this.writer) {
            return Promise.reject(new Error('MCP server not started'));
        }

        const id = ++this.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            const payload = `${JSON.stringify(request)}\n`;
            this.outputChannel.appendLine(`[MCP Client] Sending: ${method}`);
            try {
                this.writer?.(payload);
            } catch (error) {
                this.pendingRequests.delete(id);
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }

            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, 10000);
        });
    }

    /**
     * JSON-RPC通知を送信する。
     *
     * @param method 通知メソッド名
     * @param params 通知パラメータ
     */
    protected sendNotification(method: string, params?: unknown): void {
        if (!this.writer) {
            return;
        }

        const notification = {
            jsonrpc: '2.0',
            method,
            params
        };

        const payload = `${JSON.stringify(notification)}\n`;
        this.writer(payload);
    }

    /**
     * JSON-RPCレスポンスを解決/拒否する内部処理。
     *
     * @param response 受信したJSON-RPCレスポンス
     */
    protected handleResponseInternal(response: JsonRpcResponse): void {
        if (response.id === undefined) {
            return;
        }

        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
            return;
        }

        this.pendingRequests.delete(response.id);
        if (response.error) {
            pending.reject(new Error(response.error.message));
        } else {
            pending.resolve(response);
        }
    }
}
