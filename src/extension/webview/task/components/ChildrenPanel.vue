<template>
  <div class="children-panel">
    <ListEditor
      :title="'子タスク'"
      :titleLabel="'子タスク一覧'"
      :items="localItems"
      :placeholder="'task-id: タイトル'"
      @update="onUpdateItems"
    >
      <template #item="{ item, index }">
        <span class="task-title">{{ getLeftLabel(item) }}</span>
        <span class="task-meta">{{ getRightLabel(item) }}</span>
        <button class="remove" @click="removeItem(index)" title="削除">✕</button>
      </template>
    </ListEditor>

    <div class="actions" v-if="suggestedChildren && suggestedChildren.length">
      <button
        v-for="child in suggestedChildren"
        :key="child.id"
        @click="addChild(child)"
        class="btn-secondary"
      >
        追加: {{ child.title }}
      </button>
    </div>
  </div>
</template>

<script>
import ListEditor from './ListEditor.vue';

export default {
  name: 'ChildrenPanel',
  components: { ListEditor },
  props: {
    children: {
      type: Array,
      default: () => []
    },
    suggestedChildren: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      localItems: []
    };
  },
  watch: {
    children: {
      immediate: true,
      deep: true,
      handler(newChildren) {
        this.localItems = Array.isArray(newChildren) ? newChildren : [];
      }
    }
  },
  methods: {
    getLeftLabel(item) {
      return item?.title || '';
    },
    getRightLabel(item) {
      // show estimate and status
      const est = item?.estimate ? item.estimate : '';
      const st = item?.status ? item.status : '';
      return [est, st].filter(Boolean).join(' / ');
    },
    onUpdateItems(items) {
      this.$emit('update', items || []);
      this.localItems = items || [];
    },
    addChild(child) {
      const existingIds = this.localItems.map(i => i?.id).filter(Boolean);
      if (!existingIds.includes(child.id)) {
        this.localItems.push(child);
        this.onUpdateItems(this.localItems);
      }
    },
    removeItem(idx) {
      if (idx < 0 || idx >= this.localItems.length) return;
      this.localItems.splice(idx, 1);
      this.onUpdateItems(this.localItems);
    }
  }
};
</script>

<style scoped>
.children-panel { padding: 0; margin-bottom: 16px; }
.actions { margin-top: 12px; display:flex; gap:8px; }
.btn-secondary { padding:6px 12px; border-radius:4px; }
.condition-item { display:flex; align-items:center; gap:8px; padding:0 16px; height:48px; border-top:1px solid #E0E0E0 }
.task-title { flex: 1; font-weight:500 }
.task-meta { width: 200px; text-align:right }
</style>
