import fs from 'fs';
import path from 'path';
import type { Tool, ToolDeps } from './Tool';

/**
 * ツールの登録・実行を管理するレジストリ
 */
export class ToolRegistry {
    tools: Map<string, Tool>;
    deps: ToolDeps;
    /**
     * @constructor
     */
    constructor() {
        this.tools = new Map();
        this.deps = {};
    }

    /**
     * ツールを登録して初期化する
     * @param {Tool} tool 登録するツールインスタンス
     */
    register(tool: Tool) {
        if (!tool || !tool.meta || !tool.meta.name) throw new Error('Invalid tool');
        this.tools.set(tool.meta.name, tool);
        try {
            if (typeof (tool as any).init === 'function') {
                (tool as any).init(this.deps);
            }
        } catch (err) {
            console.error('[ToolRegistry] tool.init failed for', tool.meta.name, err);
        }
    }

    /**
     * 指定名のツールを登録解除する
     * @param {string} name ツール名
     * @returns {boolean} 削除に成功したか
     */
    unregister(name: string) {
        return this.tools.delete(name);
    }

    /**
     * ツール取得
     * @param {string} name ツール名
     * @returns {Tool | undefined} ツールインスタンスまたは undefined
     */
    get(name: string) {
        return this.tools.get(name);
    }

    /**
     * 登録済みツールのメタ一覧を返す
     * @returns {Array<any>} メタ情報配列
     */
    list() {
        return Array.from(this.tools.values()).map(t => t.meta);
    }

    /**
     * 指定ツールを実行する
     * @param {string} name ツール名
     * @param {any} args 実行引数
     * @returns {Promise<any>} ツールの実行結果
     */
    async execute(name: string, args: any) {
        const tool = this.get(name);
        if (!tool) throw new Error(`Tool not found: ${name}`);
        return tool.run(args);
    }
    /**
     * 指定ディレクトリからツールを動的にロードする (互換用)
     * 非推奨: 動的ロードを使わない方針の場合は呼び出さないでください
     * @param {string} dir ディレクトリパス
    * @returns {Promise<void>} 非同期完了
     */
    async loadFromDirectory(dir: string) {
        const abs = path.resolve(dir);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return;
        const files = fs.readdirSync(abs).filter(f => f.endsWith('.js') || f.endsWith('.mjs'));
        for (const f of files) {
            try {
                const modPath = new URL(path.join(abs, f)).href;
                const mod = await import(modPath);
                const instance = mod.default || mod.tool || mod.instance;
                if (instance) this.register(instance as Tool);
            } catch (err) {
                console.error('[ToolRegistry] Failed to load tool', f, err);
            }
        }
    }

    /**
     * 依存注入の設定
     * @param {ToolDeps} deps 注入する依存オブジェクト
     * @returns {void}
     */
    setDeps(deps: ToolDeps) {
        this.deps = deps || {};
        for (const tool of this.tools.values()) {
            try {
                if (typeof (tool as any).init === 'function') (tool as any).init(this.deps);
            } catch (err) {
                console.error('[ToolRegistry] tool.init failed during setDeps for', tool.meta?.name, err);
            }
        }
    }
}
