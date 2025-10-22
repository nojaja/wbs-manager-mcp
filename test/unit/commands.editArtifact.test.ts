import { jest } from '@jest/globals';

// Mock the artifactDetailPanel module so dynamic import used by the handler picks up this mock
jest.mock('../../src/extension/views/panels/artifactDetailPanel', () => {
  const createOrShow = jest.fn();
  return {
    ArtifactDetailPanel: { createOrShow },
    // also provide default interop shape used by some transpilation modes
    default: { ArtifactDetailPanel: { createOrShow } }
  };
});

describe('editArtifactCommandHandler', () => {
  it('calls ArtifactDetailPanel.createOrShow when target exists', async () => {
    const artifactTreeView: any = { selection: [{ artifact: { id: 'a1' } }] };
    const context: any = { extensionUri: {} };

    const modPanel = require('../../src/extension/views/panels/artifactDetailPanel');

  const { EditArtifactHandler } = require('../../src/extension/commands/editArtifact');
  const handler = new EditArtifactHandler();
  // handler signature: handle(context, artifactTreeView, item?)
  await handler.handle(context, artifactTreeView, artifactTreeView.selection[0]);

  const fn = (modPanel as any).ArtifactDetailPanel?.createOrShow || (modPanel as any).default?.ArtifactDetailPanel?.createOrShow;
  expect(fn).toBeDefined();
  expect(fn).toHaveBeenCalledWith(context.extensionUri, 'a1');
  });
});
