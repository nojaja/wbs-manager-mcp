import { MCPClient } from '../src/extension/mcpClient';
import * as vscode from 'vscode';

// vscode.OutputChannel を簡易モック
class DummyOutputChannel implements vscode.OutputChannel {
    name = 'dummy';
    append = (value: string) => {};
    appendLine = (value: string) => {};
    clear = () => {};
    // show はオーバーロードがあるため柔軟に受け取る
    show = (columnOrPreserve?: any, preserveFocus?: boolean) => {};
    hide = () => {};
    dispose = () => {};
    // replace は OutputChannel に必須
    replace = (value: string) => {};
}

describe('MCPClient WBS-related methods (behavioural)', () => {
    let client: MCPClient;
    let output: DummyOutputChannel;

    beforeEach(() => {
        output = new DummyOutputChannel();
        client = new MCPClient(output);
        // writer must be set to avoid start() waiting issues in some flows
        client.setWriter(() => {});
    });

    test('listTasks returns parsed array on success', async () => {
        // モック呼び出しを差し替え
        (client as any).callTool = jest.fn().mockResolvedValue({ content: [{ text: JSON.stringify([{ id: 't1', title: 'Task 1' }]) }] });
        const res = await client.listTasks(null);
        expect(res).toEqual([{ id: 't1', title: 'Task 1' }]);
    });

    test('listTasks returns empty array on parse error or missing content', async () => {
        (client as any).callTool = jest.fn().mockResolvedValue({ content: [{ text: 'not-json' }] });
        const res = await client.listTasks(null);
        expect(res).toEqual([]);
    });

    test('getTask returns object on success and null on error', async () => {
        (client as any).callTool = jest.fn()
            .mockResolvedValueOnce({ content: [{ text: JSON.stringify({ id: 't1', title: 'Task 1' }) }] })
            .mockResolvedValueOnce({ content: [{ text: '❌ error' }] });

        const ok = await client.getTask('t1');
        expect(ok).toEqual({ id: 't1', title: 'Task 1' });

        const ng = await client.getTask('t1');
        expect(ng).toBeNull();
    });

    test('createTask returns success and extracts ID', async () => {
        (client as any).callTool = jest.fn().mockResolvedValue({ content: [{ text: '✅ Created\nID: 123' }] });
        const res = await client.createTask({ title: 'A' });
        expect(res.success).toBe(true);
        expect(res.taskId).toBe('123');
    });

    test('updateTask detects success, conflict and error', async () => {
        (client as any).callTool = jest.fn()
            .mockResolvedValueOnce({ content: [{ text: '✅' }] })
            .mockResolvedValueOnce({ content: [{ text: 'modified by another user' }] })
            .mockResolvedValueOnce({ content: [{ text: '❌ some error' }] });

        const ok = await client.updateTask('t1', {});
        expect(ok.success).toBe(true);

        const conflict = await client.updateTask('t1', {});
        expect(conflict.success).toBe(false);
        expect(conflict.conflict).toBe(true);

        const err = await client.updateTask('t1', {});
        expect(err.success).toBe(false);
        expect(err.error).toBeDefined();
    });

    test('moveTask returns success on ✅', async () => {
        (client as any).callTool = jest.fn().mockResolvedValue({ content: [{ text: '✅' }] });
        const res = await client.moveTask('t1', 'p1');
        expect(res.success).toBe(true);
    });

    test('deleteTask returns success on ✅', async () => {
        (client as any).callTool = jest.fn().mockResolvedValue({ content: [{ text: '✅' }] });
        const res = await client.deleteTask('t1');
        expect(res.success).toBe(true);
    });

});
