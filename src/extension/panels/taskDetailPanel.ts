
// VSCode API
import * as vscode from 'vscode';
// サービスインターフェース
import type { WBSServicePublic } from '../services/wbsService.interface';
import type { TaskArtifactAssignment, TaskCompletionCondition, Artifact } from '../mcp/types';

interface Task {
    id: string;
    parent_id?: string;
    title: string;
    description?: string;
    assignee?: string;
    status: string;
    estimate?: string;
    version: number;
    deliverables?: TaskArtifactAssignment[];
    prerequisites?: TaskArtifactAssignment[];
    completionConditions?: TaskCompletionCondition[];
}

/**
 * タスク詳細パネルクラス
 * タスク詳細のWebview表示・編集・保存を行う
 * なぜ必要か: タスクの詳細情報をリッチなUIで表示・編集できるようにするため
 */
export class TaskDetailPanel {
    public static currentPanel: TaskDetailPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _taskId: string;
    private _task: Task | null = null;
    private readonly wbsService: WBSServicePublic;
    private _extensionUri?: vscode.Uri;

    /**
     * パネル生成・表示処理
     * 既存パネルがあれば再利用し、なければ新規作成してタスク詳細を表示する
     * なぜ必要か: 複数タブを乱立させず、1つの詳細パネルでタスク編集を集中管理するため
    * @param extensionUri 拡張機能のURI
    * @param taskId タスクID
    * @param service WBSService 公開インターフェース
     */
    public static createOrShow(extensionUri: vscode.Uri, taskId: string, service: WBSServicePublic) {
        // 処理名: パネル作成/表示
        // 処理概要: 既存パネルがあれば再利用し、無ければ新規作成して詳細を表示する
        // 実装理由: 同一タスクの複数パネルを防ぎリソース消費を抑えるため
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (TaskDetailPanel.currentPanel) {
            // 処理概要: 既存パネルの再利用
            // 実装理由: ユーザの画面遷移中に複数パネルを生成しないため
            TaskDetailPanel.currentPanel._panel.reveal(column);
            TaskDetailPanel.currentPanel.updateTask(taskId);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'taskDetail',
            'Task Detail',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: ((): vscode.Uri[] => {
                    const roots: vscode.Uri[] = [extensionUri];
                    // Safe-guard: joinPath may be undefined in test mocks
                    const joinPath = (vscode as any)?.Uri?.joinPath;
                    if (typeof joinPath === 'function') {
                        try {
                            roots.push(joinPath(extensionUri, 'dist', 'webview'));
                        } catch {
                            // ignore in test environment
                        }
                    }
                    return roots;
                })()
            }
        );

    TaskDetailPanel.currentPanel = new TaskDetailPanel(panel, extensionUri, taskId, service);
    }

    /**
     * コンストラクタ
     * Webviewパネル・タスクID・WBSServiceを受け取り初期化する
     * なぜ必要か: パネルの状態・タスク情報・API通信を一元管理するため
    * @param panel Webviewパネル
    * @param extensionUri 拡張機能のURI
    * @param taskId タスクID
    * @param service WBSService 公開インターフェース
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, taskId: string, service: WBSServicePublic) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._taskId = taskId;
        this.wbsService = service;

        // 初期ロード
        this.loadTask();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                // 受信メッセージのコマンド種別で処理分岐
                // 処理概要: Webview からのコマンドを解釈して該当処理を呼び出す
                // 実装理由: Webview 側の操作をホスト側で安全に扱うため
                switch (message.command) {
                    case 'save':
                        // 処理概要: フォームからの保存要求を受けて更新処理を実行
                        // 実装理由: Webview→拡張ホスト間で最低限のコマンドAPIに統一
                        this.saveTask(message.data);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * タスク更新処理
     * 指定タスクIDのタスク情報を再取得し、画面を更新する
     * なぜ必要か: 別タブや他ユーザーによる変更を即時反映するため
     * @param taskId タスクID
     */
    private async updateTask(taskId: string) {
        // 処理名: タスク更新（パネル内でのタスク切替）
        // 処理概要: 内部 taskId を更新して再読み込みする
        // 実装理由: 別のタスクを同一パネルで表示する場合に利用するため
        this._taskId = taskId;
        await this.loadTask();
    }

    /**
     * タスク読込処理
     * タスク情報をMCPクライアントから取得し、Webviewに反映する
     * なぜ必要か: 詳細画面表示時に常に最新のタスク情報を取得するため
     */
    private async loadTask() {
        // 処理名: タスク読込
    // 処理概要: WBSService からタスク情報を取得し Webview に反映する
        // 実装理由: 詳細表示時に常に最新の情報を表示するため
        try {
            this._task = await this.wbsService.getTaskApi(this._taskId);
            if (this._task) {
                this._panel.title = `Task: ${this._task.title}`;
                // サジェスト用成果物一覧を取得（オプション）
                let artifacts: Artifact[] = [];
                try {
                    // 処理概要: サジェストデータを取得するが、失敗時は機能継続
                    // 実装理由: サジェストは補助機能であり、取得失敗で主機能を妨げないため
                    artifacts = await this.wbsService.listArtifactsApi();
                } catch (e) {
                    // サジェスト取得失敗時はログを残さず処理を続行
                }
                this._panel.webview.html = this.getHtmlForWebview(this._task, artifacts, this._extensionUri);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load task: ${error}`);
        }
    }

    /**
     * 更新オブジェクト生成処理
     * フォームデータからタスク更新用オブジェクトを生成する
     * なぜ必要か: サーバAPIに渡す更新内容を安全・簡潔にまとめるため
     * @param data フォームデータ
     * @returns 更新オブジェクト
     */
    private buildUpdateObject(data: any): any {
        const updates: any = {};
        // 各フォーム項目が未定義でなければ更新オブジェクトに追加
        // 理由: サーバAPIに不要なフィールド送信を防ぐ
        if (data.title !== undefined) updates.title = data.title;
        if (data.description !== undefined) updates.description = data.description;
        if (data.assignee !== undefined) updates.assignee = data.assignee;
        if (data.status !== undefined) updates.status = data.status;
        if (data.estimate !== undefined) updates.estimate = data.estimate;
        if (Array.isArray(data.deliverables)) updates.deliverables = data.deliverables; // フォームからの配列はそのまま送る
        if (Array.isArray(data.prerequisites)) updates.prerequisites = data.prerequisites; // 同上
        if (Array.isArray(data.completionConditions)) updates.completionConditions = data.completionConditions; // 同上
        updates.ifVersion = this._task?.version;
        return updates;
    }

    /**
     * タスク更新成功時処理
     * 成功メッセージ表示・再読込・ツリーリフレッシュを行う
     * なぜ必要か: ユーザーに成功通知し、画面・ツリーを即時反映するため
     */
    private handleUpdateSuccess(): void {
        vscode.window.showInformationMessage('Task updated successfully');
        this.loadTask();
        vscode.commands.executeCommand('wbsTree.refresh');
    }

    /**
     * 更新競合時処理
     * 他ユーザーによる競合時に警告・再読込を行う
     * なぜ必要か: 楽観ロック失敗時にユーザーへ警告し、再取得を促すため
     */
    private async handleUpdateConflict(): Promise<void> {
        const choice = await vscode.window.showWarningMessage(
            'Task has been modified by another user. Your version is outdated.',
            'Reload',
            'Cancel'
        );
        // ユーザーがReloadを選択した場合のみ再読込
        // 理由: 意図しない再取得を防ぐ
        if (choice === 'Reload') {
            this.loadTask();
        }
    }

    /**
     * タスク保存処理
     * 入力データをもとにタスクを更新し、結果に応じて画面制御する
     * なぜ必要か: 編集内容をサーバに反映し、UI状態を一貫させるため
     * @param data 保存するフォームデータ
     */
    private async saveTask(data: any) {
        // 処理名: タスク保存
        // 処理概要: Webview から送られたフォームデータを整形してサーバへ更新リクエストを送り、結果に応じた UI 操作を行う
        // 実装理由: 編集結果を永続化し、ユーザにフィードバックを与えるため
        try {
            const updates = this.buildUpdateObject(data);
            const result = await this.wbsService.updateTaskApi(this._taskId, updates);

            if (result.success) {
                // 処理概要: 成功時は再読み込みとツリー更新を行う
                // 実装理由: UI を最新状態に保つため
                this.handleUpdateSuccess();
            } else if (result.conflict) {
                // 処理概要: 競合検出時はユーザに選択を促す
                // 実装理由: 楽観ロックによる競合時の適切な対処を促すため
                await this.handleUpdateConflict();
            } else {
                // 処理概要: その他エラーは表示する
                // 実装理由: 利用者に失敗理由を伝えるため
                vscode.window.showErrorMessage(`Failed to update task: ${result.error}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save task: ${error}`);
        }
    }



    // NOTE: formatting and summary helpers removed — webview bundle implements UI parsing/formatting.

    /**
     * Webview用HTML生成処理
     * タスク情報をもとに詳細画面のHTMLを生成する
     * なぜ必要か: WebviewでリッチなUIを動的に生成するため
     * @param task タスク情報
     * @param artifacts 成果物一覧（サジェストに利用される）
     * @param extensionUri
     * @returns HTML文字列
     */
        private getHtmlForWebview(task: Task, artifacts: Artifact[] = [], extensionUri?: vscode.Uri): string {
                // Always load the built webview bundle and inject the initial payload.
                const webview: any = this._panel.webview as any;
                const baseUri: any = (extensionUri ?? this._extensionUri!) as any;
                const joinPath = (vscode as any)?.Uri?.joinPath;
                let scriptUri: any = '/dist/webview/task.bundle.js';
                try {
                    if (typeof joinPath === 'function' && typeof webview?.asWebviewUri === 'function') {
                        const scriptPath = joinPath(baseUri, 'dist', 'webview', 'task.bundle.js');
                        scriptUri = webview.asWebviewUri(scriptPath);
                    }
                } catch {
                    // In test environments without full VS Code API, fall back to relative path
                    scriptUri = '/dist/webview/task.bundle.js';
                }
                const payload = JSON.stringify({ task, artifacts });
                return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Task Detail</title>
    <style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:12px}</style>
</head>
<body>
    <div id="app"></div>
    <script>window.__TASK_PAYLOAD__ = ${payload};</script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
        }

    /**
     * HTMLエスケープ処理
     * テキスト内の危険文字をHTMLエスケープする
     * なぜ必要か: XSS等の脆弱性対策として、ユーザー入力を安全に表示するため
     * @param text 入力テキスト
     * @returns エスケープ済み文字列
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * パネル破棄処理
     * パネル・リソースを破棄し、メモリリークを防ぐ
     * なぜ必要か: Webviewパネルの多重生成・リソースリークを防止するため
     */
    public dispose() {
        TaskDetailPanel.currentPanel = undefined;
        this._panel.dispose();
        // 登録済みリソースを全て破棄
        // 理由: メモリリーク・リソースリークを防ぐ
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

