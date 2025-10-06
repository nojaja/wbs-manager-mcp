import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

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

export class TaskDetailPanel {
    public static currentPanel: TaskDetailPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _taskId: string;
    private _task: Task | null = null;
    private serverUrl = 'http://127.0.0.1:8000';

    public static createOrShow(extensionUri: vscode.Uri, taskId: string) {
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

        TaskDetailPanel.currentPanel = new TaskDetailPanel(panel, extensionUri, taskId);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, taskId: string) {
        this._panel = panel;
        this._taskId = taskId;

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

    private async updateTask(taskId: string) {
        this._taskId = taskId;
        await this.loadTask();
    }

    private async loadTask() {
        try {
            this._task = await this.fetchTask(this._taskId);
            if (this._task) {
                this._panel.title = `Task: ${this._task.title}`;
                this._panel.webview.html = this.getHtmlForWebview(this._task);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load task: ${error}`);
        }
    }

    private async saveTask(data: any) {
        try {
            const updates: any = {};
            if (data.title !== undefined) updates.title = data.title;
            if (data.description !== undefined) updates.description = data.description;
            if (data.goal !== undefined) updates.goal = data.goal;
            if (data.assignee !== undefined) updates.assignee = data.assignee;
            if (data.status !== undefined) updates.status = data.status;
            if (data.estimate !== undefined) updates.estimate = data.estimate;
            updates.ifVersion = this._task?.version;

            const result = await this.updateTask_API(this._taskId, updates);
            
            if (result.success) {
                vscode.window.showInformationMessage('Task updated successfully');
                this.loadTask(); // Reload to get updated version
                // Trigger tree refresh
                vscode.commands.executeCommand('wbsTree.refresh');
            } else if (result.conflict) {
                const choice = await vscode.window.showWarningMessage(
                    'Task has been modified by another user. Your version is outdated.',
                    'Reload',
                    'Cancel'
                );
                if (choice === 'Reload') {
                    this.loadTask();
                }
            } else {
                vscode.window.showErrorMessage(`Failed to update task: ${result.error}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save task: ${error}`);
        }
    }

    private async fetchTask(taskId: string): Promise<Task | null> {
        return new Promise((resolve, reject) => {
            http.get(`${this.serverUrl}/api/wbs/getTask/${taskId}`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            resolve(JSON.parse(data));
                        } else {
                            resolve(null);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }

    private async updateTask_API(taskId: string, updates: any): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
        return new Promise((resolve) => {
            const data = JSON.stringify({ taskId, ...updates });
            const options = {
                hostname: '127.0.0.1',
                port: 8000,
                path: '/api/wbs/updateTask',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = http.request(options, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve({ success: true });
                    } else if (res.statusCode === 409) {
                        resolve({ success: false, conflict: true });
                    } else {
                        try {
                            const error = JSON.parse(responseData);
                            resolve({ success: false, error: error.error || 'Unknown error' });
                        } catch {
                            resolve({ success: false, error: 'Request failed' });
                        }
                    }
                });
            });

            req.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });

            req.write(data);
            req.end();
        });
    }

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
    </style>
</head>
<body>
    <h2>Task Details</h2>
    <form id="taskForm">
        <div class="form-group">
            <label for="title">Title *</label>
            <input type="text" id="title" name="title" value="${this.escapeHtml(task.title)}" required>
        </div>

        <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description">${this.escapeHtml(task.description || '')}</textarea>
        </div>

        <div class="form-group">
            <label for="goal">Goal</label>
            <textarea id="goal" name="goal">${this.escapeHtml(task.goal || '')}</textarea>
        </div>

        <div class="form-group">
            <label for="assignee">Assignee</label>
            <input type="text" id="assignee" name="assignee" value="${this.escapeHtml(task.assignee || '')}">
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
            <input type="text" id="estimate" name="estimate" value="${this.escapeHtml(task.estimate || '')}" placeholder="e.g., 3d, 5h">
        </div>

        <div class="form-group readonly">
            <label>Task ID</label>
            <input type="text" value="${task.id}" readonly>
        </div>

        <div class="form-group readonly">
            <label>Version</label>
            <input type="text" value="${task.version}" readonly>
        </div>

        <button type="submit">Save</button>
        <button type="button" id="cancelBtn">Cancel</button>
    </form>

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('taskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = {
                title: document.getElementById('title').value,
                description: document.getElementById('description').value,
                goal: document.getElementById('goal').value,
                assignee: document.getElementById('assignee').value,
                status: document.getElementById('status').value,
                estimate: document.getElementById('estimate').value
            };
            vscode.postMessage({
                command: 'save',
                data: formData
            });
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            // Close panel or reload
            location.reload();
        });
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

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
