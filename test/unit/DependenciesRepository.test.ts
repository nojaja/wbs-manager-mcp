import { initializeDatabase } from '../../src/mcpServer/db/connection';
import { DependenciesRepository } from '../../src/mcpServer/repositories/DependenciesRepository';
import { TaskRepository } from '../../src/mcpServer/repositories/TaskRepository';
import { ArtifactRepository } from '../../src/mcpServer/repositories/ArtifactRepository';
import fs from 'fs';
import path from 'path';

const testDbPath = path.join(process.cwd(), 'test-data', 'test-wbs.db');
const testDbDir = path.dirname(testDbPath);

describe('DependenciesRepository', () => {
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

  it('createDependency throws when tasks missing', async () => {
    const repo = new DependenciesRepository();
    await expect(repo.createDependency('nope', 'nope2', [])).rejects.toThrow();
  });

  it('createDependency and collectDependenciesForTasks works with artifacts', async () => {
    const taskRepo = new TaskRepository();
    const artRepo = new ArtifactRepository();
    const repo = new DependenciesRepository();

    const t1 = await taskRepo.createTask('From');
    const t2 = await taskRepo.createTask('To');
    const art = await artRepo.createArtifact('Art', 'body');

    const dep = await repo.createDependency(t1.id, t2.id, [art.id]);
    expect(dep).toBeDefined();
    const map = await repo.collectDependenciesForTasks([t1.id, t2.id]);
    expect(map.has(t1.id)).toBe(true);
    expect(map.has(t2.id)).toBe(true);
    const bucket1 = map.get(t1.id)!;
    expect(bucket1.dependents.length).toBeGreaterThanOrEqual(1);
  });
});
