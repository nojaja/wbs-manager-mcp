import fs from 'fs';
import path from 'path';
import Logger from '../logger';
import type { Tool, ToolDeps } from './Tool';

/**
 * 処理名: ToolRegistry クラス
 * 処理概要: ツール（Tool）インスタンスの登録・解除・取得・実行、および動的ロードと依存注入を管理するレジストリ機能を提供します。
 * 実装理由: アプリケーション側で個別のツール実装を意識せずに一元的に操作できるようにするため。ツールの管理と初期化、依存注入の適用を集中させ保守性を高めます。
 * @class
 */
export class ToolRegistry {
    tools: Map<string, Tool>;
    deps: ToolDeps;
    /**
     * 処理名: コンストラクタ
     * 処理概要: 内部のツールマップと依存オブジェクトを初期化します。
     * 実装理由: ToolRegistry の基本状態（空のマップと空の依存オブジェクト）を確実に用意するため。
     */
    constructor() {
        this.tools = new Map();
        this.deps = {};
    }

    /**
     * 処理名: register
     * 処理概要: Tool インスタンスをレジストリに登録し、必要であれば初期化（init）を呼び出します。
     * 実装理由: 登録と同時に依存注入を適用してツールを使用可能な状態にすることで、呼び出し側の責務を軽減します。
     * @param {Tool} tool 登録するツールインスタンス
     */
    async register(tool: Tool) {
        // 引数検証: 不正なツールオブジェクトを防ぐ
        if (!tool || !tool.meta || !tool.meta.name) throw new Error('Invalid tool');
        // まずマップに登録（暫定）
        this.tools.set(tool.meta.name, tool);
        try {
            // 初期化が提供されている場合は依存を渡して await する
            if (typeof (tool as any).init === 'function') {
                await (tool as any).init(this.deps);
            }
        } catch (err) {
            // 初期化失敗はログに記録し、登録を取り消す
            Logger.error('[ToolRegistry] tool.init failed for', null, { tool: tool.meta.name, err: err instanceof Error ? err.message : String(err) });
            this.tools.delete(tool.meta.name);
            // 呼び出し側で初期化失敗を認識できるように再スロー
            throw err;
        }
    }

    /**
     * 処理名: unregister
     * 処理概要: 指定した名前のツールをレジストリから削除します。
     * 実装理由: ランタイムで不要になったツールを解放・削除できるようにし、競合や不要なリソース保持を防ぐため。
     * @param {string} name ツール名
     * @returns {boolean} 削除に成功したか
     */
    unregister(name: string) {
        return this.tools.delete(name);
    }

    /**
     * 処理名: get
     * 処理概要: 名前に対応するツールインスタンスを返します。
     * 実装理由: 外部からツールを直接取得して特定の機能を呼び出せるようにするため。
     * @param {string} name ツール名
     * @returns {Tool | undefined} ツールインスタンスまたは undefined
     */
    get(name: string) {
        return this.tools.get(name);
    }

    /**
     * 処理名: list
     * 処理概要: 登録済みツールのメタ情報一覧を配列で返します。
     * 実装理由: 外部が利用可能なツール一覧（メタ情報）を取得して UI 表示や自動化に利用できるようにするため。
     * @returns {Array<any>} メタ情報配列
     */
    list() {
        return Array.from(this.tools.values()).map(t => t.meta);
    }

    /**
     * 処理名: execute
     * 処理概要: 指定したツールを実行し、その実行結果を返却する非同期メソッドです。
     * 実装理由: ツール呼び出しを統一的に扱い、存在確認や例外伝搬などを一元管理するため。
     * @param {string} name ツール名
     * @param {any} args 実行引数
     * @returns {Promise<any>} ツールの実行結果
     */
    async execute(name: string, args: any) {
        const tool = this.get(name);
        // ツール存在チェック: 存在しない場合はエラーにする（呼び出し側で処理）
        if (!tool) throw new Error(`Tool not found: ${name}`);
        return tool.run(args);
    }
    /**
     * 処理名: loadFromDirectory
     * 処理概要: 指定ディレクトリ内の .js/.mjs ファイルを動的にインポートして、ツールインスタンスを登録します（互換用）。
     * 実装理由: 外部プラグイン的にツールを配置して自動検出・登録する古い互換パスをサポートするため。動的ロードはセキュリティや可観測性の観点から推奨されません。
     * @param {string} dir ディレクトリパス
     * @returns {Promise<void>} 非同期完了
     */
    async loadFromDirectory(dir: string) {
        const abs = path.resolve(dir);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return;
        const files = fs.readdirSync(abs).filter(f => f.endsWith('.js') || f.endsWith('.mjs'));

        // process files sequentially to keep function simple
        for (const f of files) {
            // delegate to helper to reduce cognitive complexity
            await this.loadFileAsTool(abs, f);
        }
    }

    /**
     * Helper: import a module file and register its exported tool instance if present.
     */
    /**
     * Import a tool module file and register its exported instance if present.
     * @param {string} abs Absolute directory path
     * @param {string} f File name to import
     */
    private async loadFileAsTool(abs: string, f: string) {
        try {
            const modPath = new URL(path.join(abs, f)).href;
            const mod = await import(modPath);
            const instance = mod.default || mod.tool || mod.instance;
            if (!instance) return;
            try {
                await this.register(instance as Tool);
            } catch (err) {
                Logger.error('[ToolRegistry] register failed for dynamic tool', null, { file: f, err: err instanceof Error ? err.message : String(err) });
            }
        } catch (err) {
            Logger.error('[ToolRegistry] Failed to load tool', null, { file: f, err: err instanceof Error ? err.message : String(err) });
        }
    }

    /**
     * 処理名: setDeps
     * 処理概要: レジストリに保持しているすべてのツールに対して依存オブジェクトを注入し、必要であれば初期化を再実行します。
     * 実装理由: ツールが利用する共通リソース（DB やログ等）の提供を一括で行うため。動的に依存を差し替えられることでテストや起動時構成が容易になります。
     * @param {ToolDeps} deps 注入する依存オブジェクト
     * @returns {void}
     */
    async setDeps(deps: ToolDeps) {
        this.deps = deps || {};
        const tools = Array.from(this.tools.values());
        for (const tool of tools) {
            // delegate complex init logic to helper
            await this.initToolWithDeps(tool, this.deps);
        }
    }

    /**
     * Initialize a single tool with provided deps.
     * @param {Tool} tool
     * @param {ToolDeps} deps
     * @returns {Promise<void>}
     */
    private async initToolWithDeps(tool: Tool, deps: ToolDeps) {
        try {
            if (typeof (tool as any).init === 'function') {
                await (tool as any).init(deps);
            }
        } catch (err) {
            Logger.error('[ToolRegistry] tool.init failed during setDeps for', null, { tool: tool.meta?.name, err: err instanceof Error ? err.message : String(err) });
            if (tool.meta?.name) this.tools.delete(tool.meta.name);
        }
    }

    /**
     * Dispose all registered tools by awaiting each dispose call.
     */
    async disposeAll() {
        const tools = Array.from(this.tools.values());
        for (const tool of tools) {
            try {
                if (typeof (tool as any).dispose === 'function') {
                    await (tool as any).dispose();
                }
            } catch (err) {
                Logger.error('[ToolRegistry] tool.dispose failed for', null, { tool: tool.meta?.name, err: err instanceof Error ? err.message : String(err) });
            }
        }
        this.tools.clear();
    }
}
