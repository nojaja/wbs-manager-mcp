// Refactored TaskDetailPanel (single export) — uses WebviewPanelBase implementation.
// Keep this file focused on the derived class; common helpers are in WebviewPanelBase.
import * as vscode from 'vscode';
import type { ArtifactClientLike, TaskClientLike } from '../../services/clientContracts';
import { buildUpdateTaskPayload, type UpdateTaskParams } from '../../tasks/taskPayload';
import { WebviewPanelBase } from './WebviewPanelBase';
import type { Task, TaskArtifactAssignment, TaskCompletionCondition, Artifact } from '../../types';

import { MCPTaskClient } from '../../repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../repositories/mcp/artifactClient';


/**
 * Task detail webview panel
 */
export class TaskDetailPanel extends WebviewPanelBase {
    public static currentPanel: TaskDetailPanel | undefined;
    private _taskId: string;
    private _task: Task | null = null;
    private readonly taskClient: MCPTaskClient;
    private readonly artifactClient?: MCPArtifactClient;

    /**
     * Create or show the task detail panel
     * @param extensionUri - extension root URI
     * @param taskId - task id to display
     */
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
                localResourceRoots: ((): vscode.Uri[] => {
                    const roots: vscode.Uri[] = [extensionUri];
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

        TaskDetailPanel.currentPanel = new TaskDetailPanel(panel, extensionUri, taskId);
    }

    /**
     * Private constructor — use createOrShow
     * @param panel - vscode WebviewPanel
     * @param extensionUri - extension root URI
     * @param taskId - task id
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, taskId: string) {
        super(panel, extensionUri);
        this._taskId = taskId;
        this.taskClient = (MCPTaskClient as any).getInstance();
        this.artifactClient = (MCPArtifactClient as any).getInstance();

        this.loadTask();
    }

    /**
     * Update currently displayed task id and reload
     * @param taskId - new task id
     */
    private async updateTask(taskId: string) {
        this._taskId = taskId;
        await this.loadTask();
    }

    /**
     * Load task data and render the webview
     */
    private async loadTask() {
        try {
            this._task = await this.taskClient.getTask(this._taskId);
            if (this._task) {
                this._panel.title = `Task: ${this._task.title}`;
                let artifacts: Artifact[] = [];
                try {
                    if (this.artifactClient) {
                        artifacts = await this.artifactClient.listArtifacts();
                    }
                } catch (e) {
                    // ignore
                }
                this._panel.webview.html = this.buildHtmlForWebview('__TASK_PAYLOAD__', { task: this._task, artifacts }, undefined, `Task: ${this._task.title}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load task: ${error}`);
        }
    }

    /**
     * Build update object for updateTask API
     * @param data - incoming update data
     * @returns UpdateTaskParams
     */
    private buildUpdateObject(data: any): UpdateTaskParams {
        const updates: UpdateTaskParams = {};
        if (data.title !== undefined) updates.title = data.title;
        if (data.description !== undefined) updates.description = data.description;
        if (data.assignee !== undefined) updates.assignee = data.assignee;
        if (data.status !== undefined) updates.status = data.status;
        if (data.estimate !== undefined) updates.estimate = data.estimate;
        if (Array.isArray(data.deliverables)) updates.deliverables = data.deliverables;
        if (Array.isArray(data.prerequisites)) updates.prerequisites = data.prerequisites;
        if (Array.isArray(data.completionConditions)) updates.completionConditions = data.completionConditions;
        updates.ifVersion = this._task?.version;
        return updates;
    }

    /**
     * Handle success after task update
     */
    private handleUpdateSuccess(): void {
        vscode.window.showInformationMessage('Task updated successfully');
        this.loadTask();
        vscode.commands.executeCommand('wbsTree.refresh');
    }

    /**
     * Handle update conflict scenario
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
     * Save task updates received from webview
     * @param data - payload from webview
     */
    private async saveTask(data: any) {
        try {
            const updates = this.buildUpdateObject(data);
            const normalized = buildUpdateTaskPayload(updates);
            const result = await this.taskClient.updateTask(this._taskId, normalized);

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
     * Bundle file name for this panel
     * @returns bundle filename
     */
    protected getBundlePath(): string { return 'task.bundle.js'; }

    /**
     * Handle messages from the webview
     * @param message - message object from webview
     */
    protected onMessage(message: any): void {
        switch (message.command) {
            case 'save':
                this.saveTask(message.data);
                return;
        }
    }


    /**
     * Backwards-compatible wrapper: allow calling getHtmlForWebview(task) or getHtmlForWebview(task, artifacts)
     * @param arg - task object or full payload
     * @param artifacts - optional artifacts array when called with two args
     * @returns HTML string for the webview
     */
    public getHtmlForWebview(arg: any, artifacts?: any) {
        let payload: any;
        if (arg && typeof arg === 'object' && (arg.id !== undefined || arg.title !== undefined || arg.status !== undefined)) {
            payload = { task: arg };
            if (Array.isArray(artifacts)) payload.artifacts = artifacts;
        } else {
            payload = arg ?? {};
            if (artifacts !== undefined) payload.artifacts = artifacts;
        }
        return super.buildHtmlForWebview('__TASK_PAYLOAD__', payload, undefined, 'Task Detail');
    }

    /**
     * Dispose panel and resources
     */
    public dispose() {
        TaskDetailPanel.currentPanel = undefined;
        super.dispose();
    }
}

