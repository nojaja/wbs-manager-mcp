<template>
  <div class="artifacts-panel">
    <ListEditor
      :title="'Artifact'"
      :titleLabel="'ソース / CRUD操作'"
      :items="localItems"
      :placeholder="'artifact-id: 名前'"
      @update="onUpdateItems"
    >
      <template #item="{ item, index }">
          <span class="file-name">{{ getLeftLabel(item) }}</span>
          <span class="task-name">{{ getRightLabel(item) }}</span>
          <button class="remove" @click="removeItem(index)" title="削除">✕</button>
      </template>
    </ListEditor>

    <div class="actions">
      <button
        v-for="artifact in suggestedArtifacts"
        :key="artifact.id"
        @click="addArtifact(artifact)"
        class="btn-secondary"
      >
        追加: {{ artifact.name }}
      </button>
    </div>
  </div>
</template>

<script>
import ListEditor from './ListEditor.vue';

export default {
  name: 'ArtifactsPanel',
  components: { ListEditor },
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
      localItems: []
    };
  },
  watch: {
    artifacts: {
      immediate: true,
      deep: true,
      handler(newArtifacts) {
        this.localItems = Array.isArray(newArtifacts) ? newArtifacts : [];
      }
    }
  },
  methods: {
    getLeftLabel(item) {
      return item?.artifact_title || '';
    },
    getRightLabel(item) {
      return item?.crud_operations || '';
    },
    onUpdateItems(items) {
      this.$emit('update', items || []);
      this.localItems = items || [];
    },
    addArtifact(artifact) {
      const existingIds = this.localItems.map(i => i?.artifact_id).filter(Boolean);
      if (!existingIds.includes(artifact.id)) {
        this.localItems.push(artifact);
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
.artifacts-panel { padding: 0; }
.actions { margin-top: 12px; display:flex; gap:8px; }
.btn-secondary { padding:6px 12px; border-radius:4px; }
.condition-item { display:flex; align-items:center; gap:8px; padding:0 16px; height:48px; border-top:1px solid #E0E0E0 }
.file-name { flex: 1; font-weight:500 }
.task-name { width: 200px; text-align:right }
</style>
