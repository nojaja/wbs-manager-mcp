
//Logger
import { Logger } from '../Logger';

/**
 * コマンドハンドラの基底クラス
 * 共通ユーティリティをここに集約します。
 */
export abstract class CommandHandler {
  /** 出力チャネル */
  protected readonly outputChannel: Logger = Logger.getInstance();
  
  /**
   * サブクラスで実装するメイン処理
   */
  abstract handle(...args: any[]): Promise<any> | any;

  /**
   * treeView と item のどちらかが与えられた場合、優先的に item を返すユーティリティ
   */
  protected pickTarget(item?: any, treeView?: any) {
    if (item !== undefined && item !== null) return item;
    if (treeView && treeView.selection && treeView.selection.length > 0) return treeView.selection[0];
    return undefined;
  }
}
