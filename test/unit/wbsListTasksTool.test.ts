import { jest } from '@jest/globals';

let WbsListTasksTool: any;
let TaskRepository: any;

beforeAll(async () => {
  const taskMod: any = await import('../../src/mcpServer/repositories/TaskRepository');
  TaskRepository = taskMod.TaskRepository;
  const mod: any = await import('../../src/mcpServer/tools/wbsListTasksTool');
  WbsListTasksTool = mod.default;
});

describe('wbs.planMode.listTasks tool', () => {
  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    try {
      if (TaskRepository && TaskRepository.prototype && TaskRepository.prototype.listTasks) {
        delete TaskRepository.prototype.listTasks;
      }
    } catch (e) { /* ignore */ }
    jest.clearAllMocks();
  });

  it('returns list of tasks for top level when parentId omitted', async () => {
    const fakeTasks = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
  TaskRepository.prototype.listTasks = (jest.fn() as any).mockResolvedValue(fakeTasks);
    const tool = new WbsListTasksTool();
    const res = await tool.run({});
    expect(res).toBeDefined();
    expect(res.content[0].text).toContain('t1');
  });

  it('passes parentId to repository and returns tasks', async () => {
    const fakeTasks = [{ id: 'c1', parentId: 'p1', title: 'child' }];
  const listMock = (jest.fn() as any).mockResolvedValue(fakeTasks);
    TaskRepository.prototype.listTasks = listMock;
    const tool = new WbsListTasksTool();
    const res = await tool.run({ parentId: 'p1' });
    expect(listMock).toHaveBeenCalledWith('p1');
    expect(res.content[0].text).toContain('c1');
  });

  it('returns llmHints on error', async () => {
  TaskRepository.prototype.listTasks = (jest.fn() as any).mockRejectedValue(new Error('boom'));
    const tool = new WbsListTasksTool();
    const res = await tool.run({});
    expect(res.llmHints).toBeDefined();
    expect(res.llmHints.nextActions[0].detail).toContain('Retry');
  });
});
