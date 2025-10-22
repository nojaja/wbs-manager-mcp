<template>
  <div class="deliverables-panel">
    <h3>成果物 (Deliverables)</h3>
    
    <div class="summary" v-if="deliverablesSummary.length > 0">
      <h4>現在の成果物:</h4>
      <ul>
        <li v-for="(item, index) in deliverablesSummary" :key="index">
          {{ item }}
        </li>
      </ul>
    </div>

    <div class="form-group">
      <label for="deliverables">成果物の編集</label>
      <textarea 
        id="deliverables" 
        v-model="rawDeliverablesText" 
        @input="onUpdate"
        placeholder="成果物をID:名前の形式で1行に1つずつ入力&#10;例: artifact-001: 設計書"
        rows="6"
      ></textarea>
      <p class="hint">フォーマット: [アーティファクトID]: [名前]</p>
    </div>

    <div class="actions">
      <button 
        v-for="artifact in suggestedArtifacts" 
        :key="artifact.id"
        @click="addDeliverable(artifact)"
        class="btn-secondary"
      >
        追加: {{ artifact.name }}
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DeliverablesPanel',
  props: {
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
      rawDeliverablesText: ''
    };
  },
  computed: {
    deliverablesSummary() {
      return this.summarizeArtifactAssignments(
        this.artifacts.filter(a => a.artifact_type === 'deliverable')
      );
    }
  },
  watch: {
    artifacts: {
      immediate: true,
      deep: true,
      handler(newArtifacts) {
        if (newArtifacts) {
          const deliverables = newArtifacts.filter(a => a.artifact_type === 'deliverable');
          this.rawDeliverablesText = this.formatArtifactAssignments(deliverables);
        }
      }
    }
  },
  methods: {
    /**
     * アーティファクト割り当てをテキスト形式にフォーマット
     */
    formatArtifactAssignments(assignments) {
      return assignments
        .map(a => `${a.artifact_id}: ${a.artifact_name || ''}`)
        .join('\n');
    },

    /**
     * アーティファクト割り当てをサマリー表示用に整形
     */
    summarizeArtifactAssignments(assignments) {
      return assignments.map(a => {
        const name = a.artifact_name || a.artifact_id;
        return `${a.artifact_id}: ${name}`;
      });
    },

    /**
     * テキストエリアの内容をパースしてアーティファクト配列に変換
     * TaskDetailPanel.tsが期待する形式: { artifactId: string, crudOperations?: string }
     */
    parseArtifactText(text, artifactType) {
      return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.includes(':'))
        .map(line => {
          const parts = line.split(':');
          const artifactId = parts[0].trim();
          const rest = parts.slice(1).join(':').trim();
          
          // CRUD操作が指定されているか確認（最後の部分が大文字のCRUD文字のみの場合）
          const lastPart = rest.split(/\s+/).pop();
          const crudPattern = /^[CRUD]+$/i;
          
          if (lastPart && crudPattern.test(lastPart)) {
            return {
              artifactId,
              crudOperations: lastPart.toUpperCase()
            };
          }
          
          return { artifactId };
        });
    },

    /**
     * 変更を親に通知
     */
    onUpdate() {
      const deliverables = this.parseArtifactText(this.rawDeliverablesText, 'deliverable');
      this.$emit('update', deliverables);
    },

    /**
     * 成果物を追加
     */
    addDeliverable(artifact) {
      const existingIds = this.rawDeliverablesText
        .split('\n')
        .map(line => line.split(':')[0].trim())
        .filter(Boolean);

      if (!existingIds.includes(artifact.id)) {
        const newLine = `${artifact.id}: ${artifact.name}`;
        this.rawDeliverablesText += (this.rawDeliverablesText ? '\n' : '') + newLine;
        this.onUpdate();
      }
    }
  }
};
</script>

<style scoped>
.deliverables-panel {
  padding: 16px;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  margin-bottom: 16px;
}

.deliverables-panel h3 {
  margin: 0 0 16px 0;
  color: var(--vscode-foreground);
  font-size: 1.1em;
  font-weight: 600;
  border-bottom: 1px solid var(--vscode-panel-border);
  padding-bottom: 8px;
}

.summary {
  margin-bottom: 16px;
  padding: 12px;
  background-color: var(--vscode-textBlockQuote-background);
  border-left: 3px solid var(--vscode-textLink-foreground);
  border-radius: 2px;
}

.summary h4 {
  margin: 0 0 8px 0;
  color: var(--vscode-foreground);
  font-size: 0.95em;
  font-weight: 500;
}

.summary ul {
  margin: 0;
  padding-left: 20px;
}

.summary li {
  color: var(--vscode-foreground);
  font-size: 0.9em;
  margin-bottom: 4px;
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
  min-height: 80px;
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

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.btn-secondary {
  padding: 6px 12px;
  background-color: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border);
  border-radius: 2px;
  cursor: pointer;
  font-size: 0.85em;
  transition: background-color 0.2s;
}

.btn-secondary:hover {
  background-color: var(--vscode-button-secondaryHoverBackground);
}

.btn-secondary:active {
  background-color: var(--vscode-button-secondaryBackground);
  opacity: 0.8;
}
</style>
