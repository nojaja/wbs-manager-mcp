<template>
  <div class="deliverables-panel">
    <ListEditor
      :title="'前提Artifact'"
      :titleLabel="'ソース / 先行タスク'"
      :items="localItems"
      :placeholder="'artifact-id: 名前'"
      @update="onUpdateItems"
    >
      <!-- Customize item rendering to show left/right labels as in Figma -->
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
        @click="addDeliverable(artifact)"
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
  name: 'DeliverablesPanel',
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
        const deliverables = Array.isArray(newArtifacts)
          ? newArtifacts.filter(a => a.artifact_type === 'deliverable')
          : [];
        this.localItems = deliverables.map(a => ({ description: `${a.artifact_id}: ${a.artifact_name || ''}` }));
      }
    }
  },
  methods: {
    getLeftLabel(item) {
      const text = typeof item === 'string' ? item : item.description || '';
      const parts = text.split(':');
      return parts[0] ? parts[0].trim() : '';
    },
    getRightLabel(item) {
      const text = typeof item === 'string' ? item : item.description || '';
      const parts = text.split(':');
      return parts.slice(1).join(':').trim();
    },
    onUpdateItems(items) {
      // parse items to artifact objects like previous implementation
      const parsed = (items || []).map(i => {
        const text = typeof i === 'string' ? i : i.description || '';
        const parts = text.split(':');
        const artifactId = parts[0] ? parts[0].trim() : '';
        const rest = parts.slice(1).join(':').trim();
        // detect CRUD tail
        const lastPart = rest.split(/\s+/).pop();
        const crudPattern = /^[CRUD]+$/i;
        if (lastPart && crudPattern.test(lastPart)) {
          return { artifactId, crudOperations: lastPart.toUpperCase() };
        }
        return { artifactId };
      });
      // emit to parent
      this.$emit('update', parsed);
      // sync localItems in case parent doesn't update artifacts prop immediately
      this.localItems = (items || []).map(i => (typeof i === 'string' ? { description: i } : i));
    },
    addDeliverable(artifact) {
      const existingIds = this.localItems
        .map(i => {
          const text = i.description || '';
          return text.split(':')[0].trim();
        })
        .filter(Boolean);
      if (!existingIds.includes(artifact.id)) {
        this.localItems.push({ description: `${artifact.id}: ${artifact.name}` });
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
.deliverables-panel { padding: 0; }
.actions { margin-top: 12px; display:flex; gap:8px; }
.btn-secondary { padding:6px 12px; border-radius:4px; }
.condition-item { display:flex; align-items:center; gap:8px; padding:0 16px; height:48px; border-top:1px solid #E0E0E0 }
.file-name { flex: 1; font-weight:500 }
.task-name { width: 200px; text-align:right }
</style>
