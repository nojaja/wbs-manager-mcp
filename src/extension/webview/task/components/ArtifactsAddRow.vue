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

    <!-- Select-like field inspired by Figma design -->
    <div class="select-field" role="button" tabindex="0">
      <div class="select-value" @click.stop="onOpenSelect">{{ currentValue }}</div>
      <svg class="chevron" @click.stop="onOpenSelect" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div v-if="openSelect" class="dropdown">
        <button v-for="(o, idx) in optionsList" :key="idx" @click.prevent="selectOption(o)">{{ o }}</button>
      </div>
    </div>

    <button class="regist-btn" @click="onAdd" title="登録">
      <slot name="icon">
        <!-- small subtle rounded icon (play/arrow) like in Figma -->
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M3.33 3.33L13.33 8L3.33 12.67V3.33Z"/>
        </svg>
      </slot>
    </button>
  </div>
</template>

<script>
export default {
  name: 'ArtifactsAddRow',
  props: {
    placeholder: {
      type: String,
      default: '成果物を入力してください'
    },
    autofocus: {
      type: Boolean,
      default: false
    },
    selectedValue: {
      type: String,
      default: 'C'
    },
    /** options can be an array of strings or a single comma-separated string */
    options: {
      type: [Array, String],
      default: () => []
    }
  },
  data() {
    return {
      text: '',
      openSelect: false,
      currentValue: this.selectedValue
    };
  },
  computed: {
    optionsList() {
      if (Array.isArray(this.options)) return this.options;
      if (typeof this.options === 'string') return this.options.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    }
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
    },
    onOpenSelect() {
      this.openSelect = !this.openSelect;
      this.$emit('open-select');
    }
    ,
    selectOption(v) {
      this.currentValue = v;
      this.openSelect = false;
      this.$emit('select', v);
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
  background: #FFFFFF; /* fill_A3IDXO */
  border: 1px solid #E0E0E0; /* stroke_XB3YRY */
}

.add-input {
  flex: 1 1 auto;
  padding: 0;
  background: transparent;
  color: #000000;
  border: none;
  outline: none;
  font-size: 0.9em;
  font-weight: 500;
  line-height: 1.5em;
}

.add-input::placeholder {
  color: #E0E0E0; /* fill_GXNGN1 */
}

.select-field {
  display: inline-flex;
  align-items: center;
  width: 40px; /* as in Figma layout_VAHLYV */
  background: #FFFFFF;
  border: 1px solid #D9D9D9; /* stroke_H70TWY */
  cursor: pointer;
  box-sizing: border-box;
  position: relative;
}

.select-value {
  flex: 1 1 auto;
  font-size: 16px; /* Single Line/Body Base */
  color: #1E1E1E; /* fill_9EBSWO */
}

.chevron {
  width: 16px;
  height: 16px;
  color: #000000;
}

.regist-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: transparent; /* Subtle */
  color: #000000;
  border: none;
  cursor: pointer;
  opacity: 0.9; /* matches Figma opacity */
  border-radius: 32px; /* rounded small button */
}

/* simple dropdown */
.select-field .dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 160px;
  background: #fff;
  border: 1px solid #D9D9D9;
  box-shadow: 0 6px 12px rgba(0,0,0,0.08);
  border-radius: 6px;
  z-index: 100;
  padding: 4px 0;
}
.select-field .dropdown button {
  display:block;
  width:100%;
  padding:8px 12px;
  background:transparent;
  border:none;
  text-align:left;
  cursor:pointer;
}
.select-field .dropdown button:hover{ background:#F5F5F5 }
</style>
