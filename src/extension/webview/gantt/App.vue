<template>
  <div id="gantt-app" class="gantt-app">
    <header class="gantt-header">
      <div class="gantt-header__info">
        <h1 class="gantt-header__title">{{ headerTitle }}</h1>
        <span v-if="snapshot" class="gantt-header__timestamp">
          生成時刻: {{ formattedGeneratedAt }}
        </span>
      </div>
      <div class="gantt-header__actions">
        <button class="gantt-button" type="button" @click="requestRefresh()" :disabled="loading">
          再取得
        </button>
        <button
          v-if="context.parentId"
          class="gantt-button"
          type="button"
          @click="changeParent(null, 'Root')"
          :disabled="loading"
        >
          ルート表示
        </button>
      </div>
    </header>
    <main class="gantt-content">
      <GanttBoard
        v-if="snapshot"
        :snapshot="snapshot"
        :loading="loading"
        :error-message="errorMessage"
        @refresh="requestRefresh"
        @change-parent="onChangeParent"
      />
      <div v-else class="gantt-empty">
        <p>ガントデータがありません。"再取得" を押して最新のスナップショットを取得してください。</p>
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, onMounted, onBeforeUnmount } from 'vue';
import GanttBoard from './components/GanttBoard.vue';
import type { GanttSnapshot, GanttWebviewContext, GanttWebviewPayload } from './types';

declare function acquireVsCodeApi(): { postMessage(data: unknown): void };

interface IncomingMessage {
  command: string;
  snapshot?: GanttSnapshot;
  context?: GanttWebviewContext;
  message?: string;
  since?: string;
  parentId?: string | null;
  titleHint?: string;
}

export default defineComponent({
  name: 'GanttApp',
  components: { GanttBoard },
  setup() {
    const vscodeApi = ref<{ postMessage(data: unknown): void } | null>(null);
    const snapshot = ref<GanttSnapshot | null>(null);
    const context = ref<GanttWebviewContext>({ parentId: null });
    const loading = ref(false);
    const errorMessage = ref<string | null>(null);

    const headerTitle = computed(() => {
      if (!snapshot.value) {
        return 'Gantt (未取得)';
      }
      const base = context.value.titleHint || (context.value.parentId ?? 'Root');
      return `Gantt: ${base}`;
    });

    const formattedGeneratedAt = computed(() => {
      if (!snapshot.value) {
        return '';
      }
      try {
        const date = new Date(snapshot.value.metadata.generatedAt);
        return date.toLocaleString();
      } catch {
        return snapshot.value.metadata.generatedAt;
      }
    });

    const requestRefresh = (since?: string) => {
      if (!vscodeApi.value) {
        return;
      }
      loading.value = true;
      errorMessage.value = null;
      vscodeApi.value.postMessage({
        command: 'refresh',
        since: since ?? snapshot.value?.metadata.generatedAt
      });
    };

    const changeParent = (parentId: string | null, titleHint?: string) => {
      if (!vscodeApi.value) {
        return;
      }
      loading.value = true;
      errorMessage.value = null;
      vscodeApi.value.postMessage({
        command: 'changeParent',
        parentId,
        titleHint
      });
    };

    const applySnapshot = (payload: GanttSnapshot | null, incomingContext?: GanttWebviewContext | null) => {
      loading.value = false;
      if (!payload) {
        return;
      }
      snapshot.value = payload;
      if (incomingContext) {
        context.value = incomingContext;
      }
    };

    const onChangeParent = (payload: { parentId: string | null; titleHint?: string }) => {
      changeParent(payload.parentId, payload.titleHint);
    };

    const handleMessage = (event: MessageEvent<IncomingMessage>) => {
      const message = event.data;
      if (!message || typeof message !== 'object') {
        return;
      }
      switch (message.command) {
        case 'snapshot':
          applySnapshot(message.snapshot ?? null, message.context ?? undefined);
          break;
        case 'error':
          loading.value = false;
          errorMessage.value = message.message ?? 'ガントデータの更新に失敗しました。';
          break;
      }
    };

    onMounted(() => {
      vscodeApi.value = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
      const initialPayload = (window as any).__GANTT_PAYLOAD__ as GanttWebviewPayload | undefined;
      if (initialPayload) {
        applySnapshot(initialPayload.snapshot, initialPayload.context);
      }
      window.addEventListener('message', handleMessage as any);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('message', handleMessage as any);
    });

    return {
      snapshot,
      context,
      headerTitle,
      formattedGeneratedAt,
      loading,
      errorMessage,
      requestRefresh,
      changeParent,
      onChangeParent
    };
  }
});
</script>

<style scoped>
#gantt-app {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
}

.gantt-app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.gantt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #444);
  background: var(--vscode-editorWidget-background, rgba(0, 0, 0, 0.1));
}

.gantt-header__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.gantt-header__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gantt-header__timestamp {
  font-size: 0.8rem;
  opacity: 0.8;
}

.gantt-header__actions {
  display: flex;
  gap: 8px;
}

.gantt-button {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.9rem;
}

.gantt-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.gantt-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.gantt-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  font-size: 0.95rem;
}
</style>
