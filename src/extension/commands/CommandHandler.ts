
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
   * item または treeView の selection から対象を返すユーティリティ
   * @param item 直接渡されたアイテム（優先）
   * @param treeView TreeView インスタンス（selection を参照）
   * @returns 選択対象のアイテム、無ければ undefined
   */
  protected pickTarget(item?: any, treeView?: any) {
    if (item !== undefined && item !== null) return item;
    if (treeView && treeView.selection && treeView.selection.length > 0) return treeView.selection[0];
    return undefined;
  }
}
