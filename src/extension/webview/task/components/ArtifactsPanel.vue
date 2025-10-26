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
      <template #add-row="{ show, focusAdd, onAdd }">
        <ArtifactsAddRow
          v-if="show"
          ref="addRow"
          :placeholder="'artifact-id: 名前'"
          :autofocus="true"
          :options="crudOptions"
          @add="addFromRow"
        />
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
import ArtifactsAddRow from './ArtifactsAddRow.vue';

export default {
  name: 'ArtifactsPanel',
  components: { ListEditor, ArtifactsAddRow },
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
  computed: {
    crudOptions() {
      // 固定: C, U, R, D
      return ['C', 'U', 'R', 'D'];
    }
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
    addFromRow(text) {
      // text expected in form 'artifact-id: 名前' (based on placeholder)
      const raw = (text || '').trim();
      if (!raw) return;
      let artifact_id = '';
      let artifact_title = raw;
      const idx = raw.indexOf(':');
      if (idx !== -1) {
        artifact_id = raw.slice(0, idx).trim();
        artifact_title = raw.slice(idx + 1).trim();
      }
      // obtain selected crud from the add-row component (if available)
      const addRow = this.$refs.addRow;
      let crud = '';
      if (addRow) {
        // ref may be component instance
        crud = addRow.currentValue || addRow.selectedValue || '';
      }
      const item = {
        artifact_id: artifact_id || artifact_title,
        artifact_title: artifact_title,
        crud_operations: crud
      };
      this.localItems.push(item);
      this.onUpdateItems(this.localItems);
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
.artifacts-panel { padding: 0; margin-bottom: 16px; }
.actions { margin-top: 12px; display:flex; gap:8px; }
.btn-secondary { padding:6px 12px; border-radius:4px; }
.condition-item { display:flex; align-items:center; gap:8px; padding:0 16px; height:48px; border-top:1px solid #E0E0E0 }
.condition-item .remove { background:transparent; color: var(--vscode-icon-foreground);border:none; cursor:pointer }
.file-name { flex: 1; font-weight:500 }
.task-name { width: 200px; text-align:right }
</style>
