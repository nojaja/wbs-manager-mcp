import { ArtifactDetailPanel } from '../../src/extension/views/panels/artifactDetailPanel';

describe('ArtifactDetailPanel', () => {
  const fakePanel: any = {
    reveal: jest.fn(),
    title: '',
    webview: { html: '', onDidReceiveMessage: jest.fn(() => ({ dispose: () => {} })), postMessage: jest.fn() },
    onDidDispose: jest.fn(() => ({ dispose: () => {} })),
    dispose: jest.fn(),
    webviewOptions: {}
  };

  test('createOrShow creates new panel when no current panel exists', () => {
    const fakeMcp: any = { getProjectArtifact: jest.fn() };
    const fakeUri: any = { path: '' };
    
    // Reset any existing panel
    (ArtifactDetailPanel as any).currentPanel = undefined;
    
    // Mock vscode API
    const vscode = require('vscode');
    const mockCreatePanel = jest.fn().mockReturnValue(fakePanel);
    vscode.window.createWebviewPanel = mockCreatePanel;

  ArtifactDetailPanel.createOrShow(fakeUri, 'artifact-123');

    expect(mockCreatePanel).toHaveBeenCalledWith(
      'artifactDetail',
      'Artifact Detail',
      1,
      expect.objectContaining({
        enableScripts: true,
        localResourceRoots: [fakeUri]
      })
    );
  });

  test('createOrShow reuses existing panel', () => {
    const fakeMcp: any = { getProjectArtifact: jest.fn() };
    const fakeUri: any = { path: '' };
    
    // Create a mock existing panel
  const existingPanel = new (ArtifactDetailPanel as any)(fakePanel, fakeUri, 'old-artifact');
    (ArtifactDetailPanel as any).currentPanel = existingPanel;
    
    const updateArtifactSpy = jest.spyOn(existingPanel, 'updateArtifact' as any).mockImplementation(() => Promise.resolve());

    ArtifactDetailPanel.createOrShow(fakeUri, 'new-artifact', fakeMcp);

    expect(fakePanel.reveal).toHaveBeenCalled();
    expect(updateArtifactSpy).toHaveBeenCalledWith('new-artifact');
  });

  test('escapeHtml escapes special characters', () => {
    const fakeMcp: any = { getProjectArtifact: jest.fn() };
  const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'a1');
    const unsafe = '& < > " \'';
    const escaped = (panel as any).escapeHtml(unsafe);
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#039;');
  });

  test('getHtmlForWebview generates minimal HTML with payload and script', () => {
    const fakeMcp: any = { getProjectArtifact: jest.fn() };
  const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'a1');
    
    const artifact = {
      id: 'artifact-123',
      title: 'Test Artifact',
      uri: 'src/test.md',
      description: 'Test description',
      version: 1
    };
    
    const html = (panel as any).getHtmlForWebview(artifact);
    // Basic skeleton
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Artifact Detail</title>');
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('artifact.bundle.js');
    // Payload embedding includes artifact data
    const m = html.match(/window.__ARTIFACT_PAYLOAD__ = (.*?);<\/script>/s);
    expect(m).toBeTruthy();
    const payload = JSON.parse(m![1]);
    expect(payload.artifact).toEqual(artifact);
  });

  test('dispose cleans up resources', () => {
    const fakeMcp: any = { getProjectArtifact: jest.fn() };
  const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'a1');
    
    panel.dispose();
    
    expect(fakePanel.dispose).toHaveBeenCalled();
    expect((ArtifactDetailPanel as any).currentPanel).toBeUndefined();
  });
});