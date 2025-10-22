import * as vscode from 'vscode';
import { CommandHandler } from './CommandHandler';
import { MCPInitializeClient } from '../repositories/mcp/initializeClient';
import { MCPTaskClient } from '../repositories/mcp/taskClient';
import { MCPArtifactClient } from '../repositories/mcp/artifactClient';
import { ServerService } from '../server/ServerService';
import { WBSTreeProvider } from '../views/explorer/wbsTree';
import { ArtifactTreeProvider } from '../views/explorer/artifactTree';

/**
 * StartServerHandler
 * ローカル MCP サーバを開始し、関連プロバイダをリフレッシュするハンドラ。
 */
export class StartServerHandler extends CommandHandler {
  private wbsProvider: WBSTreeProvider = WBSTreeProvider.getInstance();
  private artifactProvider: ArtifactTreeProvider = ArtifactTreeProvider.getInstance();

  /**
   * Handle start server command
   * startLocalServer を呼び出すコマンドハンドラ
   * @param context Extension context
   */
  async handle(context: vscode.ExtensionContext) {
    const serverService = ServerService.getInstance();
    const initializeClient = (MCPInitializeClient as any).getInstance();
    const taskClient = (MCPTaskClient as any).getInstance();
    const artifactClient = (MCPArtifactClient as any).getInstance();
    await serverService.startLocalServer(context, [initializeClient, taskClient, artifactClient]);

    this.wbsProvider.refresh();
    this.artifactProvider.refresh();
  }
}

