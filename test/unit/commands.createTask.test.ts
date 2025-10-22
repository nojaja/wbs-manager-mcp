import { CreateTaskHandler } from '../../src/extension/commands/createTask';
import { WBSTreeProvider } from '../../src/extension/views/explorer/wbsTree';
import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';

describe('createTaskCommandHandler', () => {
  it('creates a task and opens detail when taskId returned', async () => {
    const created = { taskId: 't1' };
    // fake provider and spy getInstance
    const fakeProvider: any = { createTask: jest.fn().mockResolvedValue(created) };
    jest.spyOn(WBSTreeProvider as any, 'getInstance').mockReturnValue(fakeProvider);
    // spy TaskDetailPanel.createOrShow to avoid webview creation
    const tdSpy = jest.spyOn(TaskDetailPanel as any, 'createOrShow').mockResolvedValue(undefined as any);

    const treeView: any = { selection: [] };
    const handler = new CreateTaskHandler();
    const res = await handler.handle({ extensionUri: {} } as any, treeView as any);

    expect(fakeProvider.createTask).toHaveBeenCalled();
    expect(res).toEqual(created);
    expect(tdSpy).toHaveBeenCalledWith({}, 't1');
  });
});
