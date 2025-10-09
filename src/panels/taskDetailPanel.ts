import * as vscode from 'vscode';
import { MCPClient } from '../mcpClient';

interface Task {
    id: string;
    project_id: string;
    parent_id?: string;
    title: string;
    description?: string;
    goal?: string;
    assignee?: string;
    status: string;
    estimate?: string;
    version: number;
}

/**
 *
 */
export class TaskDetailPanel {
    public static currentPanel: TaskDetailPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _taskId: string;
    private _task: Task | null = null;
    private mcpClient: MCPClient;

    /**
     *
     * @param extensionUri
     * @param taskId
     * @param mcpClient
     */
    public static createOrShow(extensionUri: vscode.Uri, taskId: string, mcpClient: MCPClient) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

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
     *
     * @param panel
     * @param extensionUri
     * @param taskId
     * @param mcpClient
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, taskId: string, mcpClient: MCPClient) {
        this._panel = panel;
        this._taskId = taskId;
        this.mcpClient = mcpClient;

        this.loadTask();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'save':
                        this.saveTask(message.data);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     *
     * @param taskId
     */
    private async updateTask(taskId: string) {
        this._taskId = taskId;
        await this.loadTask();
    }

    /**
     *
     */
    private async loadTask() {
        try {
            this._task = await this.mcpClient.getTask(this._taskId);
            if (this._task) {
                this._panel.title = `Task: ${this._task.title}`;
                this._panel.webview.html = this.getHtmlForWebview(this._task);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load task: ${error}`);
        }
    }

    /**
     * Builds update object from form data
     * @param data - Form data
     * @returns Update object
     */
    private buildUpdateObject(data: any): any {
        const updates: any = {};
        if (data.title !== undefined) updates.title = data.title;
        if (data.description !== undefined) updates.description = data.description;
        if (data.goal !== undefined) updates.goal = data.goal;
        if (data.assignee !== undefined) updates.assignee = data.assignee;
        if (data.status !== undefined) updates.status = data.status;
        if (data.estimate !== undefined) updates.estimate = data.estimate;
        updates.ifVersion = this._task?.version;
        return updates;
    }

    /**
     * Handles successful task update
     */
    private handleUpdateSuccess(): void {
        vscode.window.showInformationMessage('Task updated successfully');
        this.loadTask();
        vscode.commands.executeCommand('wbsTree.refresh');
    }

    /**
     * Handles update conflict
     */
    private async handleUpdateConflict(): Promise<void> {
        const choice = await vscode.window.showWarningMessage(
            'Task has been modified by another user. Your version is outdated.',
            'Reload',
            'Cancel'
        );
        if (choice === 'Reload') {
            this.loadTask();
        }
    }

    /**
     * @param data - Form data to save
     */
    private async saveTask(data: any) {
        try {
            const updates = this.buildUpdateObject(data);
            const result = await this.mcpClient.updateTask(this._taskId, updates);
            
            if (result.success) {
                this.handleUpdateSuccess();
            } else if (result.conflict) {
                await this.handleUpdateConflict();
            } else {
                vscode.window.showErrorMessage(`Failed to update task: ${result.error}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save task: ${error}`);
        }
    }



    /**
     *
     * @param task
     * @returns string
     */
    private getHtmlForWebview(task: Task): string {
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
    </style>
</head>
<body>
    <h2>Task Details</h2>
    <form id="taskForm">
        <div class="form-group">
            <label for="title">Title *</label>
            <input type="text" id="title" name="title" required>
        </div>

        <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description"></textarea>
        </div>

        <div class="form-group">
            <label for="goal">Goal</label>
            <textarea id="goal" name="goal"></textarea>
        </div>

        <div class="form-group">
            <label for="assignee">Assignee</label>
            <input type="text" id="assignee" name="assignee">
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
            <input type="text" id="estimate" name="estimate" placeholder="e.g., 3d, 5h">
        </div>

        <div class="form-group readonly">
            <label>Task ID</label>
            <input type="text" value="${task.id}" readonly>
        </div>

        <div class="form-group readonly">
            <label>Version</label>
            <input type="text" value="${task.version}" readonly>
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

        // Initialize form fields with task data
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('title').value = taskData.title || '';
            document.getElementById('description').value = taskData.description || '';
            document.getElementById('goal').value = taskData.goal || '';
            document.getElementById('assignee').value = taskData.assignee || '';
            document.getElementById('status').value = taskData.status || 'pending';
            document.getElementById('estimate').value = taskData.estimate || '';
        });

        // Save function
        function saveTask() {
            const formData = {
                title: document.getElementById('title').value,
                description: document.getElementById('description').value,
                goal: document.getElementById('goal').value,
                assignee: document.getElementById('assignee').value,
                status: document.getElementById('status').value,
                estimate: document.getElementById('estimate').value
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
     *
     * @param text
     * @returns string
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
     *
     */
    public dispose() {
        TaskDetailPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
