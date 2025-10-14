import { WBSService } from '../../src/extension/services/WBSService';
import { WBSTreeProvider } from '../../src/extension/views/wbsTree';
import { ArtifactTreeProvider } from '../../src/extension/views/artifactTree';

// モックの設定
jest.mock('../../src/extension/views/wbsTree');
jest.mock('../../src/extension/views/artifactTree');

const MockedWBSTreeProvider = WBSTreeProvider as jest.MockedClass<typeof WBSTreeProvider>;
const MockedArtifactTreeProvider = ArtifactTreeProvider as jest.MockedClass<typeof ArtifactTreeProvider>;

describe('WBSService', () => {
  let wbsService: WBSService;
  let mockTaskClient: any;
  let mockArtifactClient: any;
  let mockWbsProvider: jest.Mocked<WBSTreeProvider>;
  let mockArtifactProvider: jest.Mocked<ArtifactTreeProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockTaskClient = {
      listTasks: jest.fn(),
      getTask: jest.fn(),
      createTask: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
      moveTask: jest.fn(),
    };

    mockArtifactClient = {
      listArtifacts: jest.fn(),
      getArtifact: jest.fn(),
      createArtifact: jest.fn(),
      updateArtifact: jest.fn(),
      deleteArtifact: jest.fn()
    };

    mockWbsProvider = {
      refresh: jest.fn(),
      createTask: jest.fn(),
      deleteTask: jest.fn(),
      handleTaskDrop: jest.fn(),
      getTreeItem: jest.fn(),
      getChildren: jest.fn(),
      onDidChangeTreeData: {} as any
    } as any;

    mockArtifactProvider = {
      refresh: jest.fn(),
      createArtifact: jest.fn(),
      editArtifact: jest.fn(),
      deleteArtifact: jest.fn(),
      getTreeItem: jest.fn(),
      getChildren: jest.fn(),
      onDidChangeTreeData: {} as any
    } as any;

    MockedWBSTreeProvider.mockImplementation(() => mockWbsProvider);
    MockedArtifactTreeProvider.mockImplementation(() => mockArtifactProvider);

  wbsService = new WBSService({
    taskClient: mockTaskClient,
    artifactClient: mockArtifactClient
  }, { wbsProvider: mockWbsProvider as any, artifactProvider: mockArtifactProvider as any });
  });

  describe('API methods (list/get/create/update/delete/move)', () => {
  it('listTasksApi delegates to task client', async () => {
      const tasks = [{ id: 't1', title: 'Task1' }];
      mockTaskClient.listTasks.mockResolvedValue(tasks);

      const res = await wbsService.listTasksApi(null);

      expect(mockTaskClient.listTasks).toHaveBeenCalledWith(null);
      expect(res).toBe(tasks);
    });

  it('getTaskApi delegates to task client', async () => {
      mockTaskClient.getTask
        .mockResolvedValueOnce({ id: 't1', title: 'Task1' })
        .mockResolvedValueOnce(null);

      const ok = await wbsService.getTaskApi('t1');
      expect(mockTaskClient.getTask).toHaveBeenCalledWith('t1');
      expect(ok).toEqual({ id: 't1', title: 'Task1' });

      const ng = await wbsService.getTaskApi('t1');
      expect(ng).toBeNull();
    });

  it('createTaskApi sanitizes inputs and delegates to task client', async () => {
  mockTaskClient.createTask.mockResolvedValue({ success: true, taskId: '42', message: '- done' });

      const res = await wbsService.createTaskApi({
        title: ' A ',
        deliverables: [
          { artifactId: ' art1 ', crudOperations: ' create ' },
          { artifactId: '   ' },
          null as any
        ],
        completionConditions: [
          { description: '   ' },
          { description: 'Finish' }
        ]
      });

  expect(mockTaskClient.createTask).toHaveBeenCalledWith({
        title: ' A ',
        description: '',
        parentId: null,
        assignee: null,
        estimate: null,
        deliverables: [{ artifactId: 'art1', crudOperations: 'create' }],
        completionConditions: [{ description: 'Finish' }]
      });
      expect(res).toEqual({ success: true, taskId: '42', message: '- done' });
    });

  it('updateTaskApi sanitizes inputs and returns client result', async () => {
  mockTaskClient.updateTask.mockResolvedValue({ success: true, taskId: 't1', message: '- updated' });

      const res = await wbsService.updateTaskApi('t1', {
        deliverables: [{ artifactId: ' art1 ', crudOperations: ' ' }],
        prerequisites: [{ artifactId: 'art2', crudOperations: ' read ' }],
        completionConditions: [{ description: ' done ' }, { description: '   ' }],
        extra: 'keep'
      });

  expect(mockTaskClient.updateTask).toHaveBeenCalledWith('t1', {
        deliverables: [{ artifactId: 'art1' }],
        prerequisites: [{ artifactId: 'art2', crudOperations: 'read' }],
        completionConditions: [{ description: 'done' }],
        extra: 'keep'
      });
      expect(res).toEqual({ success: true, taskId: 't1', message: '- updated' });
    });

  it('updateTaskApi propagates conflict and error', async () => {
      mockTaskClient.updateTask
        .mockResolvedValueOnce({ success: false, conflict: true, error: 'conflict' })
        .mockResolvedValueOnce({ success: false, error: 'error' });

      const conflict = await wbsService.updateTaskApi('t1', {});
      expect(conflict).toEqual({ success: false, conflict: true, error: 'conflict' });

      const error = await wbsService.updateTaskApi('t1', {});
      expect(error).toEqual({ success: false, error: 'error' });
    });

  it('deleteTaskApi and moveTaskApi delegate to client', async () => {
  mockTaskClient.deleteTask.mockResolvedValue({ success: true, taskId: 't1' });
  mockTaskClient.moveTask.mockResolvedValue({ success: true, taskId: 't1' });

      const d = await wbsService.deleteTaskApi('t1');
      const m = await wbsService.moveTaskApi('t1', 'p1');

  expect(mockTaskClient.deleteTask).toHaveBeenCalledWith('t1');
  expect(mockTaskClient.moveTask).toHaveBeenCalledWith('t1', 'p1');
      expect(d).toEqual({ success: true, taskId: 't1' });
      expect(m).toEqual({ success: true, taskId: 't1' });
    });
  });

  describe('Artifact API methods', () => {
  it('listArtifactsApi delegates to artifact client', async () => {
      const artifacts = [{ id: 'a1' }];
  mockArtifactClient.listArtifacts.mockResolvedValue(artifacts);
      const res = await wbsService.listArtifactsApi();
  expect(mockArtifactClient.listArtifacts).toHaveBeenCalledWith();
      expect(res).toBe(artifacts);
    });

  it('getArtifactApi delegates to client', async () => {
  mockArtifactClient.getArtifact.mockResolvedValueOnce({ id: 'a1' }).mockResolvedValueOnce(null);
      const ok = await wbsService.getArtifactApi('a1');
      const ng = await wbsService.getArtifactApi('a1');
  expect(mockArtifactClient.getArtifact).toHaveBeenNthCalledWith(1, 'a1');
      expect(ok).toEqual({ id: 'a1' });
      expect(ng).toBeNull();
    });

  it('createArtifactApi delegates and returns result', async () => {
      const result = { success: true, artifact: { id: 'a1' }, message: '- created' };
  mockArtifactClient.createArtifact.mockResolvedValue(result);
      const res = await wbsService.createArtifactApi({ title: 'x', uri: undefined, description: null });
  expect(mockArtifactClient.createArtifact).toHaveBeenCalledWith({ title: 'x', uri: null, description: null });
      expect(res).toBe(result);
    });

  it('updateArtifactApi delegates and returns result', async () => {
      const result = { success: true, artifact: { id: 'a1' } };
  mockArtifactClient.updateArtifact.mockResolvedValue(result);
      const res = await wbsService.updateArtifactApi({ artifactId: 'a1', title: 'T', uri: undefined, description: undefined, version: 2 });
  expect(mockArtifactClient.updateArtifact).toHaveBeenCalledWith({ artifactId: 'a1', title: 'T', uri: null, description: null, version: 2 });
      expect(res).toBe(result);
    });

  it('deleteArtifactApi delegates and returns result', async () => {
      const result = { success: true };
  mockArtifactClient.deleteArtifact.mockResolvedValue(result);
      const res = await wbsService.deleteArtifactApi('a1');
  expect(mockArtifactClient.deleteArtifact).toHaveBeenCalledWith('a1');
      expect(res).toBe(result);
    });
  });

  describe('constructor', () => {
    it('should create WBSService with providers', () => {
      expect(wbsService.wbsProvider).toBe(mockWbsProvider);
      expect(wbsService.artifactProvider).toBe(mockArtifactProvider);
    });
  });

  describe('refreshWbsTree', () => {
    it('should call wbsProvider.refresh', () => {
      wbsService.refreshWbsTree();
      
      expect(mockWbsProvider.refresh).toHaveBeenCalled();
    });
  });

  describe('createTask', () => {
    it('should call wbsProvider.createTask without selected', async () => {
      const expectedResult = { success: true, taskId: 'new-task' };
      mockWbsProvider.createTask.mockResolvedValue(expectedResult);
      
      const result = await wbsService.createTask();
      
      expect(mockWbsProvider.createTask).toHaveBeenCalledWith(undefined);
      expect(result).toBe(expectedResult);
    });

    it('should call wbsProvider.createTask with selected', async () => {
      const selected = { contextValue: 'task', itemId: 't1' };
      const expectedResult = { success: true, taskId: 'new-task' };
      mockWbsProvider.createTask.mockResolvedValue(expectedResult);
      
      const result = await wbsService.createTask(selected);
      
      expect(mockWbsProvider.createTask).toHaveBeenCalledWith(selected);
      expect(result).toBe(expectedResult);
    });
  });

  describe('deleteTask', () => {
    it('should call wbsProvider.deleteTask', async () => {
      const target = { contextValue: 'task', task: { id: 't1' } };
      const expectedResult = { success: true };
      mockWbsProvider.deleteTask.mockResolvedValue(expectedResult);
      
      const result = await wbsService.deleteTask(target);
      
      expect(mockWbsProvider.deleteTask).toHaveBeenCalledWith(target);
      expect(result).toBe(expectedResult);
    });
  });

  describe('addChildTask', () => {
    it('should call wbsProvider.createTask with target as parent', async () => {
      const target = { contextValue: 'task', task: { id: 't1' } };
      const expectedResult = { success: true, taskId: 'child-task' };
      mockWbsProvider.createTask.mockResolvedValue(expectedResult);
      
      const result = await wbsService.addChildTask(target);
      
      expect(mockWbsProvider.createTask).toHaveBeenCalledWith(target);
      expect(result).toBe(expectedResult);
    });
  });

  describe('refreshArtifactTree', () => {
    it('should call artifactProvider.refresh', () => {
      wbsService.refreshArtifactTree();
      
      expect(mockArtifactProvider.refresh).toHaveBeenCalled();
    });
  });

  describe('createArtifact', () => {
    it('should call artifactProvider.createArtifact', async () => {
      mockArtifactProvider.createArtifact.mockResolvedValue(undefined);
      
      const result = await wbsService.createArtifact();
      
      expect(mockArtifactProvider.createArtifact).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('editArtifact', () => {
    it('should return the item as-is', () => {
      const item = { id: 'a1', title: 'Test Artifact' };
      
      const result = wbsService.editArtifact(item);
      
      expect(result).toBe(item);
    });
  });

  describe('deleteArtifact', () => {
    it('should call artifactProvider.deleteArtifact', async () => {
      const target = { artifact: { id: 'a1', title: 'Test' } };
      mockArtifactProvider.deleteArtifact.mockResolvedValue(undefined);
      
      const result = await wbsService.deleteArtifact(target);
      
      expect(mockArtifactProvider.deleteArtifact).toHaveBeenCalledWith(target);
      expect(result).toBeUndefined();
    });
  });
});