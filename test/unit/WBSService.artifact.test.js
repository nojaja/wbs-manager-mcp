// jest is available as a global in this test environment (ts-jest)
const { WBSService } = require('../../src/extension/services/WBSService');

// ベースライン: global.callTool を WBSService が利用している想定でモックする
beforeEach(() => {
  jest.clearAllMocks();
});

describe('WBSService artifacts API', () => {
  it('listArtifactsApi: 正常系 - provider からの配列をそのまま返す', async () => {
    const fakeArtifacts = [
      { id: 'a1', file: 'foo.txt', path: '/foo.txt' },
      { id: 'a2', file: 'bar.txt', path: '/bar.txt' }
    ];

    global.callTool = jest.fn().mockResolvedValue({ content: [{ text: JSON.stringify(fakeArtifacts) }] });

    const service = new WBSService({ callTool: global.callTool });
    const res = await service.listArtifactsApi();

    expect(global.callTool).toHaveBeenCalledWith('artifacts.listArtifacts', {});
    expect(res).toEqual(fakeArtifacts);
  });

  it('listArtifactsApi: 異常系 - callTool が失敗したらエラーを投げる', async () => {
    global.callTool = jest.fn().mockRejectedValue(new Error('network error'));

    const service = new WBSService({ callTool: global.callTool });
    const res = await service.listArtifactsApi();
    expect(res).toEqual([]);
  });

  it('createArtifactApi: 正常系 - 成功時にartifactを返す', async () => {
    const artifact = { id: 'a1', title: 'New Artifact' };
    global.callTool = jest.fn().mockResolvedValue({ content: [{ text: JSON.stringify(artifact) }] });

    const service = new WBSService({ callTool: global.callTool });
    const res = await service.createArtifactApi({ title: 'New Artifact', uri: null, description: null });

    expect(global.callTool).toHaveBeenCalledWith('artifacts.createArtifact', { title: 'New Artifact', uri: null, description: null });
    expect(res.success).toBe(true);
    expect(res.artifact).toEqual(artifact);
  });

  it('updateArtifactApi: conflict を検出して conflict:true を返す', async () => {
    const conflictText = 'modified by another user';
    global.callTool = jest.fn().mockResolvedValue({ content: [{ text: conflictText }] });

    const service = new WBSService({ callTool: global.callTool });
    const res = await service.updateArtifactApi({ artifactId: 'a1', title: 'X', uri: null, description: null, version: 1 });

    expect(global.callTool).toHaveBeenCalledWith('artifacts.updateArtifact', { artifactId: 'a1', title: 'X', uri: null, description: null, ifVersion: 1 });
    expect(res.success).toBe(false);
    expect(res.conflict).toBe(true);
  });
});
