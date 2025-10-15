import * as vscode from 'vscode';

/* eslint-disable jsdoc/require-jsdoc */

/**
 * タスク情報（ビュー内利用）
 */
interface Task {
    id: string;
    parent_id?: string;
    title?: string;
    status?: string;
}

/**
 * ツリー表示用の TreeItem
 * View 表現の責務のみを持つ
 */
export class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemId: string,
        public readonly contextValue: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly description?: string,
        // task は any として受け取り、view 側の責務に限定する
        public readonly task?: any
    ) {
        super(label, collapsibleState);
        this.tooltip = description;
        this.id = itemId;

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
            this.command = {
                title: 'Open Task Details',
                command: 'wbsTree.openTask',
                arguments: [this]
            };
        }
    }
}
