<template>
  <div class="task-basic-info-panel">
    <h3>基本情報</h3>
    
    <div class="form-group">
      <label for="title">タイトル *</label>
      <input 
        id="title" 
        v-model="localTask.title" 
        @input="onUpdate"
        required 
        placeholder="タスクのタイトルを入力..."
      />
    </div>

    <div class="form-group">
      <label for="description">説明</label>
      <textarea 
        id="description" 
        v-model="localTask.description" 
        @input="onUpdate"
        placeholder="タスクの詳細説明を入力..."
        rows="4"
      ></textarea>
    </div>

    <div class="form-group">
      <label for="assignee">担当者</label>
      <input 
        id="assignee" 
        v-model="localTask.assignee" 
        @input="onUpdate"
        placeholder="担当者名を入力..."
      />
    </div>

    <div class="form-group">
      <label for="status">ステータス</label>
      <select 
        id="status" 
        v-model="localTask.status" 
        @change="onUpdate"
      >
        <option value="pending">Pending</option>
        <option value="in-progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="blocked">Blocked</option>
      </select>
    </div>

    <div class="form-group">
      <label for="estimate">見積もり</label>
      <input 
        id="estimate" 
        v-model="localTask.estimate" 
        @input="onUpdate"
        placeholder="例: 3d, 5h, 2w"
      />
      <p class="hint">期間の単位: d (日), h (時間), w (週)</p>
    </div>

    <div class="form-group readonly">
      <label>Task ID</label>
      <input type="text" :value="localTask.id" readonly />
    </div>

    <div class="form-group readonly">
      <label>Version</label>
      <input type="text" :value="localTask.version" readonly />
    </div>
  </div>
</template>

<script>
export default {
  name: 'TaskBasicInfoPanel',
  props: {
    task: {
      type: Object,
      default: () => ({
        id: '',
        title: '',
        description: '',
        assignee: '',
        status: 'pending',
        estimate: '',
        version: 0
      })
    }
  },
  data() {
    return {
      localTask: {
        id: '',
        title: '',
        description: '',
        assignee: '',
        status: 'pending',
        estimate: '',
        version: 0
      }
    };
  },
  watch: {
    task: {
      immediate: true,
      deep: true,
      handler(newTask) {
        if (newTask) {
          this.localTask = {
            id: newTask.id || '',
            title: newTask.title || '',
            description: newTask.description || '',
            assignee: newTask.assignee || '',
            status: newTask.status || 'pending',
            estimate: newTask.estimate || '',
            version: newTask.version || 0
          };
        }
      }
    }
  },
  methods: {
    onUpdate() {
      // 親コンポーネントに変更を通知
      this.$emit('update', {
        title: this.localTask.title,
        description: this.localTask.description,
        assignee: this.localTask.assignee,
        status: this.localTask.status,
        estimate: this.localTask.estimate
      });
    }
  }
};
</script>

<style scoped>
.task-basic-info-panel {
  padding: 16px;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  margin-bottom: 16px;
}

.task-basic-info-panel h3 {
  margin: 0 0 16px 0;
  color: var(--vscode-foreground);
  font-size: 1.1em;
  font-weight: 600;
  border-bottom: 1px solid var(--vscode-panel-border);
  padding-bottom: 8px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  color: var(--vscode-foreground);
  font-size: 0.9em;
  font-weight: 500;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 6px 8px;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  font-family: var(--vscode-font-family);
  font-size: 0.9em;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: 1px solid var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.form-group.readonly {
  opacity: 0.7;
}

.form-group.readonly input {
  cursor: not-allowed;
}

.hint {
  margin-top: 4px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.85em;
  font-style: italic;
}
</style>
