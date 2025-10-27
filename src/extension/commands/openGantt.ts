import type * as vscode from 'vscode';
import { CommandHandler } from './CommandHandler';
import { GanttPanel } from '../views/panels/ganttPanel';

/**
 * wbsTree.openGantt のハンドラー。選択中のタスク（またはルート）を対象にガントビューを開く。
 */
export class OpenGanttHandler extends CommandHandler {
  /**
   * コマンド実行エントリポイント。
   * @param context 拡張機能コンテキスト
   * @param treeView WBS ツリー（選択が無い場合のフォールバックに使用）
   * @param item コンテキストメニューから渡されるアイテム
   */
  handle(context: vscode.ExtensionContext, treeView?: any, item?: any): void {
    const target = this.pickTarget(item, treeView);
    const parentId = target?.itemId ?? null;
    const label: string | undefined = typeof target?.label === 'string' ? target.label : undefined;

    this.outputChannel.log(`wbsTree.openGantt: ${parentId ?? 'root'}`);

    GanttPanel.createOrShow(context.extensionUri, {
      parentId,
      titleHint: label
    });
  }
}
