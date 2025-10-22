describe('deleteTaskCommandHandler', () => {
  it('calls wbsProvider.deleteTask with selected or provided target', async () => {
    const called: any[] = [];
    const wbsProvider: any = { deleteTask: async (t: any) => { called.push(t); return true; } };
    const treeView: any = { selection: [{ id: 'x' }] };
    const mod = await import('../../src/extension/commands/deleteTask');
  const { DeleteTaskHandler } = mod;
  const handler = new DeleteTaskHandler();
  const res = await handler.handle(wbsProvider, treeView.selection[0]);
    expect(called[0]).toBe(treeView.selection[0]);
    expect(res).toBe(true);
  });
});
