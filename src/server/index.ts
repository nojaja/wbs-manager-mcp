
import { initializeDatabase, WBSRepository } from './db-simple';

interface JsonRpcRequest {
    jsonrpc: string;
    id?: number | string;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: string;
    id?: number | string;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

interface JsonRpcNotification {
    jsonrpc: string;
    method: string;
    params?: any;
}

/**
 * 標準入出力MCPサーバクラス
 * 標準入出力経由でリクエスト受付・DB操作・レスポンス返却を行う
 * なぜ必要か: VSCode拡張とサーバ間をシンプルなプロトコルで接続し、DB操作を分離するため
 */
class StdioMCPServer {
    private repo: WBSRepository;

    /**
     * コンストラクタ
     * WBSリポジトリ初期化・標準入出力ハンドラ設定を行う
     * なぜ必要か: DB操作・リクエスト受付を一元管理するため
     */
    constructor() {
        this.repo = new WBSRepository();
        this.setupStdioHandlers();
    }

    /**
     * 標準入出力ハンドラ設定処理
     * stdinからのデータ受信・パース・メッセージ分岐処理を行う
     * なぜ必要か: VSCode拡張からのリクエストをリアルタイムで受信・処理するため
     */
    private setupStdioHandlers() {
        process.stdin.setEncoding('utf8');
        let buffer = '';

        process.stdin.on('data', (chunk) => {
            buffer += chunk;
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';

            // 1行ずつJSON-RPCメッセージとして処理
            for (const line of lines) {
                // 空行はスキップ
                if (line.trim()) {
                    // 理由: サーバへの不正リクエストやパース失敗時も安全にエラー通知
                    try {
                        const message = JSON.parse(line.trim());
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('[MCP Server] Failed to parse message:', error);
                    }
                }
            }
        });

        process.stdin.on('end', () => {
            process.exit(0);
        });

        // Handle process termination
        process.on('SIGINT', () => process.exit(0));
        process.on('SIGTERM', () => process.exit(0));
    }

    /**
     * メッセージ受信処理
     * JSON-RPCリクエスト/通知を受信し、リクエストはhandleRequest、通知はhandleNotificationへ振り分ける
     * なぜ必要か: クライアントからの各種操作要求を正しく分岐・処理するため
     * @param message 受信メッセージ
     */
    private async handleMessage(message: JsonRpcRequest | JsonRpcNotification) {
        try {
            console.error(`[MCP Server] Received: ${message.method}`, message.params);

            // idプロパティの有無でリクエスト/通知を分岐
            // 理由: JSON-RPC仕様に従い、応答要否を正しく判定するため
            if ('id' in message) {
                // Request - needs response
                const response = await this.handleRequest(message as JsonRpcRequest);
                this.sendResponse(response);
            } else {
                // Notification - no response needed
                await this.handleNotification(message as JsonRpcNotification);
            }
        } catch (error) {
            console.error('[MCP Server] Error handling message:', error);
            // idプロパティがある場合のみエラー応答を返す
            // 理由: 通知には応答不要、リクエストのみエラー返却
            if ('id' in message) {
                this.sendResponse({
                    jsonrpc: '2.0',
                    id: message.id,
                    error: {
                        code: -32603,
                        message: error instanceof Error ? error.message : String(error)
                    }
                });
            }
        }
    }

    /**
     * リクエスト処理
     * JSON-RPCリクエストのメソッドごとにDB操作やツール呼び出しを行い、レスポンスを返す
     * なぜ必要か: クライアントからのAPI呼び出しをDB操作やツール呼び出しにマッピングするため
     * @param request リクエストオブジェクト
     * @returns レスポンスオブジェクト
     */
    private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        const { method, params, id } = request;

        // メソッド名ごとに処理を分岐
        // 理由: JSON-RPC仕様に従い、APIごとに適切なレスポンスを返すため
        switch (method) {
            case 'initialize':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: 'wbs-mcp-server',
                            version: '0.1.0'
                        }
                    }
                };

            case 'tools/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        tools: [
                            {
                                name: 'wbs.createTask',
                                description: 'Create a new task',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        title: { type: 'string', description: 'Task title' },
                                        description: { type: 'string', description: 'Task description' },
                                        assignee: { type: 'string', description: 'Assignee name' },
                                        estimate: { type: 'string', description: 'Time estimate' },
                                        goal: { type: 'string', description: 'Task goal' },
                                        parentId: { type: 'string', description: 'Parent task ID' },
                                        deliverables: {
                                            type: 'array',
                                            description: 'Artifacts produced or modified by this task',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    artifactId: { type: 'string' },
                                                    crudOperations: { type: 'string', description: 'C,R,U,D flags' }
                                                },
                                                required: ['artifactId']
                                            }
                                        },
                                        prerequisites: {
                                            type: 'array',
                                            description: 'Artifacts required before executing this task',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    artifactId: { type: 'string' },
                                                    crudOperations: { type: 'string', description: 'Access pattern' }
                                                },
                                                required: ['artifactId']
                                            }
                                        },
                                        completionConditions: {
                                            type: 'array',
                                            description: 'Conditions that define task completion',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    description: { type: 'string' }
                                                },
                                                required: ['description']
                                            }
                                        }
                                    },
                                    required: ['title']
                                }
                            },
                            {
                                name: 'wbs.getTask',
                                description: 'Get task details by ID',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        taskId: { type: 'string', description: 'Task ID' }
                                    },
                                    required: ['taskId']
                                }
                            },
                            {
                                name: 'wbs.updateTask',
                                description: 'Update a task',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        taskId: { type: 'string', description: 'Task ID' },
                                        title: { type: 'string', description: 'Task title' },
                                        description: { type: 'string', description: 'Task description' },
                                        assignee: { type: 'string', description: 'Assignee name' },
                                        status: { type: 'string', description: 'Task status' },
                                        estimate: { type: 'string', description: 'Time estimate' },
                                        goal: { type: 'string', description: 'Task goal' },
                                        deliverables: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    artifactId: { type: 'string' },
                                                    crudOperations: { type: 'string' }
                                                },
                                                required: ['artifactId']
                                            }
                                        },
                                        prerequisites: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    artifactId: { type: 'string' },
                                                    crudOperations: { type: 'string' }
                                                },
                                                required: ['artifactId']
                                            }
                                        },
                                        completionConditions: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    description: { type: 'string' }
                                                },
                                                required: ['description']
                                            }
                                        },
                                        ifVersion: { type: 'number', description: 'Expected version for optimistic locking' }
                                    },
                                    required: ['taskId']
                                }
                            },
                            {
                                name: 'wbs.listTasks',
                                description: 'List tasks',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            },
                            {
                                name: 'wbs.deleteTask',
                                description: 'Delete task and descendants',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        taskId: { type: 'string', description: 'Task ID' }
                                    },
                                    required: ['taskId']
                                }
                            },
                            {
                                name: 'wbs.moveTask',
                                description: 'Move a task under a different parent task',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        taskId: { type: 'string', description: 'Task ID to move' },
                                        newParentId: { type: 'string', description: 'New parent task ID (omit for root)' }
                                    },
                                    required: ['taskId']
                                }
                            }
                            ,
                            {
                                name: 'wbs.impotTask',
                                description: 'Import multiple tasks',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        tasks: {
                                            type: 'array',
                                            description: 'Array of task objects',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    title: { type: 'string', description: 'Task title (required)' },
                                                    description: { type: 'string', description: 'Task description' },
                                                    parentId: { type: 'string', description: 'Parent task ID (omit for root task)' },
                                                    assignee: { type: 'string', description: 'Assignee user name' },
                                                    estimate: { type: 'string', description: 'Estimated effort (text)' },
                                                    goal: { type: 'string', description: 'Goal or intent for the task' },
                                                    deliverables: {
                                                        type: 'array',
                                                        description: 'Deliverable artifact links',
                                                        items: {
                                                            type: 'object',
                                                            properties: {
                                                                artifactId: { type: 'string', description: 'Artifact identifier' },
                                                                crudOperations: { type: 'string', description: 'CRUD operations allowed for the artifact' },
                                                                crud: { type: 'string', description: 'Deprecated alias for crudOperations' }
                                                            },
                                                            required: ['artifactId']
                                                        }
                                                    },
                                                    prerequisites: {
                                                        type: 'array',
                                                        description: 'Prerequisite artifact links',
                                                        items: {
                                                            type: 'object',
                                                            properties: {
                                                                artifactId: { type: 'string', description: 'Artifact identifier' },
                                                                crudOperations: { type: 'string', description: 'CRUD operations allowed for the artifact' }
                                                            },
                                                            required: ['artifactId']
                                                        }
                                                    },
                                                    completionConditions: {
                                                        type: 'array',
                                                        description: 'Completion condition descriptions',
                                                        items: {
                                                            type: 'object',
                                                            properties: {
                                                                description: { type: 'string', description: 'Condition detail' }
                                                            },
                                                            required: ['description']
                                                        }
                                                    }
                                                },
                                                required: ['title']
                                            }
                                        }
                                    },
                                    required: ['tasks']
                                }
                            },
                            {
                                name: 'artifacts.listArtifacts',
                                description: 'List artifacts',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            },
                            {
                                name: 'artifacts.getArtifact',
                                description: 'Get a specific artifact by ID',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        artifactId: { type: 'string', description: 'Artifact ID' }
                                    },
                                    required: ['artifactId']
                                }
                            },
                            {
                                name: 'artifacts.createArtifact',
                                description: 'Create a new artifact',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        title: { type: 'string', description: 'Artifact title' },
                                        uri: { type: 'string', description: 'File path or URI' },
                                        description: { type: 'string', description: 'Artifact description' }
                                    },
                                    required: ['title']
                                }
                            },
                            {
                                name: 'artifacts.updateArtifact',
                                description: 'Update an existing artifact',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        artifactId: { type: 'string', description: 'Artifact ID' },
                                        title: { type: 'string', description: 'Artifact title' },
                                        uri: { type: 'string', description: 'File path or URI' },
                                        description: { type: 'string', description: 'Artifact description' },
                                        ifVersion: { type: 'number', description: 'Expected version for optimistic locking' }
                                    },
                                    required: ['artifactId']
                                }
                            },
                            {
                                name: 'artifacts.deleteArtifact',
                                description: 'Delete a artifact',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        artifactId: { type: 'string', description: 'Artifact ID' }
                                    },
                                    required: ['artifactId']
                                }
                            }
                        ]
                    }
                };

            case 'tools/call':
                // 理由: ツール名ごとに個別ハンドラへ分岐
                const toolResult = await this.handleToolCall(params);
                return {
                    jsonrpc: '2.0',
                    id,
                    result: toolResult
                };

            case 'ping':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {}
                };

            case 'resources/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        resources: []
                    }
                };

            case 'prompts/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        prompts: []
                    }
                };

            default:
                // 未知のメソッドはエラー応答
                return {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`
                    }
                };
        }
    }

    /**
     * 通知処理
     * JSON-RPC通知のメソッドごとにログ出力等を行う
     * なぜ必要か: クライアントからの状態通知やイベントを受けてサーバ側で処理するため
     * @param notification 通知オブジェクト
     */
    private async handleNotification(notification: JsonRpcNotification) {
        const { method } = notification;




    // 不要なJSDocコメント・空行を削除
    }

    /**
     * タスク存在確認・取得処理
     * 指定IDのタスクが存在すれば返し、なければエラーを返す
     * なぜ必要か: タスク更新時に存在チェック・楽観ロック用バージョン取得のため
     * @param taskId タスクID
     * @returns タスクまたはエラー
     */
    private async getTaskForUpdate(taskId: string) {
        const task = await this.repo.getTask(taskId);
        if (!task) {
            return {
                error: {
                    content: [{
                        type: 'text',
                        text: `❌ Task not found: ${taskId}`
                    }]
                }
            };
        }
        return { task };
    }

    /**
     * 楽観ロック用バージョン検証処理
     * バージョン不一致時はエラーを返す
     * なぜ必要か: 複数ユーザー編集時の競合検出・整合性維持のため
     * @param args 更新引数
     * @param currentTask 現在のタスク
     * @returns エラー応答またはnull
     */
    private validateTaskVersion(args: any, currentTask: any) {
        if (args.ifVersion !== undefined && currentTask.version !== args.ifVersion) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Task has been modified by another user. Expected version ${args.ifVersion}, but current version is ${currentTask.version}`
                }]
            };
        }
        return null;
    }

    /**
     * タスク更新オブジェクト生成処理
     * 更新引数と現在のタスクから更新用オブジェクトを生成する
     * なぜ必要か: DB更新時に必要な差分のみを安全にまとめるため
     * @param args 更新引数
     * @param currentTask 現在のタスク
     * @returns 更新オブジェクト
     */
    private buildTaskUpdate(args: any, currentTask: any) {
        return {
            title: args.title !== undefined ? args.title : currentTask.title,
            description: args.description !== undefined ? args.description : currentTask.description,
            assignee: args.assignee !== undefined ? args.assignee : currentTask.assignee,
            status: args.status !== undefined ? args.status : currentTask.status,
            estimate: args.estimate !== undefined ? args.estimate : currentTask.estimate,
            goal: args.goal !== undefined ? args.goal : currentTask.goal,
            deliverables: Array.isArray(args.deliverables)
                ? args.deliverables.map((item: any) => ({
                    artifactId: item?.artifactId,
                    crudOperations: item?.crudOperations ?? item?.crud ?? null
                }))
                : undefined,
            prerequisites: Array.isArray(args.prerequisites)
                ? args.prerequisites.map((item: any) => ({
                    artifactId: item?.artifactId,
                    crudOperations: item?.crudOperations ?? item?.crud ?? null
                }))
                : undefined,
            completionConditions: Array.isArray(args.completionConditions)
                ? args.completionConditions
                    .filter((item: any) => typeof item?.description === 'string' && item.description.trim().length > 0)
                    .map((item: any) => ({ description: item.description.trim() }))
                : undefined,
            ifVersion: args.ifVersion
        };
    }

    /**
     * タスク更新処理
     * 指定IDのタスクをDBで更新し、結果を返す
     * なぜ必要か: クライアントからのタスク編集・保存要求に応えるため
     * @param args タスク更新引数
     * @returns ツールレスポンス
     */
    private async handleUpdateTask(args: any) {
        try {
            const taskResult = await this.getTaskForUpdate(args.taskId);
            if (taskResult.error) {
                return taskResult.error;
            }

            const currentTask = taskResult.task;
            const versionError = this.validateTaskVersion(args, currentTask);
            if (versionError) {
                return versionError;
            }

            const updateData = this.buildTaskUpdate(args, currentTask);
            const updatedTask = await this.repo.updateTask(args.taskId, updateData);

            return {
                content: [{
                    type: 'text',
                    text: `✅ Task updated successfully!\n\n${JSON.stringify(updatedTask, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to update task: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * タスク一覧取得処理
     * 指定プロジェクトIDのタスク一覧をDBから取得し、ツールレスポンスで返す
     * なぜ必要か: クライアントからのタスク一覧表示要求に応えるため
     * @param args タスクリスト引数
     * @returns ツールレスポンス
     */
    private async handleListTasks(args: any) {
        try {
            const tasks = await this.repo.listTasks();
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(tasks, null, 2)
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * タスク作成処理 (ツール呼び出しから)
     * @param args 引数 (title, description, parentId, assignee, estimate, goal)
     * @returns ツールレスポンス（作成されたタスクのJSONを含む）
     */
    private async handleCreateTask(args: any) {
        try {
            const task = await this.repo.createTask(
                args.title,
                args.description ?? '',
                args.parentId ?? null,
                args.assignee ?? null,
                args.estimate ?? null,
                args.goal ?? null,
                {
                    deliverables: Array.isArray(args.deliverables) ? args.deliverables.map((item: any) => ({
                        artifactId: item?.artifactId,
                        crudOperations: item?.crudOperations ?? item?.crud ?? null
                    })) : [],
                    prerequisites: Array.isArray(args.prerequisites) ? args.prerequisites.map((item: any) => ({
                        artifactId: item?.artifactId,
                        crudOperations: item?.crudOperations ?? item?.crud ?? null
                    })) : [],
                    completionConditions: Array.isArray(args.completionConditions)
                        ? args.completionConditions
                            .filter((item: any) => typeof item?.description === 'string' && item.description.trim().length > 0)
                            .map((item: any) => ({ description: item.description.trim() }))
                        : []
                }
            );
            return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to create task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }

    /**
     * タスク取得処理 (ツール呼び出しから)
     * @param args 引数 (taskId)
     * @returns ツールレスポンス（取得したタスクのJSON、未検出時はエラーメッセージ）
     */
    private async handleGetTask(args: any) {
        try {
            const task = await this.repo.getTask(args.taskId);
            if (!task) {
                return { content: [{ type: 'text', text: `❌ Task not found: ${args.taskId}` }] };
            }
            return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to get task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }

    /**
     * タスク削除処理
     * 指定IDのタスクと子タスクを削除し、結果メッセージを返す
     * なぜ必要か: クライアントからの削除要求をDB操作に接続するため
     * @param args 削除引数（taskId）
     * @returns ツールレスポンス
     */
    private async handleDeleteTask(args: any) {
        try {
            const deleted = await this.repo.deleteTask(args.taskId);
            if (!deleted) {
                return {
                    content: [{
                        type: 'text',
                        text: `❌ Task not found: ${args.taskId}`
                    }]
                };
            }
            return {
                content: [{
                    type: 'text',
                    text: `✅ Task deleted successfully!\n\nID: ${args.taskId}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to delete task: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }
    // project deletion removed: projects table/operations are no longer supported


    /**
     * タスク移動処理
     * 指定タスクの親タスクを変更し、結果メッセージを返す
     * なぜ必要か: クライアントからのドラッグ&ドロップ操作で親子関係を付け替える要求に応えるため
     * @param args 移動引数
     * @returns ツールレスポンス
     */
    private async handleMoveTask(args: any) {
        try {
            const task = await this.repo.moveTask(args.taskId, args.newParentId ?? null);
            return {
                content: [{
                    type: 'text',
                    text: `✅ Task moved successfully!\n\n${JSON.stringify(task, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ Failed to move task: ${error instanceof Error ? error.message : String(error)}`
                }]
            };
        }
    }

    /**
     * 複数タスク一括登録ツールハンドラ
     * @param args 引数 (projectId, tasks)
     * @returns ツールレスポンス
     */
    private async handleImpotTask(args: any) {
        try {
            const tasks = Array.isArray(args.tasks) ? args.tasks : [];
            const created = await this.repo.importTasks(tasks);
            return {
                content: [{ type: 'text', text: JSON.stringify(created, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Failed to import tasks: ${error instanceof Error ? error.message : String(error)}` }]
            };
        }
    }

    /**
     * 成果物一覧取得ハンドラ
     * 成果物一覧をJSONとして返す
     * なぜ必要か: ツリービュー表示用に成果物一覧を取得するため
     * @param args 引数（省略可能）
     * @returns ツールレスポンス
     */
    private async handleListArtifacts(args: any) {
        try {
            const artifacts = await this.repo.listArtifacts();
            return {
                content: [{ type: 'text', text: JSON.stringify(artifacts, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Failed to list artifacts: ${error instanceof Error ? error.message : String(error)}` }]
            };
        }
    }

    /**
     * 成果物取得ハンドラ
     * 指定IDの成果物をJSONとして返す
     * なぜ必要か: 成果物詳細画面で表示するため
     * @param args 引数（artifactId）
     * @returns ツールレスポンス
     */
    private async handleGetArtifact(args: any) {
        try {
            const artifact = await this.repo.getArtifact(args.artifactId);
            if (!artifact) {
                return {
                    content: [{ type: 'text', text: `❌ Artifact not found: ${args.artifactId}` }]
                };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Failed to get artifact: ${error instanceof Error ? error.message : String(error)}` }]
            };
        }
    }

    /**
     * 成果物作成ハンドラ
     * 成果物を新規登録し、結果を返す
     * なぜ必要か: 成果物管理からの作成要求に応えるため
     * @param args 引数（title, uri, description）
     * @returns ツールレスポンス
     */
    private async handleCreateArtifact(args: any) {
        try {
            const artifact = await this.repo.createArtifact(
                args.title,
                args.uri ?? null,
                args.description ?? null
            );
            return {
                content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Failed to create artifact: ${error instanceof Error ? error.message : String(error)}` }]
            };
        }
    }

    /**
     * 成果物更新ハンドラ
     * 既存成果物を更新し、結果を返す
     * なぜ必要か: 成果物情報の編集をサーバへ反映するため
     * @param args 引数（artifactId, title, uri, description, ifVersion）
     * @returns ツールレスポンス
     */
    private async handleUpdateArtifact(args: any) {
        try {
            const artifact = await this.repo.updateArtifact(args.artifactId, {
                title: args.title,
                uri: args.uri ?? null,
                description: args.description ?? null,
                ifVersion: args.ifVersion
            });
            return {
                content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Failed to update artifact: ${error instanceof Error ? error.message : String(error)}` }]
            };
        }
    }

    /**
     * 成果物削除ハンドラ
     * 指定成果物を削除し、結果メッセージを返す
     * なぜ必要か: 成果物管理からの削除要求に応えるため
     * @param args 引数（artifactId）
     * @returns ツールレスポンス
     */
    private async handleDeleteArtifact(args: any) {
        try {
            const deleted = await this.repo.deleteArtifact(args.artifactId);
            if (!deleted) {
                return {
                    content: [{ type: 'text', text: `❌ Artifact not found: ${args.artifactId}` }]
                };
            }
            return {
                content: [{ type: 'text', text: `✅ Artifact deleted successfully!\n\nID: ${args.artifactId}` }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `❌ Failed to delete artifact: ${error instanceof Error ? error.message : String(error)}` }]
            };
        }
    }

    /**
     * ツール呼び出し分岐処理
     * ツール名ごとに各ハンドラへ処理を振り分ける
     * なぜ必要か: クライアントからの各種API呼び出しを柔軟に拡張・管理するため
     * @param params ツール呼び出しパラメータ
     * @returns Promise<any>
     */
    private async handleToolCall(params: any) {
        const { name, arguments: args = {} } = params ?? {};

        console.error(`[MCP Server] Tool call: ${name}`, args);

        // ツール名ごとに個別ハンドラへ分岐
        // 理由: 新規ツール追加時の拡張性・保守性向上のため
        switch (name) {
            case 'wbs.createTask':
                return this.handleCreateTask(args);
            case 'wbs.getTask':
                return this.handleGetTask(args);
            case 'wbs.updateTask':
                return this.handleUpdateTask(args);
            case 'wbs.listTasks':
                return this.handleListTasks(args);
            case 'wbs.deleteTask':
                return this.handleDeleteTask(args);
            case 'wbs.moveTask':
                return this.handleMoveTask(args);
            case 'wbs.impotTask':
                return this.handleImpotTask(args);
            case 'artifacts.listArtifacts':
                return this.handleListArtifacts(args);
            case 'artifacts.getArtifact':
                return this.handleGetArtifact(args);
            case 'artifacts.createArtifact':
                return this.handleCreateArtifact(args);
            case 'artifacts.updateArtifact':
                return this.handleUpdateArtifact(args);
            case 'artifacts.deleteArtifact':
                return this.handleDeleteArtifact(args);
            default:
                // 未知のツール名はエラー
                throw new Error(`Unknown tool: ${name}`);
        }
    }


    /**
     * レスポンス送信処理
     * JSON-RPCレスポンスを標準出力へ送信する
     * なぜ必要か: クライアントへAPI応答を返し、UIを更新させるため
     * @param response レスポンスオブジェクト
     */
    private sendResponse(response: JsonRpcResponse) {
        const responseStr = JSON.stringify(response);
        console.error(`[MCP Server] Sending: ${responseStr}`);
        process.stdout.write(responseStr + '\n');
    }
}

// Start the MCP server once the database is ready
(async () => {
    console.error('[MCP Server] Starting stdio MCP server...');
    // 理由: DB初期化・サーバ起動失敗時もエラー通知し、異常終了させる
    try {
        await initializeDatabase();
        new StdioMCPServer();
    } catch (error) {
        console.error('[MCP Server] Failed to start server:', error);
        process.exit(1);
    }
})();