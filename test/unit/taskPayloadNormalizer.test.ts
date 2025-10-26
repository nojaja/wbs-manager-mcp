import { buildCreateTaskPayload, buildUpdateTaskPayload } from '../../src/extension/tasks/taskPayload';

describe('taskPayload helpers', () => {
  describe('buildCreateTaskPayload', () => {
    it('正規化された成果物・完了条件を含む作成ペイロードを生成する', () => {
      const payload = buildCreateTaskPayload({
        title: ' Title ',
        description: undefined,
        parentId: 'root',
        assignee: undefined,
        estimate: undefined,
        artifacts: [
          { artifactId: ' art-1 ', crudOperations: ' create ' },
          { artifactId: '   ' },
          { artifactId: 'art-2', crudOperations: '' },
          { artifactId: ' pre-1 ', crudOperations: ' update ' }
        ],
        completionConditions: [
          { description: '  done  ' },
          { description: '   ' }
        ]
      });

      expect(payload).toEqual({
        title: ' Title ',
        description: '',
        parentId: 'root',
        assignee: null,
        estimate: null,
        artifacts: [
          { artifactId: 'art-1', crudOperations: 'create' },
          { artifactId: 'art-2' },
          { artifactId: 'pre-1', crudOperations: 'update' }
        ],
        completionConditions: [
          { description: 'done' }
        ]
      });
    });
  });

  describe('buildUpdateTaskPayload', () => {
    it('更新ペイロードからtaskIdを除外し配列を正規化する', () => {
      const payload = buildUpdateTaskPayload({
        taskId: 'ignore-me',
        artifacts: [
          { artifactId: ' art-1 ', crudOperations: ' read ' },
          { artifactId: '   ' },
          { artifactId: ' pre-1 ', crudOperations: '  write  ' }
        ],
        completionConditions: [
          { description: '  ready ' },
          { description: '' }
        ],
        extra: 'keep'
      });

      expect(payload).toEqual({
        artifacts: [
          { artifactId: 'art-1', crudOperations: 'read' },
          { artifactId: 'pre-1', crudOperations: 'write' }
        ],
        completionConditions: [
          { description: 'ready' }
        ],
        extra: 'keep'
      });
    });

    it('無効な配列は除去され既存フィールドは保持される', () => {
      const payload = buildUpdateTaskPayload({
        taskId: 'ignore-me',
        artifacts: undefined,
        completionConditions: [{ description: '   ' }],
        note: 'memo'
      });

      expect(payload).toEqual({
        completionConditions: [],
        note: 'memo'
      });
    });
  });
});
