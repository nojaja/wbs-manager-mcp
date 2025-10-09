
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
                    child.title,
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
                task.title,
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
        }
    }
}
