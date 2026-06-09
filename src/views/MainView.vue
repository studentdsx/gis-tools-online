<script setup>
import { nextTick, ref } from 'vue'
import { useAppStore } from '../stores/app'
import Header from '../components/Header.vue'
import ResourcePanel from '../components/ResourcePanel.vue'
import MapView from '../components/MapView.vue'
import RightPanel from '../components/RightPanel.vue'

const appStore = useAppStore()
const mapRef = ref(null)
const headerRef = ref(null)
const resourceRef = ref(null)
const leftPanelCollapsed = ref(false)

async function toggleLeftPanel() {
  leftPanelCollapsed.value = !leftPanelCollapsed.value
  await nextTick()
  requestAnimationFrame(() => {
    mapRef.value?.resizeMap()
  })
}

function handleSearch(coords) {
  if (mapRef.value) {
    mapRef.value.handleSearch(coords)
  }
}

function handleMapClick(coords) {
  if (headerRef.value) {
    headerRef.value.handleMapClickResult(coords)
  }
}

function handleAddLayer(layer) {
  mapRef.value?.addDataLayer(layer)
}

function handleToggleLayer(payload) {
  mapRef.value?.setDataLayerVisibility(payload.id, payload.visible)
}

function handleRemoveLayer(layerId) {
  mapRef.value?.removeDataLayer(layerId)
}

function handleReorderLayer(layerIds) {
  mapRef.value?.reorderDataLayers(layerIds)
}

function handleTableDrop(payload) {
  resourceRef.value?.addDroppedSource(payload)
}
</script>

<template>
  <div class="main-view">
    <Header ref="headerRef" @search="handleSearch" />
    <div class="content-area">
      <div v-if="!leftPanelCollapsed" class="left-panel">
        <ResourcePanel
          ref="resourceRef"
          @add-layer="handleAddLayer"
          @toggle-layer="handleToggleLayer"
          @remove-layer="handleRemoveLayer"
          @reorder-layer="handleReorderLayer"
        />
        <div class="left-toggle" @click="toggleLeftPanel">
          <span class="toggle-icon">◀</span>
        </div>
      </div>
      <div v-else class="left-collapsed" @click="toggleLeftPanel">
        <span class="collapsed-icon">▶</span>
      </div>
      <div class="map-container">
        <MapView ref="mapRef" @map-click="handleMapClick" @table-drop="handleTableDrop" />
      </div>
      <RightPanel 
        v-if="appStore.rightPanelVisible" 
        :title="appStore.rightPanelTitle"
      />
    </div>
  </div>
</template>

<style scoped>
.main-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a2e;
}

.content-area {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.left-panel {
  width: 330px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.left-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 56px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 11;
  box-shadow: -2px 0 6px rgba(0,0,0,0.1);
}

.left-toggle:hover {
  background: #f5f5f5;
}

.toggle-icon {
  font-size: 12px;
  color: #888;
}

.left-collapsed {
  width: 16px;
  flex-shrink: 0;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}

.left-collapsed:hover {
  background: #e8e8e8;
}

.collapsed-icon {
  font-size: 14px;
  color: #666;
}

.map-container {
  flex: 1;
  position: relative;
}
.main-view {
  background: #eef3f8;
}

.content-area {
  background: #eef3f8;
}

.left-panel {
  width: 316px;
  border-right: 1px solid #d7e0ec;
  background: #f6f8fb;
}

.left-toggle {
  right: -14px;
  width: 22px;
  height: 44px;
  border-color: #ccd8e6;
  border-radius: 0 5px 5px 0;
  background: #fff;
  box-shadow: 0 2px 8px rgba(31, 75, 130, 0.14);
}

.left-toggle:hover {
  background: #f1f7ff;
}

.toggle-icon,
.collapsed-icon {
  color: #5d728f;
}

.left-collapsed {
  width: 18px;
  background: #f8fbff;
  border-right: 1px solid #d7e0ec;
}

.left-collapsed:hover {
  background: #edf5ff;
}

.map-container {
  background: #dce5ef;
}
</style>
