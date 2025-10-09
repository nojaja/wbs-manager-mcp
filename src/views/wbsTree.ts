
// VSCode APIをインポート
import * as vscode from 'vscode';
// MCPクライアント（プロジェクト・タスク管理API）をインポート
import { MCPClient } from '../mcpClient';


/**
 * タスク情報を表現するインターフェース
 * プロジェクト管理の各タスクの属性を定義
 */
interface Task {
    id: string; // タスクID
    project_id: string; // 所属プロジェクトID
    parent_id?: string; // 親タスクID（サブタスクの場合）
    title: string; // タイトル
    description?: string; // 詳細説明
    assignee?: string; // 担当者
    status: string; // 状態（例: in-progress, completed）
    estimate?: string; // 見積もり
    version: number; // バージョン
    children?: Task[]; // 子タスク
}

type DropDecision =
    | { kind: 'parent'; parentId: string | null }
    | { kind: 'warning'; message: string }
    | { kind: 'noop' };


/**
 * プロジェクト情報を表現するインターフェース
 * プロジェクトの属性・タスク一覧を定義
 */
interface Project {
    id: string; // プロジェクトID
    title: string; // プロジェクト名
    description?: string; // プロジェクト説明
    version: number; // バージョン
    tasks?: Task[]; // プロジェクト配下のタスク
}


/**
 * WBSツリープロバイダクラス
 * プロジェクト・タスクのツリー表示・データ取得を行う
 * VSCode拡張のエクスプローラ部にWBS（Work Breakdown Structure）を表示するためのメインクラス
 */
export class WBSTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    // ツリーの更新イベント管理用（ツリーの再描画を通知するために必要）
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    // ツリー更新イベント（外部から購読可能）
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // MCPクライアント（API呼び出し用）
    private mcpClient: MCPClient;

    /**
     * コンストラクタ
     * MCPクライアントを受け取り初期化する
     * @param mcpClient MCPクライアント
     * なぜ必要か: API経由でプロジェクト・タスク情報を取得するため
     */
    constructor(mcpClient: MCPClient) {
        this.mcpClient = mcpClient;
    }

    /**
     * ツリーリフレッシュ処理
     * ツリーデータの再取得・再描画を行う
     * なぜ必要か: データ更新時にツリー表示を即時反映するため
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * ツリーアイテム取得処理
     * 指定要素のTreeItemを返す
     * なぜ必要か: VSCode APIがツリー描画時に呼び出す必須メソッド
     * @param element ツリー要素
     * @returns ツリーアイテム
     */
    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 子要素取得処理
     * 指定要素の子要素（プロジェクト・タスク）を取得し返す
     * なぜ必要か: ツリーの階層構造を動的に生成するため
     * @param element ツリー要素
     * @returns Promise<TreeItem[]>
     */
    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            // ルートレベル: プロジェクト一覧を表示
            return this.getProjects();
        } else if (element.contextValue === 'project') {
            // プロジェクト配下: タスク一覧を表示
            return this.getTasksForProject(element.itemId);
        } else if (element.contextValue === 'task') {
            // タスク配下: サブタスク一覧を表示
            if (element.task && element.task.children && element.task.children.length > 0) {
                return element.task.children.map(child => new TreeItem(
                    this.getTaskLabel(child),
                    child.id,
                    'task',
                    child.children && child.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    this.getTaskDescription(child),
                    child
                ));
            }
            // サブタスクがなければ空配列
            return [];
        }
        // その他は空配列
        return [];
    }

    /**
     * プロジェクト一覧取得処理
     * MCPクライアントからプロジェクト一覧を取得し、TreeItem配列で返す
     * なぜ必要か: ツリーのルートにプロジェクトを表示するため
     * @returns プロジェクトのTreeItem配列
     */
    private async getProjects(): Promise<TreeItem[]> {
        try {
            // プロジェクト一覧をAPIから取得
            const projects = await this.mcpClient.listProjects();
            // 各プロジェクトをTreeItemに変換
            return projects.map(project => new TreeItem(
                project.title,
                project.id,
                'project',
                vscode.TreeItemCollapsibleState.Collapsed,
                project.description
            ));
        } catch (error) {
            // エラー時はメッセージ表示し空配列返却
            vscode.window.showErrorMessage(`Failed to fetch projects: ${error}`);
            return [];
        }
    }

    /**
     * タスク一覧取得処理
     * 指定プロジェクトIDのタスク一覧を取得し、TreeItem配列で返す
     * なぜ必要か: プロジェクト配下にタスクを表示するため
     * @param projectId プロジェクトID
     * @returns Promise<TreeItem[]>
     */
    private async getTasksForProject(projectId: string): Promise<TreeItem[]> {
        try {
            // タスク一覧をAPIから取得
            const tasks = await this.mcpClient.listTasks(projectId);
            // 各タスクをTreeItemに変換
            return tasks.map(task => new TreeItem(
                this.getTaskLabel(task),
                task.id,
                'task',
                task.children && task.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                this.getTaskDescription(task),
                task
            ));
        } catch (error) {
            // エラー時はメッセージ表示し空配列返却
            vscode.window.showErrorMessage(`Failed to fetch tasks: ${error}`);
            return [];
        }
    }

    /**
     * タスク追加処理
     * 選択中のプロジェクトまたはタスク配下に新しいタスクを追加する
     * なぜ必要か: ツリー上から直接タスクを追加できるようにするため
     * @param target 選択中のツリーアイテム
     * @returns 作成結果（成功時はタスクIDを含む）
     */
    async createTask(target?: TreeItem): Promise<{ success: boolean; taskId?: string }> {
        const { projectId, parentId } = this.resolveCreationContext(target);

        if (!projectId) {
            vscode.window.showWarningMessage('新しいタスクを追加するには、プロジェクトまたはタスクを選択してください。');
            return { success: false };
        }

        try {
            const response = await this.mcpClient.createTask({
                projectId,
                parentId: parentId ?? null,
                title: 'New Task',
            });
            if (!response.success) {
                if (response.error) {
                    vscode.window.showErrorMessage(`タスクの作成に失敗しました: ${response.error}`);
                }
                return { success: false };
            }

            this.refresh();
            vscode.window.showInformationMessage('新しいタスクを作成しました。');
            return { success: true, taskId: response.taskId };
        } catch (error) {
            vscode.window.showErrorMessage(`タスクの作成中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false };
        }
    }

    /**
     * タスク削除処理
     * 選択されたタスクとその子タスクを削除する
     * なぜ必要か: ツリー上から不要なタスク階層を直接削除できるようにするため
     * @param target 選択中のタスクアイテム
     * @returns 削除結果
     */
    async deleteTask(target?: TreeItem): Promise<{ success: boolean }> {
        if (!target || target.contextValue !== 'task' || !target.task) {
            vscode.window.showWarningMessage('削除するタスクを選択してください。');
            return { success: false };
        }

        const answer = await vscode.window.showWarningMessage(
            '選択したタスクとその子タスクを削除します。よろしいですか？',
            { modal: true },
            '削除'
        );

        if (answer !== '削除') {
            return { success: false };
        }
        try {
            const response = await this.mcpClient.deleteTask(target.task.id);
            if (!response.success) {
                if (response.error) {
                    vscode.window.showErrorMessage(`タスクの削除に失敗しました: ${response.error}`);
                }
                return { success: false };
            }

            this.refresh();
            vscode.window.showInformationMessage('タスクを削除しました。');
            return { success: true };
        } catch (error) {
            vscode.window.showErrorMessage(`タスクの削除中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false };
        }
    }

    /**
     * プロジェクト削除処理
     * 選択されたプロジェクトと配下のタスクを削除する
     * なぜ必要か: UI上から不要なプロジェクトを整理できるようにするため
     * @param target 選択中のプロジェクトアイテム
     * @returns 削除結果
     */
    async deleteProject(target?: TreeItem): Promise<{ success: boolean }> {
        if (!target || target.contextValue !== 'project') {
            vscode.window.showWarningMessage('削除するプロジェクトを選択してください。');
            return { success: false };
        }

        const answer = await vscode.window.showWarningMessage(
            '選択したプロジェクトと配下のタスクを削除します。よろしいですか？',
            { modal: true },
            '削除'
        );

        if (answer !== '削除') {
            return { success: false };
        }

        try {
            const response = await this.mcpClient.deleteProject(target.itemId);
            if (!response.success) {
                if (response.error) {
                    vscode.window.showErrorMessage(`プロジェクトの削除に失敗しました: ${response.error}`);
                }
                return { success: false };
            }

            this.refresh();
            vscode.window.showInformationMessage('プロジェクトを削除しました。');
            return { success: true };
        } catch (error) {
            vscode.window.showErrorMessage(`プロジェクトの削除中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false };
        }
    }

    /**
     * タスク作成先の解決処理
     * 選択ノードに基づきプロジェクトIDと親タスクIDを特定する
     * なぜ必要か: タスク作成時の分岐ロジックを整理し、複雑度を下げるため
     * @param target 選択中のツリーアイテム
     * @returns プロジェクトIDと親タスクID
     */
    private resolveCreationContext(target?: TreeItem): { projectId?: string; parentId?: string } {
        if (!target) {
            return {};
        }
        if (target.contextValue === 'project') {
            return { projectId: target.itemId, parentId: undefined };
        }
        if (target.contextValue === 'task' && target.task) {
            return { projectId: target.task.project_id, parentId: target.task.id };
        }
        return {};
    }

    /**
     * タスクドロップ処理
     * ドラッグ&ドロップで指定されたタスクの親子関係を更新する
     * なぜ必要か: ツリー上でのタスク移動をMCPサーバへ反映するため
     * @param taskId 移動対象タスクID
     * @param target ドロップ先ツリーアイテム
     */
    async handleTaskDrop(taskId: string, target: TreeItem): Promise<void> {
        if (!target) {
            return;
        }

        try {
            const draggedTask = await this.mcpClient.getTask(taskId);
            if (!draggedTask) {
                vscode.window.showErrorMessage('移動対象のタスクを取得できませんでした。');
                return;
            }

            const decision = this.evaluateDropTarget(draggedTask, target);

            if (decision.kind === 'warning') {
                vscode.window.showWarningMessage(decision.message);
                return;
            }

            if (decision.kind === 'noop') {
                return;
            }

            const result = await this.mcpClient.moveTask(taskId, decision.parentId);
            if (result.success) {
                this.refresh();
                vscode.window.showInformationMessage('タスクを移動しました。');
                return;
            }

            if (result.error) {
                vscode.window.showErrorMessage(`タスクの移動に失敗しました: ${result.error}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`タスクの移動中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * タスク木探索処理
     * 指定タスク配下に対象IDが含まれるかを判定する
     * なぜ必要か: ドラッグ対象の子孫に移動しようとした場合に循環を防ぐため
     * @param task タスク
     * @param searchId 探索対象ID
     * @returns 子孫に含まれていればtrue
     */
    private containsTask(task: Task, searchId: string): boolean {
        if (!task.children || task.children.length === 0) {
            return false;
        }
        for (const child of task.children) {
            if (child.id === searchId || this.containsTask(child, searchId)) {
                return true;
            }
        }
        return false;
    }

    /**
     * ドロップ先評価処理
     * ターゲットに応じて移動の可否と新しい親タスクIDを判定する
     * @param draggedTask ドラッグ中のタスク
     * @param target ドロップ先ツリーアイテム
     * @returns 判定結果
     */
    private evaluateDropTarget(draggedTask: Task, target: TreeItem): DropDecision {
        if (target.contextValue === 'project') {
            return this.evaluateProjectDrop(draggedTask, target);
        }

        if (target.contextValue === 'task' && target.task) {
            return this.evaluateTaskDrop(draggedTask, target.task);
        }

        return { kind: 'noop' };
    }

    /**
     * プロジェクトノードへのドロップ評価
     * @param draggedTask ドラッグ中のタスク
     * @param target プロジェクトノード
     * @returns 判定結果
     */
    private evaluateProjectDrop(draggedTask: Task, target: TreeItem): DropDecision {
        if (draggedTask.project_id !== target.itemId) {
            return { kind: 'warning', message: '別プロジェクトへのタスク移動はサポートされていません。' };
        }

        const currentParentId = draggedTask.parent_id ?? null;
        if (currentParentId === null) {
            return { kind: 'noop' };
        }

        return { kind: 'parent', parentId: null };
    }

    /**
     * タスクノードへのドロップ評価
     * @param draggedTask ドラッグ中のタスク
     * @param targetTask ドロップ先タスク
     * @returns 判定結果
     */
    private evaluateTaskDrop(draggedTask: Task, targetTask: Task): DropDecision {
        if (draggedTask.project_id !== targetTask.project_id) {
            return { kind: 'warning', message: '別プロジェクトへのタスク移動はサポートされていません。' };
        }

        if (draggedTask.id === targetTask.id || draggedTask.parent_id === targetTask.id) {
            return { kind: 'noop' };
        }

        if (this.containsTask(draggedTask, targetTask.id)) {
            return { kind: 'warning', message: '子孫タスクの下への移動はできません。' };
        }

        const currentParentId = draggedTask.parent_id ?? null;
        if (currentParentId === targetTask.id) {
            return { kind: 'noop' };
        }

        return { kind: 'parent', parentId: targetTask.id };
    }

    /**
     * タスク説明生成処理
     * タスクの状態・担当・見積もりを文字列化して返す
     * なぜ必要か: ツリー上でタスクの概要を簡潔に表示するため
     * @param task タスク情報
     * @returns 説明文字列
     */
    private getTaskDescription(task: Task): string {
        const parts: string[] = [];
        if (task.status) parts.push(`[${task.status}]`);
        if (task.assignee) parts.push(`@${task.assignee}`);
        if (task.estimate) parts.push(task.estimate);
        return parts.join(' ');
    }

    /**
     * タスクラベル生成処理
     * タスクタイトルが空の場合はIDを表示ラベルとして返す
     * なぜ必要か: 初期状態でタイトル未設定のタスクがツリー上で識別できるようにするため
     * @param task タスク情報
     * @returns 表示用ラベル
     */
    private getTaskLabel(task: Task): string {
        if (task.title && task.title.trim().length > 0) {
            return task.title;
        }
        return task.id;
    }

}


/**
 * ツリーアイテムクラス
 * プロジェクト・タスクのツリー表示用アイテムを表現する
 * なぜ必要か: VSCodeのTreeViewに表示する各ノードの情報・見た目を制御するため
 */
class TreeItem extends vscode.TreeItem {
    /**
     * コンストラクタ
     * ラベル・ID・種別・状態・説明・タスク情報を受け取り初期化する
     * なぜ必要か: ツリー上の各ノードの表示内容・アイコン・ツールチップ等を柔軟に制御するため
     * @param label ラベル
     * @param itemId アイテムID
     * @param contextValue コンテキスト種別
     * @param collapsibleState ツリー折りたたみ状態
     * @param description 説明
     * @param task タスク情報
     */
    constructor(
        public readonly label: string,
        public readonly itemId: string,
        public readonly contextValue: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly description?: string,
        public readonly task?: Task
    ) {
        super(label, collapsibleState);
        // ツールチップに説明を設定
        this.tooltip = description;
        // ノードIDを設定
        this.id = itemId;

        // ノード種別・状態に応じてアイコンを設定
        if (contextValue === 'project') {
            // プロジェクト用アイコン
            this.iconPath = new vscode.ThemeIcon('project');
        } else if (contextValue === 'task') {
            // タスク状態ごとにアイコン切替
            if (task?.status === 'completed') {
                this.iconPath = new vscode.ThemeIcon('check');
            } else if (task?.status === 'in-progress') {
                this.iconPath = new vscode.ThemeIcon('play');
            } else {
                this.iconPath = new vscode.ThemeIcon('circle-outline');
            }
            // タスクノードクリック時に詳細パネルを開くコマンドを設定
            this.command = {
                title: 'Open Task Details',
                command: 'wbsTree.openTask',
                arguments: [this]
            };
        }
    }
}

/**
 * WBSツリードラッグ&ドロップコントローラ
 * ツリー内のタスク移動操作をハンドリングし、WBSTreeProviderへ委譲する
 */
export class WBSTreeDragAndDropController implements vscode.TreeDragAndDropController<TreeItem> {
    readonly dragMimeTypes = ['application/vnd.code.tree.wbsTree'];
    readonly dropMimeTypes = ['application/vnd.code.tree.wbsTree'];

    /**
     * コンストラクタ
     * @param provider ドロップ処理を委譲するWBSツリープロバイダ
     */
    constructor(private readonly provider: WBSTreeProvider) {}

    /**
     * ドラッグ開始処理
     * データ転送にタスクID一覧を格納する
     * @param source ドラッグされたツリーアイテム
     * @param dataTransfer データ転送オブジェクト
     */
    async handleDrag(source: readonly TreeItem[], dataTransfer: vscode.DataTransfer): Promise<void> {
        const taskIds = source
            .filter(item => item.contextValue === 'task')
            .map(item => item.itemId);

        if (taskIds.length === 0) {
            return;
        }

        dataTransfer.set('application/vnd.code.tree.wbsTree', new vscode.DataTransferItem(JSON.stringify(taskIds)));
    }

    /**
     * ドロップ処理
     * データ転送からタスクIDを取得し、プロバイダへ処理を委譲する
     * @param target ドロップ先ツリーアイテム
     * @param dataTransfer データ転送オブジェクト
     */
    async handleDrop(target: TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const item = dataTransfer.get('application/vnd.code.tree.wbsTree');
        if (!item) {
            return;
        }

        let taskIds: string[] = [];
        try {
            const raw = item.value as string | undefined;
            taskIds = raw ? JSON.parse(raw) : [];
        } catch (error) {
            console.error('[WBS Tree] Failed to parse drag data', error);
            return;
        }

        const taskId = taskIds[0];
        if (!taskId || !target) {
            return;
        }

        await this.provider.handleTaskDrop(taskId, target);
    }

    /**
     * リソース解放処理
     * コントローラ破棄時に呼び出される
     */
    dispose(): void {
        // no resources to dispose
    }
}
