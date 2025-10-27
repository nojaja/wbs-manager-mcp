import { MCPGanttClient } from '../../src/extension/repositories/mcp/ganttClient';

const snapshot = {
  metadata: {
    parentId: null,
    generatedAt: '2024-01-01T00:00:00Z',
    anchor: { start: '2024-01-01T00:00:00Z' }
  },
  tasks: [
    {
      id: 'task-1',
      label: 'Task 1',
      estimate: { durationHours: 8 },
      progress: 0.25,
      status: 'planned',
      lane: 'Alpha',
      wbsPath: ['task-1'],
      orderIndex: 0
    }
  ],
  dependencies: []
};

describe('MCPGanttClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns snapshot when callTool returns direct object', async () => {
    const client = new MCPGanttClient();
    jest.spyOn(client as any, 'callTool').mockResolvedValue(snapshot);

    const result = await client.getGanttSnapshot();

    expect(result).not.toBeNull();
    expect(result?.metadata.parentId).toBeNull();
    expect(result?.tasks[0].progress).toBe(0.25);
  });

  it('parses snapshot from JSON text payload', async () => {
    const client = new MCPGanttClient();
    const response = {
      content: [
        {
          text: JSON.stringify(snapshot)
        }
      ]
    };
    jest.spyOn(client as any, 'callTool').mockResolvedValue(response);

    const result = await client.getGanttSnapshot();

    expect(result).not.toBeNull();
    expect(result?.tasks[0].label).toBe('Task 1');
  });

  it('returns null when callTool throws', async () => {
    const client = new MCPGanttClient();
    jest.spyOn(client as any, 'callTool').mockRejectedValue(new Error('timeout'));

    const result = await client.getGanttSnapshot();

    expect(result).toBeNull();
  });
});
