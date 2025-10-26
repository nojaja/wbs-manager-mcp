import { jest } from '@jest/globals';

jest.mock('../../src/mcpServer/db/connection', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../../src/mcpServer/db/connection') as { getDatabase: jest.MockedFunction<() => Promise<any>> };
const WbsGetGanttTool = require('../../src/mcpServer/tools/wbsGetGanttTool').default;

describe('wbs.planMode.getGantt tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDatabase.mockReset();
  });

  function createDb() {
    return {
      all: jest.fn(),
      get: jest.fn()
    };
  }

  it('returns full snapshot for root scope', async () => {
    const db: any = createDb();
    const tasks = [
      {
        id: 'root-1',
        parent_id: null,
        title: 'Root Task',
        status: 'in-progress',
        estimate: '4h',
        assignee: 'Team-A',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        depth: 0
      },
      {
        id: 'child-1',
        parent_id: 'root-1',
        title: 'Child Task',
        status: 'completed',
        estimate: '2h',
        assignee: null,
        created_at: '2025-01-01T03:00:00Z',
        updated_at: '2025-01-03T00:00:00Z',
        depth: 1
      }
    ];
    const deps = [
      {
        id: 'dep-1',
        dependency_task_id: 'root-1',
        dependee_task_id: 'child-1',
        created_at: '2025-01-02T01:00:00Z'
      }
    ];
    db.all.mockResolvedValueOnce(tasks);
    db.all.mockResolvedValueOnce(deps);
    getDatabase.mockResolvedValue(db);

    const tool = new WbsGetGanttTool();
    const res = await tool.run({});
    expect(db.all).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(res.content[0].text);
    expect(payload.metadata.parentId).toBeNull();
    expect(payload.tasks).toHaveLength(2);
    const rootTask = payload.tasks.find((t: any) => t.id === 'root-1');
    expect(rootTask.estimate.durationHours).toBeCloseTo(4);
    expect(rootTask.lane).toBe('Team-A');
    const childTask = payload.tasks.find((t: any) => t.id === 'child-1');
    expect(childTask.wbsPath).toEqual(['root-1', 'child-1']);
    expect(payload.dependencies).toHaveLength(1);
    expect(res.llmHints.notes.length).toBeGreaterThanOrEqual(0);
  });

  it('filters by parent and since', async () => {
  const db: any = createDb();
    db.get.mockImplementation((sql: string, param: string) => {
      if (param === 'parent-1') return { id: 'parent-1', parent_id: null };
      return null;
    });
    db.all.mockResolvedValueOnce([
      {
        id: 'child-new',
        parent_id: 'parent-1',
        title: 'Fresh Child',
        status: 'pending',
        estimate: '1h',
        assignee: null,
        created_at: '2025-01-05T00:00:00Z',
        updated_at: '2025-01-06T00:00:00Z',
        depth: 1
      }
    ]);
    db.all.mockResolvedValueOnce([]);
    getDatabase.mockResolvedValue(db);

    const tool = new WbsGetGanttTool();
    const res = await tool.run({ parentId: 'parent-1', since: '2025-01-01T00:00:00Z' });
    expect(db.get).toHaveBeenCalledWith(expect.stringContaining('SELECT id, parent_id FROM tasks WHERE id = ?'), 'parent-1');
    const payload = JSON.parse(res.content[0].text);
    expect(payload.metadata.parentId).toBe('parent-1');
    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0].wbsPath).toEqual(['parent-1', 'child-new']);
    expect(res.llmHints.notes.some((n: string) => n.includes('since='))).toBeTruthy();
  });

  it('validates since parameter', async () => {
    const tool = new WbsGetGanttTool();
    const res = await tool.run({ since: 'not-a-date' });
    expect(res.content[0].text).toContain('Invalid since timestamp');
    expect(res.llmHints.nextActions[0].action).toBe('wbs.planMode.getGantt');
  });
});
