import { MCPTaskClient } from '../../src/extension/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/mcp/artifactClient';
import { MCPInitializeClient } from '../../src/extension/mcp/initializeClient';

describe('MCP client additional coverage tests', () => {
  const fakeOutput = { appendLine: jest.fn() } as any;
  let taskClient: MCPTaskClient;
  let artifactClient: MCPArtifactClient;
  let initClient: MCPInitializeClient;

  beforeEach(() => {
    jest.useFakeTimers();
    taskClient = new MCPTaskClient(fakeOutput);
    artifactClient = new MCPArtifactClient(fakeOutput);
    initClient = new MCPInitializeClient(fakeOutput);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('Start and initialization', () => {
    test('start sends initialize request when writer is ready', async () => {
      initClient.setWriter(() => {});
      const sendRequestSpy = jest.spyOn(initClient as any, 'sendRequest').mockResolvedValue({
        jsonrpc: '2.0',
        id: 1,
        result: {}
      });
      const notifySpy = jest.spyOn(initClient as any, 'sendNotification').mockImplementation(() => {});

      await initClient.start();

      expect(sendRequestSpy).toHaveBeenCalledWith('initialize', expect.any(Object));
      expect(notifySpy).toHaveBeenCalledWith('notifications/initialized', {});
    });
  });

  describe('Task API methods', () => {
    test('callTool method handles server errors', async () => {
      const sendRequestSpy = jest.spyOn(taskClient as any, 'sendRequest')
        .mockResolvedValue({
          error: { code: -1, message: 'Tool not found' }
        });

      await expect((taskClient as any).callTool('nonexistent.tool', {}))
        .rejects.toThrow('Tool not found');

      sendRequestSpy.mockRestore();
    });

    test('listTasks handles empty content', async () => {
      const callToolSpy = jest.spyOn(taskClient as any, 'callTool')
        .mockResolvedValue({ content: [] });

      const result = await taskClient.listTasks();
      expect(result).toEqual([]);
      expect(callToolSpy).toHaveBeenCalledWith('wbs.planMode.listTasks', {});

      callToolSpy.mockRestore();
    });

    test('listTasks handles malformed JSON', async () => {
      const callToolSpy = jest.spyOn(taskClient as any, 'callTool')
        .mockResolvedValue({ content: [{ text: 'invalid json' }] });

      const result = await taskClient.listTasks();
      expect(result).toEqual([]);
      expect(fakeOutput.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('[MCP Client] Failed to parse task list:')
      );
      expect(callToolSpy).toHaveBeenCalledWith('wbs.planMode.listTasks', {});

      callToolSpy.mockRestore();
    });

    test('listTasks handles call tool errors', async () => {
      const callToolSpy = jest.spyOn(taskClient as any, 'callTool')
        .mockRejectedValue(new Error('Network error'));

      const result = await taskClient.listTasks();
      expect(result).toEqual([]);
      expect(fakeOutput.appendLine).toHaveBeenCalledWith(
        '[MCP Client] Failed to list tasks: Network error'
      );
      expect(callToolSpy).toHaveBeenCalledWith('wbs.planMode.listTasks', {});

      callToolSpy.mockRestore();
    });

    test('listTasks passes parentId parameter correctly', async () => {
      const callToolSpy = jest.spyOn(taskClient as any, 'callTool')
        .mockResolvedValue({ content: [{ text: '[]' }] });

      await taskClient.listTasks('parent123');
      expect(callToolSpy).toHaveBeenCalledWith('wbs.planMode.listTasks', { parentId: 'parent123' });

      await taskClient.listTasks(null);
      expect(callToolSpy).toHaveBeenCalledWith('wbs.planMode.listTasks', { parentId: null });

      callToolSpy.mockRestore();
    });

    test('getTask handles various content formats', async () => {
      const callToolSpy = jest.spyOn(taskClient as any, 'callTool');

      callToolSpy.mockResolvedValueOnce({ content: [{ text: 'Task not found ❌' }] });
      let result = await taskClient.getTask('invalid-id');
      expect(result).toBeNull();

      callToolSpy.mockResolvedValueOnce({ content: [] });
      result = await taskClient.getTask('test-id');
      expect(result).toBeNull();

      callToolSpy.mockRestore();
    });
  });

  describe('Artifact operations', () => {
    test('listArtifacts returns empty array on error', async () => {
      const callToolSpy = jest.spyOn(artifactClient as any, 'callTool')
        .mockRejectedValue(new Error('Server error'));

      const result = await artifactClient.listArtifacts();
      expect(result).toEqual([]);

      callToolSpy.mockRestore();
    });

    test('getArtifact handles errors gracefully', async () => {
      const callToolSpy = jest.spyOn(artifactClient as any, 'callTool')
        .mockRejectedValue(new Error('Network error'));

      const result = await artifactClient.getArtifact('test-id');
      expect(result).toBeNull();

      callToolSpy.mockRestore();
    });

    test('deleteArtifact handles various response types', async () => {
      const callToolSpy = jest.spyOn(artifactClient as any, 'callTool');

      callToolSpy.mockResolvedValueOnce({ content: [{ text: '✅ Deleted successfully' }] });
      let result = await artifactClient.deleteArtifact('test-id');
      expect(result).toEqual({ success: true, message: '✅ Deleted successfully' });

      callToolSpy.mockResolvedValueOnce({ content: [{ text: '❌ Not found' }] });
      result = await artifactClient.deleteArtifact('test-id');
      expect(result).toEqual({ success: false, error: '❌ Not found', message: '❌ Not found' });

      callToolSpy.mockRejectedValueOnce(new Error('Network error'));
      result = await artifactClient.deleteArtifact('test-id');
      expect(result).toEqual({ success: false, error: 'Network error' });

      callToolSpy.mockRestore();
    });
  });

  describe('Request handling edge cases', () => {
    test('sendRequest handles write errors', async () => {
      taskClient.setWriter(() => {
        throw new Error('Write failed');
      });
      await expect((taskClient as any).sendRequest('test.method', {}))
        .rejects.toThrow('Write failed');
    });

    test('handleResponse ignores responses without pending requests', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      (taskClient as any).handleResponse({
        jsonrpc: '2.0',
        id: 999,
        result: 'test'
      });

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('handleResponse processes responses without id', () => {
      // Should not throw when handling notification-style responses
      expect(() => {
        (taskClient as any).handleResponse({
          jsonrpc: '2.0',
          result: 'notification'
        });
      }).not.toThrow();
    });
  });

  describe('Utility methods', () => {
    test('MCPClient no longer exposes sanitize helpers (handled by WBSService)', () => {
      expect((taskClient as any).sanitizeArtifactInputs).toBeUndefined();
      expect((taskClient as any).sanitizeCompletionInputs).toBeUndefined();
    });
  });
});