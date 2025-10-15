/**
 * DIで注入される依存オブジェクトのインターフェース
 */
/**
 * 処理名: ToolDeps インターフェース
 * 処理概要: Tool に注入される可能性のある依存オブジェクトを表現する汎用インターフェース
 * 実装理由: 各種サービスや DB、ロガーなどを柔軟に注入できるようにするため。
 */
export interface ToolDeps {
    [key: string]: any;
}

/**
 * 処理名: ToolMeta 型
 * 処理概要: ツールの識別情報や説明、入力スキーマなどを保持するメタデータ型
 * 実装理由: レジストリや UI がツールを一覧表示・検査できるように統一的なメタ情報を持たせるため。
 */
export type ToolMeta = {
    name: string;
    description?: string;
    // inputSchema may be a validation schema or a function that throws/returns errors.
    // It is intentionally typed as any to allow multiple schema libs or a custom validator function.
    inputSchema?: any;
};

/**
 * 処理名: Tool 基底クラス
 * 処理概要: すべてのツール実装が継承する共通のベースクラス。メタ情報と依存注入インターフェース、初期化/破棄/実行の基本契約を提供します。
 * 実装理由: 共通のライフサイクルとインターフェースを規定することで、ToolRegistry 等から一貫した扱いが可能になり、テストや拡張が容易になります。
 */
export class Tool {
    meta: ToolMeta;
    deps: ToolDeps;
    // 初期化済みフラグ — register/execute 側で初期化状態を検査するために利用します
    initialized: boolean = false;

    /**
     * 処理名: コンストラクタ
     * 処理概要: メタ情報をセットし、依存オブジェクトを初期化します。
     * 実装理由: サブクラスがメタを渡せるようにしつつ、deps を空オブジェクトで初期化して安全に扱えるようにします。
     * @param {ToolMeta} meta ツールのメタ情報
     */
    constructor(meta: ToolMeta = { name: 'unknown' }) {
        this.meta = meta;
        this.deps = {};
    }

    /**
     * 処理名: init
     * 処理概要: 依存注入を受け取り、内部 state を初期化します。
     * 実装理由: テスト時や起動時に外部リソースを注入してツールの動作に必要な環境を整えるため。
     * @param {ToolDeps} deps DIで注入される依存オブジェクト
     */
    async init(deps?: ToolDeps) {
        this.deps = deps || {};
        // サブクラスの init 実装が非同期処理を含むことを想定しているため
        // このメソッドは Promise を返す必要があり、初期化完了後にフラグを立てます。
        this.initialized = true;
    }

    /**
     * 処理名: dispose
     * 処理概要: ツールが保持するリソースを解放するためのフック
     * 実装理由: ファイルハンドルや DB 接続などのクリーンアップを行うためにサブクラスでオーバーライドできるように提供します。
     */
    async dispose() {
        // override if needed
        // デフォルト実装では特に何もしないが、dispose が呼ばれたら初期化フラグをクリアする
        this.initialized = false;
    }

    /**
     * 処理名: run
     * 処理概要: ツールの主処理を実行する抽象メソッド（サブクラスで実装）
     * 実装理由: ツール固有の処理ロジックはサブクラスで提供させ、ToolRegistry から統一的に呼び出せるようにするため。
     * @param {any} args 実行引数
     */
    async run(args: any): Promise<any> {
        throw new Error('Tool.run must be implemented by subclass');
    }
}

/**
 * RpcError: standardized error used by tools/dispatcher to return structured errors
 * code: numeric JSON-RPC error code (application specific codes should avoid the -32000..-32099 reserved range)
 * message: short description
 * data: optional additional payload (object)
 */
/**
 * RpcError represents a structured error that can be thrown by tools to
 * provide a JSON-RPC compatible error object back to the caller.
 *
 * Example: throw new RpcError(1001, 'Not found', { id: '123' })
 */
export class RpcError extends Error {
    code: number;
    data?: any;
    /**
     * Create a RpcError
     * @param {number} code JSON-RPC error code
     * @param {string} message error message
     * @param {any} [data] optional additional data
     */
    constructor(code: number, message: string, data?: any) {
        super(message);
        this.code = code;
        this.data = data;
        // set the name for easier identification in logs
        this.name = 'RpcError';
    }
}
