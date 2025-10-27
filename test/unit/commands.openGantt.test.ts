import { OpenGanttHandler } from '../../src/extension/commands/openGantt';
import { GanttPanel } from '../../src/extension/views/panels/ganttPanel';

describe('OpenGanttHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens gantt panel with selected item', () => {
    const handler = new OpenGanttHandler();
    const context: any = { extensionUri: { path: '/' } };
    const item: any = { itemId: 'task-1', label: 'Task 1' };
    const createSpy = jest.spyOn(GanttPanel, 'createOrShow').mockImplementation(() => {});

    handler.handle(context, undefined, item);

    expect(createSpy).toHaveBeenCalledWith(context.extensionUri, {
      parentId: 'task-1',
      titleHint: 'Task 1'
    });
  });

  it('falls back to root when no item is provided', () => {
    const handler = new OpenGanttHandler();
    const context: any = { extensionUri: { path: '/' } };
    const treeView: any = { selection: [] };
    const createSpy = jest.spyOn(GanttPanel, 'createOrShow').mockImplementation(() => {});

    handler.handle(context, treeView);

    expect(createSpy).toHaveBeenCalledWith(context.extensionUri, {
      parentId: null,
      titleHint: undefined
    });
  });
});
