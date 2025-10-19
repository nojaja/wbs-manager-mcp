<template>
  <div>
    <h2>Task Details</h2>
    <form @submit.prevent="onSave" id="taskForm">
      <div class="form-group">
        <label for="title">Title *</label>
        <input id="title" v-model="form.title" required />
      </div>

      <div class="form-group">
        <label for="description">Description</label>
        <textarea id="description" v-model="form.description"></textarea>
      </div>

      <div class="form-group">
        <label for="assignee">Assignee</label>
        <input id="assignee" v-model="form.assignee" />
      </div>

      <div class="form-group">
        <label for="status">Status</label>
        <select id="status" v-model="form.status">
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      <div class="form-group">
        <label for="estimate">Estimate</label>
        <input id="estimate" v-model="form.estimate" placeholder="e.g., 3d, 5h" />
      </div>

      <div class="form-group">
        <label for="deliverables">成果物 (artifactId[:CRUD])</label>
        <textarea id="deliverables" v-model="rawDeliverables" placeholder="artifact-id:CUD"></textarea>
        <p class="hint">CRUDは任意です（例: spec-doc:UD）。省略すると参照のみの扱いになります。</p>
        <div style="margin-top:6px; display:flex; gap:6px;">
          <input list="artifactList" v-model="deliverableSuggest" placeholder="suggest artifact by title or id" style="flex:1" />
          <button type="button" @click="addDeliverable">Add</button>
        </div>
        <ul class="artifact-list">
          <li v-if="deliverablesSummary.length === 0">成果物はまだ登録されていません。</li>
          <li v-for="(l, idx) in deliverablesSummary" :key="idx">{{ l }}</li>
        </ul>
      </div>

      <div class="form-group">
        <label for="prerequisites">前提条件 (artifactId[:CRUD])</label>
        <textarea id="prerequisites" v-model="rawPrerequisites" placeholder="artifact-id"></textarea>
        <p class="hint">このタスクの実行前に必要な成果物を1行ずつ列挙してください。</p>
        <div style="margin-top:6px; display:flex; gap:6px;">
          <input list="artifactList" v-model="prereqSuggest" placeholder="suggest artifact by title or id" style="flex:1" />
          <button type="button" @click="addPrerequisite">Add</button>
        </div>
        <ul class="artifact-list">
          <li v-if="prerequisitesSummary.length === 0">前提条件はまだ登録されていません。</li>
          <li v-for="(l, idx) in prerequisitesSummary" :key="idx">{{ l }}</li>
        </ul>
      </div>

      <div class="form-group">
        <label for="completionConditions">完了条件 (1行につき1条件)</label>
        <textarea id="completionConditions" v-model="rawCompletionConditions" placeholder="例: 仕様書のレビュー承認"></textarea>
        <p class="hint">完了条件は記入順に評価されます。</p>
      </div>

      <div class="form-group readonly">
        <label>Task ID</label>
        <input type="text" :value="payload.task.id" readonly />
      </div>

      <div class="form-group readonly">
        <label>Version</label>
        <input type="text" :value="payload.task.version" readonly />
      </div>

      <button type="submit">Save</button>
      <datalist id="artifactList">
        <option v-for="(a, idx) in payload.artifacts" :key="idx" :value="a.title">{{ a.id }}</option>
      </datalist>
    </form>
  </div>
</template>

<script>
export default {
  name: 'TaskApp',
  data() {
    return {
      payload: { task: {}, artifacts: [] },
      form: {
        title: '',
        description: '',
        assignee: '',
        status: 'pending',
        estimate: ''
      },
      rawDeliverables: '',
      rawPrerequisites: '',
      rawCompletionConditions: '',
      deliverableSuggest: '',
      prereqSuggest: ''
    };
  },
  computed: {
    deliverablesSummary() {
      return this.summarizeArtifactAssignments(this.parseArtifactText(this.rawDeliverables));
    },
    prerequisitesSummary() {
      return this.summarizeArtifactAssignments(this.parseArtifactText(this.rawPrerequisites));
    }
  },
  mounted() {
    if (window.__TASK_PAYLOAD__) {
      this.payload = window.__TASK_PAYLOAD__;
      const task = this.payload.task || {};
      this.form.title = task.title || '';
      this.form.description = task.description || '';
      this.form.assignee = task.assignee || '';
      this.form.status = task.status || 'pending';
      this.form.estimate = task.estimate || '';
      // initialize raw textareas
      this.rawDeliverables = this.formatArtifactAssignments(task.deliverables);
      this.rawPrerequisites = this.formatArtifactAssignments(task.prerequisites);
      this.rawCompletionConditions = this.formatCompletionConditions(task.completionConditions);
    }

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.onSave();
      }
    });
  },
  methods: {
    // parsing helpers
    parseArtifactText(value) {
      return value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const parts = line.split(':');
          const artifactTitleOrId = (parts.shift() || '').trim();
          const crud = parts.join(':').trim();
          const artifact = this.payload.artifacts.find(a => a.title === artifactTitleOrId) || null;
          const artifactId = artifact ? artifact.id : artifactTitleOrId;
          return {
            artifactId,
            crudOperations: crud.length > 0 ? crud : undefined
          };
        })
        .filter(entry => entry.artifactId && entry.artifactId.length > 0);
    },
    parseConditionsText(value) {
      return value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => ({ description: line }));
    },
    formatArtifactAssignments(assignments) {
      if (!Array.isArray(assignments) || assignments.length === 0) return '';
      return assignments
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(a => {
          const title = (a.artifact && a.artifact.title) || a.artifact_id || (a.artifact && a.artifact.id) || '';
          const crud = a.crudOperations ? `:${a.crudOperations}` : '';
          return `${title}${crud}`;
        })
        .join('\n');
    },
    summarizeArtifactAssignments(assignments) {
      if (!Array.isArray(assignments) || assignments.length === 0) return [];
      return assignments
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(a => {
          const id = a.artifactId || a.artifact_id || (a.artifact && a.artifact.id) || '';
          const crud = a.crudOperations ? ` | CRUD: ${a.crudOperations}` : '';
          const art = this.payload.artifacts.find(x => x.id === id) || {};
          const title = art.title ? ` | ${art.title}` : '';
          const uri = art.uri ? ` | ${art.uri}` : '';
          return `${id}${crud}${title}${uri}`.trim();
        });
    },
    formatCompletionConditions(conditions) {
      if (!Array.isArray(conditions) || conditions.length === 0) return '';
      return conditions
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(c => c.description || '')
        .filter(d => d.length > 0)
        .join('\n');
    },
    addDeliverable() {
      const val = (this.deliverableSuggest || '').trim();
      if (!val) return;
      this.rawDeliverables = (this.rawDeliverables ? this.rawDeliverables + '\n' : '') + val;
      this.deliverableSuggest = '';
    },
    addPrerequisite() {
      const val = (this.prereqSuggest || '').trim();
      if (!val) return;
      this.rawPrerequisites = (this.rawPrerequisites ? this.rawPrerequisites + '\n' : '') + val;
      this.prereqSuggest = '';
    },
    onSave() {
      const deliverables = this.parseArtifactText(this.rawDeliverables);
      const prerequisites = this.parseArtifactText(this.rawPrerequisites);
      const completionConditions = this.parseConditionsText(this.rawCompletionConditions);

      const formData = {
        title: this.form.title,
        description: this.form.description,
        assignee: this.form.assignee,
        status: this.form.status,
        estimate: this.form.estimate,
        deliverables,
        prerequisites,
        completionConditions
      };
      if (window.acquireVsCodeApi) {
        const vscode = acquireVsCodeApi();
        vscode.postMessage({ command: 'save', data: formData });
      }
    }
  }
};
</script>

<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px }
.form-group { margin-bottom: 12px }
input, textarea, select { width: 100%; padding: 6px }
.readonly { opacity: 0.7 }
.hint { margin-top: 4px; color: var(--vscode-descriptionForeground); font-size: 0.85em }
.artifact-list { margin: 8px 0 0; padding-left: 18px; color: var(--vscode-descriptionForeground); font-size: 0.85em }
</style>
