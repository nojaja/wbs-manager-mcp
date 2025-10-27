<template>
  <div class="gantt-canvas" ref="container">
    <div v-if="loading" class="gantt-canvas__loading">読み込み中...</div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { ListTable } from '@visactor/vtable';
// Try to import the gantt package. If present it exposes a Gantt constructor
// which wires up gantt-specific scenegraph components and features.
import * as VTableGantt from '@visactor/vtable-gantt';

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

export default defineComponent({
  name: 'GanttCanvas',
  props: {
    rows: {
      type: Array as () => RowDatum[],
      required: true
    },
    timelineRange: {
      type: Object as () => TimelineRange,
      required: true
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  emits: ['drilldown'],
  setup(props, { emit }) {
    const container = ref<HTMLDivElement | null>(null);
  let table: any = null;
  let ganttInstance: any = null;

    const destroyTable = () => {
      if (table) {
        if (typeof table.dispose === 'function') {
          table.dispose();
        } else if (typeof table.release === 'function') {
          table.release();
        }
      }
      table = null;
      if (container.value) {
        container.value.innerHTML = '';
      }
    };

    const renderTable = () => {
      if (!container.value) {
        return;
      }
      destroyTable();

      const records = props.rows.map(row => ({
        ...row,
        progressPercent: Math.round((row.progress ?? 0) * 100),
        durationLabel: `${row.durationHours.toFixed(1)}h`,
        timeline: row
      }));

      // Prefer the Gantt helper (if available) so gantt-specific scenegraph
      // and interactions are used. Fall back to a simple ListTable when the
      // package is not available or construction fails.
      try {
        const Gantt = (VTableGantt as any)?.Gantt;
        if (Gantt) {
          console.debug('[GanttCanvas] @visactor/vtable-gantt available: Gantt constructor found');

          // Build safer options based on props.timelineRange so initOptions
          // doesn't access undefined internals. These defaults are minimal and
          // match the shape the library expects (timelineHeader.scales etc.).
          const minDateIso = new Date(props.timelineRange.start).toISOString();
          const maxDateIso = new Date(props.timelineRange.end).toISOString();
          const opts: any = {
            records,
            minDate: minDateIso,
            maxDate: maxDateIso,
            taskListTable: {
              columns: [
                { field: 'label', title: 'タスク', width: 320 }
              ]
            },
            // Provide a minimal timeline header so initOptions won't attempt
            // to read .scales[0] on an undefined object.
            timelineHeader: {
              scales: [
                {
                  unit: 'day',
                  step: 1,
                  format: (d: any) => {
                    try {
                      return (new Date(d.dateIndex)).toLocaleDateString();
                    } catch {
                      return '';
                    }
                  }
                }
              ]
            },
            headerRowHeight: 36,
            rowHeight: 36,
            // basic task bar options to avoid library defaults accessing missing fields
            taskBar: {
              startDateField: 'start',
              endDateField: 'end',
              progressField: 'progress'
            }
          };

          // Construct the Gantt instance and attach to the container
          ganttInstance = new Gantt(container.value, opts);
          console.debug('[GanttCanvas] Gantt instance constructed', !!ganttInstance);

          // If the gantt instance emits events, wire a simple drilldown mapping
          if (ganttInstance && typeof ganttInstance.on === 'function') {
            try {
              ganttInstance.on('click_task', (ev: any) => {
                const id = ev?.task?.id ?? ev?.taskKey ?? null;
                if (id) emit('drilldown', id);
              });
            } catch (_e) {
              // not all versions expose the same event names; ignore if not present
            }

            return;
          }
        }
      } catch (err) {
        // log the error to webview devtools so we can inspect the cause
        // (this will appear in the webview console)
        // Note: avoid throwing so extension doesn't crash; fallback will run.
        // eslint-disable-next-line no-console
        console.error('[GanttCanvas] Gantt construction error:', err);
      }

      // Fallback: basic ListTable rendering when gantt implementation isn't available
      const columns: any[] = [
        { field: 'label', title: 'タスク', width: 220 },
        { field: 'lane', title: 'レーン', width: 120 },
        { field: 'status', title: '状態', width: 100 },
        { field: 'progressPercent', title: '進捗(%)', width: 110 },
        { field: 'durationLabel', title: '予定工数', width: 110 },
        // Use a unique field name for the timeline column to avoid duplicate
        // field definitions which can confuse the ListTable internals.
        {
          field: 'timeline',
          title: 'タイムライン',
          width: 520,
          cellType: 'custom',
          customRender: (args: any) => {
            try {
              drawTimeline(args, props.timelineRange);
            } catch (e) {
              // log drawing errors to webview devtools but don't throw
              // eslint-disable-next-line no-console
              console.error('[GanttCanvas] drawTimeline error', e);
            }
            // Return explicit shape to avoid the library trying to mutate an
            // undefined elementsGroup. renderDefault:false prevents scenegraph
            // creation for this custom renderer.
            return { elementsGroup: null, renderDefault: false };
          }
        }
      ];

      const options: any = {
        records,
        columns,
        widthMode: 'autoWidth',
        heightMode: 'autoHeight',
        rowHeight: 36,
        hover: {
          enable: true
        }
      };

      table = new ListTable(container.value, options);

      if (table && typeof table.on === 'function') {
        table.on('click_cell', (event: any) => {
          const record = event?.cellData?.record ?? null;
          if (record && record.id) {
            emit('drilldown', record.id);
          }
        });
      }
    };

    onMounted(renderTable);

    watch(
      () => [props.rows, props.timelineRange],
      () => {
        renderTable();
      },
      { deep: true }
    );

    onBeforeUnmount(() => {
      destroyTable();
    });

    return {
      container
    };
  }
});

function drawTimeline(args: any, range: TimelineRange) {
  const cellValue = args?.data?.timeline ?? args?.value ?? args?.cellData?.record?.timeline;
  const rect = args?.rect ?? args?.bounding;
  const ctx: CanvasRenderingContext2D | undefined = args?.context?.ctx ?? args?.ctx;
  if (!cellValue || !rect || !ctx) {
    return;
  }

  const data: RowDatum = cellValue as RowDatum;
  const { x, y, width, height } = rect;
  const startRatio = clampRatio(data.startRatio);
  const endRatio = clampRatio(data.endRatio);
  const barStartX = x + startRatio * width;
  const barWidth = Math.max(2, (endRatio - startRatio) * width);
  const barY = y + 6;
  const barHeight = Math.max(6, height - 12);

  ctx.save();
  ctx.fillStyle = 'rgba(60, 140, 231, 0.85)';
  ctx.fillRect(barStartX, barY, barWidth, barHeight);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.strokeRect(barStartX, barY, barWidth, barHeight);

  const progressWidth = barWidth * clampRatio(data.progress ?? 0);
  ctx.fillStyle = 'rgba(103, 194, 58, 0.85)';
  ctx.fillRect(barStartX, barY, progressWidth, barHeight);

  const label = `${formatLabel(data.startDate, range.start)} → ${formatLabel(data.endDate, range.start)}`;
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 8, y + height / 2);
  ctx.restore();
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function formatLabel(dateIso: string, anchor: number): string {
  try {
    const date = new Date(dateIso);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
  } catch {
    // ignore
  }
  const offsetHours = (new Date(dateIso).getTime() - anchor) / (60 * 60 * 1000);
  return `${offsetHours.toFixed(1)}h`;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}
</script>

<style scoped>
.gantt-canvas {
  position: relative;
  width: 100%;
  height: 100%;
}

.gantt-canvas__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(1px);
}
</style>
