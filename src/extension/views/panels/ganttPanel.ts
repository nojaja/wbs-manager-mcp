import * as vscode from 'vscode';
import { WebviewPanelBase } from './WebviewPanelBase';
import { MCPGanttClient } from '../../repositories/mcp/ganttClient';
import type { GanttSnapshot } from '../../types';

interface GanttPanelOptions {
    parentId?: string | null;
    titleHint?: string;
}

interface GanttWebviewPayload {
    snapshot: GanttSnapshot;
    context: {
        parentId: string | null;
        titleHint?: string;
    };
}

/**
 * Gantt 表示用 Webview パネル。
 */
export class GanttPanel extends WebviewPanelBase {
    public static currentPanel: GanttPanel | undefined;

    private readonly ganttClient: MCPGanttClient;
    private parentId: string | null;
    private titleHint?: string;
    private isHtmlInitialized = false;

    /**
     * パネルを生成または前面に表示する。
     * @param extensionUri 拡張機能ディレクトリの URI
     * @param options 表示対象の親タスクなど、初期化オプション
     */
    public static createOrShow(extensionUri: vscode.Uri, options?: GanttPanelOptions) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (GanttPanel.currentPanel) {
            GanttPanel.currentPanel._panel.reveal(column);
            GanttPanel.currentPanel.applyOptions(options);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'ganttBoard',
            'WBS Gantt',
            column ?? vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: ((): vscode.Uri[] => {
                    const roots: vscode.Uri[] = [extensionUri];
                    const joinPath = (vscode as any)?.Uri?.joinPath;
                    if (typeof joinPath === 'function') {
                        try {
                            roots.push(joinPath(extensionUri, 'dist', 'webview'));
                        } catch {
                            // ignore in test environments
                        }
                    }
                    return roots;
                })()
            }
        );

        GanttPanel.currentPanel = new GanttPanel(panel, extensionUri, options);
    }

    /**
     * 内部コンストラクタ。createOrShow 経由で呼び出す。
     * @param panel VS Code の WebviewPanel
     * @param extensionUri 拡張機能ディレクトリ URI
     * @param options 初期化パラメータ
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, options?: GanttPanelOptions) {
        super(panel, extensionUri);
        this.ganttClient = (MCPGanttClient as any).getInstance();
        this.parentId = options?.parentId ?? null;
        this.titleHint = options?.titleHint;

        this.updateTitle();
        void this.loadSnapshot();
    }

    /**
     * 既存パネルに対して対象タスクを再設定する。
     * @param options 更新したいオプション
     */
    private applyOptions(options?: GanttPanelOptions): void {
        const nextParentId = options?.parentId ?? null;
        const parentChanged = nextParentId !== this.parentId;

        this.parentId = nextParentId;
        if (options?.titleHint) {
            this.titleHint = options.titleHint;
        }

        if (parentChanged || !this.isHtmlInitialized) {
            void this.loadSnapshot();
        } else {
            this.updateTitle();
        }
    }

    /**
     * MCP から最新のガントデータを取得し、Webview へ送信する。
     * @param params 差分取得や postMessage を強制するためのパラメータ
     * @param params.since 差分取得用の ISO 8601 文字列
     * @param params.forcePostMessage HTML 初期化済みでも postMessage を強制するか
     */
    private async loadSnapshot(params?: { since?: string; forcePostMessage?: boolean }): Promise<void> {
        const snapshot = await this.ganttClient.getGanttSnapshot({
            parentId: this.parentId ?? null,
            since: params?.since
        });

        if (!snapshot) {
            vscode.window.showErrorMessage('Failed to fetch Gantt snapshot.');
            if (this.isHtmlInitialized) {
                this._panel.webview.postMessage({
                    command: 'error',
                    message: 'Failed to refresh gantt snapshot.'
                });
            }
            return;
        }

        this.updateTitle(snapshot);

        const payload: GanttWebviewPayload = {
            snapshot,
            context: {
                parentId: this.parentId,
                titleHint: this.titleHint
            }
        };

        if (!this.isHtmlInitialized) {
            this._panel.webview.html = this.buildHtmlForWebview(
                '__GANTT_PAYLOAD__',
                payload,
                this.getBundlePath(),
                this._panel.title
            );
            this.isHtmlInitialized = true;
            return;
        }

        if (params?.forcePostMessage || this.isHtmlInitialized) {
            this._panel.webview.postMessage({
                command: 'snapshot',
                snapshot,
                context: payload.context
            });
        }
    }

    /**
     * Webview タイトルを現在のコンテキストに合わせて更新する。
     * @param snapshot 最新スナップショット（任意）
     */
    private updateTitle(snapshot?: GanttSnapshot): void {
        const label = this.titleHint ?? (snapshot?.metadata?.parentId ?? 'Root');
        const suffix = snapshot?.metadata?.generatedAt
            ? new Date(snapshot.metadata.generatedAt).toLocaleString()
            : undefined;
        const titleParts = ['Gantt'];
        if (label) {
            titleParts.push(String(label));
        }
        if (suffix) {
            titleParts.push(`@ ${suffix}`);
        }
        this._panel.title = titleParts.join(' ');
    }

    /** @inheritdoc */
    protected getBundlePath(): string {
        return 'gantt.bundle.js';
    }

    /** @inheritdoc */
    protected onMessage(message: any): void {
        if (!message || typeof message !== 'object') {
            return;
        }
        switch (message.command) {
            case 'refresh':
                void this.loadSnapshot({ since: typeof message.since === 'string' ? message.since : undefined, forcePostMessage: true });
                return;
            case 'changeParent':
                this.parentId = message.parentId ?? null;
                if (typeof message.titleHint === 'string') {
                    this.titleHint = message.titleHint;
                }
                void this.loadSnapshot({ forcePostMessage: true });
                return;
        }
    }

    /** @inheritdoc */
    public dispose(): void {
        GanttPanel.currentPanel = undefined;
        super.dispose();
    }
}
