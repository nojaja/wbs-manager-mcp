describe('addChildTaskCommandHandler', () => {
  it('creates a child task and opens detail', async () => {
    const wbsProvider: any = { createTask: async () => ({ taskId: 'c1' }) };
    const treeView: any = { selection: [{ id: 'root' }] };
    const opened: string[] = [];
    const showDetail = async (id: string) => { opened.push(id); };

    const mod = await import('../../src/extension/commands/addChildTask');
    const res = await mod.addChildTaskCommandHandler(wbsProvider, treeView, showDetail);
    expect(res.taskId).toBe('c1');
    expect(opened[0]).toBe('c1');
  });
});
