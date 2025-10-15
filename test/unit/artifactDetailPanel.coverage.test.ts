import { ArtifactDetailPanel } from '../../src/extension/views/panels/artifactDetailPanel';

describe('ArtifactDetailPanel additional coverage tests', () => {
  const fakePanel: any = {
    reveal: jest.fn(),
    title: '',
    webview: { 
      html: '', 
      onDidReceiveMessage: jest.fn(() => ({ dispose: () => {} })), 
      postMessage: jest.fn() 
    },
    onDidDispose: jest.fn(() => ({ dispose: () => {} })),
    dispose: jest.fn(),
    webviewOptions: {}
  };

  let mockShowErrorMessage: jest.SpyInstance;
  let mockShowInformationMessage: jest.SpyInstance;
  let mockShowWarningMessage: jest.SpyInstance;
  let mockExecuteCommand: jest.SpyInstance;

  beforeEach(() => {
    // Reset the current panel
    (ArtifactDetailPanel as any).currentPanel = undefined;
    
    // Mock vscode API
    const vscode = require('vscode');
    mockShowErrorMessage = jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
    mockShowInformationMessage = jest.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined);
    mockShowWarningMessage = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);
    mockExecuteCommand = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadArtifact method', () => {
    test('loadArtifact handles successful artifact loading', async () => {
      const mockArtifact = {
        id: 'artifact-123',
        title: 'Test Artifact',
        uri: 'src/test.md',
        description: 'Test description',
        version: 1
      };

      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(mockArtifact)
      };

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      // loadArtifact is called in constructor, so we test it indirectly
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow async operations to complete

      expect(fakePanel.title).toBe('Artifact: Test Artifact');
      expect(fakePanel.webview.html).toContain('Test Artifact');
    });

    test('loadArtifact handles error when artifact loading fails', async () => {
      const fakeMcp: any = {
        getArtifact: jest.fn().mockRejectedValue(new Error('Network error'))
      };

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to load artifact: Error: Network error');
    });

    test('loadArtifact handles null artifact response', async () => {
      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(null)
      };

      // Reset panel state
      fakePanel.title = '';
      fakePanel.webview.html = '';

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // When artifact is null, panel title and HTML should remain unchanged
      expect(fakeMcp.getArtifact).toHaveBeenCalledWith('artifact-123');
    });
  });

  describe('saveArtifact method', () => {
    test('saveArtifact handles successful save', async () => {
      const mockArtifact = {
        id: 'artifact-123',
        title: 'Test Artifact',
        version: 1
      };

      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(mockArtifact),
        updateArtifact: jest.fn().mockResolvedValue({ success: true })
      };

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate save message
      const saveData = {
        title: 'Updated Artifact',
        uri: 'src/updated.md',
        description: 'Updated description'
      };

      await (panel as any).saveArtifact(saveData);

      expect(fakeMcp.updateArtifact).toHaveBeenCalledWith({
        artifactId: 'artifact-123',
        title: 'Updated Artifact',
        uri: 'src/updated.md',
        description: 'Updated description',
        version: 1
      });
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Artifact updated successfully');
      expect(mockExecuteCommand).toHaveBeenCalledWith('artifactTree.refresh');
    });

    test('saveArtifact handles conflict response', async () => {
      const mockArtifact = {
        id: 'artifact-123',
        title: 'Test Artifact',  
        version: 1
      };

      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(mockArtifact),
        updateArtifact: jest.fn().mockResolvedValue({ success: false, conflict: true })
      };

      mockShowWarningMessage.mockResolvedValue('Reload');

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 0));

      const saveData = { title: 'Updated Artifact' };
      await (panel as any).saveArtifact(saveData);

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        'Artifact has been modified by another user. Your version is outdated.',
        'Reload',
        'Cancel'
      );
    });

    test('saveArtifact handles conflict with Cancel choice', async () => {
      const mockArtifact = {
        id: 'artifact-123',
        title: 'Test Artifact',
        version: 1
      };

      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(mockArtifact),
        updateArtifact: jest.fn().mockResolvedValue({ success: false, conflict: true })
      };

      mockShowWarningMessage.mockResolvedValue('Cancel');

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      // Reset call count from constructor
      fakeMcp.getArtifact.mockClear();

      const saveData = { title: 'Updated Artifact' };
      await (panel as any).saveArtifact(saveData);

      // Should not reload when Cancel is selected
      expect(fakeMcp.getArtifact).not.toHaveBeenCalled();
    });

    test('saveArtifact handles general error response', async () => {
      const mockArtifact = {
        id: 'artifact-123',
        title: 'Test Artifact',
        version: 1
      };

      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(mockArtifact),
        updateArtifact: jest.fn().mockResolvedValue({ success: false, error: 'Validation failed' })
      };

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      const saveData = { title: 'Updated Artifact' };
      await (panel as any).saveArtifact(saveData);

      expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to update artifact: Validation failed');
    });

    test('saveArtifact handles exception during save', async () => {
      const mockArtifact = {
        id: 'artifact-123',
        title: 'Test Artifact',
        version: 1
      };

      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(mockArtifact),
        updateArtifact: jest.fn().mockRejectedValue(new Error('Network error'))
      };

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      const saveData = { title: 'Updated Artifact' };
      await (panel as any).saveArtifact(saveData);

      expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to save artifact: Error: Network error');
    });
  });

  describe('Message handling', () => {
    test('message handler is properly registered', () => {
      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(null)
      };

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      // Verify that message handler was registered
      expect(fakePanel.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    test('onDidReceiveMessage ignores unknown commands', () => {
      const fakeMcp: any = {
        getArtifact: jest.fn().mockResolvedValue(null)
      };

      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'artifact-123', fakeMcp);
      
      const messageHandler = fakePanel.webview.onDidReceiveMessage.mock.calls[0][0];
      
      // Should not throw for unknown commands
      expect(() => {
        messageHandler({ command: 'unknown', data: {} });
      }).not.toThrow();
    });
  });

  describe('HTML generation edge cases', () => {
  test('getHtmlForWebview embeds payload even with undefined values', () => {
      const fakeMcp: any = { getArtifact: jest.fn() };
      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'a1', fakeMcp);
      
      const artifact = {
        id: 'artifact-123',
        title: undefined,
        uri: undefined,
        description: undefined,
        version: 1
      };
      
      const html = (panel as any).getHtmlForWebview(artifact);
      // Should still render skeleton and embed payload as JSON
      expect(html).toContain('<div id="app"></div>');
      expect(html).toContain('artifact.bundle.js');
      const m = html.match(/window.__ARTIFACT_PAYLOAD__ = (.*?);<\/script>/s);
      expect(m).toBeTruthy();
      const payload = JSON.parse(m![1]);
      expect(payload.artifact).toEqual({ id: 'artifact-123', version: 1 });
    });

    test('getHtmlForWebview generates minimal HTML structure with script', () => {
      const fakeMcp: any = { getArtifact: jest.fn() };
      const panel = new (ArtifactDetailPanel as any)(fakePanel, { path: '' } as any, 'a1', fakeMcp);
      
      const artifact = {
        id: 'artifact-123',
        title: 'Test',
        uri: 'test.md',
        description: 'Test desc',
        version: 1
      };
      
      const html = (panel as any).getHtmlForWebview(artifact);
      // Check that expected minimal HTML is present
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<div id="app"></div>');
      expect(html).toContain('artifact.bundle.js');
      expect(html).toContain('</html>');
    });
  });
});