import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';
import { Logger } from '../../src/extension/Logger';

describe('MCP task/artifact client parsing edge cases', () => {
    let taskClient: MCPTaskClient;
    let artifactClient: MCPArtifactClient;
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
            // Ensure Logger.getInstance is spied so internal logging uses our mocked logger
        const logger = { log: jest.fn(), show: jest.fn() };
        jest.spyOn(Logger, 'getInstance').mockReturnValue(logger as any);
            // create clients using default construction (they use Logger internally)
            taskClient = new MCPTaskClient();
            artifactClient = new MCPArtifactClient();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('listTasks returns empty array when parse fails', async () => {
        jest.spyOn(taskClient as any, 'callTool').mockResolvedValue({ content: [{ text: 'not-json' }] });
        const res = await taskClient.listTasks(null);
        expect(res).toEqual([]);
    });

    test('listArtifacts logs and returns empty array when parsed payload not array', async () => {
        jest.spyOn(artifactClient as any, 'callTool').mockResolvedValue({ content: [{ text: JSON.stringify({ foo: 'bar' }) }] });
        const res = await artifactClient.listArtifacts();
        expect(res).toEqual([]);
    });

    test('createArtifact surfaces failure message from parseToolResponse', async () => {
        jest.spyOn(artifactClient as any, 'callTool').mockResolvedValue({ content: [{ text: '❌ duplicate' }] });
        const result = await artifactClient.createArtifact({ title: 'Doc' });
        expect(result).toEqual({ success: false, error: '❌ duplicate', message: '❌ duplicate' });
    });

    test('updateTask propagates thrown error as failure', async () => {
        jest.spyOn(taskClient as any, 'callTool').mockRejectedValue(new Error('network'));
        const result = await taskClient.updateTask('t1', {} as any);
        expect(result).toEqual({ success: false, error: 'network' });
    });

    test('deleteArtifact handles thrown error gracefully', async () => {
        jest.spyOn(artifactClient as any, 'callTool').mockRejectedValue('boom');
        const res = await artifactClient.deleteArtifact('a1');
        expect(res).toEqual({ success: false, error: 'boom' });
    });
});
