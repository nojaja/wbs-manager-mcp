import * as vscode from 'vscode';
import type { Artifact } from '../../repositories/mcp/types';
import type { ArtifactClientLike } from '../../services/clientContracts';

import { MCPArtifactClient } from '../../repositories/mcp/artifactClient';
/**
 * プロジェクト成果物ツリープロバイダ
 * 成果物一覧の読み込み・操作を提供する
 */
export class ArtifactTreeProvider implements vscode.TreeDataProvider<ArtifactTreeItem> {
    
    private static instance: ArtifactTreeProvider;

    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ArtifactTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    /**
    * 処理名: コンストラクタ
     * 処理概要: 成果物操作クライアントを受け取り内部参照を設定する
     * 実装理由(なぜ必要か): API 呼び出しを直接委譲し責務を分離するため
     */
    private readonly artifactClient: ArtifactClientLike;

    /**
     * コンストラクタ
     * @param artifactClient オプション: テスト時に注入するartifact client
     */
    constructor(artifactClient?: ArtifactClientLike) {
        this.artifactClient = artifactClient ?? (MCPArtifactClient as any).getInstance();
    }

    /**
     * ArtifactTreeProviderクラスのシングルトンインスタンスを取得します
     * @returns {ArtifactTreeProvider} ArtifactTreeProviderインスタンス
     */
    public static getInstance(): ArtifactTreeProvider {
        if (!ArtifactTreeProvider.instance) {
            ArtifactTreeProvider.instance = new ArtifactTreeProvider();
        }
        return ArtifactTreeProvider.instance;
    }

    /**
     * ツリーの再読込を通知する
     * なぜ必要か: 成果物の追加・更新・削除後にツリー表示へ即時反映するため
     */
    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    /**
     * ツリーアイテム取得処理
     * 入力要素をそのまま返し、VS Codeに描画を委譲する
     * なぜ必要か: TreeDataProviderインターフェースの必須実装で、描画時に各項目の見た目を提供するため
     * @param element ツリー項目
     * @returns 入力された項目
     */
    getTreeItem(element: ArtifactTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 子項目取得処理
     * ルートで成果物一覧を読み込む
    * なぜ必要か: 成果物の最新一覧をサーバから取得し、ツリーに反映するため
     * @param element 親項目
     * @returns 子項目配列
     */
    async getChildren(element?: ArtifactTreeItem): Promise<ArtifactTreeItem[]> {
        if (element) {
            // 処理概要: このツリーは階層を持たないため子要素は常に空
            // 実装理由: 成果物はフラット一覧として扱うため
            return [];
        }

        // 処理概要: サービス/クライアントから成果物一覧を取得して TreeItem に変換
        // 実装理由: UI に表示するためのラップ処理
        const artifacts = await this.fetchArtifacts();
        return artifacts.map((artifact: Artifact) => new ArtifactTreeItem(artifact));
    }

    /**
     * 内部ヘルパー: アーティファクト一覧を取得して Artifact[] を返す
     * @returns Promise<Artifact[]>
     */
    private async fetchArtifacts(): Promise<Artifact[]> {
        return await this.artifactClient.listArtifacts();
    }

    /**
     * 成果物作成処理
     * 入力ダイアログから新しい成果物を登録する
    * なぜ必要か: ツリーから直接成果物を追加し、管理効率を高めるため
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
            // 処理概要: キャンセルまたは未入力時は何もしない
            // 実装理由: 必須入力の不備で無効なレコードを作らない
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

        const payload = {
            title: title.trim(),
            uri: uri?.trim() || null,
            description: description?.trim() || null
        };
        const result = await this.artifactClient.createArtifact(payload);

        if (!result.success) {
            // 処理概要: サーバエラー時はメッセージ表示のみ
            // 実装理由: 画面の一貫性維持（部分更新は行わない）
            vscode.window.showErrorMessage(result.error ?? '成果物の作成に失敗しました。');
            return;
        }

        vscode.window.showInformationMessage(`成果物「${result.artifact?.title ?? title.trim()}」を作成しました。`);
        this.refresh();
    }

    /**
     * 成果物編集処理
     * 選択中の成果物を編集する
    * なぜ必要か: 既存成果物の属性をUI上から更新できるようにするため
     * @param target 編集対象項目
    * @returns Promise<void>
     */
    async editArtifact(target?: ArtifactTreeItem): Promise<void> {
        if (!target) {
            // 処理概要: 選択が無い状態での編集は警告
            // 実装理由: 意図しない編集を防ぐ
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
            // 処理概要: キャンセルまたは未入力時は何もしない
            // 実装理由: 必須入力の不備で無効な更新を行わない
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

        const payload = {
            artifactId: artifact.id,
            title: title.trim(),
            uri: uri?.trim() || null,
            description: description?.trim() || null,
            version: artifact.version
        };
        const result = await this.artifactClient.updateArtifact(payload);

        if (!result.success) {
            // 処理概要: 競合時は警告の上で再読み込み、それ以外はエラー表示
            // 実装理由: 楽観ロックでの衝突に対しユーザーに再取得を促す
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
    * なぜ必要か: 不要となった成果物をリポジトリから除去し、一覧を整理するため
     * @param target 削除対象項目
    * @returns Promise<void>
     */
    async deleteArtifact(target?: ArtifactTreeItem): Promise<void> {
        if (!target) {
            // 処理概要: 選択なしでの削除要求はガード
            // 実装理由: 誤削除を防止
            vscode.window.showWarningMessage('削除する成果物を選択してください。');
            return;
        }

        const answer = await vscode.window.showWarningMessage(
            `成果物「${target.artifact.title}」を削除しますか？この操作は取り消せません。`,
            { modal: true },
            '削除'
        );

        if (answer !== '削除') {
            // 処理概要: キャンセル時は何も行わない
            // 実装理由: 破壊的操作は明示同意を必須とする
            return;
        }

        const result = await this.artifactClient.deleteArtifact(target.artifact.id);
        if (!result.success) {
            // 処理概要: サーバエラーをユーザーへ通知
            // 実装理由: 失敗を隠さず次の行動（再試行/問い合わせ）につなげる
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
    * ラベル・説明・ツールチップ・コンテキスト値・アイコンなどツリー表示に必要な属性を設定する
    * なぜ必要か: ツリー上の見た目と挙動（右クリックメニュー等）を一元的に定義するため
     * @param artifact 成果物情報
     */
    constructor(public readonly artifact: Artifact) {
        super(artifact.title || artifact.id, vscode.TreeItemCollapsibleState.None);
        this.description = artifact.uri ?? '';
        this.tooltip = this.buildTooltip(artifact);
        this.contextValue = 'projectArtifact';
        this.id = artifact.id;
        this.iconPath = new vscode.ThemeIcon('file-code');
        // クリック時の動作: 成果物の編集（詳細パネルを開く）
        // なぜ必要か: アイテムクリックのみでは選択に留まり動作しないため、明示的にコマンドを割り当てる
        this.command = {
            command: 'artifactTree.editArtifact',
            title: 'Open Artifact',
            arguments: [this]
        };
    }

    /**
     * ツールチップ生成
     * 成果物のID/URI/説明からツールチップ用の文字列を構築する
     * なぜ必要か: マウスホバーで詳細情報を素早く確認できるようにするため
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
