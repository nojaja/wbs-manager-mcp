import { AddChildTaskHandler } from '../../src/extension/commands/addChildTask';
import { WBSTreeProvider } from '../../src/extension/views/explorer/wbsTree';
import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';

describe('addChildTaskCommandHandler', () => {
  it('creates a child task and opens detail', async () => {
    const fakeProvider: any = { createTask: jest.fn().mockResolvedValue({ taskId: 'c1' }) };
    jest.spyOn(WBSTreeProvider as any, 'getInstance').mockReturnValue(fakeProvider);
    const tdSpy = jest.spyOn(TaskDetailPanel as any, 'createOrShow').mockResolvedValue(undefined as any);

    const treeView: any = { selection: [{ id: 'root' }] };
    const handler = new AddChildTaskHandler();
    const res = await handler.handle({ extensionUri: {} } as any, treeView.selection[0], treeView);

    expect(fakeProvider.createTask).toHaveBeenCalled();
    expect(res.taskId).toBe('c1');
    expect(tdSpy).toHaveBeenCalled();
  });
});
