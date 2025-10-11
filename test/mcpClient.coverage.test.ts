import { MCPClient } from '../src/mcpClient';

describe('MCPClient additional coverage tests', () => {
  let client: MCPClient;
  const fakeOutput = { appendLine: jest.fn() } as any;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new MCPClient(fakeOutput);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('Start and initialization', () => {
    test('start method does nothing if server is already started', async () => {
      // @ts-ignore
      client['serverProcess'] = { mock: 'process' };

      const spawnSpy = jest.spyOn(require('child_process'), 'spawn');
      // ChildProcess型のダミーオブジェクトを型安全に作成
      class DummyWritable {
        writable = true;
        write = jest.fn();
      }
      class DummyReadable {
        readable = true;
        setEncoding = jest.fn();
        on = jest.fn();
      }
      class DummyChildProcess {
        stdin = new DummyWritable();
        stdout = new DummyReadable();
        stderr = new DummyReadable();
        on = jest.fn();
      }
      await client.start(new DummyChildProcess() as any);

      expect(spawnSpy).not.toHaveBeenCalled();
    });
  });



  describe('Tool calling and API methods', () => {
    test('callTool method handles server errors', async () => {
      const sendRequestSpy = jest.spyOn(client as any, 'sendRequest')
        .mockResolvedValue({
          error: { code: -1, message: 'Tool not found' }
        });

      await expect(client.callTool('nonexistent.tool', {}))
        .rejects.toThrow('Tool not found');

      sendRequestSpy.mockRestore();
    });

    test('listTasks handles empty content', async () => {
      const callToolSpy = jest.spyOn(client, 'callTool')
        .mockResolvedValue({ content: [] });

      const result = await client.listTasks();
      expect(result).toEqual([]);
      expect(callToolSpy).toHaveBeenCalledWith('wbs.listTasks', {});

      callToolSpy.mockRestore();
    });

    test('listTasks handles malformed JSON', async () => {
      const callToolSpy = jest.spyOn(client, 'callTool')
        .mockResolvedValue({ content: [{ text: 'invalid json' }] });

      const result = await client.listTasks();
      expect(result).toEqual([]);
      expect(fakeOutput.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('[MCP Client] Failed to parse task list:')
      );
      expect(callToolSpy).toHaveBeenCalledWith('wbs.listTasks', {});

      callToolSpy.mockRestore();
    });

    test('listTasks handles call tool errors', async () => {
      const callToolSpy = jest.spyOn(client, 'callTool')
        .mockRejectedValue(new Error('Network error'));

      const result = await client.listTasks();
      expect(result).toEqual([]);
      expect(fakeOutput.appendLine).toHaveBeenCalledWith(
        '[MCP Client] Failed to list tasks: Error: Network error'
      );
      expect(callToolSpy).toHaveBeenCalledWith('wbs.listTasks', {});

      callToolSpy.mockRestore();
    });

    test('listTasks passes parentId parameter correctly', async () => {
      const callToolSpy = jest.spyOn(client, 'callTool')
        .mockResolvedValue({ content: [{ text: '[]' }] });

      await client.listTasks('parent123');
      expect(callToolSpy).toHaveBeenCalledWith('wbs.listTasks', { parentId: 'parent123' });

      await client.listTasks(null);
      expect(callToolSpy).toHaveBeenCalledWith('wbs.listTasks', { parentId: null });

      callToolSpy.mockRestore();
    });

    test('getTask handles various content formats', async () => {
      const callToolSpy = jest.spyOn(client, 'callTool');

      // Test with error content containing ❌
      callToolSpy.mockResolvedValueOnce({ content: [{ text: 'Task not found ❌' }] });
      let result = await client.getTask('invalid-id');
      expect(result).toBeNull();

      // Test with empty content
      callToolSpy.mockResolvedValueOnce({ content: [] });
      result = await client.getTask('test-id');
      expect(result).toBeNull();

      callToolSpy.mockRestore();
    });
  });

  describe('Artifact operations', () => {
    test('listArtifacts returns empty array on error', async () => {
      const callToolSpy = jest.spyOn(client, 'callTool')
        .mockRejectedValue(new Error('Server error'));

      const result = await client.listArtifacts();
      expect(result).toEqual([]);

      callToolSpy.mockRestore();
    });

    test('getArtifact handles errors gracefully', async () => {
      const callToolSpy = jest.spyOn(client, 'callTool')
        .mockRejectedValue(new Error('Network error'));

      const result = await client.getArtifact('test-id');
      expect(result).toBeNull();

      callToolSpy.mockRestore();
    });

    test('deleteArtifact handles various response types', async () => {
      const callToolSpy = jest.spyOn(client, 'callTool');

      // Test success case
      callToolSpy.mockResolvedValueOnce({ content: [{ text: '✅ Deleted successfully' }] });
      let result = await client.deleteArtifact('test-id');
      expect(result).toEqual({ success: true });

      // Test error case
      callToolSpy.mockResolvedValueOnce({ content: [{ text: '❌ Not found' }] });
      result = await client.deleteArtifact('test-id');
      expect(result).toEqual({ success: false, error: '❌ Not found' });

      // Test exception case
      callToolSpy.mockRejectedValueOnce(new Error('Network error'));
      result = await client.deleteArtifact('test-id');
      expect(result).toEqual({ success: false, error: 'Network error' });

      callToolSpy.mockRestore();
    });
  });

  describe('Request handling edge cases', () => {
    test('sendRequest handles write errors', async () => {
      const mockProcess = {
        stdin: {
          write: jest.fn((data, callback) => {
            callback(new Error('Write failed'));
          })
        }
      };
      // @ts-ignore
      client['serverProcess'] = mockProcess;

      await expect((client as any).sendRequest('test.method', {}))
        .rejects.toThrow('Write failed');
    });

    test('handleResponse ignores responses without pending requests', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      (client as any).handleResponse({
        jsonrpc: '2.0',
        id: 999,
        result: 'test'
      });

      // Should not throw or cause issues
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('handleResponse processes responses without id', () => {
      // Should not throw when handling notification-style responses
      expect(() => {
        (client as any).handleResponse({
          jsonrpc: '2.0',
          result: 'notification'
        });
      }).not.toThrow();
    });
  });

  describe('Utility methods', () => {
    test('sanitizeArtifactInputs handles various input types', () => {
      // Test with undefined
      let result = (client as any).sanitizeArtifactInputs(undefined);
      expect(result).toBeUndefined();

      // Test with empty array
      result = (client as any).sanitizeArtifactInputs([]);
      expect(result).toEqual([]);

      // Test with valid artifacts
      const artifacts = [
        { artifactId: 'art1', crudOperations: 'read' },
        { artifactId: 'art2' }
      ];
      result = (client as any).sanitizeArtifactInputs(artifacts);
      expect(result).toEqual([
        { artifactId: 'art1', crudOperations: 'read' },
        { artifactId: 'art2', crudOperations: undefined }
      ]);
    });

    test('sanitizeCompletionInputs handles various input types', () => {
      // Test with undefined
      let result = (client as any).sanitizeCompletionInputs(undefined);
      expect(result).toBeUndefined();

      // Test with empty array
      result = (client as any).sanitizeCompletionInputs([]);
      expect(result).toEqual([]);

      // Test with valid conditions
      const conditions = [{ description: 'Test condition' }];
      result = (client as any).sanitizeCompletionInputs(conditions);
      expect(result).toEqual([{ description: 'Test condition' }]);
    });
  });
});