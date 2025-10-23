<template>
  <div class="list-editor">
    <div class="panel-header">
      <h3>{{ title }}</h3>
      <div class="actions">
        <button class="icon-btn" @click="onShowAdd" title="追加">
          <slot name="add-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
          </slot>
        </button>
        <span class="count" v-if="computedItems.length > 0">{{ computedItems.length }}</span>
      </div>
    </div>

    <div class="form-group">
      <label v-if="showLabel">{{ titleLabel }}</label>
      <div class="conditions-list">
        <!-- List header slot: parent can provide a header; fallback none (keeps compact layout) -->
        <slot name="list-header"></slot>

        <div class="condition-item" v-for="(c, idx) in computedItems" :key="idx">
          <!-- item slot: scoped with item and index; fallback preserves existing rendering -->
          <slot name="item" :item="c" :index="idx">
            <span class="logo" aria-hidden="true"></span>
            <span class="desc">{{ getDescription(c) }}</span>
            <button class="remove" @click="removeItem(idx)" title="削除">✕</button>
          </slot>
        </div>

        <!-- add-row slot: parent can provide a custom add row; fallback to ConditionAddRow -->
        <slot name="add-row" :show="showAddInput" :focusAdd="onShowAdd" :onAdd="addItemFromChild">
          <ConditionAddRow
            v-if="showAddInput"
            ref="addRow"
            :placeholder="placeholder"
            :autofocus="true"
            @add="addItemFromChild"
          />
        </slot>
      </div>
    </div>
  </div>
</template>

<script>
import ConditionAddRow from './ConditionAddRow.vue';

export default {
  name: 'ListEditor',
  components: { ConditionAddRow },
  props: {
    title: { type: String, default: 'List' },
    titleLabel: { type: String, default: '編集' },
    showLabel: { type: Boolean, default: true },
    items: { type: Array, default: () => [] },
    placeholder: { type: String, default: '項目を入力してください' }
  },
  data() {
    return {
      internalItems: Array.isArray(this.items) ? this.items.map(i => i) : [],
      showAddInput: false
    };
  },
  computed: {
    computedItems() {
      return this.internalItems;
    }
  },
  watch: {
    items: {
      immediate: true,
      deep: true,
      handler(v) {
        this.internalItems = Array.isArray(v) ? v.map(i => i) : [];
      }
    }
  },
  methods: {
    getDescription(i) {
      if (!i) return '';
      if (typeof i === 'string') return i;
      return i.description || i.name || JSON.stringify(i);
    },
    onShowAdd() {
      this.showAddInput = true;
      this.$nextTick(() => {
        const child = this.$refs.addRow;
        if (child && child.$refs && child.$refs.addInput) child.$refs.addInput.focus();
      });
    },
    addItemFromChild(text) {
      const t = (text || '').trim();
      if (!t) return;
      this.internalItems.push({ description: t });
      this.showAddInput = false;
      this.emitItems();
    },
    removeItem(idx) {
      if (idx < 0 || idx >= this.internalItems.length) return;
      this.internalItems.splice(idx, 1);
      this.emitItems();
    },
    emitItems() {
      this.$emit('update', this.internalItems.slice());
    }
  }
};
</script>

<style scoped>
.list-editor {
  padding: 16px;
  background-color: #FFFFFF;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
}
.panel-header { display:flex; align-items:center; justify-content:space-between; }
.panel-header h3 { margin:0; font-size:16px; font-weight:600 }
.conditions-list { display:flex; flex-direction:column; gap:8px; }
.condition-item { display:flex; align-items:center; gap:12px; padding:0 16px; height:40px; border-top:1px solid #E0E0E0 }
.condition-item .logo { width:24px; height:24px; background:#D9D9D9; border-radius:50% }
.condition-item .desc { flex:1 }
.condition-item .remove { background:transparent; border:none; cursor:pointer }
</style>
