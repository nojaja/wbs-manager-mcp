import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';

const outputChannel = { appendLine: jest.fn() } as any;

describe('MCP task/artifact client parsing edge cases', () => {
    let taskClient: MCPTaskClient;
    let artifactClient: MCPArtifactClient;

    beforeEach(() => {
        taskClient = new MCPTaskClient(outputChannel);
        artifactClient = new MCPArtifactClient(outputChannel);
    });

    test('listTasks returns empty array when parse fails', async () => {
        jest.spyOn(taskClient as any, 'callTool').mockResolvedValue({ content: [{ text: 'not-json' }] });
        const res = await taskClient.listTasks(null);
        expect(res).toEqual([]);
    });

    test('listArtifacts logs and returns empty array when parsed payload not array', async () => {
        const logSpy = jest.spyOn(outputChannel, 'appendLine');
        jest.spyOn(artifactClient as any, 'callTool').mockResolvedValue({ content: [{ text: JSON.stringify({ foo: 'bar' }) }] });
        const res = await artifactClient.listArtifacts();
        expect(res).toEqual([]);
        expect(logSpy).toHaveBeenCalled();
    });

    test('createArtifact surfaces failure message from parseToolResponse', async () => {
        jest.spyOn(artifactClient as any, 'callTool').mockResolvedValue({ content: [{ text: '❌ duplicate' }] });
        const result = await artifactClient.createArtifact({ title: 'Doc' });
        expect(result).toEqual({ success: false, error: '❌ duplicate', message: '❌ duplicate' });
    });

    test('updateTask propagates thrown error as failure', async () => {
        jest.spyOn(taskClient as any, 'callTool').mockRejectedValue(new Error('network'));
        const result = await taskClient.updateTask('t1', {});
        expect(result).toEqual({ success: false, error: 'network' });
    });

    test('deleteArtifact handles thrown error gracefully', async () => {
        jest.spyOn(artifactClient as any, 'callTool').mockRejectedValue('boom');
        const res = await artifactClient.deleteArtifact('a1');
        expect(res).toEqual({ success: false, error: 'boom' });
    });
});
