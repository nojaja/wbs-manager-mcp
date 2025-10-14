
// VSCode API
import * as vscode from 'vscode';
// (注) サーバプロセスの起動・管理は ServerService に委譲されています。

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

export type TaskArtifactRole = 'deliverable' | 'prerequisite';

export interface Artifact {
    id: string;
    title: string;
    uri?: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
    version: number;
}

export interface TaskArtifactAssignment {
    id: string;
    artifact_id: string;
    role: TaskArtifactRole;
    crudOperations?: string;
    order: number;
    artifact: Artifact;
}

export interface TaskCompletionCondition {
    id: string;
    task_id: string;
    description: string;
    order: number;
}

export interface ArtifactReferenceInput {
    artifactId: string;
    crudOperations?: string | null;
}

export interface CompletionConditionInput {
    description: string;
}

type SanitizedArtifactInput = { artifactId: string; crudOperations?: string | null };

/**
 * MCPクライアントクラス
 * サーバプロセスの起動・通信・リクエスト管理を行う
 * なぜ必要か: VSCode拡張とMCPサーバ間の通信・API呼び出しを抽象化し、UI層から独立して管理するため
 */
export class MCPClient {
    // serverProcess は ServerService が管理するため直接保持しない
    private requestId = 0;
    private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();
    private outputChannel: vscode.OutputChannel;
    // サーバへの書き込み用関数（ServerService から提供される）
    private writer: ((s: string) => void) | null = null;
    // optional WBSService delegate (set by extension during startup)
    private wbsService: any | null = null;

    /**
     * 処理名: コンストラクタ
     * 処理概要: 出力チャネルを保存し、初期状態を設定する
     * 実装理由(なぜ必要か): ログ出力先を確保して通信のデバッグや状態監視を可能にするため
     * @param outputChannel 出力チャネル
     */
    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    // NOTE: Sanitization helpers were removed in favor of WBSService centralized logic.
    // MCPClient is transport-only and will delegate to an injected WBSService when present.

    /**
     * MCPClient を初期化する。
     * 以前は ChildProcess を受け取り stdout を直接監視していたが、ServerService がプロセスを管理するため
     * start は引数なしで呼び出され、ServerService から writer と parsed responses が渡されることを期待する。
     */
    async start(): Promise<void> {
        // 処理名: クライアント開始処理
        // 処理概要: ServerService が writer を登録するまで待機し、初期化シーケンスを実行する
        // 実装理由: writer が未設定のまま通信処理を行うとエラーとなるため安全に初期化する
        const startAt = Date.now();
        const timeout = 5000; // 5秒待つ
        while (!this.writer && Date.now() - startAt < timeout) {
            // 処理概要: writer のセットを待つポーリングループ
            // 実装理由: ServerService が writer を設定する前に通信を始めると失敗するため、短時間の待機で安全に初期化する
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!this.writer) {
            throw new Error('MCPClient.start: writer not set by ServerService');
        }
        await this.initialize();
    }

    /**
     * ServerService から書き込み関数を受け取る
     * @param w サーバへ書き込む関数（例: stdin.write をラップしたもの）
     */
    setWriter(w: (s: string) => void) {
        // 処理名: writer 登録
        // 処理概要: ServerService から受け取った書き込み関数を内部に保持する
        // 実装理由: クライアントは writer を通じてサーバへメッセージを送信するため
        this.writer = w;
    }

    /**
     * WBSService を注入する（オプション）
     * @param s WBSService インスタンス
     */
    setWbsService(s: any) {
        // 処理名: WBSService 注入
        // 処理概要: ビジネスロジック層の実装を注入してクライアントが処理を委譲できるようにする
        // 実装理由: クライアントを transport-only に保ちつつ既存のビジネスロジックを利用するため
        this.wbsService = s;
    }

    /**
     * 互換用: ServerService から渡される raw line を受け取る
     * @param rawLine サーバの stdout 行（文字列）
     */
    handleResponseFromServer(rawLine: string) {
        // 処理名: サーバ生レスポンス受信ハンドラ
        // 処理概要: 生の1行(JSON)をパースし内部ハンドラへ渡す
        // 実装理由: ServerService が返す文字列を JSON として扱い、該当する Promise を解決/拒否するため
        try {
            const parsed = JSON.parse(rawLine);
            this.handleResponseInternal(parsed as JsonRpcResponse);
        } catch (err) {
            // 処理概要: サーバからの生レスポンスが JSON として解析できない場合のログ出力
            // 実装理由: 不正な出力が混入してもクライアントが例外で停止しないようにし、デバッグ情報を残すため
            this.outputChannel.appendLine(`[MCP Client] Failed to parse response: ${err}`);
        }
    }

    /**
     * ServerService から受け取った JSON-RPC オブジェクトを処理する
     * @param parsed サーバからパース済みの JSON-RPC オブジェクト
     */
    handleResponse(parsed: any) {
        // 処理名: パース済レスポンスハンドラ
        // 処理概要: 既にオブジェクト化されたレスポンスを内部ハンドラへ渡す
        // 実装理由: ServerService 以外のソースからも同じ内部処理を使えるようにするため
        try {
            const response = parsed as JsonRpcResponse;
            this.handleResponseInternal(response);
        } catch (err) {
            // 処理概要: パース済みレスポンス処理中に例外が発生した際の保護処理
            // 実装理由: 外部から渡されたオブジェクトの形式が想定と異なる場合でもクライアントの安定性を保つため
            this.outputChannel.appendLine(`[MCP Client] handleResponse error: ${err}`);
        }
    }

    /**
     * サーバ終了通知ハンドラ（ServerService が呼び出す）
     * @param code 終了コード
     * @param signal シグナル
     */
    onServerExit(code: number | null, signal: NodeJS.Signals | null) {
        // 処理名: サーバ終了通知ハンドラ
        // 処理概要: サーバプロセス終了時に保留中のリクエストを全て拒否し、内部状態をクリアする
        // 実装理由: サーバが停止した状態で保留を残すとリソースリークやフリーズを招くため
        this.outputChannel.appendLine(`[MCP Client] Server process exited with code ${code}, signal: ${signal}`);
        for (const [id, { reject }] of this.pendingRequests) {
            reject(new Error('Server process exited'));
        }
        this.pendingRequests.clear();
    }

    /**
     * 初期化処理
     * サーバへinitializeリクエストを送り、初期化・通知を行う
     * なぜ必要か: サーバ・クライアント間のプロトコルバージョンや機能を同期するため
     */
    private async initialize(): Promise<void> {
        // 処理名: 初期化処理
        // 処理概要: JSON-RPC の initialize リクエストを送ってサーバと機能同期を行う
        // 実装理由: クライアントとサーバのプロトコルや機能を合わせて以降の通信を安定させるため
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
        // 処理名: JSON-RPC リクエスト送信
        // 処理概要: writer を経由してサーバへ JSON-RPC リクエストを送信し、Promise でレスポンスを待つ
        // 実装理由: 非同期通信の結果を呼び出し元へ返すための汎用的な送信ラッパ
        if (!this.writer) {
            // 処理概要: writer 未登録時の早期エラー返却
            // 実装理由: 通信手段が未設定のまま送信処理を継続するのを防ぐため
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
            // 処理概要: writer を通じて文字列を送信し、送信失敗時は保留リクエストを破棄してエラーを返す
            // 実装理由: IO 例外が発生した場合にそのリクエストだけを安全に取り消すため
            try {
                this.writer!(requestStr);
            } catch (error) {
                this.pendingRequests.delete(id);
                reject(error);
            }

            // タイムアウト設定: 10秒で未応答なら reject
            // 処理概要: 一定時間応答が無ければ保留を解除して呼び出し元にエラーを返す
            // 実装理由: サーバの無応答で UI が永久に待ち続けることを防ぐため
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
        // 処理名: 通知送信
        // 処理概要: JSON-RPC の通知を送る（レスポンスは不要）
        // 実装理由: 状態変更やイベントをサーバへ伝えるための片方向メカニズム
        if (!this.writer) {
            return;
        }

        const notification = {
            jsonrpc: '2.0',
            method,
            params
        };

        const notificationStr = JSON.stringify(notification) + '\n';
        this.writer(notificationStr);
    }

    /**
     * レスポンス処理
     * サーバからのJSON-RPCレスポンスを受け取り、対応するPromiseを解決/拒否する
     * なぜ必要か: 非同期リクエストの結果を正しくUI層に返すため
     * @param response サーバからのレスポンス
     */
    private handleResponseInternal(response: JsonRpcResponse): void {
        // 処理名: レスポンス内部処理
        // 処理概要: JSON-RPC レスポンスの id を見て対応する保留 Promise を解決または拒否する
        // 実装理由: 非同期送信に対するレスポンスの受け口を一元化するため
        if (response.id !== undefined) {
            const pending = this.pendingRequests.get(response.id as number);
            if (pending) {
                this.pendingRequests.delete(response.id as number);
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
     * タスク一覧取得処理
     * 指定parentIdの直下のタスク一覧を取得し、配列で返す
     * なぜ必要か: 階層構造に応じたタスクツリーをUIに表示するため
     * @param parentId 親タスクID（省略時はトップレベル）
     * @returns Promise<any[]>
     */
    async listTasks(parentId?: string | null): Promise<any[]> {
        // If a WBSService is injected, prefer it (business logic centralized there)
        if (this.wbsService && typeof this.wbsService.listTasksApi === 'function') {
            return this.wbsService.listTasksApi(parentId);
        }
        try {
            // 処理概要: wbs.listTasks ツールを呼び、テキストレスポンスを JSON に変換して返す
            // 実装理由: サーバはテキストコンテンツを返すため、クライアント側で構造化データに戻す必要がある
            const args = parentId !== undefined ? { parentId } : {};
            const result = await this.callTool('wbs.planMode.listTasks', args);
            const content = result.content?.[0]?.text;
            if (content) {
                try {
                    // 処理概要: 受け取った文字列をパースして配列にする
                    // 実装理由: ツール出力は文字列化された JSON であるため、復元が必要
                    return JSON.parse(content);
                } catch (error) {
                    // 処理概要: パース失敗時のログ出力
                    // 実装理由: 受信データが想定外でも例外で処理が止まらないようにするため
                    this.outputChannel.appendLine(`[MCP Client] Failed to parse task list: ${error} : ${content}`);
                }
            }
            return [];
        } catch (error) {
            // 処理概要: callTool 自体の呼び出し失敗時のフォールバック
            // 実装理由: サーバ通信エラーが発生しても UI を破壊しないように空配列を返す
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
        if (this.wbsService && typeof this.wbsService.getTaskApi === 'function') {
            return this.wbsService.getTaskApi(taskId);
        }
        try {
            const result = await this.callTool('wbs.planMode.getTask', { taskId });
            const content = result.content?.[0]?.text;
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
     * @param updates.deliverables 成果物の割当一覧（任意）
     * @param updates.prerequisites 前提条件の成果物割当一覧（任意）
     * @param updates.completionConditions 完了条件の一覧（任意）
     * @returns 更新結果オブジェクト
     */
    async updateTask(taskId: string, updates: any): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
        if (this.wbsService && typeof this.wbsService.updateTaskApi === 'function') {
            return this.wbsService.updateTaskApi(taskId, updates);
        }
        try {
            // Transport-only fallback: pass updates as-is to the server tool.
            const result = await this.callTool('wbs.planMode.updateTask', { taskId, ...updates });
            const content = result.content?.[0]?.text;
            if (content?.includes('✅')) {
                return { success: true };
            } else if (content?.includes('modified by another user')) {
                return { success: false, conflict: true };
            }
            return { success: false, error: content || 'Unknown error' };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * タスク作成処理
     * 新しいタスクを作成し、結果を返す
     * なぜ必要か: ツリー上からタスクを追加する機能を提供するため
    * @param params 作成パラメータ
    * @param params.title タスクタイトル
    * @param params.description タスク説明
    * @param params.parentId 親タスクID
    * @param params.assignee 担当者
    * @param params.estimate 見積もり
    * @param params.deliverables 成果物の割当一覧（任意）
    * @param params.prerequisites 前提条件の成果物割当一覧（任意）
    * @param params.completionConditions 完了条件の一覧（任意）
     * @returns 作成結果（成功時はタスクIDを含む）
     */
    async createTask(params: {
        title?: string;
        description?: string;
        parentId?: string | null;
        assignee?: string | null;
        estimate?: string | null;
        deliverables?: ArtifactReferenceInput[];
        prerequisites?: ArtifactReferenceInput[];
        completionConditions?: CompletionConditionInput[];
    }): Promise<{ success: boolean; taskId?: string; error?: string; message?: string }> {
        if (this.wbsService && typeof this.wbsService.createTaskApi === 'function') {
            return this.wbsService.createTaskApi(params);
        }
        try {
            // Transport-only fallback: forward params directly to the tool.
            const result = await this.callTool('wbs.planMode.createTask', params);
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
     * 成果物一覧取得処理
     * 成果物一覧を取得する
     * なぜ必要か: 成果物ツリービューに一覧を表示するため
     * @returns 成果物配列
     */
    async listArtifacts(): Promise<Artifact[]> {
        // Transport-only: always call the server tool directly to avoid delegating
        // to an injected service which may call back into this client and cause
        // recursion.
        try {
            const result = await this.callTool('wbs.planMode.listArtifacts', {});
            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content) as Artifact[];
            }
            return [];
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to list artifacts: ${error}`);
            return [];
        }
    }

    /**
     * 成果物作成処理
     * 成果物を新規登録し、作成結果を返す
     * なぜ必要か: 成果物管理機能から新規登録するため
     * @param params 作成パラメータ
     * @param params.title 成果物タイトル
     * @param params.uri 関連URI（任意）
     * @param params.description 説明（任意）
     * @returns 作成結果
     */
    async createArtifact(params: {
        title: string;
        uri?: string | null;
        description?: string | null;
    }): Promise<{ success: boolean; artifact?: Artifact; error?: string }> {
        if (this.wbsService && typeof this.wbsService.createArtifactApi === 'function') {
            return this.wbsService.createArtifactApi(params);
        }
        try {
            const result = await this.callTool('wbs.planMode.createArtifact', {
                title: params.title,
                uri: params.uri ?? null,
                description: params.description ?? null
            });
            const content = result.content?.[0]?.text ?? '';
            if (content.includes('❌')) {
                return { success: false, error: content };
            }
            const artifact = JSON.parse(content) as Artifact;
            return { success: true, artifact };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }

    /**
     * 成果物更新処理
     * 既存成果物を更新し、更新結果を返す
     * なぜ必要か: 成果物情報の編集に対応するため
     * @param params 更新パラメータ
     * @param params.artifactId 成果物ID
     * @param params.title 成果物タイトル（任意）
     * @param params.uri 関連URI（任意）
     * @param params.description 説明（任意）
     * @param params.version 競合検出用バージョン（任意）
     * @returns 更新結果
     */
    async updateArtifact(params: {
        artifactId: string;
        title?: string;
        uri?: string | null;
        description?: string | null;
        version?: number;
    }): Promise<{ success: boolean; artifact?: Artifact; conflict?: boolean; error?: string }> {
        if (this.wbsService && typeof this.wbsService.updateArtifactApi === 'function') {
            return this.wbsService.updateArtifactApi(params);
        }
        try {
            const result = await this.callTool('wbs.planMode.updateArtifact', {
                artifactId: params.artifactId,
                title: params.title,
                uri: params.uri ?? null,
                description: params.description ?? null,
                ifVersion: params.version
            });
            const content = result.content?.[0]?.text ?? '';
            if (content.includes('modified by another user')) {
                return { success: false, conflict: true, error: content };
            }
            if (content.includes('❌')) {
                return { success: false, error: content };
            }
            const artifact = JSON.parse(content) as Artifact;
            return { success: true, artifact };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }

    /**
     * 成果物取得処理
     * 指定IDの成果物を取得する
     * なぜ必要か: 成果物詳細画面で最新情報を表示するため
     * @param artifactId 成果物ID
     * @returns 成果物またはnull
     */
    async getArtifact(artifactId: string): Promise<Artifact | null> {
        if (this.wbsService && typeof this.wbsService.getArtifactApi === 'function') {
            return this.wbsService.getArtifactApi(artifactId);
        }
        try {
            const result = await this.callTool('wbs.planMode.getArtifact', { artifactId });
            const content = result.content?.[0]?.text;
            if (content && !content.includes('❌')) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to get artifact: ${error}`);
            return null;
        }
    }

    /**
     * 成果物削除処理
     * 指定成果物を削除する
     * なぜ必要か: 成果物管理から除去するため
     * @param artifactId 成果物ID
     * @returns 削除結果
     */
    async deleteArtifact(artifactId: string): Promise<{ success: boolean; error?: string }> {
        if (this.wbsService && typeof this.wbsService.deleteArtifactApi === 'function') {
            return this.wbsService.deleteArtifactApi(artifactId);
        }
        try {
            const result = await this.callTool('wbs.planMode.deleteArtifact', { artifactId });
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
     * タスク削除処理
     * 指定したタスクIDと紐づく子タスクを削除する
     * なぜ必要か: UIからの削除操作をサーバAPI呼び出しに委譲するため
     * @param taskId タスクID
     * @returns 削除結果
     */
    async deleteTask(taskId: string): Promise<{ success: boolean; error?: string }> {
        if (this.wbsService && typeof this.wbsService.deleteTaskApi === 'function') {
            return this.wbsService.deleteTaskApi(taskId);
        }
        try {
            const result = await this.callTool('wbs.planMode.deleteTask', { taskId });
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
        if (this.wbsService && typeof this.wbsService.moveTaskApi === 'function') {
            return this.wbsService.moveTaskApi(taskId, newParentId);
        }
        try {
            const result = await this.callTool('wbs.planMode.moveTask', { taskId, newParentId: newParentId ?? null });
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
        // ServerService がプロセスのライフサイクルを管理するため、ここでは接続解除と保留リクエストのクリーンアップのみを行う
        this.outputChannel.appendLine('[MCP Client] Detaching from server (clearing writer and pending requests)');
        this.writer = null;
        // 保留中リクエストを全てクリア
        for (const [id, { reject }] of this.pendingRequests) {
            reject(new Error('MCP client stopped'));
        }
        this.pendingRequests.clear();
    }

}