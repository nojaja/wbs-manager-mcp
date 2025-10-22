<template>
  <div class="completion-conditions-panel">
    <h3>完了条件 (Completion Conditions)</h3>
    
    <div class="form-group">
      <label for="completionConditions">完了条件の編集</label>
      <textarea 
        id="completionConditions" 
        v-model="rawConditionsText" 
        @input="onUpdate"
        placeholder="完了条件を1行に1つずつ入力&#10;例:&#10;- すべての単体テストが通過&#10;- コードレビューが承認済み&#10;- ドキュメントが更新済み"
        rows="8"
      ></textarea>
      <p class="hint">各条件を1行に1つずつ記述してください</p>
    </div>

    <div class="preview" v-if="previewConditions.length > 0">
      <h4>プレビュー:</h4>
      <ul>
        <li v-for="(condition, index) in previewConditions" :key="index">
          {{ condition }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CompletionConditionsPanel',
  props: {
    completionConditions: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      rawConditionsText: ''
    };
  },
  computed: {
    previewConditions() {
      return this.rawConditionsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    }
  },
  watch: {
    completionConditions: {
      immediate: true,
      deep: true,
      handler(newConditions) {
        if (newConditions) {
          this.rawConditionsText = this.formatCompletionConditions(newConditions);
        }
      }
    }
  },
  methods: {
    /**
     * 完了条件配列をテキスト形式にフォーマット
     */
    formatCompletionConditions(conditions) {
      if (!Array.isArray(conditions)) {
        return '';
      }
      return conditions
        .map(c => {
          if (typeof c === 'string') {
            return c;
          }
          // オブジェクト形式の場合（将来の拡張用）
          return c.description || c.condition || JSON.stringify(c);
        })
        .join('\n');
    },

    /**
     * テキストをパースして配列に変換
     * TaskDetailPanel.tsが期待する形式: { description: string }
     */
    parseConditionsText(text) {
      return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => ({ description: line }));
    },

    /**
     * 変更を親に通知
     */
    onUpdate() {
      const conditions = this.parseConditionsText(this.rawConditionsText);
      this.$emit('update', conditions);
    }
  }
};
</script>

<style scoped>
.completion-conditions-panel {
  padding: 16px;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  margin-bottom: 16px;
}

.completion-conditions-panel h3 {
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

.form-group textarea {
  width: 100%;
  padding: 6px 8px;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  resize: vertical;
  min-height: 120px;
}

.form-group textarea:focus {
  outline: 1px solid var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
}

.hint {
  margin-top: 4px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.85em;
  font-style: italic;
}

.preview {
  margin-top: 16px;
  padding: 12px;
  background-color: var(--vscode-textBlockQuote-background);
  border-left: 3px solid var(--vscode-textLink-foreground);
  border-radius: 2px;
}

.preview h4 {
  margin: 0 0 8px 0;
  color: var(--vscode-foreground);
  font-size: 0.95em;
  font-weight: 500;
}

.preview ul {
  margin: 0;
  padding-left: 20px;
}

.preview li {
  color: var(--vscode-foreground);
  font-size: 0.9em;
  margin-bottom: 4px;
}
</style>
