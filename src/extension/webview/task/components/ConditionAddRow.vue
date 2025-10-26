<template>
  <div class="add-row">
    <input
      ref="addInput"
      class="add-input"
      type="text"
      :placeholder="placeholder"
      v-model="text"
      @keyup.enter="onAdd"
    />
    <button class="regist-btn" @click="onAdd" title="登録">
      <slot name="icon">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M3.33 3.33L13.33 8L3.33 12.67V3.33Z" stroke="currentColor" stroke-width="1.6"/>
        </svg>
      </slot>
    </button>
  </div>
</template>

<script>
export default {
  name: 'ConditionAddRow',
  props: {
    placeholder: {
      type: String,
      default: '完了条件を入力してください'
    },
    autofocus: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      text: ''
    };
  },
  mounted() {
    if (this.autofocus) {
      this.$nextTick(() => {
        const input = this.$refs.addInput;
        if (input) input.focus();
      });
    }
  },
  methods: {
    onAdd() {
      const t = (this.text || '').trim();
      if (!t) return;
      this.$emit('add', t);
      this.text = '';
    }
  }
};
</script>

<style scoped>
.add-row {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 0 16px;
  height: 40px;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  
}

.add-input {
  flex: 1 1 auto;
  padding: 0;
  background: transparent;
  color: var(--vscode-input-foreground);
  border: none;
  outline: none;
  font-size: 0.9em;
  font-weight: 500;
  line-height: 1.5em;
}

.add-input::placeholder {
  color: #E0E0E0;
}

.regist-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: transparent;
  color: var(--vscode-icon-foreground);
  border: none;
  cursor: pointer;
  opacity: 0.9;
}
</style>
