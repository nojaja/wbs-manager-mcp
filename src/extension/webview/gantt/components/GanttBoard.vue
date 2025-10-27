<template>
  <div class="gantt-board">
    <div class="gantt-board__canvas">
      <GanttCanvas
        :rows="rows"
        :timeline-range="timelineRange"
        :loading="loading"
        @drilldown="handleDrilldown"
      />
      <div v-if="errorMessage" class="gantt-board__overlay-error">
        {{ errorMessage }}
      </div>
    </div>
    <aside class="gantt-board__sidebar">
      <section class="gantt-board__section">
        <header>
          <h2>概要</h2>
        </header>
        <dl>
          <dt>タスク数</dt>
          <dd>{{ snapshot.tasks.length }}</dd>
          <dt>依存関係</dt>
          <dd>{{ snapshot.dependencies.length }}</dd>
          <dt>アンカー</dt>
          <dd>{{ anchorLabel }}</dd>
        </dl>
        <button class="gantt-board__button" type="button" @click="onRefresh">
          最新のデータを取得
        </button>
      </section>
      <section class="gantt-board__section">
        <header>
          <h2>レーン</h2>
        </header>
        <ul class="gantt-board__list">
          <li v-for="lane in lanes" :key="lane">
            {{ lane }}
          </li>
        </ul>
      </section>
      <section class="gantt-board__section">
        <header>
          <h2>ドリルダウン</h2>
        </header>
        <ul class="gantt-board__list">
          <li v-for="task in drilldownTargets" :key="task.id">
            <div class="gantt-board__list-item">
              <span class="gantt-board__list-label">{{ task.label }}</span>
              <button type="button" class="gantt-board__mini-button" @click="emitDrilldown(task)">
                詳細へ
              </button>
            </div>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import GanttCanvas from './GanttCanvas.vue';
import type { GanttSnapshot } from '../types';

interface RowDatum {
  id: string;
  label: string;
  lane: string;
  status: string;
  progress: number;
  durationHours: number;
  start: number;
  end: number;
  startDate: string;
  endDate: string;
  startOffsetHours: number;
  endOffsetHours: number;
  startRatio: number;
  endRatio: number;
}

interface TimelineRange {
  start: number;
  end: number;
  spanHours: number;
}

const HOUR_MS = 60 * 60 * 1000;

type Dependency = GanttSnapshot['dependencies'][number];

export default defineComponent({
  name: 'GanttBoard',
  components: { GanttCanvas },
  props: {
    snapshot: {
      type: Object as () => GanttSnapshot,
      required: true
    },
    loading: {
      type: Boolean,
      default: false
    },
    errorMessage: {
      type: String as () => string | null,
      default: null
    }
  },
  emits: ['refresh', 'change-parent'],
  setup(props, { emit }) {
    const anchorTime = computed(() => new Date(props.snapshot.metadata.anchor.start).getTime());

    const taskMap = computed(() => {
      const map = new Map<string, ReturnType<typeof normalizeTask>>();
      for (const task of props.snapshot.tasks) {
        map.set(task.id, normalizeTask(task));
      }
      return map;
    });

    const dependencyMap = computed(() => {
      const map = new Map<string, Dependency[]>();
      for (const dep of props.snapshot.dependencies) {
        const list = map.get(dep.to) ?? [];
        list.push(dep);
        map.set(dep.to, list);
      }
      return map;
    });

    const memoStart = new Map<string, number>();

    const computeStart = (taskId: string): number => {
      if (memoStart.has(taskId)) {
        return memoStart.get(taskId)!;
      }
      const base = anchorTime.value;
      const incoming = dependencyMap.value.get(taskId) ?? [];
      if (incoming.length === 0) {
        memoStart.set(taskId, base);
        return base;
      }
      let maxStart = base;
      for (const dep of incoming) {
        const candidate = computeDependencyStart(dep, taskId);
        if (candidate > maxStart) {
          maxStart = candidate;
        }
      }
      memoStart.set(taskId, maxStart);
      return maxStart;
    };

    const computeDependencyStart = (dependency: Dependency, targetId: string): number => {
      const fromTask = taskMap.value.get(dependency.from);
      const toTask = taskMap.value.get(targetId);
      if (!fromTask || !toTask) {
        return anchorTime.value;
      }
      const fromStart = computeStart(fromTask.id);
      const fromEnd = fromStart + fromTask.durationHours * HOUR_MS;
      const toDuration = toTask.durationHours * HOUR_MS;
      const lag = (dependency.lagHours ?? 0) * HOUR_MS;

      switch (dependency.type) {
        case 'SS':
          return fromStart + lag;
        case 'FF':
          return fromEnd + lag - toDuration;
        case 'SF':
          return fromStart + lag - toDuration;
        case 'FS':
        default:
          return fromEnd + lag;
      }
    };

    const rows = computed<RowDatum[]>(() => {
      memoStart.clear();
      const tasks = props.snapshot.tasks.map(task => {
        const durationHours = Math.max(task.estimate?.durationHours ?? 0, 0);
        const start = computeStart(task.id);
        const end = start + durationHours * HOUR_MS;
        return {
          id: task.id,
          label: task.label,
          lane: task.lane ?? 'Default',
          status: task.status,
          progress: task.progress,
          durationHours,
          start,
          end,
          startDate: new Date(start).toISOString(),
          endDate: new Date(end).toISOString(),
          startOffsetHours: (start - anchorTime.value) / HOUR_MS,
          endOffsetHours: (end - anchorTime.value) / HOUR_MS,
          startRatio: 0,
          endRatio: 0
        } satisfies RowDatum;
      });

      const minStart = Math.min(anchorTime.value, ...tasks.map(t => t.start));
      const maxEnd = Math.max(anchorTime.value + HOUR_MS, ...tasks.map(t => t.end));
      const range = maxEnd - minStart;

      for (const task of tasks) {
        task.startRatio = range > 0 ? (task.start - minStart) / range : 0;
        task.endRatio = range > 0 ? (task.end - minStart) / range : 0;
      }

      return tasks.sort((a, b) => {
        if (a.lane !== b.lane) {
          return a.lane.localeCompare(b.lane);
        }
        return a.startOffsetHours - b.startOffsetHours;
      });
    });

    const timelineRange = computed<TimelineRange>(() => {
      const minStart = Math.min(anchorTime.value, ...rows.value.map(row => row.start));
      const maxEnd = Math.max(anchorTime.value + HOUR_MS, ...rows.value.map(row => row.end));
      return {
        start: minStart,
        end: maxEnd,
        spanHours: (maxEnd - minStart) / HOUR_MS
      };
    });

    const lanes = computed(() => {
      const set = new Set<string>();
      for (const row of rows.value) {
        set.add(row.lane);
      }
      return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
    });

  const drilldownTargets = computed(() => props.snapshot.tasks.map(normalizeTask));

    const anchorLabel = computed(() => new Date(props.snapshot.metadata.anchor.start).toLocaleString());

    const onRefresh = () => {
      emit('refresh', props.snapshot.metadata.generatedAt);
    };

    const emitDrilldown = (task: ReturnType<typeof normalizeTask>) => {
      emit('change-parent', { parentId: task.id, titleHint: task.label });
    };

    const handleDrilldown = (taskId: string) => {
      const target = drilldownTargets.value.find(task => task.id === taskId);
      if (target) {
        emitDrilldown(target);
      }
    };

    return {
      rows,
      lanes,
      timelineRange,
      drilldownTargets,
      anchorLabel,
      onRefresh,
      emitDrilldown,
      handleDrilldown
    };
  }
});

function normalizeTask(task: GanttSnapshot['tasks'][number]) {
  return {
    id: task.id,
    label: task.label,
    lane: task.lane ?? 'Default',
    durationHours: Math.max(task.estimate?.durationHours ?? 0, 0),
    progress: task.progress,
    status: task.status
  };
}
</script>

<style scoped>
.gantt-board {
  display: grid;
  grid-template-columns: 1fr 320px;
  height: 100%;
  overflow: hidden;
}

.gantt-board__canvas {
  position: relative;
  overflow: hidden;
}

.gantt-board__overlay-error {
  position: absolute;
  top: 16px;
  left: 16px;
  padding: 8px 12px;
  background: rgba(180, 0, 0, 0.8);
  color: #fff;
  border-radius: 4px;
}

.gantt-board__sidebar {
  border-left: 1px solid var(--vscode-editorWidget-border, #444);
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gantt-board__section > header {
  margin-bottom: 8px;
}

.gantt-board__section h2 {
  margin: 0;
  font-size: 0.95rem;
}

dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  font-size: 0.85rem;
}

dl dt {
  opacity: 0.7;
}

dl dd {
  margin: 0;
  text-align: right;
}

.gantt-board__button {
  margin-top: 12px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
  font-size: 0.9rem;
}

.gantt-board__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.85rem;
}

.gantt-board__list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.gantt-board__list-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.gantt-board__mini-button {
  padding: 4px 8px;
  font-size: 0.75rem;
  border-radius: 4px;
  border: none;
  background: var(--vscode-inputOption-activeBackground, #094771);
  color: var(--vscode-button-foreground, #fff);
  cursor: pointer;
}

@media (max-width: 1024px) {
  .gantt-board {
    grid-template-columns: 1fr;
  }
  .gantt-board__sidebar {
    border-left: none;
    border-top: 1px solid var(--vscode-editorWidget-border, #444);
    flex-direction: row;
    flex-wrap: wrap;
  }
  .gantt-board__section {
    flex: 1;
    min-width: 200px;
  }
}
</style>
