describe('deleteTaskCommandHandler', () => {
  it('calls wbsProvider.deleteTask with selected or provided target', async () => {
    const called: any[] = [];
    const fakeProvider: any = { deleteTask: async (t: any) => { called.push(t); return true; } };
    const treeView: any = { selection: [{ id: 'x' }] };

    const { DeleteTaskHandler } = require('../../src/extension/commands/deleteTask');
    const WBSTreeProvider = require('../../src/extension/views/explorer/wbsTree').WBSTreeProvider;
    jest.spyOn(WBSTreeProvider as any, 'getInstance').mockReturnValue(fakeProvider);

    const handler = new DeleteTaskHandler();
    const res = await handler.handle(treeView, treeView.selection[0]);
    expect(called[0]).toBe(treeView.selection[0]);
    expect(res).toBe(true);
  });
});
