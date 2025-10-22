<template>
  <div id="app" class="three-pane-layout">
    <!-- 左ペイン: 先行タスク一覧 -->
    <DependeesTaskList
      :dependees="dependees"
      :selectedTaskId="currentTask.id"
      @select-task="onSelectTask"
    />

    <!-- 中央ペイン: タスク詳細 -->
    <TaskDetailMain
      :task="currentTask"
      :artifacts="currentArtifacts"
      :suggestedArtifacts="suggestedArtifacts"
      @save="onSave"
    />

    <!-- 右ペイン: 後続タスク一覧 -->
    <DependentsTaskList
      :dependents="dependents"
      :selectedTaskId="currentTask.id"
      @select-task="onSelectTask"
    />
  </div>
</template>

<script>
import DependeesTaskList from './components/DependeesTaskList.vue';
import TaskDetailMain from './components/TaskDetailMain.vue';
import DependentsTaskList from './components/DependentsTaskList.vue';

export default {
  name: 'App',
  components: {
    DependeesTaskList,
    TaskDetailMain,
    DependentsTaskList
  },
  data() {
    return {
      // 現在表示中のタスク
      currentTask: {},
      // 現在のタスクに紐づくアーティファクト
      currentArtifacts: [],
      // 先行タスク一覧
      dependees: [],
      // 後続タスク一覧
      dependents: [],
      // 成果物追加用の候補（将来的にサーバーから取得）
      suggestedArtifacts: [],
      // VS Code API（一度だけ取得）
      vscode: null
    };
  },
  mounted() {
    // VS Code APIを一度だけ取得
    this.vscode = acquireVsCodeApi();

    // 初期データ取得
    if (window.__TASK_PAYLOAD__) {
      const payload = window.__TASK_PAYLOAD__;
      this.currentTask = payload.task || {};
      this.currentArtifacts = payload.artifacts || [];
      this.dependees = payload.dependees || [];
      this.dependents = payload.dependents || [];
      this.suggestedArtifacts = payload.suggestedArtifacts || [];
    }

    // VS Code拡張機能からのメッセージを受信
    window.addEventListener('message', this.onMessage);
  },
  beforeUnmount() {
    window.removeEventListener('message', this.onMessage);
  },
  methods: {
    /**
     * 拡張機能からのメッセージハンドラ
     */
    onMessage(event) {
      const message = event.data;
      switch (message.command) {
        case 'loadTask':
          // タスクデータの更新
          this.currentTask = message.task || {};
          this.currentArtifacts = message.artifacts || [];
          this.dependees = message.dependees || [];
          this.dependents = message.dependents || [];
          this.suggestedArtifacts = message.suggestedArtifacts || [];
          break;
      }
    },

    /**
     * タスク選択時の処理
     */
    onSelectTask(taskId) {
      // VS Code拡張機能に選択したタスクIDを通知
      this.vscode.postMessage({
        command: 'selectTask',
        taskId: taskId
      });
    },

    /**
     * 保存処理
     */
    onSave(formData) {
      // VS Code拡張機能に保存データを送信
      this.vscode.postMessage({
        command: 'save',
        data: formData
      });
    }
  }
};
</script>

<style scoped>
#app {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-family);
}

.three-pane-layout {
  display: flex;
  height: 100%;
  width: 100%;
}

.three-pane-layout > * {
  flex-shrink: 0;
}

/* 左ペイン: 先行タスク */
.three-pane-layout > *:nth-child(1) {
  width: 250px;
  min-width: 200px;
  max-width: 400px;
}

/* 中央ペイン: タスク詳細 */
.three-pane-layout > *:nth-child(2) {
  flex: 1;
  min-width: 400px;
}

/* 右ペイン: 後続タスク */
.three-pane-layout > *:nth-child(3) {
  width: 250px;
  min-width: 200px;
  max-width: 400px;
}
</style>
