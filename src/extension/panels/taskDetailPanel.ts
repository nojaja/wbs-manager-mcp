
// VSCode API
import * as vscode from 'vscode';
// MCPクライアント（API通信・管理用）
import { MCPClient, TaskArtifactAssignment, TaskCompletionCondition, Artifact } from '../mcpClient';

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
    private mcpClient: MCPClient;

    /**
     * パネル生成・表示処理
     * 既存パネルがあれば再利用し、なければ新規作成してタスク詳細を表示する
     * なぜ必要か: 複数タブを乱立させず、1つの詳細パネルでタスク編集を集中管理するため
     * @param extensionUri 拡張機能のURI
     * @param taskId タスクID
     * @param mcpClient MCPクライアント
     */
    public static createOrShow(extensionUri: vscode.Uri, taskId: string, mcpClient: MCPClient) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 既存パネルがあれば再利用し、タスクIDを更新
        // 理由: 複数パネル生成による混乱・リソース浪費を防ぐため
        if (TaskDetailPanel.currentPanel) {
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
                localResourceRoots: [extensionUri]
            }
        );

        TaskDetailPanel.currentPanel = new TaskDetailPanel(panel, extensionUri, taskId, mcpClient);
    }

    /**
     * コンストラクタ
     * Webviewパネル・タスクID・MCPクライアントを受け取り初期化する
     * なぜ必要か: パネルの状態・タスク情報・API通信を一元管理するため
     * @param panel Webviewパネル
     * @param extensionUri 拡張機能のURI
     * @param taskId タスクID
     * @param mcpClient MCPクライアント
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, taskId: string, mcpClient: MCPClient) {
        this._panel = panel;
        this._taskId = taskId;
        this.mcpClient = mcpClient;

        this.loadTask();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                // 受信メッセージのコマンド種別で処理分岐
                // 理由: 複数コマンド拡張時の可読性・保守性向上のため
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
        this._taskId = taskId;
        await this.loadTask();
    }

    /**
     * タスク読込処理
     * タスク情報をMCPクライアントから取得し、Webviewに反映する
     * なぜ必要か: 詳細画面表示時に常に最新のタスク情報を取得するため
     */
    private async loadTask() {
        try {
            // 理由: タスク取得失敗時もエラー通知し、UIの不整合を防ぐ
            this._task = await this.mcpClient.getTask(this._taskId);
            if (this._task) {
                this._panel.title = `Task: ${this._task.title}`;
                // Fetch project artifacts for suggestion list (minimal change)
                let artifacts: Artifact[] = [];
                try {
                    // 処理概要: サジェスト用の成果物一覧を取得（失敗しても機能継続）
                    // 実装理由: 主要機能（詳細表示/編集）を阻害しない非必須データのため
                    artifacts = await this.mcpClient.listArtifacts();
                } catch (e) {
                    // ignore and continue without suggestions
                }
                this._panel.webview.html = this.getHtmlForWebview(this._task, artifacts);
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
        try {
            // 理由: サーバ更新失敗時もエラー通知し、UIの不整合を防ぐ
            const updates = this.buildUpdateObject(data);
            const result = await this.mcpClient.updateTask(this._taskId, updates);

            // 更新成功時
            if (result.success) {
                this.handleUpdateSuccess();
                // 楽観ロック競合時
            } else if (result.conflict) {
                await this.handleUpdateConflict();
                // その他エラー時
            } else {
                vscode.window.showErrorMessage(`Failed to update task: ${result.error}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save task: ${error}`);
        }
    }



    /**
     * 成果物割当のテキスト整形
    * 割当配列をartifactTitle[:CRUD]形式の改行区切り文字列へ変換する
    * なぜ必要か: Webviewフォームへの初期値表示と編集容易性を両立させるため
     * @param assignments 成果物割当
     * @returns 改行区切り文字列
     */
    private formatArtifactAssignments(assignments?: TaskArtifactAssignment[]): string {
        if (!Array.isArray(assignments) || assignments.length === 0) {
            return '';
        }

        return assignments
            .slice()
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((assignment) => {
                const artifactTitle = assignment.artifact?.title || assignment.artifact_id || assignment.artifact?.id || '';
                const crud = assignment.crudOperations ? `:${assignment.crudOperations}` : '';
                return `${artifactTitle}${crud}`;
            })
            .join('\n');
    }

    /**
     * 成果物割当のサマリー生成
    * 割当のID/CRUD/タイトル/URIを人が読みやすい1行文字列の配列にする
    * なぜ必要か: 詳細入力欄とは別に、視認性の高い概要表示を提供するため
     * @param assignments 成果物割当
     * @returns 人が読みやすいサマリー
     */
    private summarizeArtifactAssignments(assignments?: TaskArtifactAssignment[]): string[] {
        if (!Array.isArray(assignments) || assignments.length === 0) {
            return [];
        }

        return assignments
            .slice()
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((assignment) => {
                const artifactId = assignment.artifact_id || assignment.artifact?.id || '';
                const crud = assignment.crudOperations ? ` | CRUD: ${assignment.crudOperations}` : '';
                const title = assignment.artifact?.title ? ` | ${assignment.artifact.title}` : '';
                const uri = assignment.artifact?.uri ? ` | ${assignment.artifact.uri}` : '';
                return `${artifactId}${crud}${title}${uri}`.trim();
            });
    }

    /**
     * 完了条件の整形
    * 完了条件配列を改行区切りのテキストに変換する
    * なぜ必要か: Webviewフォームへの初期表示・編集を簡便にするため
     * @param conditions 完了条件
     * @returns 改行区切り文字列
     */
    private formatCompletionConditions(conditions?: TaskCompletionCondition[]): string {
        if (!Array.isArray(conditions) || conditions.length === 0) {
            return '';
        }

        return conditions
            .slice()
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((condition) => condition.description ?? '')
            .filter((description) => description.length > 0)
            .join('\n');
    }

    /**
     * Webview用HTML生成処理
     * タスク情報をもとに詳細画面のHTMLを生成する
     * なぜ必要か: WebviewでリッチなUIを動的に生成するため
     * @param task タスク情報
     * @param artifacts 成果物一覧（サジェストに利用される）
     * @returns HTML文字列
     */
    private getHtmlForWebview(task: Task, artifacts: Artifact[] = []): string {
        const deliverablesText = this.formatArtifactAssignments(task.deliverables);
        const prerequisitesText = this.formatArtifactAssignments(task.prerequisites);
        const completionText = this.formatCompletionConditions(task.completionConditions);
        const deliverablesSummary = this.summarizeArtifactAssignments(task.deliverables);
        const prerequisitesSummary = this.summarizeArtifactAssignments(task.prerequisites);
        const safeTitle = this.escapeHtml(task.title ?? '');
        const safeDescription = this.escapeHtml(task.description ?? '');
        const safeAssignee = this.escapeHtml(task.assignee ?? '');
        const safeEstimate = this.escapeHtml(task.estimate ?? '');
        const safeDeliverablesText = this.escapeHtml(deliverablesText);
        const safePrerequisitesText = this.escapeHtml(prerequisitesText);
        const safeCompletionText = this.escapeHtml(completionText);
        const safeTaskId = this.escapeHtml(task.id);
        const safeVersion = this.escapeHtml(String(task.version));

        // build datalist markup from artifacts so suggestions are available in static HTML
        const datalistHtml = (artifacts || [])
            .map(a => `<option value="${this.escapeHtml(a.title || '')}">${this.escapeHtml(a.id || '')}</option>`)
            .join('');
        const datalistMarkup = `<datalist id="artifactList">${datalistHtml}</datalist>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Detail</title>
    <style>
        body {
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, textarea, select {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            box-sizing: border-box;
        }
        textarea {
            min-height: 80px;
            font-family: var(--vscode-font-family);
        }
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            margin-right: 10px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .readonly {
            opacity: 0.7;
        }
        kbd {
            background: var(--vscode-keybindingLabel-background);
            color: var(--vscode-keybindingLabel-foreground);
            border: 1px solid var(--vscode-keybindingLabel-border);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: monospace;
            font-size: 0.85em;
        }
        .hint {
            margin-top: 4px;
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
        }
        .artifact-list {
            margin: 8px 0 0;
            padding-left: 18px;
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
        }
    </style>
</head>
<body>
    ${datalistMarkup}
    <h2>Task Details</h2>
    <form id="taskForm">
        <div class="form-group">
            <label for="title">Title *</label>
            <input type="text" id="title" name="title" required value="${safeTitle}">
        </div>

        <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description">${safeDescription}</textarea>
        </div>

        

        <div class="form-group">
            <label for="assignee">Assignee</label>
            <input type="text" id="assignee" name="assignee" value="${safeAssignee}">
        </div>

        <div class="form-group">
            <label for="status">Status</label>
            <select id="status" name="status">
                <option value="pending" ${task.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="blocked" ${task.status === 'blocked' ? 'selected' : ''}>Blocked</option>
            </select>
        </div>

        <div class="form-group">
            <label for="estimate">Estimate</label>
            <input type="text" id="estimate" name="estimate" placeholder="e.g., 3d, 5h" value="${safeEstimate}">
        </div>

        <div class="form-group">
            <label for="deliverables">成果物 (artifactId[:CRUD])</label>
            <textarea id="deliverables" name="deliverables" placeholder="artifact-id:CUD">${safeDeliverablesText}</textarea>
            <p class="hint">CRUDは任意です（例: spec-doc:UD）。省略すると参照のみの扱いになります。</p>
            <div style="margin-top:6px; display:flex; gap:6px;">
                <input list="artifactList" id="deliverableSuggest" placeholder="suggest artifact by title or id" style="flex:1" />
                <button type="button" id="addDeliverable">Add</button>
            </div>
            <ul id="deliverablesSummary" class="artifact-list"></ul>
        </div>

        <div class="form-group">
            <label for="prerequisites">前提条件 (artifactId[:CRUD])</label>
            <textarea id="prerequisites" name="prerequisites" placeholder="artifact-id">${safePrerequisitesText}</textarea>
            <p class="hint">このタスクの実行前に必要な成果物を1行ずつ列挙してください。</p>
            <div style="margin-top:6px; display:flex; gap:6px;">
                <input list="artifactList" id="prerequisiteSuggest" placeholder="suggest artifact by title or id" style="flex:1" />
                <button type="button" id="addPrerequisite">Add</button>
            </div>
            <ul id="prerequisitesSummary" class="artifact-list"></ul>
        </div>

        <div class="form-group">
            <label for="completionConditions">完了条件 (1行につき1条件)</label>
            <textarea id="completionConditions" name="completionConditions" placeholder="例: 仕様書のレビュー承認">${safeCompletionText}</textarea>
            <p class="hint">完了条件は記入順に評価されます。</p>
        </div>

        <div class="form-group readonly">
            <label>Task ID</label>
            <input type="text" value="${safeTaskId}" readonly>
        </div>

        <div class="form-group readonly">
            <label>Version</label>
            <input type="text" value="${safeVersion}" readonly>
        </div>

        <button type="submit" title="Save (Ctrl+S)">Save</button>
        <p style="margin-top: 10px; color: var(--vscode-descriptionForeground); font-size: 0.9em;">
            💡 Tip: Press <kbd>Ctrl+S</kbd> to save quickly
        </p>
    </form>

    <script>
        const vscode = acquireVsCodeApi();

        // Task data from server (safely passed as JSON)
        const taskData = ${JSON.stringify(task)};
        const initialDeliverables = ${JSON.stringify(deliverablesText)};
        const initialPrerequisites = ${JSON.stringify(prerequisitesText)};
        const initialCompletionConditions = ${JSON.stringify(completionText)};
        const deliverablesSummary = ${JSON.stringify(deliverablesSummary)};
        const prerequisitesSummary = ${JSON.stringify(prerequisitesSummary)};
        
        // Create title -> id mapping for artifacts
        const artifactTitleToId = new Map();
        if (taskData.deliverables) {
            taskData.deliverables.forEach(d => {
                if (d.artifact && d.artifact.title && d.artifact.id) {
                    artifactTitleToId.set(d.artifact.title, d.artifact.id);
                }
            });
        }
        if (taskData.prerequisites) {
            taskData.prerequisites.forEach(p => {
                if (p.artifact && p.artifact.title && p.artifact.id) {
                    artifactTitleToId.set(p.artifact.title, p.artifact.id);
                }
            });
        }

        // Initialize form fields with task data
        document.addEventListener('DOMContentLoaded', () => {
            console.log('Task Detail Webview loaded2');
            document.getElementById('title').value = taskData.title || '';
            document.getElementById('description').value = taskData.description || '';
            document.getElementById('assignee').value = taskData.assignee || '';
            document.getElementById('status').value = taskData.status || 'pending';
            document.getElementById('estimate').value = taskData.estimate || '';
            document.getElementById('deliverables').value = initialDeliverables;
            document.getElementById('prerequisites').value = initialPrerequisites;
            document.getElementById('completionConditions').value = initialCompletionConditions;

            renderSummary('deliverablesSummary', deliverablesSummary, '成果物はまだ登録されていません。');
            renderSummary('prerequisitesSummary', prerequisitesSummary, '前提条件はまだ登録されていません。');
            // wire add buttons for suggestions
            const addDeliverableBtn = document.getElementById('addDeliverable');
            const deliverableSuggest = document.getElementById('deliverableSuggest');
            if (addDeliverableBtn && deliverableSuggest) {
                addDeliverableBtn.addEventListener('click', () => {
                    const val = (deliverableSuggest.value || '').trim();
                    if (!val) return;
                    const textarea = document.getElementById('deliverables');
                    if (textarea) {
                        textarea.value = (textarea.value ? textarea.value + '\\n' : '') + val;
                        deliverableSuggest.value = '';
                    }
                });
            }

            const addPrereqBtn = document.getElementById('addPrerequisite');
            const prereqSuggest = document.getElementById('prerequisiteSuggest');
            if (addPrereqBtn && prereqSuggest) {
                addPrereqBtn.addEventListener('click', () => {
                    const val = (prereqSuggest.value || '').trim();
                    if (!val) return;
                    const textarea = document.getElementById('prerequisites');
                    if (textarea) {
                        textarea.value = (textarea.value ? textarea.value + '\\n' : '') + val;
                        prereqSuggest.value = '';
                    }
                });
            }
        });

        function renderSummary(elementId, lines, emptyMessage) {
            const container = document.getElementById(elementId);
            if (!container) {
                return;
            }
            container.innerHTML = '';
            if (!Array.isArray(lines) || lines.length === 0) {
                const li = document.createElement('li');
                li.textContent = emptyMessage;
                container.appendChild(li);
                return;
            }
            lines.forEach((line) => {
                const li = document.createElement('li');
                li.textContent = line;
                container.appendChild(li);
            });
        }

        function parseArtifactText(value) {
            return value
                .split('\\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line) => {
                    const parts = line.split(':');
                    const artifactTitleOrId = parts.shift()?.trim() ?? '';
                    const crud = parts.join(':').trim();
                    
                    // Try to convert title to ID, fallback to original value if not found
                    const artifactId = artifactTitleToId.get(artifactTitleOrId) || artifactTitleOrId;
                    
                    return {
                        artifactId,
                        crudOperations: crud.length > 0 ? crud : undefined
                    };
                })
                .filter((entry) => entry.artifactId.length > 0);
        }

        function parseConditionsText(value) {
            return value
                .split('\\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line) => ({ description: line }));
        }

        // Save function
        function saveTask() {
            const deliverables = parseArtifactText(document.getElementById('deliverables').value);
            const prerequisites = parseArtifactText(document.getElementById('prerequisites').value);
            const completionConditions = parseConditionsText(document.getElementById('completionConditions').value);

            const formData = {
                title: document.getElementById('title').value,
                description: document.getElementById('description').value,
                assignee: document.getElementById('assignee').value,
                status: document.getElementById('status').value,
                estimate: document.getElementById('estimate').value,
                deliverables,
                prerequisites,
                completionConditions
            };
            
            console.log('Sending form data:', formData);
            vscode.postMessage({
                command: 'save',
                data: formData
            });
        }

        // Form submit event
        document.getElementById('taskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            saveTask();
        });

        // Ctrl+S keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault(); // Prevent default browser save dialog
                saveTask();
            }
        });
    </script>
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

