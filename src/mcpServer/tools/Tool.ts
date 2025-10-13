/**
 * DIで注入される依存オブジェクトのインターフェース
 */
export interface ToolDeps {
    [key: string]: any;
}

export type ToolMeta = {
    name: string;
    description?: string;
    inputSchema?: any;
};

/**
 * 基底 Tool クラス
 */
export class Tool {
    meta: ToolMeta;
    deps: ToolDeps;

    /**
     * @param {ToolMeta} meta ツールのメタ情報
     */
    constructor(meta: ToolMeta = { name: 'unknown' }) {
        this.meta = meta;
        this.deps = {};
    }

    /**
     * 初期化フック
     * @param {ToolDeps} deps DIで注入される依存オブジェクト
     */
    async init(deps?: ToolDeps) {
        this.deps = deps || {};
    }

    /** 終了フック */
    async dispose() {
        // override if needed
    }

    /**
     * 実行: サブクラスで実装
     * @param {any} args 実行引数
     */
    async run(args: any): Promise<any> {
        throw new Error('Tool.run must be implemented by subclass');
    }
}
