<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: '模块正在按 PRD/TRD 拆分建设。'
  },
  items: {
    type: Array,
    default: () => []
  }
})
</script>

<template>
  <div class="tool-shell">
    <main class="placeholder-main">
      <section class="placeholder-panel">
        <p class="eyebrow">GIS Tools</p>
        <h1>{{ title }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
        <div class="placeholder-grid">
          <article v-for="item in items" :key="item" class="placeholder-item">
            {{ item }}
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.tool-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #eef3f8;
  color: #17231b;
}

.placeholder-main {
  min-height: 0;
  flex: 1;
  padding: 18px;
  overflow: auto;
}

.placeholder-panel {
  max-width: 960px;
  margin: 0 auto;
  padding: 18px;
  border: 1px solid #d7e0ec;
  border-radius: 8px;
  background: #fbfcfa;
}

.eyebrow {
  margin: 0 0 4px;
  color: #0f5fc6;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: #17231b;
  font-size: 22px;
}

.subtitle {
  margin: 8px 0 16px;
  color: #52657d;
  font-size: 13px;
}

.placeholder-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.placeholder-item {
  min-height: 54px;
  display: flex;
  align-items: center;
  padding: 10px;
  border: 1px solid #dce6f1;
  border-radius: 6px;
  background: #f8fbff;
  color: #24364d;
  font-size: 13px;
  font-weight: 800;
}
</style>
