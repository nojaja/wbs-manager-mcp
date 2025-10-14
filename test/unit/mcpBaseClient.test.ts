import { MCPBaseClient } from '../../src/extension/mcp/baseClient';

const fakeOutput = { appendLine: jest.fn() } as any;

class ConcreteClient extends MCPBaseClient {
    // expose protected members for testing convenience
    public async send(method: string, params?: any) {
        return (this as any).sendRequest(method, params);
    }

    public emitResponse(payload: any) {
        (this as any).handleResponse(payload);
    }

    public emitServerExit(code: number | null, signal: NodeJS.Signals | null) {
        (this as any).onServerExit(code, signal);
    }

    public notify(method: string, params?: any) {
        return (this as any).sendNotification(method, params);
    }
}

describe('MCPBaseClient', () => {
    let client: ConcreteClient;

    beforeEach(() => {
        jest.useFakeTimers();
        client = new ConcreteClient(fakeOutput);
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    test('send rejects when writer is missing', async () => {
        await expect(client.send('foo')).rejects.toThrow('MCP server not started');
    });

    test('send resolves after matching response arrives', async () => {
        const writeSpy = jest.fn();
        client.setWriter(writeSpy);

        const promise = client.send('foo', { value: 1 });
        const [[requestPayload]] = writeSpy.mock.calls as [[string]];
        const { id } = JSON.parse(requestPayload);

        client.emitResponse({ jsonrpc: '2.0', id, result: { ok: true } });

        await expect(promise).resolves.toEqual({ jsonrpc: '2.0', id, result: { ok: true } });
    });

    test('pending requests reject when server exits', async () => {
        const writeSpy = jest.fn();
        client.setWriter(writeSpy);

        const promise = client.send('foo');
        const [[requestPayload]] = writeSpy.mock.calls as [[string]];
        const { id } = JSON.parse(requestPayload);
        expect(id).toBeGreaterThan(0);

        client.emitServerExit(1, 'SIGTERM');

        await expect(promise).rejects.toThrow('Server process exited');
    });

    test('send notification emits payload without errors', () => {
        const writeSpy = jest.fn();
        client.setWriter(writeSpy);

        client.notify('events/ping', { value: 'pong' });

        expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching('events/ping'));
    });
});
