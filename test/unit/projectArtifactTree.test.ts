import { jest } from '@jest/globals';
import * as vscode from 'vscode';
import { ArtifactTreeItem, ArtifactTreeProvider } from '../../src/extension/views/artifactTree';
import type { Artifact } from '../../src/extension/mcp/types';
import type { WBSServicePublic } from '../../src/extension/services/wbsService.interface';

jest.mock('vscode');

describe('ProjectArtifactTreeProvider', () => {
  type ArtifactService = Pick<WBSServicePublic, 'listArtifactsApi' | 'createArtifactApi' | 'updateArtifactApi' | 'deleteArtifactApi'>;
  let wbsService: jest.Mocked<ArtifactService>;
  let provider: ArtifactTreeProvider;

  beforeEach(() => {
    const artifactServiceMock: jest.Mocked<ArtifactService> = {
      listArtifactsApi: jest.fn(async () => []),
      createArtifactApi: jest.fn(async () => ({ success: true })),
      updateArtifactApi: jest.fn(async () => ({ success: true })),
      deleteArtifactApi: jest.fn(async () => ({ success: true }))
    };
    wbsService = artifactServiceMock;
    provider = new ArtifactTreeProvider(wbsService as unknown as WBSServicePublic);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getChildren returns top-level items for artifacts', async () => {
    const artifacts: Artifact[] = [
      {
        id: 'a1',
        title: '仕様書',
        uri: 'docs/spec.md',
        description: 'プロジェクト仕様書',
        version: 3
      }
    ];
    wbsService.listArtifactsApi.mockResolvedValueOnce(artifacts);

    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children?.[0].artifact.title).toBe('仕様書');
    expect(children?.[0]).toBeInstanceOf(ArtifactTreeItem);
  });

  test('createArtifact collects input and calls client', async () => {
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    showInputMock
      .mockResolvedValueOnce('  新アーティファクト  ')
      .mockResolvedValueOnce(' src/output.pdf ')
      .mockResolvedValueOnce('成果物詳細');
    const refreshSpy = jest.spyOn(provider, 'refresh');

    await provider.createArtifact();

    expect(wbsService.createArtifactApi).toHaveBeenCalledWith({
      title: '新アーティファクト',
      uri: 'src/output.pdf',
      description: '成果物詳細'
    });
    expect(refreshSpy).toHaveBeenCalled();
    showInputMock.mockRestore();
  });

  test('editArtifact handles conflict response', async () => {
    const artifact: Artifact = {
      id: 'a2',
      title: '既存成果物',
      uri: 'docs/old.md',
      description: '旧バージョン',
      version: 5
    };
    const item = new ArtifactTreeItem(artifact);
    jest
      .spyOn(vscode.window, 'showInputBox')
      .mockResolvedValueOnce('既存成果物 v2')
      .mockResolvedValueOnce('docs/new.md')
      .mockResolvedValueOnce('最新バージョン');
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage');

    wbsService.updateArtifactApi.mockResolvedValueOnce({ success: false, conflict: true });

    await provider.editArtifact(item);

    expect(wbsService.updateArtifactApi).toHaveBeenCalledWith({
      artifactId: artifact.id,
      title: '既存成果物 v2',
      uri: 'docs/new.md',
      description: '最新バージョン',
      version: artifact.version
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  test('deleteArtifact confirmation triggers client call', async () => {
    const artifact: Artifact = {
      id: 'a3',
      title: '削除対象',
      version: 1
    };
    const item = new ArtifactTreeItem(artifact);
    jest
      .spyOn(vscode.window, 'showWarningMessage')
      .mockResolvedValueOnce('削除' as any);

    await provider.deleteArtifact(item);

    expect(wbsService.deleteArtifactApi).toHaveBeenCalledWith(artifact.id);
  });

  test('getChildren returns empty array for non-root element', async () => {
    const artifact: Artifact = {
      id: 'a1',
      title: 'Test Artifact',
      version: 1
    };
    const item = new ArtifactTreeItem(artifact);

    const children = await provider.getChildren(item);

    expect(children).toHaveLength(0);
  });

  test('createArtifact cancels when no title provided', async () => {
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    showInputMock.mockResolvedValueOnce(undefined);

    await provider.createArtifact();

    expect(wbsService.createArtifactApi).not.toHaveBeenCalled();
    showInputMock.mockRestore();
  });

  test('createArtifact validates empty title', async () => {
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    showInputMock.mockResolvedValueOnce('Valid Title');

    await provider.createArtifact();
    
    const validateInput = showInputMock.mock.calls[0][0]?.validateInput;
    expect(validateInput?.('')).toBe('名称は必須です。');
    expect(validateInput?.('  ')).toBe('名称は必須です。');
    expect(validateInput?.('Valid')).toBeUndefined();
    showInputMock.mockRestore();
  });

  test('createArtifact handles API error', async () => {
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    
    showInputMock
      .mockResolvedValueOnce('Test Title')
      .mockResolvedValueOnce('test.md')
      .mockResolvedValueOnce('Test description');
    
    wbsService.createArtifactApi.mockResolvedValueOnce({ success: false, error: 'Creation failed' });

    await provider.createArtifact();

    expect(errorSpy).toHaveBeenCalledWith('Creation failed');
    showInputMock.mockRestore();
    errorSpy.mockRestore();
  });

  test('createArtifact handles API error without message', async () => {
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    
    showInputMock
      .mockResolvedValueOnce('Test Title')
      .mockResolvedValueOnce('test.md')
      .mockResolvedValueOnce('Test description');
    
    wbsService.createArtifactApi.mockResolvedValueOnce({ success: false });

    await provider.createArtifact();

    expect(errorSpy).toHaveBeenCalledWith('成果物の作成に失敗しました。');
    showInputMock.mockRestore();
    errorSpy.mockRestore();
  });

  test('createArtifact shows success message', async () => {
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    const refreshSpy = jest.spyOn(provider, 'refresh');
    
    showInputMock
      .mockResolvedValueOnce('  Test Title  ')
      .mockResolvedValueOnce('  test.md  ')
      .mockResolvedValueOnce('  Test description  ');

    wbsService.createArtifactApi.mockResolvedValueOnce({ success: true, artifact: { id: 'a1', title: 'Test Title', version: 1 } });

    await provider.createArtifact();

    expect(wbsService.createArtifactApi).toHaveBeenCalledWith({
      title: 'Test Title',
      uri: 'test.md',
      description: 'Test description'
    });
    expect(infoSpy).toHaveBeenCalledWith('成果物「Test Title」を作成しました。');
    expect(refreshSpy).toHaveBeenCalled();
    
    showInputMock.mockRestore();
    infoSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  test('createArtifact handles null uri and description', async () => {
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    
    showInputMock
      .mockResolvedValueOnce('Test Title')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    wbsService.createArtifactApi.mockResolvedValueOnce({ success: true });

    await provider.createArtifact();

    expect(wbsService.createArtifactApi).toHaveBeenCalledWith({
      title: 'Test Title',
      uri: null,
      description: null
    });
    
    showInputMock.mockRestore();
  });

  test('editArtifact warns when no target provided', async () => {
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage');

    await provider.editArtifact();

    expect(warnSpy).toHaveBeenCalledWith('編集する成果物を選択してください。');
    expect(wbsService.updateArtifactApi).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('editArtifact cancels when no title provided', async () => {
    const artifact: Artifact = { id: 'a1', title: 'Test', version: 1 };
    const item = new ArtifactTreeItem(artifact);
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    
    showInputMock.mockResolvedValueOnce(undefined);

    await provider.editArtifact(item);

    expect(wbsService.updateArtifactApi).not.toHaveBeenCalled();
    showInputMock.mockRestore();
  });

  test('editArtifact validates empty title', async () => {
    const artifact: Artifact = { id: 'a1', title: 'Test', version: 1 };
    const item = new ArtifactTreeItem(artifact);
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    
    showInputMock.mockResolvedValueOnce('Valid Title');

    await provider.editArtifact(item);

    const validateInput = showInputMock.mock.calls[0][0]?.validateInput;
    expect(validateInput?.('')).toBe('名称は必須です。');
    expect(validateInput?.('  ')).toBe('名称は必須です。');
    expect(validateInput?.('Valid')).toBeUndefined();
    showInputMock.mockRestore();
  });

  test('editArtifact handles non-conflict API error', async () => {
    const artifact: Artifact = { id: 'a1', title: 'Test', version: 1 };
    const item = new ArtifactTreeItem(artifact);
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    const refreshSpy = jest.spyOn(provider, 'refresh');
    
    showInputMock
      .mockResolvedValueOnce('Updated Title')
      .mockResolvedValueOnce('updated.md')
      .mockResolvedValueOnce('Updated description');
    
    wbsService.updateArtifactApi.mockResolvedValueOnce({ success: false, error: 'Update failed' });

    await provider.editArtifact(item);

    expect(errorSpy).toHaveBeenCalledWith('Update failed');
    expect(refreshSpy).toHaveBeenCalled();
    
    showInputMock.mockRestore();
    errorSpy.mockRestore(); 
    refreshSpy.mockRestore();
  });

  test('editArtifact shows success message', async () => {
    const artifact: Artifact = { id: 'a1', title: 'Test', version: 1 };
    const item = new ArtifactTreeItem(artifact);
    const showInputMock = jest.spyOn(vscode.window, 'showInputBox');
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    const refreshSpy = jest.spyOn(provider, 'refresh');
    
    showInputMock
      .mockResolvedValueOnce('  Updated Title  ')
      .mockResolvedValueOnce('  updated.md  ')
      .mockResolvedValueOnce('  Updated description  ');
    
    wbsService.updateArtifactApi.mockResolvedValueOnce({ success: true, artifact: { id: 'a1', title: 'Updated Title', version: 2 } });

    await provider.editArtifact(item);

    expect(wbsService.updateArtifactApi).toHaveBeenCalledWith({
      artifactId: 'a1',
      title: 'Updated Title',
      uri: 'updated.md',
      description: 'Updated description',
      version: 1
    });
    expect(infoSpy).toHaveBeenCalledWith('成果物「Updated Title」を更新しました。');
    expect(refreshSpy).toHaveBeenCalled();
    
    showInputMock.mockRestore();
    infoSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  test('deleteArtifact warns when no target provided', async () => {
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage');

    await provider.deleteArtifact();

    expect(warnSpy).toHaveBeenCalledWith('削除する成果物を選択してください。');
    expect(wbsService.deleteArtifactApi).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('deleteArtifact cancels when not confirmed', async () => {
    const artifact: Artifact = { id: 'a1', title: 'Test', version: 1 };
    const item = new ArtifactTreeItem(artifact);
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValueOnce(undefined);

    await provider.deleteArtifact(item);

    expect(wbsService.deleteArtifactApi).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('deleteArtifact handles API error', async () => {
    const artifact: Artifact = { id: 'a1', title: 'Test', version: 1 };
    const item = new ArtifactTreeItem(artifact);
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValueOnce('削除' as any);
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    
    wbsService.deleteArtifactApi.mockResolvedValueOnce({ success: false, error: 'Delete failed' });

    await provider.deleteArtifact(item);

    expect(errorSpy).toHaveBeenCalledWith('Delete failed');
    
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('deleteArtifact shows success message', async () => {
    const artifact: Artifact = { id: 'a1', title: 'Test', version: 1 };
    const item = new ArtifactTreeItem(artifact);
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValueOnce('削除' as any);
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    const refreshSpy = jest.spyOn(provider, 'refresh');
    
    wbsService.deleteArtifactApi.mockResolvedValueOnce({ success: true });

    await provider.deleteArtifact(item);

    expect(infoSpy).toHaveBeenCalledWith('成果物「Test」を削除しました。');
    expect(refreshSpy).toHaveBeenCalled();
    
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    refreshSpy.mockRestore();
  });
});

describe('ArtifactTreeItem', () => {
  test('constructor sets correct properties', () => {
    const artifact: Artifact = {
      id: 'a1',
      title: 'Test Artifact',
      uri: 'docs/test.md',
      description: 'Test description',
      version: 1
    };

    const item = new ArtifactTreeItem(artifact);

    expect(item.artifact).toBe(artifact);
    expect(item.description).toBe('docs/test.md');
    expect(item.contextValue).toBe('projectArtifact');
    expect(item.id).toBe('a1');
    // VSCode TreeItem の collapsibleState は直接テストしません
    expect(item.command).toEqual({
      command: 'artifactTree.editArtifact',
      title: 'Open Artifact',
      arguments: [item]
    });
  });

  test('constructor handles missing properties', () => {
    const artifact: Artifact = {
      id: 'a2',
      title: 'a2',
      version: 1
    };

    const item = new ArtifactTreeItem(artifact);

    expect(item.artifact).toBe(artifact);
    expect(item.description).toBe(''); // Empty string when uri is missing
  });

  test('buildTooltip creates correct tooltip', () => {
    const artifact: Artifact = {
      id: 'a1',
      title: 'Test',
      uri: 'docs/test.md',
      description: 'Test description',
      version: 1
    };

    const item = new ArtifactTreeItem(artifact);

    expect(item.tooltip).toBe('ID: a1\nURI: docs/test.md\nTest description');
  });

  test('buildTooltip handles missing uri and description', () => {
    const artifact: Artifact = {
      id: 'a1',
      title: 'Test',
      version: 1
    };

    const item = new ArtifactTreeItem(artifact);

    expect(item.tooltip).toBe('ID: a1');
  });
});
