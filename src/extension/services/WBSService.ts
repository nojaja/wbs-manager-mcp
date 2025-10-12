// src/services/WBSService.ts
import { WBSTreeProvider } from '../views/wbsTree';
import { ArtifactTreeProvider } from '../views/artifactTree';
/**
 * WBS・成果物ビジネスロジックの集約サービス
 */
export class WBSService {
  /** WBSツリープロバイダ */
  wbsProvider: WBSTreeProvider;
  /** 成果物ツリープロバイダ */
  artifactProvider: ArtifactTreeProvider;

  /**
   * コンストラクタ
   * @param mcpClient MCPクライアント
   */
  constructor(mcpClient: any) {
    this.wbsProvider = new WBSTreeProvider(mcpClient);
    this.artifactProvider = new ArtifactTreeProvider(mcpClient);
  }

  /**
   * WBSツリーをリフレッシュ
   * @returns {Promise<void>}
   */
  refreshWbsTree() {
    return this.wbsProvider.refresh();
  }
  /**
   * タスクを作成
   * @param selected 選択ノード
   * @returns {Promise<any>}
   */
  createTask(selected?: any) {
    return this.wbsProvider.createTask(selected);
  }
  /**
   * タスクを削除
   * @param target 削除対象
   * @returns {Promise<any>}
   */
  deleteTask(target: any) {
    return this.wbsProvider.deleteTask(target);
  }
  /**
   * 子タスクを追加
   * @param target 親ノード
   * @returns {Promise<any>}
   */
  addChildTask(target: any) {
    return this.wbsProvider.createTask(target);
  }
  /**
   * 成果物ツリーをリフレッシュ
   * @returns {Promise<void>}
   */
  refreshArtifactTree() {
    return this.artifactProvider.refresh();
  }
  /**
   * 成果物を作成
   * @returns {Promise<any>}
   */
  async createArtifact() {
    return await this.artifactProvider.createArtifact();
  }
  /**
   * 成果物編集（UI層でArtifactDetailPanel.createOrShowを呼ぶためパススルー）
   * @param item 編集対象
   * @returns {any}
   */
  editArtifact(item: any) {
    return item;
  }
  /**
   * 成果物を削除
   * @param target 削除対象
   * @returns {Promise<any>}
   */
  deleteArtifact(target: any) {
    return this.artifactProvider.deleteArtifact(target);
  }
}
