import { 
  WBSRepository,
  initializeDatabase, 
  Task,
  Artifact,
  TaskArtifactAssignment,
  TaskCompletionCondition
} from '../../src/mcpServer/db-simple';
import fs from 'fs';
import path from 'path';

// テスト用のデータベースパス
const testDbPath = path.join(process.cwd(), 'test-data', 'test-wbs.db');
const testDbDir = path.dirname(testDbPath);

describe('db-simple', () => {
  let repository: WBSRepository;

  beforeAll(async () => {
    // テスト用環境変数を設定
    process.env.WBS_MCP_DATA_DIR = path.dirname(testDbPath);
    
    // テストディレクトリが存在しない場合は作成
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    // 各テスト前にDBを初期化
    await initializeDatabase();
    repository = new WBSRepository();
  });

  afterEach(() => {
    // テスト後にDBファイルを削除
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterAll(() => {
    // テスト完了後にテストディレクトリを削除
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
    // 環境変数をクリア
    delete process.env.WBS_MCP_DATA_DIR;
  });

  describe('Task operations', () => {
    test('should create and retrieve a task', async () => {
      const title = 'Test Task';
      const description = 'Test Description';
      const assignee = 'Test Assignee';
      const estimate = '2 hours';

  const createdTask = await repository.createTask(title, description, null, assignee, estimate);
      expect(createdTask).toBeDefined();
      expect(createdTask.title).toBe(title);
      expect(createdTask.description).toBe(description);
      expect(createdTask.id).toBeDefined();

      const retrievedTask = await repository.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.title).toBe(title);
    });

    test('should get all tasks', async () => {
      const title = 'Test Task 1';
      const description = 'Test Description 1';

      await repository.createTask(title, description);
      const tasks = await repository.listTasks();
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.some((task: Task) => task.title === title)).toBe(true);
    });

    test('should update a task', async () => {
      const createdTask = await repository.createTask('Original Task', 'Original Description');
      const updateData = {
        title: 'Updated Task',
        description: 'Updated Description',
        status: 'in-progress'
      };

      const updatedTask = await repository.updateTask(createdTask.id, updateData);
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.title).toBe(updateData.title);
      expect(updatedTask!.description).toBe(updateData.description);
      expect(updatedTask!.status).toBe(updateData.status);
    });

    test('should delete a task', async () => {
      const createdTask = await repository.createTask('Task to Delete', 'This task will be deleted');
      await repository.deleteTask(createdTask.id);

      const deletedTask = await repository.getTask(createdTask.id);
      expect(deletedTask).toBeNull();
    });

    test('should create task with parent_id', async () => {
      const parentTask = await repository.createTask('Parent Task', 'Parent Description');

      const childTask = await repository.createTask('Child Task', 'Child Description', parentTask.id);

      expect(childTask.parent_id).toBe(parentTask.id);
    });

    test('should return null for non-existent task', async () => {
      const task = await repository.getTask('non-existent-id');
      expect(task).toBeNull();
    });
  });

  describe('Artifact operations', () => {
    test('should get all artifacts', async () => {
      const artifacts = await repository.listArtifacts();
      expect(Array.isArray(artifacts)).toBe(true);
    });

    test('should return null for non-existent artifact', async () => {
      const artifact = await repository.getArtifact('non-existent-id');
      expect(artifact).toBeNull();
    });

    test('should delete an artifact', async () => {
      // まず既存のアーティファクトがある場合のテスト
      const result = await repository.deleteArtifact('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('Task move operations', () => {
    test('should move task to new parent', async () => {
      const parentTask = await repository.createTask('Parent Task', 'Parent Description');

      const childTask = await repository.createTask('Child Task', 'Child Description');

      const movedTask = await repository.moveTask(childTask.id, parentTask.id);
      expect(movedTask.parent_id).toBe(parentTask.id);
    });

    test('should move task to root level', async () => {
      const parentTask = await repository.createTask('Parent Task', 'Parent Description');

      const childTask = await repository.createTask('Child Task', 'Child Description', parentTask.id);

      const movedTask = await repository.moveTask(childTask.id, null);
      expect(movedTask.parent_id).toBeNull();
    });
  });

  describe('Import tasks operation', () => {
    test('should import multiple tasks', async () => {
      const tasksToImport = [
        { title: 'Task A', description: 'First' },
        { title: 'Task B', description: 'Second' },
        { title: 'Task C', description: 'Third' }
      ];

      const created = await repository.importTasks(tasksToImport);
      expect(Array.isArray(created)).toBe(true);
      expect(created.length).toBe(3);

      const listed = await repository.listTasks();
      expect(listed.length).toBeGreaterThanOrEqual(3);
      const titles = listed.map(t => t.title);
      expect(titles).toEqual(expect.arrayContaining(['Task A', 'Task B', 'Task C']));
    });

    test('should import empty task list', async () => {
      const created = await repository.importTasks([]);
      expect(Array.isArray(created)).toBe(true);
      expect(created.length).toBe(0);
    });
  });

  describe('Advanced task operations', () => {
    test('should create task with all parameters', async () => {
      const task = await repository.createTask(
        'Complex Task',
        'Detailed description',
        null,
        'John Doe',
        '4 hours'
      );

      expect(task.title).toBe('Complex Task');
      expect(task.description).toBe('Detailed description');
      expect(task.assignee).toBe('John Doe');
      expect(task.estimate).toBe('4 hours');
      expect(task.status).toBe('pending');
    });

    test('should update task with partial data', async () => {
      const task = await repository.createTask('Original', 'Original desc');
      
      const updated = await repository.updateTask(task.id, { 
        status: 'completed',
        assignee: 'Jane Doe'
      });

      expect(updated!.title).toBe('Original'); // unchanged
      expect(updated!.status).toBe('completed'); // updated
      expect(updated!.assignee).toBe('Jane Doe'); // updated
    });

    test('should get task with nested structure', async () => {
      const parent = await repository.createTask('Parent', 'Parent description');
      const child = await repository.createTask('Child', 'Child description', parent.id);
      
      const retrieved = await repository.getTask(parent.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.children).toBeDefined();
    });
  });

  describe('Error handling', () => {
    test('should handle update of non-existent task', async () => {
      await expect(repository.updateTask('non-existent-id', { title: 'Updated' }))
        .rejects.toThrow('Task not found: non-existent-id');
    });

    test('should handle move with invalid parent', async () => {
      const task = await repository.createTask('Test Task', 'Test Description');

      await expect(repository.moveTask(task.id, 'non-existent-parent'))
        .rejects.toThrow();
    });

    test('should handle move task to itself as parent', async () => {
      const task = await repository.createTask('Test Task', 'Test Description');

      await expect(repository.moveTask(task.id, task.id))
        .rejects.toThrow();
    });

    test('should handle delete of non-existent task', async () => {
      const result = await repository.deleteTask('non-existent-id');
      expect(result).toBe(false);
    });

    test('should handle move of non-existent task', async () => {
      await expect(repository.moveTask('non-existent-id', null))
        .rejects.toThrow();
    });
  });

  describe('Database initialization', () => {
    test('should initialize database successfully', async () => {
      // initializeDatabase is called in beforeEach, this test ensures it works
      const tasks = await repository.listTasks();
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  describe('listTasks with parentId parameter', () => {
    test('should return top-level tasks when parentId is null', async () => {
      const parentTask = await repository.createTask('Parent Task', 'Parent Description');
      const childTask = await repository.createTask('Child Task', 'Child Description', parentTask.id);

      const topLevelTasks = await repository.listTasks(null);
      
      expect(Array.isArray(topLevelTasks)).toBe(true);
      expect(topLevelTasks.some(task => task.id === parentTask.id)).toBe(true);
      expect(topLevelTasks.some(task => task.id === childTask.id)).toBe(false);
    });

    test('should return child tasks when parentId is specified', async () => {
      const parentTask = await repository.createTask('Parent Task', 'Parent Description');
      const childTask1 = await repository.createTask('Child Task 1', 'Child Description 1', parentTask.id);
      const childTask2 = await repository.createTask('Child Task 2', 'Child Description 2', parentTask.id);

      const childTasks = await repository.listTasks(parentTask.id);
      
      expect(Array.isArray(childTasks)).toBe(true);
      expect(childTasks.length).toBe(2);
      expect(childTasks.some(task => task.id === childTask1.id)).toBe(true);
      expect(childTasks.some(task => task.id === childTask2.id)).toBe(true);
    });

    test('should return empty array when no child tasks exist', async () => {
      const parentTask = await repository.createTask('Parent Task', 'Parent Description');

      const childTasks = await repository.listTasks(parentTask.id);
      
      expect(Array.isArray(childTasks)).toBe(true);
      expect(childTasks.length).toBe(0);
    });

    test('should return hierarchical structure when parentId is undefined', async () => {
  // 仕様変更: parentIdがundefinedの場合はトップレベルのみ返す
  const parentTask = await repository.createTask('Parent Task', 'Parent Description');
  const childTask = await repository.createTask('Child Task', 'Child Description', parentTask.id);

  const topLevelTasks = await repository.listTasks(undefined);

  expect(Array.isArray(topLevelTasks)).toBe(true);
  // トップレベルに親タスクのみが含まれる
  expect(topLevelTasks.some(task => task.id === parentTask.id)).toBe(true);
  // 子タスクはトップレベルには含まれない
  expect(topLevelTasks.some(task => task.id === childTask.id)).toBe(false);
    });
  });

  describe('Relative path support', () => {
    test('should resolve relative path correctly', () => {
      const originalEnv = process.env.WBS_MCP_DATA_DIR;
      const originalCwd = process.cwd();
      
      try {
        // 相対パス "." を設定
        process.env.WBS_MCP_DATA_DIR = '.';
        
        // db-simpleモジュールを再ロードして新しい環境変数を反映
        delete require.cache[require.resolve('../../src/mcpServer/db-simple')];
        const { WBSRepository: TestRepository } = require('../../src/mcpServer/db-simple');
        
        // 相対パスが正しく現在の作業ディレクトリを基準に解決されることを確認
        // 実際のパス解決はresolveDatabasePath内で行われるため、
        // ここではエラーなくRepositoryが作成できることを確認
        expect(() => new TestRepository()).not.toThrow();
        
      } finally {
        // 環境変数を元に戻す
        process.env.WBS_MCP_DATA_DIR = originalEnv;
      }
    });
  });
});