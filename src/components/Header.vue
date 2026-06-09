<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const searchLng = ref('')
const searchLat = ref('')
const emit = defineEmits(['search', 'mapClick'])

function handleSearch() {
  const lng = parseFloat(searchLng.value)
  const lat = parseFloat(searchLat.value)
  if (!isNaN(lng) && !isNaN(lat)) {
    emit('search', { lng, lat })
  }
}

function openMapshaper() {
  router.push('/mapshaper')
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
      <span class="logo-text">GIS工具集合</span>
    </div>
    <nav class="menu">
      <div class="menu-group process-group">
        <span class="group-name">数据处理</span>
        <div class="process-menu">
          <button class="menu-item process-trigger" type="button">
            <span class="menu-name">mapshaper</span>
          </button>
          <div class="process-dropdown">
            <button class="dropdown-item" type="button" @click="openMapshaper">
              mapshaper
            </button>
          </div>
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
  background: #0f5fc6;
  border-bottom: 1px solid #0b55b4;
  box-shadow: 0 1px 4px rgba(15, 95, 198, 0.18);
  padding: 0 16px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.logo-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}

.logo-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0;
}

.menu {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.menu-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-name {
  color: rgba(255, 255, 255, 0.66);
  font-size: 12px;
  font-weight: 500;
  border-right: 1px solid rgba(255, 255, 255, 0.22);
  padding: 0 7px 0 0;
}

.menu-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  display: flex;
  align-items: center;
  height: 32px;
  border-color: rgba(255, 255, 255, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.12);
  padding: 0 6px;
}

.search-input {
  width: 74px;
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
  height: 24px;
  padding: 0 10px;
  border-radius: 4px;
  background: #ffffff;
  color: #0f5fc6;
  border: 0;
  font-weight: 700;
  cursor: pointer;
}

.search-btn:hover {
  background: #eaf3ff;
}

.process-menu {
  position: relative;
}

.process-trigger {
  height: 30px;
}

.process-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 200;
  min-width: 138px;
  padding: 6px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 10px 22px rgba(31, 75, 130, 0.18);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.process-menu:hover .process-dropdown,
.process-menu:focus-within .process-dropdown {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.dropdown-item {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #1f2a37;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.dropdown-item:hover {
  background: #edf5ff;
  color: #0f5fc6;
}
</style>
