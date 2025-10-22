import { CommandHandler } from './CommandHandler';
import { MCPTaskClient } from '../repositories/mcp/taskClient';
import { MCPArtifactClient } from '../repositories/mcp/artifactClient';

/**
 * wbsTree.openTask ハンドラ
 * @param context
 * @param item
 */
export class OpenTaskHandler extends CommandHandler {
  handle(context: any, item: any) {
    this.outputChannel.log(`wbsTree.openTask: ${item ? item.label : 'no item'}`);
      
    const target = this.pickTarget(item, undefined);
    if (target) {
      const taskClient = (MCPTaskClient as any).getInstance();
      const artifactClient = (MCPArtifactClient as any).getInstance();
      // dynamic require to avoid circular load at module init
      const TaskDetailPanel = require('../views/panels/taskDetailPanel').TaskDetailPanel;
      TaskDetailPanel.createOrShow(context.extensionUri, target.itemId, { taskClient, artifactClient });
    }
  }
}
