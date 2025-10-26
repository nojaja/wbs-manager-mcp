<template>
  <div class="dependees-task-list">
    <div class="list-header">
      <h3>先行タスク (Prerequisites)</h3>
      <span class="count">{{ dependees.length }}</span>
    </div>

    <TaskList
      :tasks="dependees"
      :selectedTaskId="selectedTaskId"
      emptyMessage="先行タスクがありません"
      @select-task="selectTask"
    />
    
    <div class="list-header">
      <h3>後続タスク (Successors)</h3>
      <span class="count">{{ dependents.length }}</span>
    </div>
    <TaskList
      :tasks="dependents"
      :selectedTaskId="selectedTaskId"
      emptyMessage="後続タスクがありません"
      @select-task="selectTask"
    />
  </div>
</template>

<script>
import TaskList from './TaskList.vue';
export default {
  name: 'DependeesTaskList',
  components: { TaskList },
  props: {
    dependees: {
      type: Array,
      default: () => []
    },
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
.dependees-task-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--vscode-editor-background);
  border-right: 1px solid var(--vscode-panel-border);
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--vscode-sideBarSectionHeader-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  border-top: 1px solid var(--vscode-panel-border);
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
</style>
