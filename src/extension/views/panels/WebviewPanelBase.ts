// VSCode API
import * as vscode from 'vscode';

/**
 * 共通 Webview パネル基底クラス
 * - Webview の初期イベント登録（dispose / onDidReceiveMessage）
 * - localResourceRoots の計算
 * - scriptUri の決定
 * - HTML 生成ヘルパー
 * - escapeHtml
 *
 * 派生クラスは getBundlePath と onMessage を実装すること
 */
export abstract class WebviewPanelBase {
    protected readonly _panel: vscode.WebviewPanel;
    protected _disposables: vscode.Disposable[] = [];
    protected _extensionUri?: vscode.Uri;

    /**
     * Construct the base webview panel
     * @param panel - vscode WebviewPanel instance
     * @param extensionUri - optional extension root URI
     */
    constructor(panel: vscode.WebviewPanel, extensionUri?: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // dispose 登録は各派生で currentPanel をクリアした上で super.dispose() を呼び出す想定
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // 受信メッセージは派生の onMessage へ委譲
        this._panel.webview.onDidReceiveMessage(
            message => {
                try {
                    this.onMessage(message);
                } catch (e) {
                    // swallow to avoid breaking host
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Get allowed local resource roots for the webview
     * @returns array of vscode.Uri
     */
    protected getLocalResourceRoots(): vscode.Uri[] {
        const roots: vscode.Uri[] = [];
        if (this._extensionUri) {
            roots.push(this._extensionUri);
            const joinPath = (vscode as any)?.Uri?.joinPath;
            if (typeof joinPath === 'function') {
                try {
                    roots.push(joinPath(this._extensionUri, 'dist', 'webview'));
                } catch {
                    // ignore in test env
                }
            }
        }
        return roots;
    }

    /**
     * スクリプト URI を解決する。テスト環境では相対パス文字列を返す。
     * bundleName は 'task.bundle.js' のようなファイル名を返す実装とする。
     */
    /**
     * Resolve the script URI for the webview bundle
     * @param bundleName - optional bundle file name (e.g. 'task.bundle.js')
     * @returns script URI string usable in the webview
     */
    protected getScriptUri(bundleName?: string): string {
        const webview: any = this._panel.webview as any;
        const baseUri: any = (this._extensionUri ?? undefined) as any;
        const joinPath = (vscode as any)?.Uri?.joinPath;
        let scriptUri: any = `/dist/webview/${bundleName ?? this.getBundlePath()}`;
        try {
            if (typeof joinPath === 'function' && typeof webview?.asWebviewUri === 'function' && baseUri) {
                const scriptPath = joinPath(baseUri, 'dist', 'webview', bundleName ?? this.getBundlePath());
                scriptUri = webview.asWebviewUri(scriptPath);
            }
        } catch {
            // fallback to relative path for tests
            scriptUri = `/dist/webview/${bundleName ?? this.getBundlePath()}`;
        }
        return String(scriptUri);
    }

    /**
     * HTML 生成共通部
     * payloadName は window.__XXX_PAYLOAD__ の名前（例: '__TASK_PAYLOAD__' の前後の識別子）
     */
    /**
     * Generate HTML for the webview including injected payload and script tag
     * @param payloadName - global window payload variable name
     * @param payload - serializable payload object
     * @param bundleName - optional bundle filename override
     * @param title - optional page title
     * @returns full HTML string for the webview
     */
    protected buildHtmlForWebview(payloadName: string, payload: unknown, bundleName?: string, title?: string): string {
        const scriptUri = this.getScriptUri(bundleName);
        const payloadJson = JSON.stringify(payload ?? {});
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${this.escapeHtml(title ?? '')}</title>
    <style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:12px}</style>
</head>
<body>
    <div id="app"></div>
    <script>window.${payloadName} = ${payloadJson};</script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Escape HTML special characters
     * @param text - input string
     * @returns escaped string
     */
    protected escapeHtml(text: string): string {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * リソース破棄
     */
    public dispose() {
        try {
            this._panel.dispose();
        } catch {
            // ignore
        }
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }

    // 派生クラスで実装
    protected abstract getBundlePath(): string;
    protected abstract onMessage(message: any): void;
}
