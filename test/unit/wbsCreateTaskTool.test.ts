import { jest } from '@jest/globals';

const TaskRepository = require('../../src/mcpServer/repositories/TaskRepository').TaskRepository;
const DependenciesRepository = require('../../src/mcpServer/repositories/DependenciesRepository').DependenciesRepository;
const WbsCreateTaskTool = require('../../src/mcpServer/tools/wbsCreateTaskTool').default;

describe('wbs.planMode.createTask tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Remove any prototype overrides to avoid leaking mocks between tests
    try {
      if (TaskRepository && TaskRepository.prototype && TaskRepository.prototype.createTask) {
        delete TaskRepository.prototype.createTask;
      }
    } catch (e) { /* ignore */ }
    try {
      if (DependenciesRepository && DependenciesRepository.prototype && DependenciesRepository.prototype.createDependency) {
        delete DependenciesRepository.prototype.createDependency;
      }
    } catch (e) { /* ignore */ }
    jest.clearAllMocks();
  });

  it('creates task with minimal required fields and returns task JSON', async () => {
    const fakeTask = { id: 'task-1', title: 'Hello' };
    // Mock instance method on prototype so new instances use the mock
    TaskRepository.prototype.createTask = (jest.fn() as any).mockResolvedValue(fakeTask);

    const tool = new WbsCreateTaskTool();
    const res = await tool.run({ title: 'Hello' });

    expect(res).toBeDefined();
    expect(res.content).toBeInstanceOf(Array);
    expect(res.content[0].text).toContain('task-1');
  });

  it('normalizes artifacts and creates dependencies', async () => {
    const fakeTask = { id: 'task-2', title: 'WithDeps' };
    const createTaskMock = (jest.fn() as any).mockResolvedValue(fakeTask);
    TaskRepository.prototype.createTask = createTaskMock;

  const createDepMock = (jest.fn() as any).mockResolvedValue({ dependencyId: 'dep-1' });
  DependenciesRepository.prototype.createDependency = createDepMock;

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
  TaskRepository.prototype.createTask = (jest.fn() as any).mockRejectedValue(err);
    const tool = new WbsCreateTaskTool();
    const res = await tool.run({ title: 'Fail' });
    expect(res.llmHints).toBeDefined();
    expect(res.llmHints.nextActions.some((a: any) => a.action === 'retryCreate')).toBe(true);
  });
});
