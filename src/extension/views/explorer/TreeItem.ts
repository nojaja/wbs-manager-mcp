import * as vscode from 'vscode';

/**
 * ツリー表示用の TreeItem
 * View 表現の責務のみを持つ
 */
export class TreeItem extends vscode.TreeItem {
    /**
     * Create a TreeItem for the explorer view
     * @param label 表示ラベル
     * @param itemId アイテムID
     * @param contextValue コンテキスト値
     * @param collapsibleState 折りたたみ状態
     * @param description 表示のツールチップ
     * @param task 任意のタスクオブジェクト（view責務のみ）
     */
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
