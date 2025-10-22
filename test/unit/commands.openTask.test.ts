import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';
import { OpenTaskHandler } from '../../src/extension/commands/openTask';

describe('openTaskCommandHandler', () => {
  it('opens task detail when item provided', () => {
    const context: any = { extensionUri: {} };
    const item: any = { itemId: 't1', label: 'task' };

  const createSpy = jest.spyOn(TaskDetailPanel, 'createOrShow').mockImplementation(() => {});

    const handler = new OpenTaskHandler();
    handler.handle(context, item);

    expect(createSpy).toHaveBeenCalledWith(context.extensionUri, 't1');
    createSpy.mockRestore();
  });
});
