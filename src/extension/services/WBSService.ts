// src/services/WBSService.ts
import type { WBSTreeProvider } from '../views/wbsTree';
import type { ArtifactTreeProvider } from '../views/artifactTree';
import type { Artifact } from '../mcp/types';
import type { WBSServicePublic, CreateTaskParams, UpdateTaskParams } from './wbsService.interface';

type TaskClientContract = {
  listTasks(parentId?: string | null): Promise<any[]>;
  getTask(taskId: string): Promise<any | null>;
  createTask(params: Record<string, unknown>): Promise<{ success: boolean; taskId?: string; error?: string; message?: string }>;
  updateTask(taskId: string, updates: Record<string, unknown>): Promise<{ success: boolean; conflict?: boolean; error?: string; taskId?: string; message?: string }>;
  deleteTask(taskId: string): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }>;
  moveTask(taskId: string, newParentId: string | null): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }>;
};

type ArtifactClientContract = {
  listArtifacts(): Promise<Artifact[]>;
  getArtifact(artifactId: string): Promise<Artifact | null>;
  createArtifact(params: { title: string; uri?: string | null; description?: string | null }): Promise<{ success: boolean; artifact?: Artifact; error?: string; message?: string }>;
  updateArtifact(params: { artifactId: string; title?: string; uri?: string | null; description?: string | null; version?: number }): Promise<{ success: boolean; artifact?: Artifact; conflict?: boolean; error?: string; message?: string }>;
  deleteArtifact(artifactId: string): Promise<{ success: boolean; error?: string; message?: string }>;
};

interface WBSServiceDependencies {
  taskClient: TaskClientContract;
  artifactClient: ArtifactClientContract;
}
/**
 * WBS・成果物ビジネスロジックの集約サービス
 */
export class WBSService implements WBSServicePublic {
  /** WBSツリープロバイダ */
  wbsProvider!: WBSTreeProvider;
  /** 成果物ツリープロバイダ */
  artifactProvider!: ArtifactTreeProvider;
  /** タスク向けリポジトリクライアント */
  private readonly taskClient: TaskClientContract;
  /** 成果物向けリポジトリクライアント */
  private readonly artifactClient: ArtifactClientContract;

  /**
   * コンストラクタ
   * @param clients タスク・成果物用の MCP クライアント群
   * @param [providers] オプションのプロバイダ注入（循環依存回避のため外部から注入可能）
   * @param [providers.wbsProvider] WBS ツリープロバイダ（任意）
   * @param [providers.artifactProvider] 成果物ツリープロバイダ（任意）
   */
  constructor(clients: WBSServiceDependencies, providers?: { wbsProvider: WBSTreeProvider; artifactProvider: ArtifactTreeProvider }) {
    this.taskClient = clients.taskClient;
    this.artifactClient = clients.artifactClient;
    if (providers) {
      this.wbsProvider = providers.wbsProvider;
      this.artifactProvider = providers.artifactProvider;
    }
  }

  /**
   * providers が未指定のときに同期的にプロバイダを生成する（createRequire を使用）
   * テスト環境では jest.mock によりモック化された実装が返るため互換性がある
   * @param mcpClient MCPClient インスタンス
   * @returns void
   */
  private tryAutoCreateProviders(): void {
    console.warn('[WBSService] Auto-creation of providers is no longer supported. Please provide them via dependency injection.');
  }

  /**
   * プロバイダを設定
   * @param wbsProvider WBSツリーのプロバイダ
   * @param artifactProvider 成果物ツリーのプロバイダ
   * @returns void
   */
  setProviders(wbsProvider: WBSTreeProvider, artifactProvider: ArtifactTreeProvider) {
    this.wbsProvider = wbsProvider;
    this.artifactProvider = artifactProvider;
  }

  // ----- WBS related business logic moved from MCPClient -----

  /**
   * 指定親ID直下のタスク一覧を取得する
   * @param parentId 親タスクID
  * @returns タスク配列
   */
  async listTasksApi(parentId?: string | null): Promise<any[]> {
    try {
      return await this.taskClient.listTasks(parentId ?? null);
    } catch (error) {
      console.error('[WBSService] Failed to list tasks:', error);
      return [];
    }
  }

  /**
   * タスク詳細を取得する
   * @param taskId タスクID
  * @returns タスクオブジェクトまたはnull
   */
  async getTaskApi(taskId: string): Promise<any | null> {
    try {
      return await this.taskClient.getTask(taskId);
    } catch (error) {
      console.error('[WBSService] Failed to get task:', error);
      return null;
    }
  }

  /**
   * 成果物入力配列を正規化する
   * @param inputs 入力配列
   * @returns 正規化済み配列またはundefined
   */
  private sanitizeArtifactInputs(inputs?: Array<{ artifactId: string; crudOperations?: string | null }>) {
    // 処理概要: 入力配列を検証・正規化して不正な要素を除去する
    // 実装理由: サーバへ渡す前に安全な入力形式に整えるため
    if (!Array.isArray(inputs)) return undefined;
    const normalized: Array<{ artifactId: string; crudOperations?: string | null }> = [];
    for (const item of inputs) {
      const sanitized = this.normalizeArtifactInput(item);
      if (sanitized) normalized.push(sanitized);
    }
    return normalized;
  }

  /**
   * 完了条件入力配列を正規化する
   * @param inputs 入力配列
   * @returns 正規化済み配列またはundefined
   */
  private sanitizeCompletionInputs(inputs?: Array<{ description: string }>) {
    // 処理概要: 完了条件の配列を検証し空文字を除去して返す
    // 実装理由: 空の完了条件をサーバへ渡さないことでデータ整合性を保つため
    if (!Array.isArray(inputs)) return undefined;
    const normalized: Array<{ description: string }> = [];
    for (const item of inputs) {
      const description = typeof item?.description === 'string' ? item.description.trim() : '';
      if (description.length > 0) normalized.push({ description });
    }
    return normalized;
  }

  /**
   * 単一成果物入力を正規化する
   * @param input 成果物入力
   * @returns 正規化済み入力またはnull
   */
  private normalizeArtifactInput(input: { artifactId: string; crudOperations?: string | null } | undefined) {
    // 処理概要: 単一成果物入力を検証・正規化する
    // 実装理由: 無効な artifactId や空の crudOperations を弾くため
    if (!input || typeof input.artifactId !== 'string') return null;
    const artifactId = input.artifactId.trim();
    if (artifactId.length === 0) return null;
    if (typeof input.crudOperations === 'string') {
      const crud = input.crudOperations.trim();
      if (crud.length > 0) return { artifactId, crudOperations: crud };
    }
    return { artifactId };
  }

  /**
   * タスクを更新するビジネスロジック
   * @param taskId タスクID
   * @param updates 更新内容
   * @returns 更新結果
   */
  async updateTaskApi(taskId: string, updates: any): Promise<{ success: boolean; conflict?: boolean; error?: string; taskId?: string; message?: string }> {
    try {
      // 処理概要: 更新内容を正規化してサーバへ渡し、結果を解釈して返す
      // 実装理由: クライアントからの生データを整形してサーバ API と整合する形にするため
      const deliverables = this.sanitizeArtifactInputs(updates.deliverables);
      const prerequisites = this.sanitizeArtifactInputs(updates.prerequisites);
      const completionConditions = this.sanitizeCompletionInputs(updates.completionConditions);

      const normalizedUpdates: Record<string, unknown> = { ...updates };
      if (deliverables !== undefined) {
        normalizedUpdates.deliverables = deliverables;
      } else {
        delete normalizedUpdates.deliverables;
      }
      if (prerequisites !== undefined) {
        normalizedUpdates.prerequisites = prerequisites;
      } else {
        delete normalizedUpdates.prerequisites;
      }
      if (completionConditions !== undefined) {
        normalizedUpdates.completionConditions = completionConditions;
      } else {
        delete normalizedUpdates.completionConditions;
      }
      delete (normalizedUpdates as any).taskId;

      const result = await this.taskClient.updateTask(taskId, normalizedUpdates);
      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * タスクを作成するビジネスロジック
   * @param params 作成パラメータ
   * @returns 作成結果
   */
  async createTaskApi(params: any): Promise<{ success: boolean; taskId?: string; error?: string; message?: string }> {
    try {
      const deliverables = this.sanitizeArtifactInputs(params.deliverables);
      const prerequisites = this.sanitizeArtifactInputs(params.prerequisites);
      const completionConditions = this.sanitizeCompletionInputs(params.completionConditions);

      const toolArguments: Record<string, unknown> = {
        title: params.title ?? 'New Task',
        description: params.description ?? '',
        parentId: params.parentId ?? null,
        assignee: params.assignee ?? null,
        estimate: params.estimate ?? null
      };

      if (deliverables !== undefined) toolArguments.deliverables = deliverables;
      if (prerequisites !== undefined) toolArguments.prerequisites = prerequisites;
      if (completionConditions !== undefined) toolArguments.completionConditions = completionConditions;

      return await this.taskClient.createTask(toolArguments);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * タスクを削除するビジネスロジック
   * @param taskId タスクID
   * @returns 削除結果
   */
  async deleteTaskApi(taskId: string): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }> {
    try {
      return await this.taskClient.deleteTask(taskId);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * タスクを移動するビジネスロジック
   * @param taskId タスクID
   * @param newParentId 新しい親タスクID（またはnull）
   * @returns 移動結果
   */
  async moveTaskApi(taskId: string, newParentId: string | null): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }> {
    try {
      return await this.taskClient.moveTask(taskId, newParentId);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }



  /**
   * WBSツリーの再描画を要求する
   * @returns Promise<void> | undefined
   */
  refreshWbsTree() {
    if (this.wbsProvider && typeof this.wbsProvider.refresh === 'function') {
      try {
        return this.wbsProvider.refresh();
      } catch (err) {
        console.error('[WBSService] wbsProvider.refresh failed:', err);
      }
    } else {
      console.error('[WBSService] wbsProvider not set; cannot refresh WBS tree');
    }
  }

  /**
   * タスクを作成
   * @param selected 親ノードなど選択対象
   * @returns any
   */
  createTask(selected?: any) {
    if (this.wbsProvider && typeof this.wbsProvider.createTask === 'function') {
      return this.wbsProvider.createTask(selected);
    }
    console.error('[WBSService] wbsProvider not set; createTask no-op');
    return { success: false } as any;
  }

  /**
   * タスクを削除
   * @param target 削除対象
   * @returns any
   */
  deleteTask(target: any) {
    if (this.wbsProvider && typeof this.wbsProvider.deleteTask === 'function') {
      return this.wbsProvider.deleteTask(target);
    }
    console.error('[WBSService] wbsProvider not set; deleteTask no-op');
    return { success: false } as any;
  }

  /**
   * 子タスクを追加
   * @param target 親ノード
   * @returns any
   */
  addChildTask(target: any) {
    if (this.wbsProvider && typeof this.wbsProvider.createTask === 'function') {
      return this.wbsProvider.createTask(target);
    }
    console.error('[WBSService] wbsProvider not set; addChildTask no-op');
    return { success: false } as any;
  }

  /**
   * 成果物ツリーの再描画を要求する
   * @returns Promise<void> | undefined
   */
  refreshArtifactTree() {
    if (this.artifactProvider && typeof this.artifactProvider.refresh === 'function') {
      try {
        return this.artifactProvider.refresh();
      } catch (err) {
        console.error('[WBSService] artifactProvider.refresh failed:', err);
      }
    } else {
      console.error('[WBSService] artifactProvider not set; cannot refresh artifact tree');
    }
  }
  /**
   * 成果物を作成
   * @returns {Promise<any>}
   */
  async createArtifact() {
    if (this.artifactProvider && typeof this.artifactProvider.createArtifact === 'function') {
      return await this.artifactProvider.createArtifact();
    }
    console.error('[WBSService] artifactProvider not set; createArtifact no-op');
    return undefined;
  }

  /**
   * 成果物編集（UI層でパネルを呼び出す想定）
   * @param item 編集対象
   * @returns any
   */
  editArtifact(item: any) {
    // パススルー（既存テストは item を返すことを期待している）
    return item;
  }

  /**
   * 成果物を削除
   * @param target 削除対象
   * @returns any
   */
  deleteArtifact(target: any) {
    if (this.artifactProvider && typeof this.artifactProvider.deleteArtifact === 'function') {
      return this.artifactProvider.deleteArtifact(target);
    }
    console.error('[WBSService] artifactProvider not set; deleteArtifact no-op');
    return undefined;
  }

  // ----- Artifact (project artifacts) API pass-throughs -----
  /**
   * 成果物一覧を取得する（MCPClient へのパススルー）
   * @returns 成果物オブジェクト配列
   */
  async listArtifactsApi(): Promise<Artifact[]> {
    try {
      return await this.artifactClient.listArtifacts();
    } catch (error) {
      console.error('[WBSService] Failed to list artifacts:', error);
      return [];
    }
  }

  /**
   * 指定IDの成果物を取得する（MCPClient へのパススルー）
   * @param artifactId 成果物ID
   * @returns 成果物またはnull
   */
  async getArtifactApi(artifactId: string): Promise<Artifact | null> {
    try {
      return await this.artifactClient.getArtifact(artifactId);
    } catch (error) {
      console.error('[WBSService] Failed to get artifact:', error);
      return null;
    }
  }

  /**
   * 成果物を作成する（MCPClient へのパススルー）
   * @param params 作成パラメータ
   * @param params.title 成果物名
   * @param params.uri 関連URI またはファイルパス（null 許容）
   * @param params.description 説明（null 許容）
   * @returns 作成結果を含むオブジェクト
   */
  async createArtifactApi(params: { title: string; uri?: string | null; description?: string | null }) {
    try {
      return await this.artifactClient.createArtifact({
        title: params.title,
        uri: params.uri ?? null,
        description: params.description ?? null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * 成果物を更新する（MCPClient へのパススルー）
   * @param params 更新パラメータ
   * @param params.artifactId 対象成果物ID
   * @param params.title 新しい名称
   * @param params.uri 新しいURI（null 許容）
   * @param params.description 新しい説明（null 許容）
   * @param params.version 現在のバージョン（楽観ロック用）
   * @returns 更新結果を含むオブジェクト
   */
  async updateArtifactApi(params: { artifactId: string; title: string; uri?: string | null; description?: string | null; version?: number }) {
    try {
      return await this.artifactClient.updateArtifact({
        artifactId: params.artifactId,
        title: params.title,
        uri: params.uri ?? null,
        description: params.description ?? null,
        version: params.version
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * 成果物を削除する（MCPClient へのパススルー）
   * @param artifactId 削除対象の成果物ID
   * @returns 削除結果を含むオブジェクト
   */
  async deleteArtifactApi(artifactId: string) {
    try {
      return await this.artifactClient.deleteArtifact(artifactId);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export type { WBSServicePublic };
