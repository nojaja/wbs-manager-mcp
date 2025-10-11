import * as vscode from 'vscode';
import { MCPClient, Artifact } from '../mcpClient';

/**
 * プロジェクト成果物ツリープロバイダ
 * 成果物一覧の読み込み・操作を提供する
 */
export class ArtifactTreeProvider implements vscode.TreeDataProvider<ArtifactTreeItem> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ArtifactTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    /**
     * コンストラクタ
     * @param mcpClient MCPクライアント
     */
    constructor(private readonly mcpClient: MCPClient) {}

    /**
     * ツリーの再読込を通知する
     */
    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    /**
     * ツリーアイテム取得処理
     * @param element ツリー項目
     * @returns 入力された項目
     */
    getTreeItem(element: ArtifactTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 子項目取得処理
     * ルートで成果物一覧を読み込む
     * @param element 親項目
     * @returns 子項目配列
     */
    async getChildren(element?: ArtifactTreeItem): Promise<ArtifactTreeItem[]> {
        if (element) {
            return [];
        }

        const artifacts = await this.mcpClient.listArtifacts();
        return artifacts.map((artifact) => new ArtifactTreeItem(artifact));
    }

    /**
     * 成果物作成処理
     * 入力ダイアログから新しい成果物を登録する
    * @returns Promise<void>
     */
    async createArtifact(): Promise<void> {
        const title = await vscode.window.showInputBox({
            prompt: '成果物の名称を入力してください',
            /**
             * 入力値検証
             * @param value 入力値
             * @returns エラーメッセージまたはundefined
             */
            validateInput: (value) => (value.trim().length === 0 ? '名称は必須です。' : undefined)
        });
        if (!title) {
            return;
        }

        const uri = await vscode.window.showInputBox({
            prompt: '関連するファイルパスまたはURI (任意)',
            placeHolder: '例: src/specs/design.md'
        });

        const description = await vscode.window.showInputBox({
            prompt: '成果物の説明 (任意)',
            placeHolder: '例: アプリの画面遷移図'
        });

        const result = await this.mcpClient.createArtifact({
            title: title.trim(),
            uri: uri?.trim() || null,
            description: description?.trim() || null
        });

        if (!result.success) {
            vscode.window.showErrorMessage(result.error ?? '成果物の作成に失敗しました。');
            return;
        }

        vscode.window.showInformationMessage(`成果物「${result.artifact?.title ?? title.trim()}」を作成しました。`);
        this.refresh();
    }

    /**
     * 成果物編集処理
     * 選択中の成果物を編集する
     * @param target 編集対象項目
    * @returns Promise<void>
     */
    async editArtifact(target?: ArtifactTreeItem): Promise<void> {
        if (!target) {
            vscode.window.showWarningMessage('編集する成果物を選択してください。');
            return;
        }

        const { artifact } = target;

        const title = await vscode.window.showInputBox({
            prompt: '成果物の名称を編集',
            value: artifact.title,
            /**
             * 入力値検証
             * @param value 入力値
             * @returns エラーメッセージまたはundefined
             */
            validateInput: (value) => (value.trim().length === 0 ? '名称は必須です。' : undefined)
        });
        if (!title) {
            return;
        }

        const uri = await vscode.window.showInputBox({
            prompt: '関連するファイルパスまたはURI (任意)',
            value: artifact.uri ?? ''
        });

        const description = await vscode.window.showInputBox({
            prompt: '成果物の説明 (任意)',
            value: artifact.description ?? ''
        });

        const result = await this.mcpClient.updateArtifact({
            artifactId: artifact.id,
            title: title.trim(),
            uri: uri?.trim() || null,
            description: description?.trim() || null,
            version: artifact.version
        });

        if (!result.success) {
            if (result.conflict) {
                vscode.window.showWarningMessage('成果物が他の処理で更新されたため再読み込みします。');
            } else {
                vscode.window.showErrorMessage(result.error ?? '成果物の更新に失敗しました。');
            }
            this.refresh();
            return;
        }

        vscode.window.showInformationMessage(`成果物「${result.artifact?.title ?? title.trim()}」を更新しました。`);
        this.refresh();
    }

    /**
     * 成果物削除処理
     * 選択した成果物を削除する
     * @param target 削除対象項目
    * @returns Promise<void>
     */
    async deleteArtifact(target?: ArtifactTreeItem): Promise<void> {
        if (!target) {
            vscode.window.showWarningMessage('削除する成果物を選択してください。');
            return;
        }

        const answer = await vscode.window.showWarningMessage(
            `成果物「${target.artifact.title}」を削除しますか？この操作は取り消せません。`,
            { modal: true },
            '削除'
        );

        if (answer !== '削除') {
            return;
        }

        const result = await this.mcpClient.deleteArtifact(target.artifact.id);
        if (!result.success) {
            vscode.window.showErrorMessage(result.error ?? '成果物の削除に失敗しました。');
            return;
        }

        vscode.window.showInformationMessage(`成果物「${target.artifact.title}」を削除しました。`);
        this.refresh();
    }

}

/**
 * 成果物ツリー項目
 * VS Codeツリーに表示される単一成果物を表現する
 */
export class ArtifactTreeItem extends vscode.TreeItem {
    /**
     * コンストラクタ
     * @param artifact 成果物情報
     */
    constructor(public readonly artifact: Artifact) {
        super(artifact.title || artifact.id, vscode.TreeItemCollapsibleState.None);
        this.description = artifact.uri ?? '';
        this.tooltip = this.buildTooltip(artifact);
        this.contextValue = 'projectArtifact';
        this.id = artifact.id;
        this.iconPath = new vscode.ThemeIcon('file-code');
    }

    /**
     * ツールチップ生成
     * @param artifact 成果物情報
     * @returns ツールチップ文字列
     */
    private buildTooltip(artifact: Artifact): string {
        const lines = [`ID: ${artifact.id}`];
        if (artifact.uri) {
            lines.push(`URI: ${artifact.uri}`);
        }
        if (artifact.description) {
            lines.push(artifact.description);
        }
        return lines.join('\n');
    }
}
