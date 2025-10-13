// src/services/WBSService.ts
/* eslint-disable jsdoc/require-param */
import type { WBSTreeProvider } from '../views/wbsTree';
import type { ArtifactTreeProvider } from '../views/artifactTree';
import type { MCPClient, Artifact } from '../mcpClient';
import type { WBSServicePublic } from './wbsService.interface';
/**
 * WBS・成果物ビジネスロジックの集約サービス
 */
export class WBSService {
  /** WBSツリープロバイダ */
  wbsProvider!: WBSTreeProvider;
  /** 成果物ツリープロバイダ */
  artifactProvider!: ArtifactTreeProvider;
  /** 内部で保持する MCPClient（ツール呼び出し用） */
  private readonly mcpClient: MCPClient;

  /**
   * コンストラクタ
   * @param mcpClient MCPClient インスタンス
   * @param [providers] オプションのプロバイダ注入（循環依存回避のため外部から注入可能）
   * @param [providers.wbsProvider] WBS ツリープロバイダ（任意）
   * @param [providers.artifactProvider] 成果物ツリープロバイダ（任意）
   */
  constructor(mcpClient: MCPClient, providers: { wbsProvider: WBSTreeProvider; artifactProvider: ArtifactTreeProvider }) {
    this.mcpClient = mcpClient;
    // providers は必須にして外部から注入してもらうDI方式に変更
    this.wbsProvider = providers.wbsProvider;
    this.artifactProvider = providers.artifactProvider;
  }

  /**
   * providers が未指定のときに同期的にプロバイダを生成する（createRequire を使用）
   * テスト環境では jest.mock によりモック化された実装が返るため互換性がある
   */
  private tryAutoCreateProviders(mcpClient: MCPClient) {
    console.warn('[WBSService] Auto-creation of providers is no longer supported. Please provide them via dependency injection.');
  }

  /**
   * 外部から provider を注入する（extension.ts から呼び出す想定）
   * @param wbsProvider WBS の TreeDataProvider 実装
   * @param artifactProvider 成果物の TreeDataProvider 実装
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
      // 処理概要: 指定 parentId の直下タスクをサーバから取得して JSON 化して返す
      // 実装理由: UI のツリー描画に必要なタスクデータを取得するため
      const args = parentId !== undefined ? { parentId } : {};
      const result = await (this.mcpClient as any).callTool('wbs.planMode.listTasks', args);
      const content = result.content?.[0]?.text;
      if (content) {
        try {
          return JSON.parse(content);
        } catch (error) {
          console.error('[WBSService] Failed to parse task list:', error, content);
        }
      }
      return [];
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
      // 処理概要: 指定 taskId の詳細を取得して返す
      // 実装理由: タスク詳細表示・編集時に最新情報が必要なため
      const result = await (this.mcpClient as any).callTool('wbs.planMode.getTask', { taskId });
      const content = result.content?.[0]?.text;
      if (content && !content.includes('❌')) {
        return JSON.parse(content);
      }
      return null;
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
   * 共通: ツールのレスポンスを解析する (content と llmHints を解釈)
   * @param {any} result ツールの返却オブジェクト
   * @returns {{ parsed?: any; hintSummary: string; error?: string }} パース結果とヒント要約
   */
  private parseToolResponse(result: any): { parsed?: any; hintSummary: string; error?: string } {
    const content = result?.content?.[0]?.text;
    const hint = result?.llmHints ?? null;
    const hintSummary = Array.isArray(hint?.nextActions) ? hint.nextActions.map((action: any) => `- ${action.detail ?? ''}`).join('\n') : '';
    if (!content) {
      return { hintSummary, error: typeof result === 'string' ? result : JSON.stringify(result) };
    }
    // まず JSON としてパースを試みる（成功ならそれを返す）
    try {
      const parsed = JSON.parse(content);
      return { parsed, hintSummary };
    } catch (err) {
      // JSON でなければプレーンテキストの解析にフォールバック
    }
    const analysis = this.analyzePlainContent(content);
    if (analysis?.type === 'conflict' || analysis?.type === 'error') {
      return { hintSummary, error: content };
    }
    if (analysis?.type === 'success') {
      if (analysis.id) return { parsed: { id: analysis.id }, hintSummary };
      return { parsed: true, hintSummary };
    }
    return { hintSummary, error: typeof content === 'string' ? content : JSON.stringify(content) };
  }

  /**
   * プレーンテキストパターンを解析する（成功・エラー・競合・ID抽出）
   * @param content ツール出力の text フィールド
   * @returns {{ type: 'conflict'|'error'|'success'|null; id?: string }} 分析結果
   */
  private analyzePlainContent(content: any): { type: 'conflict'|'error'|'success'|null; id?: string } {
    if (typeof content !== 'string') return { type: null };
    if (content.includes('modified by another user')) return { type: 'conflict' };
    if (content.includes('❌')) return { type: 'error' };
    if (content.includes('✅')) {
      const m = content.match(/ID:\s*(\S+)/);
      return { type: 'success', id: m ? m[1] : undefined };
    }
    return { type: null };
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

      const toolArguments: Record<string, unknown> = { taskId, ...updates };

      if (deliverables !== undefined) {
        toolArguments.deliverables = deliverables;
      }
      if (prerequisites !== undefined) {
        toolArguments.prerequisites = prerequisites;
      }
      if (completionConditions !== undefined) {
        toolArguments.completionConditions = completionConditions;
      }

      const result = await (this.mcpClient as any).callTool('wbs.planMode.updateTask', toolArguments);
      const parsed = this.parseToolResponse(result);
      if (parsed.parsed) {
        return { success: true, taskId: parsed.parsed.id ?? taskId, message: parsed.hintSummary };
      }
      if (parsed.error && String(parsed.error).includes('modified by another user')) {
        return { success: false, conflict: true, error: parsed.error };
      }
      return { success: false, error: parsed.error || 'Unknown error', message: parsed.error ?? parsed.hintSummary };
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

  const result = await (this.mcpClient as any).callTool('wbs.planMode.createTask', toolArguments);
      const parsed = this.parseToolResponse(result);
      if (parsed.parsed) {
        return { success: true, taskId: parsed.parsed.id, message: parsed.hintSummary };
      }
      return { success: false, error: parsed.error || 'Unknown error', message: parsed.error ?? parsed.hintSummary };
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
      const result = await (this.mcpClient as any).callTool('wbs.planMode.deleteTask', { taskId });
      const parsed = this.parseToolResponse(result);
      if (parsed.parsed) {
        return { success: true, taskId: parsed.parsed.id ?? taskId, message: parsed.hintSummary };
      }
      return { success: false, error: parsed.error || 'Unknown error', message: parsed.error ?? parsed.hintSummary };
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
      const result = await (this.mcpClient as any).callTool('wbs.planMode.moveTask', { taskId, newParentId: newParentId ?? null });
      const parsed = this.parseToolResponse(result);
      if (parsed.parsed) {
        return { success: true, taskId: parsed.parsed.id ?? taskId, message: parsed.hintSummary };
      }
      return { success: false, error: parsed.error || 'Unknown error', message: parsed.error ?? parsed.hintSummary };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }


  /**
   * WBSツリーをリフレッシュ
   * @returns {Promise<void>}
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
   * @param selected 選択ノード
   * @returns {Promise<any>}
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
   * @returns {Promise<any>}
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
   * @returns {Promise<any>}
   */
  addChildTask(target: any) {
    if (this.wbsProvider && typeof this.wbsProvider.createTask === 'function') {
      return this.wbsProvider.createTask(target);
    }
    console.error('[WBSService] wbsProvider not set; addChildTask no-op');
    return { success: false } as any;
  }
  /**
   * 成果物ツリーをリフレッシュ
   * @returns {Promise<void>}
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
   * 成果物編集（UI層でArtifactDetailPanel.createOrShowを呼ぶためパススルー）
   * @param item 編集対象
   * @returns {any}
   */
  editArtifact(item: any) {
    // パススルー（既存テストは item を返すことを期待している）
    return item;
  }
  /**
   * 成果物を削除
   * @param target 削除対象
   * @returns {Promise<any>}
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
      const result = await (this.mcpClient as any).callTool('wbs.planMode.listArtifacts', {});
      const content = result.content?.[0]?.text;
      if (content) {
        try {
          return JSON.parse(content) as Artifact[];
        } catch (err) {
          console.error('[WBSService] Failed to parse artifacts list:', err, content);
        }
      }
      return [];
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
      const result = await (this.mcpClient as any).callTool('wbs.planMode.getArtifact', { artifactId });
      const content = result.content?.[0]?.text;
      if (content && !content.includes('❌')) {
        return JSON.parse(content) as Artifact;
      }
      return null;
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
      const result = await (this.mcpClient as any).callTool('wbs.planMode.createArtifact', {
        title: params.title,
        uri: params.uri ?? null,
        description: params.description ?? null
      });

      
    const parsed = this.parseToolResponse(result);
    if (parsed.parsed && typeof parsed.parsed === 'object') {
    return { success: true, artifact: parsed.parsed as Artifact, message: parsed.hintSummary };
    }
    return { success: false, error: parsed.error || 'Unknown error', message: parsed.error ?? parsed.hintSummary };
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
      const result = await (this.mcpClient as any).callTool('wbs.planMode.updateArtifact', {
        artifactId: params.artifactId,
        title: params.title,
        uri: params.uri ?? null,
        description: params.description ?? null,
        ifVersion: params.version
      });
      const content = result.content?.[0]?.text ?? '';
      if (content.includes('modified by another user')) {
        return { success: false, conflict: true, error: content };
      }
      if (content.includes('❌')) {
        return { success: false, error: content };
      }
      const artifact = JSON.parse(content) as Artifact;
      return { success: true, artifact };
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
      const result = await (this.mcpClient as any).callTool('wbs.planMode.deleteArtifact', { artifactId });
      const content = result.content?.[0]?.text ?? '';
      if (content.includes('✅')) {
        return { success: true };
      }
      return { success: false, error: content || 'Unknown error' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export type { WBSServicePublic };
