<template>
  <div>
    <h2>Artifact Details</h2>
    <form @submit.prevent="onSave">
      <div class="form-group">
        <label for="title">Title *</label>
        <input id="title" v-model="form.title" required />
      </div>

      <div class="form-group">
        <label for="uri">URI</label>
        <input id="uri" v-model="form.uri" />
      </div>

      <div class="form-group">
        <label for="description">Description</label>
        <textarea id="description" v-model="form.description"></textarea>
      </div>

      <div class="form-group readonly">
        <label>Artifact ID</label>
        <input type="text" :value="payload.artifact.id" readonly />
      </div>

      <div class="form-group readonly">
        <label>Version</label>
        <input type="text" :value="payload.artifact.version" readonly />
      </div>

      <button type="submit">Save</button>
    </form>
  </div>
</template>

<script>
export default {
  name: 'ArtifactApp',
  data() {
    return {
      payload: { artifact: {} },
      form: {
        title: '',
        uri: '',
        description: ''
      }
    };
  },
  mounted() {
    if (window.__ARTIFACT_PAYLOAD__) {
      this.payload = window.__ARTIFACT_PAYLOAD__;
      const t = this.payload.artifact || {};
      this.form.title = t.title || '';
      this.form.uri = t.uri || '';
      this.form.description = t.description || '';
    }
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.onSave();
      }
    });
  },
  methods: {
    onSave() {
      const formData = {
        title: this.form.title,
        uri: this.form.uri,
        description: this.form.description
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
input, textarea { width: 100%; padding: 6px }
.readonly { opacity: 0.7 }
</style>
