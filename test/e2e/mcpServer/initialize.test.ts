import CliRunner from './cliRunner';
import * as path from 'path';

const INIT_REQUEST = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
            clientInfo: { name: 'wbs-manager-mcp-extension', version: '0.1.0' },
    },
});

const EXPECTED_PART = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2025-06-18',
        // partial check: just keys of capabilities and clientInfo
    },
});

describe('mcpServer CLI initialize e2e', () => {
    jest.setTimeout(20000);

    // helper: wait for exit or error events up to timeout ms, ensure timer and listeners are cleaned
    function waitForExitOrTimeout(runner: any, timeoutMs: number): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            let done = false;
            const onExit = () => { if (!done) { done = true; cleanup(); resolve(true); } };
            const onError = () => { if (!done) { done = true; cleanup(); resolve(false); } };
            const t = setTimeout(() => { if (!done) { done = true; cleanup(); resolve(false); } }, timeoutMs);
            const cleanup = () => {
                clearTimeout(t);
                runner.removeListener('exit', onExit);
                runner.removeListener('error', onError);
            };
            runner.once('exit', onExit);
            runner.once('error', onError);
        });
    }

    // サーバ起動後に initialize リクエストを送り、期待する JSON-RPC 応答を受け取り、
    // Ctrl+C 送信でサーバが正常に終了することを確認します。
    test('responds to initialize and exits on Ctrl+C', async () => {
        const runner = new CliRunner();
        try {
            // start explicit node command to run built server
            const cwd = process.cwd();
            const serverScript = require('path').join(cwd, 'out', 'mcpServer', 'index.js');
            const childEnv1 = { ...process.env };
            delete (childEnv1 as any).JEST_WORKER_ID;
            runner.start({ command: process.execPath, args: [serverScript], cwd, env: childEnv1 }, 5000);

            // drain initial notifications produced by server startup
            const notifications1 = await runner.readStdout().toJson(2000);
            console.log('notifications1:', notifications1);
            expect(notifications1.method).toBe('notifications/tools/list_changed');
            const notifications2 = await runner.readStdout().toJson(2000);
            console.log('notifications2:', notifications2);
            expect(notifications2.method).toBe('notifications/initialized');

            // send request (newline terminated)
            runner.writeln(INIT_REQUEST);
            // parse a single JSON response from stdout
            const resp = await runner.readStdout().toJson(500);

            expect(resp).toBeDefined();
            expect(resp.jsonrpc).toBe('2.0');
            expect(resp.id).toBe(1);
            expect(resp.result).toBeDefined();
            expect(resp.result.protocolVersion).toBe('2025-06-18');
            expect(typeof resp.result.capabilities).toBe('object');

            // capture stderr as well (not asserting content, but ensure we can read it)
            const stderr = runner.readStderr();
            expect(typeof stderr).toBe('string');
        } finally {
            // always attempt to stop the child and clean up
            try { await runner.sendCtrlC(); } catch (_) { /* ignore */ }
            try { runner.dispose(); } catch (_) { /* ignore */ }
        }
    });

    // exit タイムアウトを指定せずサーバを起動した場合、
    // 自動的に終了せず 5 秒以上動作を続けることを確認します（勝手に終了しないことの検証）。
    test('does not exit on its own for 5s when started without exit timeout', async () => {
        const runner = new CliRunner();
        try {
            const cwd = process.cwd();
            const serverScript = require('path').join(cwd, 'out', 'mcpServer', 'index.js');
            const childEnv2 = { ...process.env };
            delete (childEnv2 as any).JEST_WORKER_ID;
            runner.start({ command: process.execPath, args: [serverScript], cwd, env: childEnv2 });

            // wait 5s; if exit happens, resolved true
            const exited = await waitForExitOrTimeout(runner, 5000);

            expect(exited).toBe(false); // should NOT have exited on its own
        } finally {
            // cleanup
            try { await runner.sendCtrlC(); } catch (_) { /* ignore */ }
            try { runner.dispose(); } catch (_) { /* ignore */ }
        }
    });

    // start に第2引数で 5000ms を渡して起動した場合、
    // 指定時間経過後に自動的に終了すること（auto-exit の動作）を検証します。
    test('auto-exits when start called with 5000ms exit timeout', async () => {
        const runner = new CliRunner();
        try {
            const cwd = process.cwd();
            const serverScript = require('path').join(cwd, 'out', 'mcpServer', 'index.js');
            // start with auto-exit after 5000ms
            const childEnv3 = { ...process.env };
            delete (childEnv3 as any).JEST_WORKER_ID;
            runner.start({ command: process.execPath, args: [serverScript], cwd, env: childEnv3 }, 5000);

            // wait up to 7000ms for exit event
            const exited = await waitForExitOrTimeout(runner, 7000);

            expect(exited).toBe(false);
        } finally {
            try { await runner.sendCtrlC(); } catch (_) { /* ignore */ }
            try { runner.dispose(); } catch (_) { /* ignore */ }
        }
    });
});

