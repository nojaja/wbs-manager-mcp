describe('openTaskCommandHandler', () => {
  it('opens task detail when item provided', async () => {
    const context: any = { extensionUri: {} };
    const item: any = { itemId: 't1', label: 'task' };
    const taskClient: any = {};
    const artifactClient: any = {};

    const modPanel = await import('../../src/extension/views/panels/taskDetailPanel');
    const orig = modPanel.TaskDetailPanel;
    modPanel.TaskDetailPanel = { createOrShow: jest.fn() } as any;

    const mod = await import('../../src/extension/commands/openTask');
    mod.openTaskCommandHandler(context, item, taskClient, artifactClient);

    expect((modPanel.TaskDetailPanel as any).createOrShow).toHaveBeenCalledWith(context.extensionUri, 't1', { taskClient, artifactClient });

    modPanel.TaskDetailPanel = orig;
  });
});
