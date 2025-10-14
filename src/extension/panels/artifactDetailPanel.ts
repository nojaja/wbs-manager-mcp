// VSCode API
import * as vscode from 'vscode';
// MCPクライアント（API通信・管理用）
import type { WBSService } from '../services/WBSService';
import type { Artifact } from '../mcp/types';

/**
 * 成果物詳細パネルクラス
 * 成果物詳細のWebview表示・編集・保存を行う
 * なぜ必要か: 成果物の詳細情報をリッチなUIで表示・編集できるようにするため
 */
export class ArtifactDetailPanel {
    public static currentPanel: ArtifactDetailPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _artifactId: string;
    private _artifact: Artifact | null = null;
    private wbsService?: WBSService;
    private _extensionUri?: vscode.Uri;

    /**
     * パネル生成・表示処理
     * 既存パネルがあれば再利用し、なければ新規作成して成果物詳細を表示する
     * なぜ必要か: 複数タブを乱立させず、1つの詳細パネルで成果物編集を集中管理するため
    * @param extensionUri 拡張機能のURI
    * @param artifactId 成果物ID
    * @param serviceOrClient WBSService または互換的な MCP クライアントオブジェクト
     */
    public static createOrShow(extensionUri: vscode.Uri, artifactId: string, serviceOrClient: any) {
        // 処理名: 成果物詳細パネル作成/表示
        // 処理概要: 既存パネルがあれば再利用、無ければ新規作成して成果物詳細を表示
        // 実装理由: 同一資源の複数パネル生成を防ぎ一貫した編集体験を提供するため
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ArtifactDetailPanel.currentPanel) {
            ArtifactDetailPanel.currentPanel._panel.reveal(column);
            ArtifactDetailPanel.currentPanel.updateArtifact(artifactId);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'artifactDetail',
            'Artifact Detail',
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

        ArtifactDetailPanel.currentPanel = new ArtifactDetailPanel(panel, extensionUri, artifactId, serviceOrClient);
    }

    /**
     * コンストラクタ
     * Webviewパネル・成果物ID・WBSServiceを受け取り初期化する
     * なぜ必要か: パネルの状態・成果物情報・API通信を一元管理するため
    * @param panel Webviewパネル
    * @param extensionUri 拡張機能のURI
    * @param artifactId 成果物ID
    * @param serviceOrClient WBSService または互換的な MCP クライアントオブジェクト
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, artifactId: string, serviceOrClient: any) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._artifactId = artifactId;
        // 注入されたオブジェクトが WBSService API を提供していればそのまま使用
        // そうでなければ legacy な MCP クライアント（getArtifact/updateArtifact）を
        // getArtifactApi/updateArtifactApi へ変換するアダプタを作成して互換性を保つ
        const svc = serviceOrClient as any;
        if (svc && typeof svc.getArtifactApi === 'function' && typeof svc.updateArtifactApi === 'function') {
            this.wbsService = svc as WBSService;
        } else if (svc && typeof svc.getArtifact === 'function') {
            // ラップして WBSService ライクなインターフェースを提供
            this.wbsService = {
                // minimal adapter for methods used by this panel
                /**
                 * Adapter: legacy getArtifact -> getArtifactApi
                 * @param id artifact id
                 * @returns Promise resolving to Artifact or null
                 */
                async getArtifactApi(id: string) {
                    return svc.getArtifact(id);
                },
                /**
                 * Adapter: legacy updateArtifact -> updateArtifactApi
                 * @param updates update payload
                 * @returns Promise resolving to update result object
                 */
                async updateArtifactApi(updates: any) {
                    if (typeof svc.updateArtifact === 'function') {
                        return svc.updateArtifact(updates);
                    }
                    // If updateArtifact is not available on legacy client, throw a descriptive error
                    throw new Error('legacy client does not implement updateArtifact');
                }
            } as unknown as WBSService;
        } else {
            this.wbsService = svc as WBSService;
        }

        this.loadArtifact();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                // 受信メッセージでコマンドを振り分け
                // 実装理由: Webview 側の操作をホスト側で適切に処理するため
                switch (message.command) {
                    case 'save':
                        this.saveArtifact(message.data);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * 成果物更新処理
     * 指定成果物IDの成果物情報を再取得し、画面を更新する
     * なぜ必要か: 別タブや他ユーザーによる変更を即時反映するため
     * @param artifactId 成果物ID
     */
    private async updateArtifact(artifactId: string) {
        // 処理名: 成果物更新（パネル内での切替）
        // 処理概要: 内部 ID を更新して再読込を行う
        // 実装理由: 同一パネルで別の成果物を表示できるようにするため
        this._artifactId = artifactId;
        await this.loadArtifact();
    }

    /**
     * 成果物読込処理
     * 成果物情報をMCPクライアントから取得し、Webviewに反映する
     * なぜ必要か: 詳細画面表示時に常に最新の成果物情報を取得するため
     */
    private async loadArtifact() {
        // 処理名: 成果物読込
        // 処理概要: サービス/クライアントから成果物情報を取得し Webview に埋め込む
        // 実装理由: 詳細表示時に最新の成果物情報を提示するため
        try {
            this._artifact = await this.wbsService!.getArtifactApi(this._artifactId);
            if (this._artifact) {
                this._panel.title = `Artifact: ${this._artifact.title}`;
                this._panel.webview.html = this.getHtmlForWebview(this._artifact, this._extensionUri);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load artifact: ${error}`);
        }
    }

    /**
     * 成果物保存処理
     * 入力データをもとに成果物を更新し、結果に応じて画面制御する
     * なぜ必要か: 編集内容をサーバに反映し、UI状態を一貫させるため
     * @param data 保存するフォームデータ
     */
    private async saveArtifact(data: any) {
        // 処理名: 成果物保存
        // 処理概要: フォームデータを元に成果物更新を行い、結果に応じて UI を更新する
        // 実装理由: 編集内容を永続化してユーザにフィードバックを返すため
        try {
            const updates = {
                artifactId: this._artifactId,
                title: data.title,
                uri: data.uri || null,
                description: data.description || null,
                version: this._artifact?.version
            };
            const result = await this.wbsService!.updateArtifactApi(updates);

            if (result.success) {
                // 処理概要: 成功時は再読込とツリー更新を行う
                // 実装理由: UI の一貫性を保つため
                vscode.window.showInformationMessage('Artifact updated successfully');
                this.loadArtifact();
                vscode.commands.executeCommand('artifactTree.refresh');
            } else if (result.conflict) {
                // 処理概要: 競合検出時はユーザの選択で再読込を行う
                // 実装理由: 楽観ロック競合の取り扱いを利用者に委ねるため
                const choice = await vscode.window.showWarningMessage(
                    'Artifact has been modified by another user. Your version is outdated.',
                    'Reload',
                    'Cancel'
                );
                if (choice === 'Reload') {
                    this.loadArtifact();
                }
            } else {
                // 処理概要: その他エラーは表示
                // 実装理由: 利用者に失敗を通知し次のアクションを促すため
                vscode.window.showErrorMessage(`Failed to update artifact: ${result.error}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save artifact: ${error}`);
        }
    }

    /**
     * Webview用HTML生成処理
     * 成果物情報をもとに詳細画面のHTMLを生成する
     * なぜ必要か: WebviewでリッチなUIを動的に生成するため
     * @param artifact 成果物情報
     * @param extensionUri
     * @returns HTML文字列
     */
        private getHtmlForWebview(artifact: Artifact, extensionUri?: vscode.Uri): string {
                const webview: any = this._panel.webview as any;
                const baseUri: any = (extensionUri ?? this._extensionUri!) as any;
                const joinPath = (vscode as any)?.Uri?.joinPath;
                let scriptUri: any = '/dist/webview/artifact.bundle.js';
                try {
                    if (typeof joinPath === 'function' && typeof webview?.asWebviewUri === 'function') {
                        const scriptPath = joinPath(baseUri, 'dist', 'webview', 'artifact.bundle.js');
                        scriptUri = webview.asWebviewUri(scriptPath);
                    }
                } catch {
                    // fallback for test environment
                    scriptUri = '/dist/webview/artifact.bundle.js';
                }
                const payload = JSON.stringify({ artifact });
                return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Artifact Detail</title>
    <style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:12px}</style>
</head>
<body>
    <div id="app"></div>
    <script>window.__ARTIFACT_PAYLOAD__ = ${payload};</script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
        }

    /**
     * HTMLエスケープ処理
     * テキスト内の危険文字をHTMLエスケープする
     * なぜ必要か: XSS等の脆弱性対策として、ユーザー入力を安全に表示するため
     * @param text 入力テキスト
     * @returns エスケープ済み文字列
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
     * パネル破棄処理
     * パネル・リソースを破棄し、メモリリークを防ぐ
     * なぜ必要か: Webviewパネルの多重生成・リソースリークを防止するため
     */
    public dispose() {
        ArtifactDetailPanel.currentPanel = undefined;
        this._panel.dispose();
        // 登録済みリソースを全て破棄
        // 理由: メモリリーク・リソースリークを防ぐ
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}