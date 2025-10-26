<template>
  <div class="markdown-editable-field">
    <label v-if="label">{{ label }}</label>
    <div v-if="!editing" class="markdown-preview" @click="startEdit" tabindex="0" :title="hint">
      <div v-if="value && value.trim() !== ''" v-html="renderedMarkdown"></div>
      <div v-else class="placeholder">{{ placeholder }}</div>
    </div>
    <textarea
      v-else
      ref="textarea"
      :placeholder="placeholder"
      :rows="rows"
      v-model="editValue"
      @blur="finishEdit"
      @keydown.enter.exact="finishEdit"
      @keydown.esc="cancelEdit"
      @input="onInput"
    ></textarea>
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<script>
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt({
  breaks: true,
  html: false
});

export default {
  name: 'MarkdownEditableField',
  props: {
    modelValue: { type: String, default: '' },
    label: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    rows: { type: Number, default: 4 },
    hint: { type: String, default: '' }
  },
  emits: ['update:modelValue'],
  data() {
    return {
      editing: false,
      editValue: this.modelValue
    };
  },
  computed: {
    value() {
      return this.modelValue;
    },
    renderedMarkdown() {
      return md.render(this.value || '');
    }
  },
  watch: {
    modelValue(newVal) {
      if (!this.editing) this.editValue = newVal;
    }
  },
  methods: {
    startEdit() {
      this.editing = true;
      this.editValue = this.value;
      this.$nextTick(() => {
        if (this.$refs.textarea) this.$refs.textarea.focus();
      });
    },
    finishEdit() {
      this.editing = false;
      this.$emit('update:modelValue', this.editValue);
    },
    cancelEdit(e) {
      e.preventDefault();
      this.editing = false;
      this.editValue = this.value;
    },
    onInput() {
      this.$emit('update:modelValue', this.editValue);
    }
  }
};
</script>

<style scoped>
.markdown-editable-field {
  margin-bottom: 12px;
}
.markdown-editable-field label {
  display: block;
  margin-bottom: 4px;
  color: var(--vscode-foreground);
  font-size: 0.9em;
  font-weight: 500;
}
.markdown-preview {
  min-height: 60px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  padding: 6px 8px;
  cursor: pointer;
  white-space: pre-line;
}
.markdown-preview:focus {
  outline: 1px solid var(--vscode-focusBorder);
  border-color: var(--vscode-focusBorder);
}
.placeholder {
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}
textarea {
  width: 100%;
  padding: 6px 8px;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  font-family: var(--vscode-font-family);
  font-size: 0.9em;
  resize: vertical;
  min-height: 60px;
}
.hint {
  margin-top: 4px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.85em;
  font-style: italic;
}
</style>