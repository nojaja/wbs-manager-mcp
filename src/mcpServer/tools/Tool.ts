/**
 * DIで注入される依存オブジェクトのインターフェース
 */
/**
 * 処理名: ToolDeps インターフェース
 * 処理概要: Tool に注入される可能性のある依存オブジェクトを表現する汎用インターフェース
 * 実装理由: 各種サービスや DB、ロガーなどを柔軟に注入できるようにするため。
 * @class
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
    }

    /**
     * 処理名: dispose
     * 処理概要: ツールが保持するリソースを解放するためのフック
     * 実装理由: ファイルハンドルや DB 接続などのクリーンアップを行うためにサブクラスでオーバーライドできるように提供します。
     */
    async dispose() {
        // override if needed
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
