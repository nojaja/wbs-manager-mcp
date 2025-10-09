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
 *
 */
export class WBSTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private mcpClient: MCPClient;

    /**
     *
     * @param mcpClient
     */
    constructor(mcpClient: MCPClient) {
        this.mcpClient = mcpClient;
    }

    /**
     *
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     *
     * @param element
     * @returns vscode.TreeItem
     */
    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     *
     * @param element
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
     *
     * @returns Promise<TreeItem[]>
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
     *
     * @param projectId
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
     *
     * @param task
     * @returns string
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
 *
 */
class TreeItem extends vscode.TreeItem {
    /**
     *
     * @param label
     * @param itemId
     * @param contextValue
     * @param collapsibleState
     * @param description
     * @param task
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
