<template>
  <div class="dependents-task-list">
    <div class="list-header">
      <h3>後続タスク (Successors)</h3>
      <span class="count">{{ dependents.length }}</span>
    </div>

    <div class="task-list">
      <div 
        v-if="dependents.length === 0" 
        class="empty-message"
      >
        後続タスクがありません
      </div>

      <div
        v-for="task in dependents"
        :key="task.id"
        :class="['task-item', { selected: task.id === selectedTaskId }]"
        @click="selectTask(task.id)"
      >
        <div class="task-status" :data-status="task.status">
          <span class="status-indicator"></span>
        </div>
        <div class="task-info">
          <div class="task-title">{{ task.title }}</div>
          <div class="task-meta">
            <span class="task-id">{{ task.id }}</span>
            <span v-if="task.assignee" class="task-assignee">
              👤 {{ task.assignee }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DependentsTaskList',
  props: {
    dependents: {
      type: Array,
      default: () => []
    },
    selectedTaskId: {
      type: String,
      default: ''
    }
  },
  methods: {
    selectTask(taskId) {
      this.$emit('select-task', taskId);
    }
  }
};
</script>

<style scoped>
.dependents-task-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--vscode-sideBar-background);
  border-left: 1px solid var(--vscode-panel-border);
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--vscode-sideBarSectionHeader-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}

.list-header h3 {
  margin: 0;
  color: var(--vscode-sideBarTitle-foreground);
  font-size: 0.95em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.count {
  background-color: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.empty-message {
  padding: 24px 16px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-size: 0.9em;
  font-style: italic;
}

.task-item {
  display: flex;
  align-items: flex-start;
  padding: 10px 16px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}

.task-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.task-item.selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  border-left-color: var(--vscode-focusBorder);
}

.task-status {
  flex-shrink: 0;
  margin-right: 10px;
  margin-top: 2px;
}

.status-indicator {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--vscode-descriptionForeground);
}

[data-status="completed"] .status-indicator {
  background-color: #4caf50;
}

[data-status="in-progress"] .status-indicator {
  background-color: #2196f3;
}

[data-status="blocked"] .status-indicator {
  background-color: #f44336;
}

[data-status="pending"] .status-indicator {
  background-color: #ff9800;
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-title {
  color: var(--vscode-foreground);
  font-size: 0.9em;
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8em;
  color: var(--vscode-descriptionForeground);
}

.task-id {
  font-family: var(--vscode-editor-font-family);
}

.task-assignee {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* スクロールバーのスタイル */
.task-list::-webkit-scrollbar {
  width: 8px;
}

.task-list::-webkit-scrollbar-track {
  background: var(--vscode-scrollbarSlider-background);
}

.task-list::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-hoverBackground);
  border-radius: 4px;
}

.task-list::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-activeBackground);
}
</style>
