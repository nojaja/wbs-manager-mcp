<template>
  <ListEditor
    :title="'完了条件'"
    :titleLabel="'完了条件の編集'"
    :items="completionConditions"
    :placeholder="'完了条件を入力してください'"
    @update="onUpdateItems"
  >
    <!-- default item slot uses ListEditor default rendering -->
  </ListEditor>
</template>

<script>
import ListEditor from './ListEditor.vue';

export default {
  name: 'CompletionConditionsPanel',
  components: { ListEditor },
  props: {
    completionConditions: {
      type: Array,
      default: () => []
    }
  },
  methods: {
    onUpdateItems(items) {
      // pass through to parent (preserve original 'update' behavior)
      this.$emit('update', items);
    }
  }
};
</script>

<style scoped>
/* visual styling is handled by ListEditor */
</style>
