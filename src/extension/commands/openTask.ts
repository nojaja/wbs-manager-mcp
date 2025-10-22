import { CommandHandler } from './CommandHandler';
import { MCPTaskClient } from '../repositories/mcp/taskClient';
import { MCPArtifactClient } from '../repositories/mcp/artifactClient';
import { TaskDetailPanel } from '../views/panels/taskDetailPanel';

/**
 * OpenTaskHandler
 * wbsTree.openTask のハンドラ（TaskDetailPanel を表示）。
 */
export class OpenTaskHandler extends CommandHandler {

  /**
   * wbsTree.openTask ハンドラ
   * Handle open task command
   * @param context Extension context
   * @param item target item or selection
   */
  handle(context: any, item: any) {
    this.outputChannel.log(`wbsTree.openTask: ${item ? item.label : 'no item'}`);

    const target = this.pickTarget(item, undefined);
    if (target) {
      const taskClient = (MCPTaskClient as any).getInstance();
      const artifactClient = (MCPArtifactClient as any).getInstance();
  TaskDetailPanel.createOrShow(context.extensionUri, target.itemId);
    }
  }
}
