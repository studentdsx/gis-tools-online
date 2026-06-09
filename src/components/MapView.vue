<script setup>
import { ref, onMounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import * as turf from '@turf/turf'
import { useAppStore } from '../stores/app'

const emit = defineEmits(['mapClick', 'tableDrop'])
const mapContainer = ref(null)
let map = null
let marker = null
let measureMarkers = []
let measurePoints = []
const dataLayers = new Map()
let dataLayerOrder = []

const appStore = useAppStore()

const showMeasurePanel = ref(false)
const activeTool = ref(null)
const defaultBasemapStyle = 'mapbox://styles/mapbox/satellite-streets-v12'
const styleOptions = ref([])
let currentBasemapLayer = null

onMounted(() => {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  if (!token) {
    console.error('缺少 VITE_MAPBOX_ACCESS_TOKEN：请复制 .env.example 为 .env 并填入 Mapbox token')
  }
  mapboxgl.accessToken = token || ''
  
  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: defaultBasemapStyle,
    center: [114.0579, 22.5431],
    zoom: 12,
    attributionControl: false,
    navigationControl: false,
    preserveDrawingBuffer: true
  })

  map.on('load', () => {
    map.resize()
    restoreDataLayers()
  })

  map.on('click', (e) => {
    const { lng, lat } = e.lngLat
    
    emit('mapClick', { lng, lat })

    if (appStore.measureMode === 'length' || appStore.measureMode === 'area') {
      addMeasurePoint(lng, lat)
    }
  })
})

function toggleToolPanel(tool) {
  if (activeTool.value === tool) {
    activeTool.value = null
    showMeasurePanel.value = false
    showScreenshotPanel.value = false
  } else {
    activeTool.value = tool
    if (tool === 'measure') {
      showMeasurePanel.value = true
      showScreenshotPanel.value = false
    } else if (tool === 'screenshot') {
      showMeasurePanel.value = false
      showScreenshotPanel.value = true
    }
  }
}

function closePanels() {
  activeTool.value = null
  showMeasurePanel.value = false
  showScreenshotPanel.value = false
}

const showScreenshotPanel = ref(false)

function takeScreenshot() {
  closePanels()
  
  if (!map || !map.isStyleLoaded()) {
    console.error('地图未加载完成')
    return
  }

  try {
    map.triggerRepaint()
    
    setTimeout(() => {
      const canvas = map.getCanvas()
      if (canvas) {
        const dataURL = canvas.toDataURL('image/png')
        
        const link = document.createElement('a')
        const center = map.getCenter()
        const zoom = map.getZoom()
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        link.download = `map_${center.lng.toFixed(4)}_${center.lat.toFixed(4)}_z${zoom.toFixed(1)}_${timestamp}.png`
        link.href = dataURL
        link.click()
      }
    }, 100)
  } catch (error) {
    console.error('截图失败:', error)
  }
}

function getDataLayerIds(layerId) {
  return [`${layerId}-fill`, `${layerId}-line`, `${layerId}-circle`]
}

function getLayerVisibility(visible) {
  return visible ? 'visible' : 'none'
}

function getOrderedDataLayerIds() {
  const knownIds = Array.from(dataLayers.keys())
  const orderedKnownIds = dataLayerOrder.filter((id) => dataLayers.has(id))
  const orderedSet = new Set(orderedKnownIds)
  return [
    ...orderedKnownIds,
    ...knownIds.filter((id) => !orderedSet.has(id))
  ]
}

function getDataLayerBeforeId() {
  return ['measure-polygon-fill', 'measure-polygon-line', 'measure-line']
    .find((id) => map?.getLayer(id))
}

function applyDataLayerOrder() {
  if (!map || !map.isStyleLoaded()) return

  const bottomToTopLayerIds = [...getOrderedDataLayerIds()].reverse()
  const mapLayerIds = bottomToTopLayerIds
    .flatMap((layerId) => getDataLayerIds(layerId))
    .filter((mapLayerId) => map.getLayer(mapLayerId))
  const beforeId = getDataLayerBeforeId()

  mapLayerIds.forEach((mapLayerId) => {
    map.moveLayer(mapLayerId, beforeId)
  })
}

function addMapboxDataLayer(layer) {
  if (!map || !map.isStyleLoaded()) return

  const sourceId = layer.id

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: layer.geojson
    })
  } else {
    map.getSource(sourceId).setData(layer.geojson)
  }

  const visibility = getLayerVisibility(layer.visible)

  if (!map.getLayer(`${layer.id}-fill`)) {
    map.addLayer({
      id: `${layer.id}-fill`,
      type: 'fill',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      layout: { visibility },
      paint: {
        'fill-color': layer.color,
        'fill-opacity': 0.32
      }
    })
  }

  if (!map.getLayer(`${layer.id}-line`)) {
    map.addLayer({
      id: `${layer.id}-line`,
      type: 'line',
      source: sourceId,
      filter: [
        'any',
        ['==', ['geometry-type'], 'LineString'],
        ['==', ['geometry-type'], 'MultiLineString'],
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon']
      ],
      layout: {
        visibility,
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': layer.color,
        'line-width': 2.4,
        'line-opacity': 0.9
      }
    })
  }

  if (!map.getLayer(`${layer.id}-circle`)) {
    map.addLayer({
      id: `${layer.id}-circle`,
      type: 'circle',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      layout: { visibility },
      paint: {
        'circle-color': layer.color,
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.92
      }
    })
  }
}

function restoreDataLayers() {
  dataLayers.forEach((layer) => {
    addMapboxDataLayer(layer)
  })
  applyDataLayerOrder()
}

function createRasterStyle(layer) {
  return {
    version: 8,
    sources: {
      [layer.id]: {
        type: 'raster',
        tiles: [layer.url],
        tileSize: 256
      }
    },
    layers: [
      {
        id: `${layer.id}-raster`,
        type: 'raster',
        source: layer.id
      }
    ]
  }
}

function applyBasemapLayer(layer) {
  if (!map) return

  currentBasemapLayer = layer
  map.once('style.load', restoreDataLayers)

  if (layer.basemapType === 'raster-xyz') {
    map.setStyle(createRasterStyle(layer))
  } else {
    map.setStyle(layer.url || defaultBasemapStyle)
  }
}

function switchStyle() {}

function getGeoJsonBounds(geojson) {
  const bounds = new mapboxgl.LngLatBounds()

  function extendCoordinates(coords) {
    if (!Array.isArray(coords)) return

    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      bounds.extend(coords)
      return
    }

    coords.forEach(extendCoordinates)
  }

  geojson?.features?.forEach((feature) => {
    extendCoordinates(feature.geometry?.coordinates)
  })

  return bounds.isEmpty() ? null : bounds
}

function fitDataLayer(layer) {
  const bounds = getGeoJsonBounds(layer.geojson)

  if (bounds) {
    map.fitBounds(bounds, {
      padding: 80,
      duration: 900,
      maxZoom: 16
    })
  }
}

function addDataLayer(layer) {
  if (layer.kind === 'basemap') {
    applyBasemapLayer(layer)
    return
  }

  dataLayers.set(layer.id, layer)
  dataLayerOrder = [
    layer.id,
    ...dataLayerOrder.filter((id) => id !== layer.id)
  ]

  if (!map || !map.isStyleLoaded()) {
    map?.once('style.load', () => {
      addMapboxDataLayer(layer)
      applyDataLayerOrder()
      fitDataLayer(layer)
    })
    return
  }

  addMapboxDataLayer(layer)
  applyDataLayerOrder()
  fitDataLayer(layer)
}

function setDataLayerVisibility(layerId, visible) {
  if (currentBasemapLayer?.id === layerId) return

  const layer = dataLayers.get(layerId)
  if (layer) {
    layer.visible = visible
  }

  getDataLayerIds(layerId).forEach((id) => {
    if (map?.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', getLayerVisibility(visible))
    }
  })
}

function removeDataLayer(layerId) {
  if (currentBasemapLayer?.id === layerId) {
    currentBasemapLayer = null
    map?.once('style.load', restoreDataLayers)
    map?.setStyle(defaultBasemapStyle)
    return
  }

  getDataLayerIds(layerId).forEach((id) => {
    if (map?.getLayer(id)) {
      map.removeLayer(id)
    }
  })

  if (map?.getSource(layerId)) {
    map.removeSource(layerId)
  }

  dataLayers.delete(layerId)
  dataLayerOrder = dataLayerOrder.filter((id) => id !== layerId)
}

function reorderDataLayers(layerIds) {
  dataLayerOrder = layerIds.filter((layerId) => dataLayers.has(layerId))
  applyDataLayerOrder()
}

function handleMapDrop(event) {
  const raw = event.dataTransfer.getData('application/json')
  if (!raw) return

  try {
    emit('tableDrop', JSON.parse(raw))
  } catch (error) {
    console.error('拖拽数据无法识别', error)
  }
}

function toggleMeasureMode(mode) {
  if (appStore.measureMode === mode) {
    appStore.setMeasureMode(null)
    clearMeasure()
  } else {
    appStore.setMeasureMode(mode)
    clearMeasure()
  }
}

function addMeasurePoint(lng, lat) {
  measurePoints.push([lng, lat])

  const el = document.createElement('div')
  el.style.cssText = 'width: 12px; height: 12px; background: #4a90d9; border: 2px solid #fff; border-radius: 50%; cursor: pointer;'
  
  const m = new mapboxgl.Marker(el)
    .setLngLat([lng, lat])
    .addTo(map)
  measureMarkers.push(m)

  if (appStore.measureMode === 'length' && measurePoints.length >= 2) {
    updateMeasureLine()
  } else if (appStore.measureMode === 'area' && measurePoints.length >= 3) {
    updateMeasurePolygon()
  }
}

function updateMeasureLine() {
  if (measurePoints.length < 2) return

  const lineGeoJSON = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: measurePoints
    }
  }

  const length = turf.length(lineGeoJSON, { units: 'meters' })
  
  if (map.getSource('measure-line')) {
    map.getSource('measure-line').setData(lineGeoJSON)
  } else {
    map.addSource('measure-line', {
      type: 'geojson',
      data: lineGeoJSON
    })
    map.addLayer({
      id: 'measure-line',
      type: 'line',
      source: 'measure-line',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#4a90d9',
        'line-width': 3
      }
    })
  }

  appStore.setMeasureResult({ length, area: 0 })
}

function updateMeasurePolygon() {
  if (measurePoints.length < 3) return

  const polygonCoords = [...measurePoints, measurePoints[0]]
  const polygonGeoJSON = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [polygonCoords]
    }
  }

  const area = turf.area(polygonGeoJSON)

  if (map.getSource('measure-polygon')) {
    map.getSource('measure-polygon').setData(polygonGeoJSON)
  } else {
    map.addSource('measure-polygon', {
      type: 'geojson',
      data: polygonGeoJSON
    })
    map.addLayer({
      id: 'measure-polygon-fill',
      type: 'fill',
      source: 'measure-polygon',
      paint: {
        'fill-color': '#4a90d9',
        'fill-opacity': 0.2
      }
    })
    map.addLayer({
      id: 'measure-polygon-line',
      type: 'line',
      source: 'measure-polygon',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#4a90d9',
        'line-width': 2
      }
    })
  }

  appStore.setMeasureResult({ length: 0, area })
}

function clearMeasure() {
  measurePoints = []
  
  measureMarkers.forEach(m => m.remove())
  measureMarkers = []
  
  if (map.getLayer('measure-line')) {
    map.removeLayer('measure-line')
    map.removeSource('measure-line')
  }
  if (map.getLayer('measure-polygon-fill')) {
    map.removeLayer('measure-polygon-fill')
    map.removeLayer('measure-polygon-line')
    map.removeSource('measure-polygon')
  }

  appStore.setMeasureResult({ length: 0, area: 0 })
}

function flyTo(lng, lat) {
  if (map) {
    map.flyTo({
      center: [lng, lat],
      zoom: 15,
      duration: 1000
    })

    if (marker) {
      marker.setLngLat([lng, lat])
    } else {
      marker = new mapboxgl.Marker({ color: '#ff0000' })
        .setLngLat([lng, lat])
        .addTo(map)
    }
  }
}

function handleSearch(coords) {
  flyTo(coords.lng, coords.lat)
}

function resizeMap() {
  map?.resize()
}

defineExpose({
  handleSearch,
  addDataLayer,
  setDataLayerVisibility,
  removeDataLayer,
  reorderDataLayers,
  resizeMap
})

</script>

<template>
  <div class="map-wrapper" @click.self="closePanels" @dragover.prevent @drop.prevent="handleMapDrop">
    <div ref="mapContainer" class="map-view"></div>
    
    <div class="bottom-tools">
      <div class="tools-group">
        <div 
          v-if="false"
          class="tool-btn"
          :class="{ active: activeTool === 'style' }"
          @click.stop="toggleToolPanel('style')"
        >
          <span class="tool-icon">🗺️</span>
        </div>
        <div 
          class="tool-btn"
          :class="{ active: activeTool === 'measure' }"
          @click.stop="toggleToolPanel('measure')"
        >
          <span class="tool-icon">📏</span>
        </div>
        <div 
          class="tool-btn"
          :class="{ active: activeTool === 'screenshot' }"
          @click.stop="toggleToolPanel('screenshot')"
        >
          <span class="tool-icon">📷</span>
        </div>
      </div>

      <div v-if="showScreenshotPanel" class="panel-dropdown screenshot-dropdown" @click.stop>
        <div class="dropdown-title">地图截图</div>
        <div class="screenshot-info">
          <div class="info-row">
            <span class="info-label">当前中心:</span>
            <span class="info-value">{{ map ? `${map.getCenter().lng.toFixed(4)}, ${map.getCenter().lat.toFixed(4)}` : '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">缩放等级:</span>
            <span class="info-value">{{ map ? map.getZoom().toFixed(1) : '-' }}</span>
          </div>
        </div>
        <button class="screenshot-btn" @click="takeScreenshot">
          <span class="btn-icon">📷</span>
          保存截图
        </button>
      </div>

      <div v-if="false" class="panel-dropdown style-dropdown" @click.stop>
        <div class="dropdown-title">底图切换</div>
        <div class="style-list">
          <div 
            v-for="style in styleOptions" 
            :key="style.id"
            class="style-item"
            :class="{ active: appStore.currentStyle === style.id }"
            @click="switchStyle(style.id)"
          >
            <div class="style-preview" :class="style.id"></div>
            <span class="style-name">{{ style.name }}</span>
          </div>
        </div>
      </div>

      <div v-if="showMeasurePanel" class="panel-dropdown measure-dropdown" @click.stop>
        <div class="dropdown-title">量算工具</div>
        <div class="measure-btns">
          <button 
            class="measure-btn"
            :class="{ active: appStore.measureMode === 'length' }"
            @click="toggleMeasureMode('length')"
          >
            <span class="btn-icon">📐</span>
            长度测量
          </button>
          <button 
            class="measure-btn"
            :class="{ active: appStore.measureMode === 'area' }"
            @click="toggleMeasureMode('area')"
          >
            <span class="btn-icon">⬜</span>
            面积测量
          </button>
        </div>
        <div v-if="appStore.measureResult.length > 0 || appStore.measureResult.area > 0" class="result-info">
          <div v-if="appStore.measureResult.length > 0">
            <span class="result-label">距离:</span>
            <span class="result-value">{{ appStore.measureResult.length.toFixed(2) }} m</span>
          </div>
          <div v-if="appStore.measureResult.area > 0">
            <span class="result-label">面积:</span>
            <span class="result-value">{{ (appStore.measureResult.area / 1000000).toFixed(4) }} 平方公里</span>
          </div>
        </div>
        <button v-if="measurePoints.length > 0" class="clear-btn" @click="clearMeasure">
          清除测量
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

.map-view {
  width: 100%;
  height: 100%;
}

.bottom-tools {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 100;
}

.tools-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px;
}

.tool-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: #f0f0f0;
}

.tool-btn.active {
  background: #3b82f6;
  color: #fff;
}

.tool-icon {
  font-size: 18px;
}

.panel-dropdown {
  position: absolute;
  bottom: 52px;
  right: 0;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.dropdown-title {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  border-bottom: 1px solid #eee;
}

.style-dropdown {
  width: 200px;
}

.style-list {
  display: flex;
  padding: 8px;
  gap: 8px;
}

.style-item {
  flex: 1;
  cursor: pointer;
  text-align: center;
}

.style-item:hover .style-preview {
  transform: scale(1.05);
}

.style-item.active .style-preview {
  border: 3px solid #3b82f6;
}

.style-item.active .style-name {
  color: #3b82f6;
  font-weight: 500;
}

.style-preview {
  width: 100%;
  height: 45px;
  border-radius: 4px;
  border: 2px solid #ddd;
  transition: all 0.2s ease;
}

.style-preview.satellite {
  background: linear-gradient(135deg, #4a7c59 0%, #2d5a3d 100%);
}

.style-preview.light {
  background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
}

.style-preview.dark {
  background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%);
}

.style-name {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: #666;
}

.measure-dropdown {
  width: 160px;
  padding: 10px;
}

.measure-btns {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.measure-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  color: #333;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.measure-btn:hover {
  background: #eee;
  border-color: #3b82f6;
}

.measure-btn.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #3b82f6;
}

.btn-icon {
  font-size: 16px;
}

.result-info {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.result-info > div {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 13px;
}

.result-label {
  color: #666;
}

.result-value {
  color: #3b82f6;
  font-weight: 500;
}

.clear-btn {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: #fee;
  border-color: #f88;
  color: #f66;
}

.screenshot-dropdown {
  width: 180px;
  padding: 10px;
}

.screenshot-info {
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
}

.info-label {
  color: #999;
}

.info-value {
  color: #333;
  font-family: monospace;
}

.screenshot-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.screenshot-btn:hover {
  background: #2563eb;
}
.tools-group {
  gap: 3px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(31, 75, 130, 0.16);
}

.tool-btn {
  width: 34px;
  height: 34px;
  border-radius: 5px;
  color: #43556f;
}

.tool-btn:hover {
  background: #eef6ff;
  color: #0f5fc6;
}

.tool-btn.active {
  background: #0f5fc6;
  color: #fff;
}

.panel-dropdown {
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  box-shadow: 0 10px 24px rgba(31, 75, 130, 0.18);
}

.dropdown-title {
  padding: 10px 12px;
  color: #1f2a37;
  background: #f8fbff;
  border-bottom-color: #d7e0ec;
  font-size: 13px;
  font-weight: 800;
}

.measure-dropdown,
.screenshot-dropdown {
  width: 178px;
  padding: 8px;
}

.measure-btn {
  min-height: 34px;
  padding: 8px 10px;
  border-color: #d7e0ec;
  border-radius: 5px;
  background: #fff;
  color: #1f2a37;
  font-size: 12px;
}

.measure-btn:hover {
  border-color: #8bbcf7;
  background: #f4f8ff;
}

.measure-btn.active,
.screenshot-btn {
  border-color: #0f5fc6;
  background: #0f5fc6;
  color: #fff;
}

.clear-btn {
  border-color: #d7e0ec;
  border-radius: 5px;
  background: #f8fbff;
  font-size: 12px;
}

.result-value {
  color: #0f5fc6;
}
</style>
