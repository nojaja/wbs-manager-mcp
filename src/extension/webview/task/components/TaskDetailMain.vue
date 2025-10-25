<template>
  <div class="task-detail-main">
    <div class="panel-header">
      <h2>タスク詳細</h2>
      <button @click="onSave" class="btn-primary">
        保存 (Ctrl+S)
      </button>
    </div>

    <div class="panels-container">
      <TaskBasicInfoPanel 
        :task="task" 
        @update="onBasicInfoUpdate"
      />

      <DeliverablesPanel 
        :artifacts="artifacts"
        :suggestedArtifacts="suggestedArtifacts"
        @update="onDeliverablesUpdate"
      />

      <CompletionConditionsPanel 
        :completionConditions="completionConditions"
        @update="onConditionsUpdate"
      />
    </div>
  </div>
</template>

<script>
import TaskBasicInfoPanel from './TaskBasicInfoPanel.vue';
import DeliverablesPanel from './DeliverablesPanel.vue';
import CompletionConditionsPanel from './CompletionConditionsPanel.vue';

export default {
  name: 'TaskDetailMain',
  components: {
    TaskBasicInfoPanel,
    DeliverablesPanel,
    CompletionConditionsPanel
  },
  props: {
    task: {
      type: Object,
      default: () => ({})
    },
    artifacts: {
      type: Array,
      default: () => []
    },
    suggestedArtifacts: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      localTask: {},
      localDeliverables: [],
      localPrerequisites: [],
      localCompletionConditions: [],
      hasChanges: false
    };
  },
  computed: {
    completionConditions() {
      return this.task.completion_conditions || [];
    }
  },
  watch: {
    task: {
      immediate: true,
      deep: true,
      handler(newTask) {
        if (newTask) {
          this.localTask = { ...newTask };
          this.hasChanges = false;
        }
      }
    },
    artifacts: {
      immediate: true,
      deep: true,
      handler(newArtifacts) {
        // JSONオブジェクトのまま受け取る（フィルタリング不要）
        this.localDeliverables = Array.isArray(newArtifacts) ? newArtifacts : [];
        this.localPrerequisites = [];
      }
    }
  },
  mounted() {
    // Ctrl+S ショートカット
    document.addEventListener('keydown', this.handleKeyDown);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
  },
  methods: {
    /**
     * 基本情報更新
     */
    onBasicInfoUpdate(updates) {
      this.localTask = { ...this.localTask, ...updates };
      this.hasChanges = true;
    },

    /**
     * 成果物更新
     */
    onDeliverablesUpdate(deliverables) {
      this.localDeliverables = deliverables;
      this.hasChanges = true;
    },

    /**
     * 完了条件更新
     */
    onConditionsUpdate(conditions) {
      this.localCompletionConditions = conditions;
      this.hasChanges = true;
    },

    /**
     * 保存処理
     */
    onSave() {
      // TaskDetailPanel.tsのbuildUpdateObject()が期待する形式に合わせる
      // JSON.parse(JSON.stringify())でVueのリアクティブプロパティを除去
      const formData = JSON.parse(JSON.stringify({
        title: this.localTask.title,
        description: this.localTask.description,
        assignee: this.localTask.assignee,
        status: this.localTask.status,
        estimate: this.localTask.estimate,
        deliverables: this.localDeliverables,
        prerequisites: this.localPrerequisites,
        completionConditions: this.localCompletionConditions
      }));

      // 親コンポーネント（App.vue）に保存イベントを通知
      this.$emit('save', formData);
      this.hasChanges = false;
    },

    /**
     * キーボードショートカットハンドラ
     */
    handleKeyDown(event) {
      if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        this.onSave();
      }
    }
  }
};
</script>

<style scoped>
.task-detail-main {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}

.panel-header h2 {
  margin: 0;
  color: var(--vscode-foreground);
  font-size: 1.2em;
  font-weight: 600;
}

.btn-primary {
  padding: 6px 16px;
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background-color 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--vscode-button-hoverBackground);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.panels-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* スクロールバーのスタイル */
.panels-container::-webkit-scrollbar {
  width: 10px;
}

.panels-container::-webkit-scrollbar-track {
  background: var(--vscode-scrollbarSlider-background);
}

.panels-container::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-hoverBackground);
  border-radius: 5px;
}

.panels-container::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-activeBackground);
}
</style>
