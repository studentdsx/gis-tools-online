<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const searchLng = ref('')
const searchLat = ref('')
const expandedMenu = ref('')
const emit = defineEmits(['search', 'tool-action'])
const primaryMenus = [
  {
    name: 'data-import',
    label: '数据导入',
    children: [
      { label: '本地矢量文件', action: 'local-vector-import' },
      { label: 'CSV 导入', action: 'csv-import' },
      { label: 'CAD 导入', action: 'cad-import' },
      { label: '数据库导入', action: 'database-import' }
    ]
  },
  {
    name: 'data-edit',
    label: '数据处理',
    children: [
      { label: '新建图层', action: 'create-layer' },
      { label: '坐标转换', action: 'crs-transform' },
      { label: 'China Coord Convert', action: 'coord-convert' },
      { label: 'mapshaper', action: 'mapshaper' }
    ]
  },
  {
    name: 'analysis-tools',
    label: '分析工具',
    children: [
      { label: '缓冲区生成', action: 'buffer-analysis' },
      { label: '空间连接', action: 'spatial-join' },
      { label: '图层求交', action: 'layer-intersection' },
      { label: '图层裁剪', action: 'layer-clip' },
      { label: '图层合并', action: 'layer-merge' },
      { label: '要素融合', action: 'feature-merge' },
      { label: '可达性分析', action: 'accessibility-analysis' },
      { label: '渔网生成', action: 'fishnet' }
    ]
  },
  {
    name: 'data-download',
    label: '数据下载',
    children: [
      { label: 'OSM 数据下载', action: 'osm-download' },
      { label: '高德 POI 下载', action: 'amap-poi-download' }
    ]
  },
  {
    name: 'visualization',
    label: '可视化',
    children: [
      { label: '热力图', action: 'heatmap' },
      { label: '流线图', action: 'flow-map' },
      { label: '聚合点', action: 'cluster-map' },
      { label: '分级点图', action: 'graduated-point' },
      { label: '面分级图', action: 'choropleth-map' }
    ]
  },
  {
    name: 'portal',
    label: '外链门户',
    route: '/portal'
  }
]

function handleSearch() {
  const lng = parseFloat(searchLng.value)
  const lat = parseFloat(searchLat.value)
  if (!isNaN(lng) && !isNaN(lat)) {
    emit('search', { lng, lat })
  }
}

function openMenu(item) {
  if (item.children?.length) {
    expandedMenu.value = expandedMenu.value === item.name ? '' : item.name
    return
  }

  expandedMenu.value = ''
  if (item.route) {
    router.push(item.route)
    return
  }
  emit('tool-action', item.action)
}

function openChildMenu(item) {
  expandedMenu.value = ''
  emit('tool-action', item.action)
}

function openWorkbench() {
  expandedMenu.value = ''
  router.push('/')
}

function handleMapClickResult(coords) {
  searchLng.value = coords.lng.toFixed(6)
  searchLat.value = coords.lat.toFixed(6)
}

defineExpose({ handleMapClickResult })
</script>

<template>
  <header class="header">
    <div class="logo">
      <span class="logo-icon">GIS</span>
      <button class="logo-text" type="button" @click="openWorkbench">GIS工具集合</button>
    </div>
    <nav class="menu">
      <div
        v-for="item in primaryMenus"
        :key="item.name"
        class="menu-group"
        :class="{ open: expandedMenu === item.name }"
      >
        <button
          class="menu-item"
          :class="{ active: expandedMenu === item.name }"
          type="button"
          :aria-expanded="item.children?.length ? expandedMenu === item.name : undefined"
          @click="openMenu(item)"
        >
          <span>{{ item.label }}</span>
          <span v-if="item.children?.length" class="chevron">v</span>
        </button>
        <div v-if="item.children?.length" class="menu-dropdown">
          <button
            v-for="child in item.children"
            :key="`${item.name}-${child.label}`"
            class="dropdown-item"
            type="button"
            @click="openChildMenu(child)"
          >
            {{ child.label }}
          </button>
        </div>
      </div>
    </nav>
    <div class="header-right">
      <div class="search-box">
        <input 
          v-model="searchLng" 
          type="text" 
          placeholder="经度" 
          class="search-input"
        />
        <span class="separator">,</span>
        <input 
          v-model="searchLat" 
          type="text" 
          placeholder="纬度" 
          class="search-input"
        />
        <button class="search-btn" @click="handleSearch">搜索</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 62%),
    #0f5fc6;
  border-bottom: 1px solid #084c9e;
  box-shadow: 0 2px 12px rgba(9, 55, 115, 0.24);
  padding: 0 16px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.logo-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.17);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.logo-text {
  border: 0;
  background: transparent;
  font-size: 15px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0;
  cursor: pointer;
}

.menu {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: visible;
}

.menu-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.84);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.menu-item:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
}

.menu-item.active {
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.21);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.menu-group {
  position: relative;
  flex-shrink: 0;
}

.chevron {
  color: rgba(255, 255, 255, 0.66);
  font-size: 10px;
  line-height: 1;
  transition: transform 0.16s ease;
}

.menu-group.open .chevron {
  transform: rotate(180deg);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  display: flex;
  align-items: center;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.27);
  border-radius: 7px;
  background: rgba(7, 59, 120, 0.24);
  padding: 0 5px 0 8px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.search-input {
  width: 78px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #fff;
  font-size: 12px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.58);
}

.separator {
  color: rgba(255, 255, 255, 0.58);
  margin: 0 4px;
}

.search-btn {
  height: 26px;
  padding: 0 12px;
  border-radius: 6px;
  background: #ffffff;
  color: #0f5fc6;
  border: 0;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(7, 59, 120, 0.16);
  transition: background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.search-btn:hover {
  background: #eaf3ff;
  box-shadow: 0 3px 9px rgba(7, 59, 120, 0.2);
  transform: translateY(-1px);
}

.menu-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 200;
  min-width: 168px;
  padding: 7px;
  border: 1px solid #cfdced;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 16px 38px rgba(13, 54, 104, 0.22);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.menu-group.open .menu-dropdown {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.dropdown-item {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #1f2a37;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.dropdown-item:hover {
  border-color: #cfe1f7;
  background: #edf5ff;
  color: #0f5fc6;
}
</style>
