import { jest } from '@jest/globals';
import WbsCreateTaskToolModule from '../../src/mcpServer/tools/wbsCreateTaskTool.js';

// Dynamic import pattern: the tool exports default class and instance
const WbsCreateTaskTool = WbsCreateTaskToolModule.default;

// Mock TaskRepository and DependenciesRepository used inside the tool
jest.mock('../../src/mcpServer/repositories/TaskRepository.js', () => {
  return {
    TaskRepository: jest.fn().mockImplementation(() => ({
      createTask: jest.fn()
    })),
    default: jest.fn()
  };
});

jest.mock('../../src/mcpServer/repositories/DependenciesRepository.js', () => {
  return {
    DependenciesRepository: jest.fn().mockImplementation(() => ({
      createDependency: jest.fn()
    })),
    default: jest.fn()
  };
});

import { TaskRepository } from '../../src/mcpServer/repositories/TaskRepository.js';
import { DependenciesRepository } from '../../src/mcpServer/repositories/DependenciesRepository.js';

describe('wbs.planMode.createTask tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates task with minimal required fields and returns task JSON', async () => {
    const fakeTask = { id: 'task-1', title: 'Hello' };
    TaskRepository.mock.instances[0]?.createTask?.mockResolvedValueOnce?.(fakeTask);
    // If mock not instantiated yet, we set the prototype
    if (!TaskRepository.mock.instances[0]) {
      TaskRepository.mockImplementation(() => ({ createTask: jest.fn().mockResolvedValue(fakeTask) }));
    }

    const tool = new WbsCreateTaskTool();
    const res = await tool.run({ title: 'Hello' });

    expect(res).toBeDefined();
    expect(res.content).toBeInstanceOf(Array);
    expect(res.content[0].text).toContain('task-1');
  });

  it('normalizes artifacts and creates dependencies', async () => {
    const fakeTask = { id: 'task-2', title: 'WithDeps' };
    const createTaskMock = jest.fn().mockResolvedValue(fakeTask);
    TaskRepository.mockImplementation(() => ({ createTask: createTaskMock }));

    const createDepMock = jest.fn().mockResolvedValue({ dependencyId: 'dep-1' });
    DependenciesRepository.mockImplementation(() => ({ createDependency: createDepMock }));

    const tool = new WbsCreateTaskTool();
    const res = await tool.run({
      title: 'WithDeps',
      artifacts: [{ artifactId: 'a1', crudOperations: 'C' }],
      dependency: [{ taskId: 'succ-1', artifacts: ['a1'] }]
    });

    expect(createTaskMock).toHaveBeenCalled();
    expect(createDepMock).toHaveBeenCalledWith('task-2', 'succ-1', ['a1']);
    expect(res.dependencies).toBeInstanceOf(Array);
    expect(res.dependencies[0].success).toBe(true);
  });

  it('returns helpful llmHints on repository error', async () => {
    const err = new Error('DB down');
    TaskRepository.mockImplementation(() => ({ createTask: jest.fn().mockRejectedValue(err) }));
    const tool = new WbsCreateTaskTool();
    const res = await tool.run({ title: 'Fail' });
    expect(res.llmHints).toBeDefined();
    expect(res.llmHints.nextActions.some(a => a.action === 'retryCreate')).toBe(true);
  });
});
