import { jest } from '@jest/globals';

describe('createTaskCommandHandler', () => {
  it('creates a task and opens detail when taskId returned', async () => {
    const created = { taskId: 't1' };
  const wbsProvider: any = { createTask: async () => created };
    const treeView: any = { selection: [] };
    const opened: string[] = [];
    const showDetail = async (id: string) => { opened.push(id); };

    const mod = await import('../../src/extension/commands/createTask');
    const res = await mod.createTaskCommandHandler(wbsProvider, treeView, showDetail);
    expect(res).toBe(created);
    expect(opened[0]).toBe('t1');
  });
});
