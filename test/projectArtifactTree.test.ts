import { jest } from '@jest/globals';
import * as vscode from 'vscode';
import { ProjectArtifactTreeItem, ProjectArtifactTreeProvider } from '../src/views/projectArtifactTree';
import { MCPClient, ProjectArtifact } from '../src/mcpClient';

jest.mock('vscode');

describe('ProjectArtifactTreeProvider', () => {
  const baseProject = { id: 'project-1' };
  type ArtifactClient = Pick<MCPClient,
    'getWorkspaceProject' | 'listProjectArtifacts' | 'createProjectArtifact' | 'updateProjectArtifact' | 'deleteProjectArtifact'>;
  let mcpClient: jest.Mocked<ArtifactClient>;
  let provider: ProjectArtifactTreeProvider;

  beforeEach(() => {
    const artifactClientMock: jest.Mocked<ArtifactClient> = {
      getWorkspaceProject: jest.fn(async () => baseProject),
      listProjectArtifacts: jest.fn(async (_projectId: string) => []),
      createProjectArtifact: jest.fn(async () => ({ success: true } as Awaited<ReturnType<MCPClient['createProjectArtifact']>>)),
      updateProjectArtifact: jest.fn(async () => ({ success: true } as Awaited<ReturnType<MCPClient['updateProjectArtifact']>>)),
      deleteProjectArtifact: jest.fn(async () => ({ success: true } as Awaited<ReturnType<MCPClient['deleteProjectArtifact']>>))
    };
    mcpClient = artifactClientMock;
    provider = new ProjectArtifactTreeProvider(mcpClient as unknown as MCPClient);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getChildren returns top-level items for artifacts', async () => {
    const artifacts: ProjectArtifact[] = [
      {
        id: 'a1',
        project_id: baseProject.id,
        title: '仕様書',
        uri: 'docs/spec.md',
        description: 'プロジェクト仕様書',
        version: 3
      }
    ];
    mcpClient.listProjectArtifacts.mockResolvedValueOnce(artifacts);

    const children = await provider.getChildren();

  expect(children).toHaveLength(1);
  expect(children?.[0].artifact.title).toBe('仕様書');
  expect(children?.[0]).toBeInstanceOf(ProjectArtifactTreeItem);
  });

  test('createArtifact collects input and calls client', async () => {
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    showInputMock
      .mockResolvedValueOnce('  新アーティファクト  ')
      .mockResolvedValueOnce(' src/output.pdf ')
      .mockResolvedValueOnce('成果物詳細');
    const refreshSpy = jest.spyOn(provider, 'refresh');

    await provider.createArtifact();

    expect(mcpClient.createProjectArtifact).toHaveBeenCalledWith({
      projectId: baseProject.id,
      title: '新アーティファクト',
      uri: 'src/output.pdf',
      description: '成果物詳細'
    });
    expect(refreshSpy).toHaveBeenCalled();
    showInputMock.mockRestore();
  });

  test('editArtifact handles conflict response', async () => {
    const artifact: ProjectArtifact = {
      id: 'a2',
      project_id: baseProject.id,
      title: '既存成果物',
      uri: 'docs/old.md',
      description: '旧バージョン',
      version: 5
    };
    const item = new ProjectArtifactTreeItem(artifact);
    jest
      .spyOn(vscode.window, 'showInputBox')
      .mockResolvedValueOnce('既存成果物 v2')
      .mockResolvedValueOnce('docs/new.md')
      .mockResolvedValueOnce('最新バージョン');
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage');

    mcpClient.updateProjectArtifact.mockResolvedValueOnce({ success: false, conflict: true });

    await provider.editArtifact(item);

    expect(mcpClient.updateProjectArtifact).toHaveBeenCalledWith({
      artifactId: artifact.id,
      title: '既存成果物 v2',
      uri: 'docs/new.md',
      description: '最新バージョン',
      version: artifact.version
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  test('deleteArtifact confirmation triggers client call', async () => {
    const artifact: ProjectArtifact = {
      id: 'a3',
      project_id: baseProject.id,
      title: '削除対象',
      version: 1
    };
    const item = new ProjectArtifactTreeItem(artifact);
    jest
      .spyOn(vscode.window, 'showWarningMessage')
      .mockResolvedValueOnce('削除' as any);

    await provider.deleteArtifact(item);

    expect(mcpClient.deleteProjectArtifact).toHaveBeenCalledWith(artifact.id);
  });
});
