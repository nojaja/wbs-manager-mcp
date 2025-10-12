import { WBSService } from '../src/extension/services/WBSService';
import { WBSTreeProvider } from '../src/extension/views/wbsTree';
import { ArtifactTreeProvider } from '../src/extension/views/artifactTree';

// モックの設定
jest.mock('../src/extension/views/wbsTree');
jest.mock('../src/extension/views/artifactTree');

const MockedWBSTreeProvider = WBSTreeProvider as jest.MockedClass<typeof WBSTreeProvider>;
const MockedArtifactTreeProvider = ArtifactTreeProvider as jest.MockedClass<typeof ArtifactTreeProvider>;

describe('WBSService', () => {
  let wbsService: WBSService;
  let mockMcpClient: any;
  let mockWbsProvider: jest.Mocked<WBSTreeProvider>;
  let mockArtifactProvider: jest.Mocked<ArtifactTreeProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockMcpClient = {
      listTasks: jest.fn(),
      createTask: jest.fn(),
      deleteTask: jest.fn(),
      getTask: jest.fn(),
      moveTask: jest.fn(),
      listArtifacts: jest.fn(),
      createArtifact: jest.fn(),
      updateArtifact: jest.fn(),
      deleteArtifact: jest.fn(),
      callTool: jest.fn()
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

    wbsService = new WBSService(mockMcpClient);
  });

  describe('API methods (list/get/create/update/delete/move)', () => {
    beforeEach(() => {
      // ensure provider exposes mcpClient for API methods to call
      (wbsService.wbsProvider as any).mcpClient = mockMcpClient;
    });

    it('listTasksApi returns parsed array', async () => {
      mockMcpClient.callTool.mockResolvedValue({ content: [{ text: JSON.stringify([{ id: 't1', title: 'Task1' }]) }] });
      const res = await wbsService.listTasksApi(null);
      expect(res).toEqual([{ id: 't1', title: 'Task1' }]);
    });

    it('getTaskApi returns object or null', async () => {
      mockMcpClient.callTool
        .mockResolvedValueOnce({ content: [{ text: JSON.stringify({ id: 't1', title: 'Task1' }) }] })
        .mockResolvedValueOnce({ content: [{ text: '❌ error' }] });

      const ok = await wbsService.getTaskApi('t1');
      expect(ok).toEqual({ id: 't1', title: 'Task1' });

      const ng = await wbsService.getTaskApi('t1');
      expect(ng).toBeNull();
    });

    it('createTaskApi extracts ID on success', async () => {
      mockMcpClient.callTool.mockResolvedValue({ content: [{ text: '✅ Created\nID: 42' }] });
      const res = await wbsService.createTaskApi({ title: 'A' });
      expect(res.success).toBe(true);
      expect(res.taskId).toBe('42');
    });

    it('updateTaskApi detects success/conflict/error', async () => {
      mockMcpClient.callTool
        .mockResolvedValueOnce({ content: [{ text: '✅' }] })
        .mockResolvedValueOnce({ content: [{ text: 'modified by another user' }] })
        .mockResolvedValueOnce({ content: [{ text: '❌ some error' }] });

      const ok = await wbsService.updateTaskApi('t1', {});
      expect(ok.success).toBe(true);

      const conflict = await wbsService.updateTaskApi('t1', {});
      expect(conflict.success).toBe(false);
      expect(conflict.conflict).toBe(true);

      const err = await wbsService.updateTaskApi('t1', {});
      expect(err.success).toBe(false);
      expect(err.error).toBeDefined();
    });

    it('deleteTaskApi and moveTaskApi return success on ✅', async () => {
      mockMcpClient.callTool.mockResolvedValue({ content: [{ text: '✅' }] });
      const d = await wbsService.deleteTaskApi('t1');
      expect(d.success).toBe(true);
      const m = await wbsService.moveTaskApi('t1', 'p1');
      expect(m.success).toBe(true);
    });
  });

  describe('constructor', () => {
    it('should create WBSService with providers', () => {
      expect(MockedWBSTreeProvider).toHaveBeenCalledWith(mockMcpClient);
      expect(MockedArtifactTreeProvider).toHaveBeenCalledWith(mockMcpClient);
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