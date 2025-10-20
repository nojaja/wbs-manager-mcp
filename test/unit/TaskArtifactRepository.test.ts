import { initializeDatabase, closeDatabase, resolveDatabasePath } from '../../src/mcpServer/db/connection';
import { TaskArtifactRepository } from '../../src/mcpServer/repositories/TaskArtifactRepository';
import { TaskRepository } from '../../src/mcpServer/repositories/TaskRepository';
import { ArtifactRepository } from '../../src/mcpServer/repositories/ArtifactRepository';
import fs from 'fs';
import path from 'path';

const testDbPath = path.join(process.cwd(), 'test-data', 'test-wbs.db');
const testDbDir = path.dirname(testDbPath);

describe('TaskArtifactRepository', () => {
  let tmpDir: string;

  beforeAll(() => {
    if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
  });

  beforeEach(async () => {
    // create a per-test temporary directory so each test uses its own DB file
    tmpDir = fs.mkdtempSync(path.join(testDbDir, 'tmp-'));
    process.env.WBS_MCP_DATA_DIR = tmpDir;
    await initializeDatabase();
  });

  afterEach(async () => {
    // Close any open DB handles for the resolved DB and remove the file and temp dir
    try {
      const dbPath = resolveDatabasePath();
      await closeDatabase(dbPath);
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      // remove the temporary directory recursively
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {
      // ignore cleanup errors
    }
    delete process.env.WBS_MCP_DATA_DIR;
  });

  it('creates task-artifact mapping and collects assignments', async () => {
    const taskRepo = new TaskRepository();
    const artRepo = new ArtifactRepository();
    const repo = new TaskArtifactRepository();

    const task = await taskRepo.createTask('T');
    const artifact = await artRepo.createArtifact('A', 'body');

    const assign = await repo.createTaskArtifactMap(task.id, artifact.id);
    expect(assign).toBeDefined();
    expect(assign.taskId).toBe(task.id);

    const ids = await repo.getArtifactIdsByTaskIds(task.id);
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);

    const map = await repo.collectTaskArtifacts([task.id]);
    expect(map.has(task.id)).toBe(true);
    const bucket = map.get(task.id)!;
    expect(bucket.deliverables.length).toBeGreaterThanOrEqual(1);
  });

  it('syncTaskArtifacts enforces artifact existence', async () => {
    const taskRepo = new TaskRepository();
    const repo = new TaskArtifactRepository();
    const task = await taskRepo.createTask('T2');

    await expect(repo.syncTaskArtifacts(task.id, 'deliverable' as any, [{ artifactId: 'no-exist' }], new Date().toISOString()))
      .rejects.toThrow();
  });
});
