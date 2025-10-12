
import { jest } from '@jest/globals';
import { WBSService } from '../src/extension/services/WBSService';

describe('WBS/Artifact ビジネスロジックの現状動作テスト', () => {
  let mcpClient: any;
  let service: WBSService;

  beforeEach(() => {
    mcpClient = { fetch: jest.fn() };
    service = new WBSService(mcpClient);
  });


  it('WBSツリー: refreshが呼ばれるとwbsProvider.refreshが呼ばれる', async () => {
    const refreshSpy = jest.spyOn(service.wbsProvider, 'refresh');
    await service.refreshWbsTree();
    expect(refreshSpy).toHaveBeenCalled();
  });


  it('WBSツリー: createTaskでwbsProvider.createTaskが呼ばれる', async () => {
    const createTaskSpy = jest.spyOn(service.wbsProvider, 'createTask').mockResolvedValue({ success: true, taskId: 't1' });
    const result = await service.createTask();
    expect(createTaskSpy).toHaveBeenCalled();
    expect(result.taskId).toBe('t1');
  });


  it('WBSツリー: deleteTaskでwbsProvider.deleteTaskが呼ばれる', async () => {
    const deleteTaskSpy = jest.spyOn(service.wbsProvider, 'deleteTask').mockResolvedValue({ success: true });
    await service.deleteTask({ itemId: 't1' });
    expect(deleteTaskSpy).toHaveBeenCalled();
  });


  it('Artifactツリー: refreshが呼ばれるとartifactProvider.refreshが呼ばれる', async () => {
    const refreshSpy = jest.spyOn(service.artifactProvider, 'refresh');
    await service.refreshArtifactTree();
    expect(refreshSpy).toHaveBeenCalled();
  });


  it('Artifactツリー: createArtifactでartifactProvider.createArtifactが呼ばれる', async () => {
    const createArtifactSpy = jest.spyOn(service.artifactProvider, 'createArtifact').mockResolvedValue(undefined);
    await service.createArtifact();
    expect(createArtifactSpy).toHaveBeenCalled();
  });


  it('Artifactツリー: deleteArtifactでartifactProvider.deleteArtifactが呼ばれる', async () => {
    // artifactProvider.deleteArtifactはvoid型だが、テスト用に任意の値を返す
    const deleteArtifactSpy = jest.spyOn(service.artifactProvider, 'deleteArtifact').mockResolvedValue({} as any);
    await service.deleteArtifact({ artifact: { id: 'a1' } });
    expect(deleteArtifactSpy).toHaveBeenCalled();
  });
});
