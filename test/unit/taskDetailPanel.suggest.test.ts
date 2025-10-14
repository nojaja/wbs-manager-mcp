import { TaskDetailPanel } from '../../src/extension/panels/taskDetailPanel';
import { MCPClient } from '../../src/extension/mcpClient';

// Minimal smoke test: call getHtmlForWebview via creating instance using mocked panel
// We avoid complex VSCode APIs by directly testing the HTML generator method via a small wrapper class.

class DummyPanel {
    public title = '';
    public webview = {
        html: '',
        asWebviewUri: (u: any) => String(u)
    } as any;
}

class DummyMCP extends MCPClient {
    constructor() { super({} as any); }
}

describe('TaskDetailPanel suggestions', () => {
    it('injects datalist and add buttons when artifacts provided', async () => {
        // Prepare dummy task and artifacts
        const task: any = {
            id: 'T1',
            title: 'Test Task',
            status: 'pending',
            version: 1
        };

        const artifacts = [
            { id: 'A1', title: 'Spec Doc' },
            { id: 'A2', title: 'Design' }
        ];

        // Create instance via bypassing constructor by using Object.create
        const dummy = Object.create(TaskDetailPanel.prototype) as any;
        // attach minimal fields used by getHtmlForWebview
        dummy._panel = new DummyPanel() as any;
        dummy._extensionUri = { toString: () => '' } as any;
        const html = (TaskDetailPanel as any).prototype.getHtmlForWebview.call(dummy, task, artifacts);

        expect(html).toBeDefined();
        // Minimal page structure and script
        expect(html).toContain('<div id="app"></div>');
        expect(html).toContain('task.bundle.js');
        // Payload includes artifacts
        const m = html.match(/window.__TASK_PAYLOAD__ = (.*?);<\/script>/s);
        expect(m).toBeTruthy();
        const payload = JSON.parse(m![1]);
        expect(payload.artifacts.map((a: any) => a.title)).toEqual(['Spec Doc', 'Design']);
    });
});
