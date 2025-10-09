import * as vscode from 'vscode';
import { MCPClient } from '../mcpClient';

interface Task {
    id: string;
    project_id: string;
    parent_id?: string;
    title: string;
    description?: string;
    assignee?: string;
    status: string;
    estimate?: string;
    version: number;
    children?: Task[];
}

interface Project {
    id: string;
    title: string;
    description?: string;
    version: number;
    tasks?: Task[];
}

/**
 * WBSツリープロバイダクラス
 * プロジェクト・タスクのツリー表示・データ取得を行う
 */
export class WBSTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private mcpClient: MCPClient;

    /**
     * コンストラクタ
     * MCPクライアントを受け取り初期化する
     * @param mcpClient MCPクライアント
     */
    constructor(mcpClient: MCPClient) {
        this.mcpClient = mcpClient;
    }

    /**
     * ツリーリフレッシュ処理
     * ツリーデータの再取得・再描画を行う
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * ツリーアイテム取得処理
     * 指定要素のTreeItemを返す
     * @param element ツリー要素
     * @returns ツリーアイテム
     */
    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 子要素取得処理
     * 指定要素の子要素（プロジェクト・タスク）を取得し返す
     * @param element ツリー要素
     * @returns Promise<TreeItem[]>
     */
    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            // Root level - show projects
            return this.getProjects();
        } else if (element.contextValue === 'project') {
            // Show tasks for a project
            return this.getTasksForProject(element.itemId);
        } else if (element.contextValue === 'task') {
            // Show child tasks
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
            return [];
        }
        return [];
    }

    /**
     * プロジェクト一覧取得処理
     * MCPクライアントからプロジェクト一覧を取得し、TreeItem配列で返す
     * @returns プロジェクトのTreeItem配列
     */
    private async getProjects(): Promise<TreeItem[]> {
        try {
            const projects = await this.mcpClient.listProjects();
            return projects.map(project => new TreeItem(
                project.title,
                project.id,
                'project',
                vscode.TreeItemCollapsibleState.Collapsed,
                project.description
            ));
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch projects: ${error}`);
            return [];
        }
    }

    /**
     * タスク一覧取得処理
     * 指定プロジェクトIDのタスク一覧を取得し、TreeItem配列で返す
     * @param projectId プロジェクトID
     * @returns Promise<TreeItem[]>
     */
    private async getTasksForProject(projectId: string): Promise<TreeItem[]> {
        try {
            const tasks = await this.mcpClient.listTasks(projectId);
            return tasks.map(task => new TreeItem(
                task.title,
                task.id,
                'task',
                task.children && task.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                this.getTaskDescription(task),
                task
            ));
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch tasks: ${error}`);
            return [];
        }
    }

    /**
     * タスク説明生成処理
     * タスクの状態・担当・見積もりを文字列化して返す
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
 */
class TreeItem extends vscode.TreeItem {
    /**
     * コンストラクタ
     * ラベル・ID・種別・状態・説明・タスク情報を受け取り初期化する
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
        this.tooltip = description;
        this.id = itemId;

        // Set icons based on context
        if (contextValue === 'project') {
            this.iconPath = new vscode.ThemeIcon('project');
        } else if (contextValue === 'task') {
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
