<script setup>
import { computed, reactive } from 'vue'
import { portalCategories, portalTools } from '../utils/portalTools'

const portalForm = reactive({
  keyword: '',
  category: '全部'
})

const categoryStats = computed(() => {
  const counts = new Map()
  portalTools.forEach((tool) => {
    counts.set(tool.category, (counts.get(tool.category) || 0) + 1)
  })
  return counts
})

const filteredPortalTools = computed(() => {
  const keyword = portalForm.keyword.trim().toLowerCase()
  return portalTools.filter((tool) => {
    const categoryMatched = portalForm.category === '全部' || tool.category === portalForm.category
    if (!categoryMatched) return false
    if (!keyword) return true
    return [
      tool.name,
      tool.category,
      tool.description,
      ...(tool.tags || [])
    ].join(' ').toLowerCase().includes(keyword)
  })
})

function openTool(tool) {
  if (!tool?.url) return
  window.open(tool.url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <main class="portal-page">
    <section class="portal-shell">
      <aside class="portal-sidebar">
        <div class="sidebar-head">
          <p>Portal</p>
          <h1>外链门户</h1>
          <span>{{ portalTools.length }} 个在线 GIS 工具</span>
        </div>
        <div class="category-list">
          <button
            v-for="category in portalCategories"
            :key="category"
            type="button"
            :class="{ active: portalForm.category === category }"
            @click="portalForm.category = category"
          >
            <span>{{ category }}</span>
            <em>{{ category === '全部' ? portalTools.length : categoryStats.get(category) || 0 }}</em>
          </button>
        </div>
      </aside>

      <section class="portal-content">
        <div class="portal-toolbar">
          <label>
            <span>搜索工具</span>
            <input v-model.trim="portalForm.keyword" type="search" placeholder="搜索工具名、标签、说明" />
          </label>
          <div class="toolbar-meta">
            <strong>{{ filteredPortalTools.length }}</strong>
            <span>匹配结果</span>
          </div>
        </div>

        <div class="tool-grid">
          <article v-for="tool in filteredPortalTools" :key="tool.url" class="tool-card">
            <div class="tool-title">
              <strong>{{ tool.name }}</strong>
              <span>{{ tool.category }}</span>
            </div>
            <p>{{ tool.description }}</p>
            <div class="tool-tags">
              <em v-for="tag in tool.tags" :key="`${tool.name}-${tag}`">{{ tag }}</em>
            </div>
            <button type="button" @click="openTool(tool)">打开工具</button>
          </article>

          <div v-if="!filteredPortalTools.length" class="empty-state">
            <strong>没有匹配工具</strong>
            <span>换个关键词或分类再试。</span>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.portal-page {
  width: 100%;
  height: 100%;
  background: #eef4fb;
  color: #1f2a37;
  overflow: hidden;
}

.portal-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  overflow: hidden;
}

.portal-sidebar {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid #d7e0ec;
  background: #f7fbff;
}

.sidebar-head {
  padding: 18px 16px 14px;
  border-bottom: 1px solid #d7e0ec;
  background: linear-gradient(180deg, #ffffff, #f7fbff);
}

.sidebar-head p,
.sidebar-head h1,
.sidebar-head span {
  margin: 0;
}

.sidebar-head p {
  color: #0f5fc6;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sidebar-head h1 {
  margin-top: 4px;
  color: #172033;
  font-size: 20px;
  letter-spacing: 0;
}

.sidebar-head span {
  display: block;
  margin-top: 6px;
  color: #6b7b90;
  font-size: 12px;
  font-weight: 800;
}

.category-list {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 10px;
  overflow: auto;
}

.category-list button {
  min-height: 36px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #334155;
  text-align: left;
  cursor: pointer;
}

.category-list button:hover,
.category-list button.active {
  border-color: #bcd3ef;
  background: #edf5ff;
}

.category-list span {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-list em {
  min-width: 24px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eaf3ff;
  color: #0f5fc6;
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
}

.portal-content {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.portal-toolbar {
  display: grid;
  grid-template-columns: minmax(280px, 520px) auto;
  gap: 14px;
  align-items: end;
  padding: 14px 16px;
  border-bottom: 1px solid #d7e0ec;
  background: #fff;
}

.portal-toolbar label {
  display: grid;
  gap: 5px;
}

.portal-toolbar label span {
  color: #52657d;
  font-size: 12px;
  font-weight: 900;
}

.portal-toolbar input {
  height: 34px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid #cad7e8;
  border-radius: 6px;
  background: #fff;
  color: #1f2a37;
  outline: none;
}

.portal-toolbar input:focus {
  border-color: #0f5fc6;
  box-shadow: 0 0 0 3px rgba(15, 95, 198, 0.12);
}

.toolbar-meta {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #6b7b90;
  font-size: 12px;
  font-weight: 900;
}

.toolbar-meta strong {
  color: #0f5fc6;
  font-size: 18px;
}

.tool-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  align-content: start;
  gap: 10px;
  padding: 12px;
  overflow: auto;
}

.tool-card {
  display: grid;
  gap: 9px;
  min-height: 168px;
  padding: 12px;
  border: 1px solid #dce6f1;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--gis-shadow-sm, 0 5px 14px rgba(31, 75, 130, 0.06));
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.tool-card:hover {
  border-color: #bcd3ef;
  box-shadow: var(--gis-shadow-md, 0 12px 28px rgba(31, 75, 130, 0.12));
  transform: translateY(-1px);
}

.tool-title {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.tool-title strong {
  min-width: 0;
  color: #17231b;
  font-size: 14px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-title span {
  height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  background: #edf5ff;
  color: #0f5fc6;
  font-size: 11px;
  font-weight: 900;
}

.tool-card p {
  margin: 0;
  min-height: 40px;
  color: #52657d;
  font-size: 12px;
  line-height: 1.55;
}

.tool-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tool-tags em {
  height: 20px;
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border-radius: 999px;
  background: #f5f7fb;
  color: #5f6f86;
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
}

.tool-card button {
  justify-self: start;
  height: 28px;
  padding: 0 12px;
  border: 1px solid #0f5fc6;
  border-radius: 6px;
  background: linear-gradient(180deg, #1777e6, #0f5fc6);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(15, 95, 198, 0.18);
  transition: background 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.tool-card button:hover {
  background: linear-gradient(180deg, #2384f2, #0b55b4);
  box-shadow: 0 5px 14px rgba(15, 95, 198, 0.22);
  transform: translateY(-1px);
}

.empty-state {
  grid-column: 1 / -1;
  display: grid;
  gap: 6px;
  min-height: 110px;
  place-items: center;
  border: 1px dashed #cbd8ea;
  border-radius: 7px;
  background: #f8fbff;
  color: #6b7b90;
}

.empty-state strong {
  color: #24364d;
  font-size: 14px;
}

@media (max-width: 760px) {
  .portal-shell {
    grid-template-columns: 1fr;
  }

  .portal-sidebar {
    max-height: 220px;
    border-right: 0;
    border-bottom: 1px solid #d7e0ec;
  }

  .portal-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
