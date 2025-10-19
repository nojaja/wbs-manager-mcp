import { jest } from '@jest/globals';
import WbsListTasksToolModule from '../../src/mcpServer/tools/wbsListTasksTool.js';
const WbsListTasksTool = WbsListTasksToolModule.default;

jest.mock('../../src/mcpServer/repositories/TaskRepository.js', () => ({
  TaskRepository: jest.fn().mockImplementation(() => ({ listTasks: jest.fn() })),
  default: jest.fn()
}));

import { TaskRepository } from '../../src/mcpServer/repositories/TaskRepository.js';

describe('wbs.planMode.listTasks tool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns list of tasks for top level when parentId omitted', async () => {
    const fakeTasks = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
    TaskRepository.mockImplementation(() => ({ listTasks: jest.fn().mockResolvedValue(fakeTasks) }));
    const tool = new WbsListTasksTool();
    const res = await tool.run({});
    expect(res).toBeDefined();
    expect(res.content[0].text).toContain('t1');
  });

  it('passes parentId to repository and returns tasks', async () => {
    const fakeTasks = [{ id: 'c1', parentId: 'p1', title: 'child' }];
    const listMock = jest.fn().mockResolvedValue(fakeTasks);
    TaskRepository.mockImplementation(() => ({ listTasks: listMock }));
    const tool = new WbsListTasksTool();
    const res = await tool.run({ parentId: 'p1' });
    expect(listMock).toHaveBeenCalledWith('p1');
    expect(res.content[0].text).toContain('c1');
  });

  it('returns llmHints on error', async () => {
    TaskRepository.mockImplementation(() => ({ listTasks: jest.fn().mockRejectedValue(new Error('boom')) }));
    const tool = new WbsListTasksTool();
    const res = await tool.run({});
    expect(res.llmHints).toBeDefined();
    expect(res.llmHints.nextActions[0].detail).toContain('Retry');
  });
});
