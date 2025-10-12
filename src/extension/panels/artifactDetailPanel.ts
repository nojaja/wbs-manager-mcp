// VSCode API
import * as vscode from 'vscode';
// MCPクライアント（API通信・管理用）
import type { WBSService } from '../services/WBSService';
import type { MCPClient, Artifact } from '../mcpClient';

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
    private mcpClient?: MCPClient;

    /**
     * パネル生成・表示処理
     * 既存パネルがあれば再利用し、なければ新規作成して成果物詳細を表示する
     * なぜ必要か: 複数タブを乱立させず、1つの詳細パネルで成果物編集を集中管理するため
    * @param extensionUri 拡張機能のURI
    * @param artifactId 成果物ID
    * @param serviceOrClient WBSService か MCPClient のいずれか
     */
    public static createOrShow(extensionUri: vscode.Uri, artifactId: string, serviceOrClient: WBSService | MCPClient) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 既存パネルがあれば再利用し、成果物IDを更新
        // 理由: 複数パネル生成による混乱・リソース浪費を防ぐため
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
                localResourceRoots: [extensionUri]
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
    * @param serviceOrClient WBSService か MCPClient のいずれか
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, artifactId: string, serviceOrClient: WBSService | MCPClient) {
        this._panel = panel;
        this._artifactId = artifactId;
        if ((serviceOrClient as any)?.getArtifact) {
            this.mcpClient = serviceOrClient as MCPClient;
        } else {
            this.wbsService = serviceOrClient as WBSService;
        }

        this.loadArtifact();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                // 受信メッセージのコマンド種別で処理分岐
                // 理由: 複数コマンド拡張時の可読性・保守性向上のため
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
        this._artifactId = artifactId;
        await this.loadArtifact();
    }

    /**
     * 成果物読込処理
     * 成果物情報をMCPクライアントから取得し、Webviewに反映する
     * なぜ必要か: 詳細画面表示時に常に最新の成果物情報を取得するため
     */
    private async loadArtifact() {
        try {
            // 理由: 成果物取得失敗時もエラー通知し、UIの不整合を防ぐ
            this._artifact = this.wbsService
                ? await this.wbsService.getArtifactApi(this._artifactId)
                : await this.mcpClient!.getArtifact(this._artifactId);
            if (this._artifact) {
                this._panel.title = `Artifact: ${this._artifact.title}`;
                this._panel.webview.html = this.getHtmlForWebview(this._artifact);
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
        try {
            // 理由: サーバ更新失敗時もエラー通知し、UIの不整合を防ぐ
            const updates = {
                artifactId: this._artifactId,
                title: data.title,
                uri: data.uri || null,
                description: data.description || null,
                version: this._artifact?.version
            };
            const result = this.wbsService
                ? await this.wbsService.updateArtifactApi(updates)
                : await this.mcpClient!.updateArtifact(updates);

            // 更新成功時
            if (result.success) {
                vscode.window.showInformationMessage('Artifact updated successfully');
                this.loadArtifact();
                vscode.commands.executeCommand('artifactTree.refresh');
                // 楽観ロック競合時
            } else if (result.conflict) {
                const choice = await vscode.window.showWarningMessage(
                    'Artifact has been modified by another user. Your version is outdated.',
                    'Reload',
                    'Cancel'
                );
                // ユーザーがReloadを選択した場合のみ再読込
                // 理由: 意図しない再取得を防ぐ
                if (choice === 'Reload') {
                    this.loadArtifact();
                }
                // その他エラー時
            } else {
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
     * @returns HTML文字列
     */
    private getHtmlForWebview(artifact: Artifact): string {
        const safeTitle = this.escapeHtml(artifact.title ?? '');
        const safeUri = this.escapeHtml(artifact.uri ?? '');
        const safeDescription = this.escapeHtml(artifact.description ?? '');
        const safeArtifactId = this.escapeHtml(artifact.id);
        const safeVersion = this.escapeHtml(String(artifact.version));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artifact Detail</title>
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
        input, textarea {
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
    <h2>Artifact Details</h2>
    <form id="artifactForm">
        <div class="form-group">
            <label for="title">Title *</label>
            <input type="text" id="title" name="title" required value="${safeTitle}">
        </div>

        <div class="form-group">
            <label for="uri">URI</label>
            <input type="text" id="uri" name="uri" placeholder="例: src/specs/design.md" value="${safeUri}">
        </div>

        <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description" placeholder="成果物の説明">${safeDescription}</textarea>
        </div>

        <div class="form-group readonly">
            <label>Artifact ID</label>
            <input type="text" value="${safeArtifactId}" readonly>
        </div>

        <div class="form-group readonly">
            <label>Version</label>
            <input type="text" value="${safeVersion}" readonly>
        </div>

        <button type="submit" title="Save (Ctrl+S)">Save</button>
        <p style="margin-top: 10px; color: var(--vscode-descriptionForeground); font-size: 0.9em;">
            💡 Tip: Press <kbd>Ctrl+S</kbd> to save quickly
        </p>
    </form>

    <script>
        const vscode = acquireVsCodeApi();

        // Artifact data from server (safely passed as JSON)
        const artifactData = ${JSON.stringify(artifact)};

        // Initialize form fields with artifact data
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('title').value = artifactData.title || '';
            document.getElementById('uri').value = artifactData.uri || '';
            document.getElementById('description').value = artifactData.description || '';
        });

        // Save function
        function saveArtifact() {
            const formData = {
                title: document.getElementById('title').value,
                uri: document.getElementById('uri').value,
                description: document.getElementById('description').value
            };
            
            console.log('Sending form data:', formData);
            vscode.postMessage({
                command: 'save',
                data: formData
            });
        }

        // Form submit event
        document.getElementById('artifactForm').addEventListener('submit', (e) => {
            e.preventDefault();
            saveArtifact();
        });

        // Ctrl+S keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault(); // Prevent default browser save dialog
                saveArtifact();
            }
        });
    </script>
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