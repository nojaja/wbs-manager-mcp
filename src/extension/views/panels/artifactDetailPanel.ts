import * as vscode from 'vscode';
import type { ArtifactClientLike } from '../../services/clientContracts';
import { WebviewPanelBase } from './WebviewPanelBase';

type ArtifactDetailDependencies = {
  artifactClient: Pick<ArtifactClientLike, 'getArtifact' | 'updateArtifact' | 'listArtifacts'>;
};

interface Artifact {
  id: string;
  title: string;
  description?: string;
  version?: number;
}

/**
 * Artifact detail webview panel
 */
export class ArtifactDetailPanel extends WebviewPanelBase {
  public static currentPanel: ArtifactDetailPanel | undefined;
  private _artifactId: string;
  private _artifact: Artifact | null = null;
  private readonly artifactClient: Pick<ArtifactClientLike, 'getArtifact' | 'updateArtifact' | 'listArtifacts'>;

  /**
   * Create or show the artifact detail panel
   * @param extensionUri - extension root URI
   * @param artifactId - artifact identifier to show
   * @param deps - dependencies (clients)
   */
  public static createOrShow(extensionUri: vscode.Uri, artifactId: string, deps: ArtifactDetailDependencies) {
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

    ArtifactDetailPanel.currentPanel = new ArtifactDetailPanel(panel, extensionUri, artifactId, deps);
  }

  /**
   * Private constructor — use createOrShow
   * @param panel - vscode WebviewPanel instance
   * @param extensionUri - extension root URI
   * @param artifactId - artifact id to display
   * @param deps - dependencies object
   */
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, artifactId: string, deps: any) {
    super(panel, extensionUri);
    this._artifactId = artifactId;
    // Tests sometimes pass the client directly instead of deps object
    this.artifactClient = deps?.artifactClient ?? deps;

    this.loadArtifact();
  }

  /**
   * Update displayed artifact id and reload
   * @param artifactId - new artifact id
   */
  private async updateArtifact(artifactId: string) {
    this._artifactId = artifactId;
    await this.loadArtifact();
  }

  /**
   * Load artifact data and render webview
   */
  private async loadArtifact() {
    try {
      this._artifact = await this.artifactClient.getArtifact(this._artifactId as any);
      if (this._artifact) {
        this._panel.title = `Artifact: ${this._artifact.title}`;
        this._panel.webview.html = this.buildHtmlForWebview('__ARTIFACT_PAYLOAD__', { artifact: this._artifact }, undefined, `Artifact: ${this._artifact.title}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load artifact: ${error}`);
    }
  }

  /**
   * Save artifact updates received from webview
   * @param data - payload data from the webview
   */
  private async saveArtifact(data: any) {
    try {
      const updates = {
        artifactId: this._artifactId,
        title: data.title,
        uri: data.uri || null,
        description: data.description || null,
        version: this._artifact?.version
      };
      const result = await this.artifactClient.updateArtifact(updates as any);

      if (result && (result as any).success) {
        vscode.window.showInformationMessage('Artifact updated successfully');
        await this.loadArtifact();
        await vscode.commands.executeCommand('artifactTree.refresh');
        return;
      }

      if (result && (result as any).conflict) {
        const choice = await vscode.window.showWarningMessage(
          'Artifact has been modified by another user. Your version is outdated.',
          'Reload',
          'Cancel'
        );
        if (choice === 'Reload') {
          await this.loadArtifact();
        }
        return;
      }

      const err = result && (result as any).error;
      if (err) {
        vscode.window.showErrorMessage(`Failed to update artifact: ${err}`);
        return;
      }

      vscode.window.showErrorMessage('Failed to update artifact');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save artifact: ${error}`);
    }
  }

  /**
   * Bundle file name for this panel
   * @returns bundle filename used by this panel
   */
  protected getBundlePath(): string { return 'artifact.bundle.js'; }

  /**
   * Handle messages from the webview
   * @param message - message object received from webview
   */
  protected onMessage(message: any): void {
    switch (message.command) {
      case 'save':
        this.saveArtifact(message.data);
        return;
    }
  }

  /**
   * Dispose panel and resources
   */
  public dispose() {
    ArtifactDetailPanel.currentPanel = undefined;
    super.dispose();
  }

  /**
   * Backwards-compatible wrapper: allow calling getHtmlForWebview(artifact)
   * @param arg - artifact object or full payload
   * @returns HTML string for the webview
   */
  public getHtmlForWebview(arg: any) {
    let payload: any;
    if (arg && typeof arg === 'object' && (arg.id !== undefined || arg.title !== undefined)) {
      payload = { artifact: arg };
    } else {
      payload = arg ?? {};
    }
  return super.buildHtmlForWebview('__ARTIFACT_PAYLOAD__', payload, undefined, 'Artifact Detail');
  }
}