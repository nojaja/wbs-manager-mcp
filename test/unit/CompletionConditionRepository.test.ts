import { initializeDatabase } from '../../src/mcpServer/db/connection';
import { CompletionConditionRepository } from '../../src/mcpServer/repositories/CompletionConditionRepository';
import { TaskRepository } from '../../src/mcpServer/repositories/TaskRepository';
import fs from 'fs';
import path from 'path';

const testDbPath = path.join(process.cwd(), 'test-data', 'test-wbs.db');
const testDbDir = path.dirname(testDbPath);

describe('CompletionConditionRepository', () => {
  beforeAll(() => {
    if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
  });

  beforeEach(async () => {
    process.env.WBS_MCP_DATA_DIR = path.dirname(testDbPath);
    await initializeDatabase();
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.WBS_MCP_DATA_DIR;
  });

  it('creates and retrieves completion conditions', async () => {
    const taskRepo = new TaskRepository();
    const repo = new CompletionConditionRepository();

    const task = await taskRepo.createTask('Task for CC', 'desc');
    const created = await repo.createCompletionCondition(task.id, 'do something');

    expect(created).toBeDefined();
    expect(created.task_id).toBe(task.id);
    expect(created.order).toBe(0);

    const byTask = await repo.getCompletionConditionByTaskId(task.id);
    expect(Array.isArray(byTask)).toBe(true);
    expect(byTask.length).toBe(1);
    expect(byTask[0].description).toBe('do something');
  });

  it('syncTaskCompletionConditions replaces and trims entries', async () => {
    const taskRepo = new TaskRepository();
    const repo = new CompletionConditionRepository();

    const task = await taskRepo.createTask('Task for sync', 'desc');
    await repo.createCompletionCondition(task.id, 'first');

    const now = new Date().toISOString();
    await repo.syncTaskCompletionConditions(task.id, [
      { description: '  one  ' },
      { description: 'two' },
      { description: '   ' },
    ], now);

    const list = await repo.getCompletionConditionByTaskId(task.id);
    expect(list.length).toBe(2);
    expect(list[0].order).toBe(0);
    expect(list[0].description).toBe('one');
    expect(list[1].order).toBe(1);
  });

  it('collectCompletionConditions returns map with empty arrays for missing keys', async () => {
    const taskRepo = new TaskRepository();
    const repo = new CompletionConditionRepository();

    const t1 = await taskRepo.createTask('T1');
    const t2 = await taskRepo.createTask('T2');

    await repo.createCompletionCondition(t1.id, 'x');

    const map = await repo.collectCompletionConditions([t1.id, t2.id]);
    expect(map.has(t1.id)).toBe(true);
    expect(map.has(t2.id)).toBe(true);
    expect(map.get(t2.id)).toBeInstanceOf(Array);
  });
});
