import { ToolRegistry } from '../tools/ToolRegistry';
import Logger from '../logger';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../parser/Parser';
import { RpcError } from '../tools/Tool';

/**
 * Dispatcher routes parsed JSON-RPC messages to the appropriate handlers and
 * delegates tool calls to the ToolRegistry.
 */
export class Dispatcher {
  private toolRegistry: ToolRegistry;

  /**
   * 処理名: Dispatcher 初期化
   * 処理概要: Dispatcher インスタンスを作成し、与えられた ToolRegistry をバインドします。
   * 実装理由: メッセージのルーティングとツール呼び出しの委譲を行う中心コンポーネントであり、動的に登録されたツール群にアクセスするために ToolRegistry が必要です。
   * @param {ToolRegistry} toolRegistry
   */
  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }



  /**
   * 処理名: ツール呼び出し処理
   * 処理概要: JSON-RPC の tools/call リクエストを処理します。ツール名の存在確認、ツール取得、入力バリデーションを行い、実行に委譲して結果を JSON-RPC 形式で返却します。
   * 実装理由: リクエストハンドリングとツール実行の責務を分離することで可読性と保守性を高め、入力不正や未登録ツールに対する適切な JSON-RPC エラー応答を一元化するためです。
   * @param {string|undefined} name tool name
   * @param {any} args arguments to the tool
   * @param {string|number|null} id request id
   * @returns {Promise<any>} JSON-RPC response object
   */
  private async handleToolsCall(name: string | undefined, args: any, id: string | number | undefined): Promise<JsonRpcResponse> {
    // 処理概要: ツール名が指定されているか確認し、未指定ならパラメータエラーを返す。
    // 実装理由: ツール呼び出しは必ずツール名を要するため、早期に入力チェックを行い無意味な処理を防止する。
    if (!name) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params: missing tool name' } };
    }
    const tool = this.toolRegistry.get(name);
    // 処理概要: 指定された名前のツールが登録されているか確認し、未登録なら Method not found 相当のエラーを返す。
    // 実装理由: 存在しないツールに対する呼び出しを防ぎ、クライアントに明確なエラー理由を返すため。
    if (!tool) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${name}` } };

    // Validation
    // 処理概要: ツール定義に従って入力のバリデーションを行い、失敗した場合は適切な JSON-RPC エラーを返す。
    // 実装理由: 不正な入力で実行してしまうとツール内部で未定義の挙動や例外が発生するため、事前に検証して安全性を担保する。
    try {
      await this.validateToolInput(tool, args);
    } catch (e: any) {
      if (e instanceof RpcError) {
        return { jsonrpc: '2.0', id, error: { code: e.code, message: e.message, data: e.data } };
      }
      return { jsonrpc: '2.0', id, error: { code: -32602, message: e instanceof Error ? e.message : String(e) } };
    }
    // Execute tool (delegated to reduce complexity)
    return await this.executeTool(name, args, id);
  }


  /**
   * 処理名: ツール実行とレスポンス整形
   * 処理概要: 指定されたツールを実行し、その結果を JSON-RPC のレスポンス形式に整形して返します。実行中に発生した RpcError は適切な JSON-RPC エラーに変換し、それ以外の例外はサーバ内部エラーとしてログ記録および応答します。
   * 実装理由: ツール実行の成功/失敗時のレスポンス生成ロジックを共通化し、エラーログ出力やレスポンスコードの一貫性を確保するためです。
   * @param {string} name
   * @param {any} args
   * @param {string|number|null} id
   * @returns {Promise<any>} JSON-RPC response object
   */
  private async executeTool(name: string, args: any, id: string | number | undefined): Promise<JsonRpcResponse> {
    // 処理概要: ツールを実行し結果を JSON-RPC レスポンスとして返す。実行中の例外は RpcError とそれ以外で分岐して扱う。
    // 実装理由: ツール実行は外部依存を伴うため様々な例外が発生し得る。RpcError は既知のエラーコードを保持しているためそのまま返し、未知のエラーはログに残して内部エラーとして返すことで運用時の原因調査を容易にする。
    try {
      const toolResult = await this.toolRegistry.execute(name, args);
      return { jsonrpc: '2.0', id, result: toolResult };
    } catch (err: any) {
      // 処理概要: RpcError はそのままクライアントに返却
      // 実装理由: RpcError はツール側が意図的に返す検証/業務エラーであり、クライアントが対応できる情報を含むため。
      if (err instanceof RpcError) {
        return { jsonrpc: '2.0', id, error: { code: err.code, message: err.message, data: err.data } };
      }
      // 処理概要: 想定外のエラーはサーバログに記録し内部エラーコードで応答
      // 実装理由: 想定外の例外は運用で調査が必要になるためログを残し、クライアントへは内部エラーとして通知する。
      Logger.error('[MCP Server] Unexpected tool error:', null, { tool: name, err: err instanceof Error ? err.message : String(err) });
      return { jsonrpc: '2.0', id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
    }
  }


  /**
   * 処理名: ツール入力バリデーション
   * 処理概要: ツール定義に含まれる inputSchema を利用して引数の検証を行います。関数型バリデータや Joi 風の .validate メソッドの両方をサポートします。検証失敗時には RpcError をスローします。
   * 実装理由: 各ツールごとに入力検証の実装が分散すると不整合が発生するため、共通化して早期に不正な入力を弾き、実行時例外を防ぐためです。
   * @param {any} tool tool instance
   * @param {any} args arguments passed to tool
   * @returns {Promise<void>} resolves when valid or throws RpcError
   */
  private async validateToolInput(tool: any, args: any) {
    // 処理概要: ツールのメタ情報から inputSchema を取得し、存在する場合は適切なバリデータで検証を実施する。
    // 実装理由: inputSchema がないツールも許容されるため、早期リターンで処理を省略しつつ、あれば検証ルートへ進めて不正入力を弾く。
    const schema = tool?.meta?.inputSchema;
    if (!schema) return;
    try {
      if (typeof schema === 'function') {
        // 処理概要: 関数スキーマ（カスタムバリデータ）を使った検証
        // 実装理由: カスタム関数は柔軟な検証を提供するためサポートする
        await this.validateWithFunctionSchema(schema, args);
      } else if (typeof schema.validate === 'function') {
        // 処理概要: validate メソッドを持つスキーマ（Joi 風）での検証
        // 実装理由: 多くのライブラリがこのパターンを採用しているため互換性を持たせる
        await this.validateWithValidateMethod(schema, args);
      }
    } catch (e) {
      if (e instanceof RpcError) throw e;
      // 処理概要: 検証エラーは RpcError にラップして上位へ伝搬
      // 実装理由: 呼び出し側で一貫した JSON-RPC エラーハンドリングを行うため
      throw new RpcError(-32602, 'Invalid params', (e instanceof Error) ? e.message : e);
    }
  }

  /**
   * 処理名: 関数スキーマ検証
   * 処理概要: 関数形式のスキーマ（同期/非同期）を呼び出して検証結果を評価し、不正な場合は RpcError を投げます。
   * 実装理由: スキーマが関数として提供されるケース（カスタムバリデータ等）に対応するため。同期/非同期の結果を統一的に扱う必要があるためこのヘルパーを設けています。
   * @param {Function} schemaFn
   * @param {any} args
   */
  private async validateWithFunctionSchema(schemaFn: Function, args: any) {
    // 処理概要: スキーマ関数を実行し、同期/非同期の戻り値形式に応じて検証結果を評価する
    // 実装理由: カスタムバリデータが Promise を返す場合や単純なオブジェクトを返す場合の両方に対応するため
    const res = schemaFn(args);
    if (res && typeof (res as any).then === 'function') {
      const awaited = await res;
      if (awaited && awaited.valid === false) {
        throw new RpcError(-32602, 'Invalid params', awaited.errors || awaited);
      }
    } else if (res && (res as any).valid === false) {
      throw new RpcError(-32602, 'Invalid params', (res as any).errors || res);
    }
  }



  /**
   * 処理名: validate(args) 形式スキーマ検証
   * 処理概要: schema.validate(args) の戻り値を評価し、エラーがあれば RpcError を投げます。Promise もサポートします。
   * 実装理由: Joi などのライブラリが expose する validate メソッドを利用するツール定義をサポートし、バリデーションロジックの重複を避けるためです。
   * @param {any} schema
   * @param {any} args
   */
  private async validateWithValidateMethod(schema: any, args: any) {
    // 処理概要: schema.validate(args) の戻り値を評価し、同期/非同期どちらの形式でもエラーがあれば RpcError を投げる
    // 実装理由: Joi などのバリデーションライブラリに合わせて、戻り値が Promise でも直値でも扱えるようにするため
    const maybe = schema.validate(args);
    if (maybe && typeof (maybe as any).then === 'function') {
      const awaited = await maybe;
      if (awaited && awaited.error) throw new RpcError(-32602, 'Invalid params', awaited.error);
    } else if (maybe && (maybe as any).error) {
      throw new RpcError(-32602, 'Invalid params', (maybe as any).error);
    }
  }


  /**
   * 処理名: JSON-RPC メッセージ振り分け
   * 処理概要: 受信した JSON-RPC メッセージがリクエストか通知かを判定し、適切なハンドラに委譲します。リクエストの場合はレスポンスを返し、通知の場合は undefined を返します。
   * 実装理由: JSON-RPC プロトコルの仕様に基づき、id の有無でリクエスト/通知を識別して処理を分離するため。これにより通知の非同期処理とリクエストの同期応答を明確に扱えます。
   * @param {JsonRpcRequest|JsonRpcNotification} message
   * @returns {Promise<JsonRpcResponse|undefined>} response or undefined
   */
  async handle(message: JsonRpcRequest | JsonRpcNotification): Promise<JsonRpcResponse | undefined> {
    // 処理概要: メッセージがリクエスト（id を含む）か通知かを判定し、それぞれの処理へ振り分ける
    // 実装理由: JSON-RPC の仕様に従い応答が必要な場合と不要な場合を明確に分けるため
    if ('id' in message) {
      return this.handleRequest(message as JsonRpcRequest);
    } else {
      await this.handleNotification(message as JsonRpcNotification);
      return undefined;
    }
  }


  /**
   * 処理名: JSON-RPC リクエスト処理
   * 処理概要: 各 JSON-RPC のメソッド（initialize、tools/list、tools/call、ping など）を受け取り、対応するレスポンスを構築して返却します。未知のメソッドは Method not found エラーを返します。
   * 実装理由: サーバが提供する API のルーティングを一元化し、新しいメソッド追加時にここを拡張することで挙動が明確になるため。
   * @param {JsonRpcRequest} request
   * @returns {Promise<JsonRpcResponse>} response
   */
  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, params, id } = request;
    // 処理概要: 受け取ったメソッド名に応じて適切な処理分岐を行う（ルーティング）
    // 実装理由: サーバが提供する API の各機能をここで一元的に判断・実行することで拡張や保守を容易にする
    try {
      switch (method) {
        case 'initialize':
          // 処理概要: 初期化リクエストに対してサーバのプロトコル情報と能力を返却する
          // 実装理由: クライアントがサーバのバージョンや機能（ツールサポートなど）を確認できるようにするため
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'wbs-mcp-server', version: '0.1.0' }
            }
          };
        case 'tools/list':
          // 処理概要: 登録済みツール一覧を返却する
          // 実装理由: クライアントが利用可能なツールを動的に検出できるようにするため
          return { jsonrpc: '2.0', id, result: { tools: this.toolRegistry.list() } };
        case 'tools/call': {
          // 処理概要: tools/call リクエストの params から name と arguments を抽出し、ツール呼び出し処理に委譲する
          // 実装理由: パラメータ抽出と呼び出しの責務を分離することで handleRequest を簡潔に保つため
          const name = params?.name as string | undefined;
          const args = params?.arguments ?? {};
          return await this.handleToolsCall(name, args, id);
        }
        case 'ping':
          // 処理概要: ヘルスチェックのために空の結果を返す
          // 実装理由: クライアントや監視ツールによる接続確認のため
          return { jsonrpc: '2.0', id, result: {} };
        case 'resources/list':
          // 処理概要: 利用可能なリソース一覧（現状は空）を返す
          // 実装理由: 将来の拡張でリソース情報を返却できるようインターフェースを確保するため
          return { jsonrpc: '2.0', id, result: { resources: [] } };
        case 'prompts/list':
          // 処理概要: 利用可能なプロンプト一覧（現状は空）を返す
          // 実装理由: 将来プロンプト機能を提供するためのプレースホルダ
          return { jsonrpc: '2.0', id, result: { prompts: [] } };
        default:
          // 処理概要: 未知のメソッドに対して Method not found エラーを返す
          // 実装理由: クライアントが誤ったメソッド名を使った場合に明示的に通知するため
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
    } catch (err) {
      // 処理概要: ルーティング中に発生した予期せぬ例外を内部エラーとして返す
      // 実装理由: 例外発生時にクライアントへ一貫したエラー応答を返し、サーバ側で詳細ログを参照して調査できるようにする
      return { jsonrpc: '2.0', id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
    }
  }


  /**
   * 処理名: 通知ハンドリング
   * 処理概要: レスポンス不要な JSON-RPC 通知を受け取り、現状はログ出力のみ行います。将来的には非同期処理フックを追加できます。
   * 実装理由: 通知はクライアントから一方的に送られるイベントであり、サーバは応答を返さないため、通知専用の処理経路を用意して将来的な拡張性を確保します。
   * @param {JsonRpcNotification} notification
   */
  private async handleNotification(notification: JsonRpcNotification) {
    Logger.debug('[MCP Server] Notification received: ' + String(notification.method));
    // no-op for now
  }
}
