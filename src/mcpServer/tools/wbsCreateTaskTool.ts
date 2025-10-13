import { Tool } from './Tool';

/**
 * wbs.createTask ツール
 */
export default class WbsCreateTaskTool extends Tool {
    repo: any | null;
    /**
     * @constructor
     */
    constructor() {
        super({
            name: 'wbs.createTask',
            description: 'Create a new task (tool plugin wrapper)',
            inputSchema: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Task title' },
                    description: { type: 'string', description: 'Task description' },
                    assignee: { type: 'string', description: 'Assignee name' },
                    estimate: { type: 'string', description: 'Time estimate' },
                    completionConditions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { description: { type: 'string' } },
                            required: ['description']
                        }
                    },
                    parentId: { type: 'string', description: 'Parent task ID' },
                    deliverables: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } },
                            required: ['artifactId']
                        }
                    },
                    prerequisites: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } },
                            required: ['artifactId']
                        }
                    }
                },
                required: ['title']
            }
        });
        this.repo = null;
    }

    /**
     * @param deps DIで注入される依存
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * タスク作成処理 (ツール呼び出しから)
     * @param args ツール引数 (title, description, parentId, assignee, estimate)
    * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const task = await repo.createTask(
                args.title,
                args.description ?? '',
                args.parentId ?? null,
                args.assignee ?? null,
                args.estimate ?? null,
                {
                    deliverables: Array.isArray(args.deliverables) ? args.deliverables.map((item: any) => ({
                        artifactId: item?.artifactId,
                        crudOperations: item?.crudOperations ?? item?.crud ?? null
                    })) : [],
                    prerequisites: Array.isArray(args.prerequisites) ? args.prerequisites.map((item: any) => ({
                        artifactId: item?.artifactId,
                        crudOperations: item?.crudOperations ?? item?.crud ?? null
                    })) : [],
                    completionConditions: Array.isArray(args.completionConditions)
                        ? args.completionConditions
                            .filter((item: any) => typeof item?.description === 'string' && item.description.trim().length > 0)
                            .map((item: any) => ({ description: item.description.trim() }))
                        : []
                }
            );
            return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to create task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsCreateTaskTool();
