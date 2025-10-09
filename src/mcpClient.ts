
// 子プロセス操作用モジュール
import * as child_process from 'child_process';
// パス操作ユーティリティ
import * as path from 'path';
// VSCode API
import * as vscode from 'vscode';

interface JsonRpcRequest {
    jsonrpc: string;
    id: number;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: string;
    id?: number;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

/**
 * MCPクライアントクラス
 * サーバプロセスの起動・通信・リクエスト管理を行う
 * なぜ必要か: VSCode拡張とMCPサーバ間の通信・API呼び出しを抽象化し、UI層から独立して管理するため
 */
export class MCPClient {
    private serverProcess: child_process.ChildProcess | null = null;
    private requestId = 0;
    private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();
    private outputChannel: vscode.OutputChannel;

    /**
     * コンストラクタ
     * 出力チャネルを受け取り、初期化する
     * なぜ必要か: ログ出力やデバッグ情報をVSCodeに表示するため
     * @param outputChannel 出力チャネル
     */
    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * サーバプロセス起動処理
     * MCPサーバプロセスを起動し、初期化・接続を行う
     * なぜ必要か: 拡張機能から独立したサーバプロセスでDB・API処理を行うため
     * @param serverPath サーバ実行ファイルのパス
     * @param options オプション（cwd, env）
     * @param options.cwd
     * @param options.env
     */
    async start(serverPath: string, options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<void> {
        // サーバプロセスが既に起動済みなら何もしない
        // 理由: 多重起動による競合・リソース浪費を防ぐため
        if (this.serverProcess) {
            return;
        }

        return new Promise((resolve, reject) => {
            // サーバプロセスをspawnで起動
            this.serverProcess = child_process.spawn(process.execPath, [serverPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: options?.cwd,
                env: options?.env
            });

            let buffer = '';

            // サーバ標準出力の受信・パース
            this.serverProcess.stdout?.setEncoding('utf8');
            this.serverProcess.stdout?.on('data', (chunk) => {
                buffer += chunk;
                let lines = buffer.split('\n');
                buffer = lines.pop() || '';

                // 1行ずつJSON-RPCレスポンスとして処理
                for (const line of lines) {
                    // 空行はスキップ
                    if (line.trim()) {
                        // 理由: サーバからのレスポンスを安全にパースし、失敗時はログ出力
                        try {
                            const response = JSON.parse(line.trim()) as JsonRpcResponse;
                            this.handleResponse(response);
                        } catch (error) {
                            this.outputChannel.appendLine(`[MCP Client] Failed to parse response: ${error}`);
                        }
                    }
                }
            });

            // サーバ標準エラー出力の受信
            this.serverProcess.stderr?.on('data', (data) => {
                // 理由: サーバ側のエラーを即時にユーザー・開発者へ通知するため
                const error = data.toString().trim();
                this.outputChannel.appendLine(`[MCP Server] ${error}`);
            });

            // サーバプロセス終了時の処理
            this.serverProcess.on('exit', (code, signal) => {
                // 理由: サーバ異常終了時にユーザーへ通知し、リソースをクリーンアップするため
                this.outputChannel.appendLine(`[MCP Client] Server process exited with code ${code}, signal: ${signal}`);
                this.serverProcess = null;
                // 保留中リクエストを全てreject
                for (const [id, { reject }] of this.pendingRequests) {
                    reject(new Error('Server process exited'));
                }
                this.pendingRequests.clear();
            });

            // サーバプロセスエラー時の処理
            this.serverProcess.on('error', (err) => {
                // 理由: サーバ起動失敗や予期せぬ例外を即時通知し、リソースリークを防ぐため
                this.outputChannel.appendLine(`[MCP Client] Server process error: ${err.message}`);
                reject(err);
            });

            // サーバ初期化リクエスト送信（遅延）
            setTimeout(async () => {
                // 理由: サーバ起動直後の初期化リクエスト送信（遅延）
                try {
                    await this.initialize();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, 1000);
        });
    }

    /**
     * 初期化処理
     * サーバへinitializeリクエストを送り、初期化・通知を行う
     * なぜ必要か: サーバ・クライアント間のプロトコルバージョンや機能を同期するため
     */
    private async initialize(): Promise<void> {
        const response = await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'wbs-mcp-extension',
                version: '0.1.0'
            }
        });

        if (response.error) {
            throw new Error(`Failed to initialize MCP: ${response.error.message}`);
        }

        // Send initialized notification
        this.sendNotification('notifications/initialized', {});
    }

    /**
     * リクエスト送信処理
     * サーバへJSON-RPCリクエストを送信し、レスポンスをPromiseで返す
     * なぜ必要か: 非同期でサーバAPIを呼び出し、結果をUI層に返すため
     * @param method メソッド名
     * @param params パラメータ
     * @returns Promise<JsonRpcResponse>
     */
    private sendRequest(method: string, params?: any): Promise<JsonRpcResponse> {
        // サーバプロセスが未起動なら即時エラー
        // 理由: サーバ未起動時のリクエスト送信を防ぐ
        if (!this.serverProcess) {
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
            // リクエストIDごとにPromise管理
            this.pendingRequests.set(id, { resolve, reject });

            const requestStr = JSON.stringify(request) + '\n';
            this.outputChannel.appendLine(`[MCP Client] Sending: ${method}`);

            // サーバへリクエスト送信
            this.serverProcess!.stdin?.write(requestStr, (error) => {
                // 理由: 書き込み失敗時は即時エラー通知
                if (error) {
                    this.pendingRequests.delete(id);
                    reject(error);
                }
            });

            // 10秒タイムアウトで未応答リクエストを自動エラー化
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, 10000);
        });
    }

    /**
     * 通知送信処理
     * サーバへJSON-RPC通知を送信する（応答不要）
     * なぜ必要か: サーバ側への状態通知やイベント伝達を非同期・片方向で行うため
     * @param method メソッド名
     * @param params パラメータ
     */
    private sendNotification(method: string, params?: any): void {
        // サーバプロセスが未起動なら何もしない
        // 理由: 通知送信時の無駄なエラー発生を防ぐ
        if (!this.serverProcess) {
            return;
        }

        const notification = {
            jsonrpc: '2.0',
            method,
            params
        };

        const notificationStr = JSON.stringify(notification) + '\n';
        this.serverProcess.stdin?.write(notificationStr);
    }

    /**
     * レスポンス処理
     * サーバからのJSON-RPCレスポンスを受け取り、対応するPromiseを解決/拒否する
     * なぜ必要か: 非同期リクエストの結果を正しくUI層に返すため
     * @param response サーバからのレスポンス
     */
    private handleResponse(response: JsonRpcResponse): void {
        // レスポンスIDが存在する場合のみ対応するPromiseを解決/拒否
        if (response.id !== undefined) {
            const pending = this.pendingRequests.get(response.id as number);
            if (pending) {
                this.pendingRequests.delete(response.id as number);
                // 理由: サーバ側でエラーが返却された場合はreject、それ以外はresolve
                if (response.error) {
                    pending.reject(new Error(response.error.message));
                } else {
                    pending.resolve(response);
                }
            }
        }
    }

    /**
     * ツール呼び出し処理
     * サーバのツールAPIを呼び出し、結果を返す
     * なぜ必要か: サーバ側の各種機能（プロジェクト・タスク管理等）を抽象化して呼び出すため
     * @param toolName ツール名
     * @param args 引数
     * @returns Promise<any>
     */
    async callTool(toolName: string, args: any): Promise<any> {
        const response = await this.sendRequest('tools/call', {
            name: toolName,
            arguments: args
        });

        // サーバ側でエラーが返却された場合は例外スロー
        if (response.error) {
            throw new Error(response.error.message);
        }

        return response.result;
    }

    /**
     * プロジェクト一覧取得処理
     * サーバからプロジェクト一覧を取得し、配列で返す
     * なぜ必要か: UIツリーのルートにプロジェクト一覧を表示するため
     * @returns Promise<any[]>
     */
    async listProjects(): Promise<any[]> {
        try {
            // 理由: サーバAPI呼び出し・パース失敗時も空配列で安全に返す
            const result = await this.callTool('wbs.listProjects', {});
            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return [];
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to list projects: ${error}`);
            return [];
        }
    }

    /**
     * タスク一覧取得処理
     * 指定プロジェクトのタスク一覧を取得し、配列で返す
     * なぜ必要か: プロジェクト配下のタスクツリーをUIに表示するため
     * @param projectId プロジェクトID
     * @returns Promise<any[]>
     */
    async listTasks(projectId: string): Promise<any[]> {
        try {
            // 理由: サーバAPI呼び出し・パース失敗時も空配列で安全に返す
            const result = await this.callTool('wbs.listTasks', { projectId });
            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return [];
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to list tasks: ${error}`);
            return [];
        }
    }

    /**
     * タスク取得処理
     * 指定タスクIDのタスク詳細を取得する
     * なぜ必要か: タスク詳細画面や編集時に最新情報を取得するため
     * @param taskId タスクID
     * @returns Promise<any | null>
     */
    async getTask(taskId: string): Promise<any | null> {
        try {
            // 理由: サーバAPI呼び出し・パース失敗時もnullで安全に返す
            const result = await this.callTool('wbs.getTask', { taskId });
            const content = result.content?.[0]?.text;
            // ❌が含まれていればエラー扱い
            if (content && !content.includes('❌')) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to get task: ${error}`);
            return null;
        }
    }

    /**
     * タスク更新処理
     * 指定タスクIDの内容を更新し、結果を返す
     * なぜ必要か: タスク編集・保存時にサーバDBへ反映するため
     * @param taskId タスクID
     * @param updates 更新内容
     * @returns 更新結果オブジェクト
     */
    async updateTask(taskId: string, updates: any): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
        try {
            // 理由: サーバAPI呼び出し・パース失敗時もエラー内容を返す
            const result = await this.callTool('wbs.updateTask', { taskId, ...updates });
            const content = result.content?.[0]?.text;
            // 更新成功
            if (content?.includes('✅')) {
                return { success: true };
                // 楽観ロック競合
            } else if (content?.includes('modified by another user')) {
                return { success: false, conflict: true };
                // その他エラー
            } else {
                return { success: false, error: content || 'Unknown error' };
            }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * タスク作成処理
     * 指定プロジェクトに新しいタスクを作成し、結果を返す
     * なぜ必要か: ツリー上からタスクを追加する機能を提供するため
     * @param params 作成パラメータ
    * @param params.projectId プロジェクトID
    * @param params.title タスクタイトル
    * @param params.description タスク説明
    * @param params.parentId 親タスクID
    * @param params.assignee 担当者
    * @param params.estimate 見積もり
    * @param params.goal ゴール
     * @returns 作成結果（成功時はタスクIDを含む）
     */
    async createTask(params: {
        projectId: string;
        title?: string;
        description?: string;
        parentId?: string | null;
        assignee?: string | null;
        estimate?: string | null;
        goal?: string | null;
    }): Promise<{ success: boolean; taskId?: string; error?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.createTask', {
                projectId: params.projectId,
                title: params.title ?? 'New Task',
                description: params.description ?? '',
                parentId: params.parentId ?? null,
                assignee: params.assignee ?? null,
                estimate: params.estimate ?? null,
                goal: params.goal ?? null
            });
            const content = result.content?.[0]?.text ?? '';
            if (content.includes('✅')) {
                const idMatch = content.match(/ID:\s*(.+)/);
                const createdId = idMatch ? idMatch[1].trim() : undefined;
                return { success: true, taskId: createdId, message: content };
            }
            return { success: false, error: content || 'Unknown error', message: content };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }

    /**
     * タスク削除処理
     * 指定したタスクIDと紐づく子タスクを削除する
     * なぜ必要か: UIからの削除操作をサーバAPI呼び出しに委譲するため
     * @param taskId タスクID
     * @returns 削除結果
     */
    async deleteTask(taskId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.callTool('wbs.deleteTask', { taskId });
            const content = result.content?.[0]?.text ?? '';
            if (content.includes('✅')) {
                return { success: true };
            }
            return { success: false, error: content || 'Unknown error' };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * プロジェクト削除処理
     * 指定したプロジェクトIDと配下のタスクを削除する
     * なぜ必要か: UIからの削除操作をサーバAPI呼び出しに委譲するため
     * @param projectId プロジェクトID
     * @returns 削除結果
     */
    async deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.callTool('wbs.deleteProject', { projectId });
            const content = result.content?.[0]?.text ?? '';
            if (content.includes('✅')) {
                return { success: true };
            }
            return { success: false, error: content || 'Unknown error' };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * タスク移動処理
     * 指定したタスクの親タスクを変更する
     * なぜ必要か: UIのドラッグ&ドロップ操作でサーバ側に親子関係変更を伝えるため
     * @param taskId タスクID
     * @param newParentId 新しい親タスクID（ルートへ移動する場合はnull）
     * @returns 移動結果
     */
    async moveTask(taskId: string, newParentId: string | null): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.callTool('wbs.moveTask', { taskId, newParentId: newParentId ?? null });
            const content = result.content?.[0]?.text ?? '';
            if (content.includes('✅')) {
                return { success: true };
            }
            return { success: false, error: content || 'Unknown error' };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * サーバプロセス停止処理
     * サーバプロセスを停止し、リクエスト管理をクリアする
     * なぜ必要か: プロセスリーク・リソース消費を防ぎ、拡張機能終了時に安全に停止するため
     */
    stop(): void {
        // サーバプロセスが起動中ならkill
        // 理由: プロセスリーク・リソース消費を防ぐ
        if (this.serverProcess) {
            this.serverProcess.kill();
            this.serverProcess = null;
        }
        // 保留中リクエストを全てクリア
        this.pendingRequests.clear();
    }
}