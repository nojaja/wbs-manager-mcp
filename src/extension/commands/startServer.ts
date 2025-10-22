import * as vscode from 'vscode';
import { CommandHandler } from './CommandHandler';
import { MCPInitializeClient } from '../repositories/mcp/initializeClient';
import { MCPTaskClient } from '../repositories/mcp/taskClient';
import { MCPArtifactClient } from '../repositories/mcp/artifactClient';
import { ServerService } from '../server/ServerService';
import { WBSTreeProvider} from '../views/explorer/wbsTree';
import { ArtifactTreeProvider} from '../views/explorer/artifactTree';

/**
 * startLocalServer を呼び出すコマンドハンドラ
 * @param context ExtensionContext
 * @param clients MCP クライアント配列
 */
export class StartServerHandler extends CommandHandler {
  private wbsProvider: WBSTreeProvider = WBSTreeProvider.getInstance();
  private artifactProvider: ArtifactTreeProvider = ArtifactTreeProvider.getInstance();
  
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

