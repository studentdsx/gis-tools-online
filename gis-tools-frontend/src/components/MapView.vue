<script setup>
import { ref, onBeforeUnmount, onMounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import * as turf from '@turf/turf'
import { useAppStore } from '../stores/app'

const emit = defineEmits(['mapClick', 'tableDrop', 'featureSelect', 'editLayerChange', 'editFeatureCreated'])
const mapContainer = ref(null)
let map = null
let marker = null
let measureMarkers = []
let measurePoints = []
const dataLayers = new Map()
let dataLayerOrder = []
const visualizationLayers = new Map()
let selectedFeature = null
let draw = null
let editingLayer = null
let editingOriginalLayer = null
let editHistory = []
let applyingEditSnapshot = false
let bboxSelectionState = null
let mapLoaded = false

const appStore = useAppStore()

const showMeasurePanel = ref(false)
const activeTool = ref(null)
const editingCursorActive = ref(false)
const blankBackgroundLayerId = 'blank-background'
const activeBasemapSourceId = 'active-basemap-source'
const activeBasemapLayerId = 'active-basemap-raster'
const defaultRasterBasemap = {
  id: 'map-basemap-osm',
  kind: 'basemap',
  basemapType: 'raster-xyz',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  subdomains: ['a', 'b', 'c'],
  attribution: '© OpenStreetMap contributors'
}
const selectedFeatureStyle = {
  fillColor: '#f59e0b',
  lineColor: '#f97316',
  pointColor: '#f59e0b',
  haloColor: '#ffffff'
}
const styleOptions = ref([])
let currentBasemapLayer = null

onMounted(() => {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  mapboxgl.accessToken = token || ''
  
  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: createBaseMapStyle(defaultRasterBasemap),
    center: [114.0579, 22.5431],
    zoom: 12,
    attributionControl: false,
    navigationControl: false,
    preserveDrawingBuffer: true
  })

  map.on('load', () => {
    mapLoaded = true
    map.resize()
    initDraw()
    restoreDataLayers()
  })

  map.on('click', (e) => {
    const { lng, lat } = e.lngLat
    
    emit('mapClick', { lng, lat })

    if (appStore.measureMode === 'length' || appStore.measureMode === 'area') {
      addMeasurePoint(lng, lat)
      return
    }

    if (editingLayer) return

    handleFeatureClick(e)
  })

  window.addEventListener('keydown', handleEditKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEditKeydown)
  cancelBboxSelection()
})

function handleEditKeydown(event) {
  if (!editingLayer) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undoLayerEdit()
  }
}

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
  return [`${layerId}-fill`, `${layerId}-outline`, `${layerId}-line`, `${layerId}-circle`]
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function createEmptyFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: []
  }
}

function ensureEditFeatureIds(geojson) {
  const next = cloneJson(geojson || createEmptyFeatureCollection())
  next.features = (next.features || []).map((feature, index) => {
    const editId = feature.id || feature.properties?.__gisEditId || `feature-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`
    return {
      ...feature,
      id: editId,
      properties: {
        ...(feature.properties || {}),
        __gisEditId: editId
      }
    }
  })
  return next
}

function stripEditRuntimeProperties(geojson) {
  const next = cloneJson(geojson || createEmptyFeatureCollection())
  next.features = (next.features || []).map((feature, index) => {
    const properties = { ...(feature.properties || {}) }
    properties.__gisIndex = index
    properties.__gisEditId = properties.__gisEditId || feature.id || `feature-${Date.now()}-${index}`
    return {
      type: 'Feature',
      id: properties.__gisEditId,
      properties,
      geometry: feature.geometry
    }
  })
  return next
}

function buildEditingLayerFromDraw() {
  if (!editingLayer || !draw) return null
  const geojson = stripEditRuntimeProperties(draw.getAll())
  return {
    ...editingLayer,
    featureCount: geojson.features.length,
    geojson
  }
}

function pushEditHistory() {
  if (!draw || applyingEditSnapshot) return
  editHistory.push(cloneJson(draw.getAll()))
  if (editHistory.length > 40) editHistory.shift()
}

function emitEditingChange(dirty = true) {
  const layer = buildEditingLayerFromDraw()
  if (!layer) return
  editingLayer = layer
  dataLayers.set(layer.id, layer)
  if (map?.getSource(layer.id)) {
    map.getSource(layer.id).setData(layer.geojson)
  }
  emit('editLayerChange', { layer, dirty })
}

function initDraw() {
  if (!map || draw) return

  draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {},
    userProperties: true
  })
  map.addControl(draw)

  map.on('draw.create', (event) => {
    const [feature] = event.features || []
    pushEditHistory()
    emitEditingChange(true)
    if (feature) {
      emit('editFeatureCreated', { feature })
    }
  })
  map.on('draw.update', () => {
    pushEditHistory()
    emitEditingChange(true)
  })
  map.on('draw.delete', () => {
    pushEditHistory()
    emitEditingChange(true)
  })
  map.on('draw.selectionchange', () => {
    updateSelectedFeatureLayer()
  })
}

function ensureDrawReady() {
  if (!map) return false
  if (!draw) initDraw()
  return Boolean(draw)
}

function syncEditingCursor() {
  editingCursorActive.value = Boolean(editingLayer)
  if (map?.getCanvas()) {
    map.getCanvas().style.cursor = editingLayer ? 'default' : ''
  }
}

function getDrawModeForGeometryType(geometryType) {
  const type = String(geometryType || '').toUpperCase()
  if (type.includes('POLYGON')) return 'draw_polygon'
  if (type.includes('LINE')) return 'draw_line_string'
  return 'draw_point'
}

function startLayerEdit(layer) {
  if (!layer || layer.kind === 'basemap' || !ensureDrawReady()) return

  editingOriginalLayer = cloneJson(layer)
  const editableGeojson = ensureEditFeatureIds(layer.geojson)
  editingLayer = {
    ...cloneJson(layer),
    geojson: editableGeojson
  }

  draw.deleteAll()
  draw.add(editableGeojson)
  editHistory = [cloneJson(draw.getAll())]
  setEditMode('simple_select')
  syncEditingCursor()
  updateSelectedFeatureLayer()
  emitEditingChange(false)
}

function setEditMode(mode) {
  if (!ensureDrawReady() || !editingLayer) return
  const nextMode = mode || 'simple_select'
  try {
    if (nextMode === 'direct_select') {
      const [featureId] = draw.getSelectedIds()
      if (!featureId) return false
      draw.changeMode(nextMode, { featureId })
      syncEditingCursor()
      return true
    }
    draw.changeMode(nextMode)
    syncEditingCursor()
    return true
  } catch (error) {
    draw.changeMode('simple_select')
    syncEditingCursor()
    return false
  }
}

function hasSelectedEditingFeature() {
  return Boolean(draw && editingLayer && draw.getSelectedIds().length)
}

function deleteSelectedEditingFeature() {
  if (!draw || !editingLayer) return
  const selectedIds = draw.getSelectedIds()
  if (!selectedIds.length) return
  draw.delete(selectedIds)
  pushEditHistory()
  updateSelectedFeatureLayer()
  emitEditingChange(true)
}

function undoLayerEdit() {
  if (!draw || !editingLayer || editHistory.length <= 1) return
  editHistory.pop()
  const previous = cloneJson(editHistory[editHistory.length - 1])
  applyingEditSnapshot = true
  draw.deleteAll()
  draw.add(previous)
  applyingEditSnapshot = false
  updateSelectedFeatureLayer()
  emitEditingChange(true)
}

function saveLayerEdit() {
  if (!editingLayer) return null
  const layer = buildEditingLayerFromDraw()
  if (!layer) return null
  editingOriginalLayer = cloneJson(layer)
  editHistory = draw ? [cloneJson(draw.getAll())] : []
  editingLayer = layer
  syncEditingCursor()
  return layer
}

function revertLayerEdit() {
  if (!editingOriginalLayer) return null
  const original = cloneJson(editingOriginalLayer)
  if (draw) {
    draw.deleteAll()
    draw.add(ensureEditFeatureIds(original.geojson))
  }
  editingLayer = original
  dataLayers.set(original.id, original)
  if (map?.getSource(original.id)) {
    map.getSource(original.id).setData(original.geojson)
  }
  syncEditingCursor()
  updateSelectedFeatureLayer()
  return original
}

function cancelLayerEdit() {
  if (draw) {
    draw.deleteAll()
  }
  editingLayer = null
  editingOriginalLayer = null
  editHistory = []
  syncEditingCursor()
  updateSelectedFeatureLayer()
}

function getEditingOriginalLayer() {
  return editingOriginalLayer ? cloneJson(editingOriginalLayer) : null
}

function updateEditingFeatureProperties(featureId, properties) {
  if (!draw || !editingLayer || !featureId) return
  const all = draw.getAll()
  const targetId = String(featureId)
  const feature = all.features.find((item) => String(item.id) === targetId || String(item.properties?.__gisEditId) === targetId)
  if (!feature) return
  const nextProperties = {
    ...(feature.properties || {}),
    ...properties,
    __gisEditId: feature.properties?.__gisEditId || feature.id
  }
  draw.setFeatureProperty(feature.id, '__gisEditId', nextProperties.__gisEditId)
  Object.entries(nextProperties).forEach(([key, value]) => {
    draw.setFeatureProperty(feature.id, key, value)
  })
  pushEditHistory()
  emitEditingChange(true)
}

function getLayerVisibility(visible) {
  return visible ? 'visible' : 'none'
}

function getDataLayerStyle(layer) {
  const baseColor = layer.color || layer.style?.color || '#0f5fc6'
  return {
    color: baseColor,
    fillColor: layer.style?.fillColor || baseColor,
    fillOpacity: layer.style?.fillOpacity ?? 0.32,
    outlineColor: layer.style?.outlineColor || baseColor,
    outlineWidth: layer.style?.outlineWidth ?? 1.6,
    outlineOpacity: layer.style?.outlineOpacity ?? 0.95,
    lineColor: layer.style?.lineColor || baseColor,
    lineWidth: layer.style?.lineWidth ?? 2.4,
    lineOpacity: layer.style?.lineOpacity ?? 0.9,
    lineDash: layer.style?.lineDash || 'solid',
    circleColor: layer.style?.circleColor || baseColor,
    circleRadius: layer.style?.circleRadius ?? 5,
    circleOpacity: layer.style?.circleOpacity ?? 0.92,
    circleStrokeColor: layer.style?.circleStrokeColor || '#ffffff',
    circleStrokeWidth: layer.style?.circleStrokeWidth ?? 1.5
  }
}

function getRampColors(ramp = 'warm') {
  return {
    warm: ['#fff7bc', '#fec44f', '#f97316', '#b91c1c'],
    cool: ['#dbeafe', '#60a5fa', '#2563eb', '#1e3a8a'],
    forest: ['#ecfccb', '#86efac', '#10b981', '#065f46'],
    fire: ['#fff7ed', '#fdba74', '#ef4444', '#7f1d1d']
  }[ramp] || ['#dbeafe', '#60a5fa', '#2563eb', '#1e3a8a']
}

function getVisualizationLayerIds(id) {
  return [
    `${id}-fill`,
    `${id}-line`,
    `${id}-heat`,
    `${id}-cluster`,
    `${id}-cluster-count`,
    `${id}-circle`
  ]
}

function getLineDashArray(lineDash) {
  return {
    dash: [3, 2],
    dot: [0.2, 2],
    'dash-dot': [3, 2, 0.2, 2]
  }[lineDash] || [1, 0]
}

function isMapReady() {
  return Boolean(map && mapLoaded)
}

function whenMapReady(callback) {
  if (!map) return
  if (isMapReady()) {
    callback()
    return
  }

  const runOnce = () => {
    if (!mapLoaded) return
    cleanup()
    callback()
  }
  const cleanup = () => {
    map.off('load', runOnce)
    map.off('style.load', runOnce)
    map.off('styledata', runOnce)
    map.off('idle', runOnce)
  }

  map.once('load', runOnce)
  map.once('style.load', runOnce)
  map.once('styledata', runOnce)
  map.once('idle', runOnce)
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

function getSelectableMapLayerIds() {
  return getOrderedDataLayerIds()
    .flatMap((layerId) => getDataLayerIds(layerId))
    .filter((mapLayerId) => map?.getLayer(mapLayerId))
}

function moveLayerToTop(layerId) {
  if (!map?.getLayer(layerId)) return

  try {
    map.moveLayer(layerId)
  } catch (error) {
    console.warn('调整图层顺序失败', layerId, error)
  }
}

function addOverlayMapLayer(layerDefinition) {
  if (!map) return false

  try {
    map.addLayer(layerDefinition)
    return true
  } catch (error) {
    try {
      map.addLayer(layerDefinition)
      return true
    } catch (fallbackError) {
      console.warn('添加覆盖图层失败', layerDefinition?.id, fallbackError)
      return false
    }
  }
}

function getDrawLayerIds() {
  if (!map?.getStyle) return []
  return (map.getStyle().layers || [])
    .map((layer) => layer.id)
    .filter((id) => id.startsWith('gl-draw-'))
}

function getPersistentLayerIds() {
  return new Set([
    blankBackgroundLayerId,
    activeBasemapLayerId,
    'measure-polygon-fill',
    'measure-polygon-line',
    'measure-line',
    'selected-feature-fill',
    'selected-feature-line',
    'selected-feature-circle',
    ...getDrawLayerIds(),
    ...getOrderedDataLayerIds().flatMap((layerId) => getDataLayerIds(layerId)),
    ...Array.from(visualizationLayers.keys()).flatMap((layerId) => getVisualizationLayerIds(layerId))
  ])
}

function getPersistentSourceIds(persistentLayerIds) {
  const sourceIds = new Set([
    activeBasemapSourceId,
    'selected-feature',
    'measure-line',
    'measure-polygon',
    'mapbox-gl-draw-cold',
    'mapbox-gl-draw-hot',
    ...Array.from(dataLayers.keys()),
    ...Array.from(visualizationLayers.keys())
  ])

  ;(map?.getStyle()?.layers || []).forEach((layer) => {
    if (persistentLayerIds.has(layer.id) && layer.source) {
      sourceIds.add(layer.source)
    }
  })

  return sourceIds
}

function raiseOverlayLayers() {
  Array.from(visualizationLayers.keys())
    .flatMap((layerId) => getVisualizationLayerIds(layerId))
    .forEach(moveLayerToTop);
  [
    'measure-polygon-fill',
    'measure-polygon-line',
    'measure-line',
    'selected-feature-fill',
    'selected-feature-line',
    'selected-feature-circle',
    ...getDrawLayerIds()
  ].forEach(moveLayerToTop)
}

function getFirstOverlayLayerId() {
  const bottomToTopDataLayerIds = [...getOrderedDataLayerIds()].reverse()
  const overlayIds = [
    ...bottomToTopDataLayerIds.flatMap((layerId) => getDataLayerIds(layerId)),
    'measure-polygon-fill',
    'measure-polygon-line',
    'measure-line',
    'selected-feature-fill',
    'selected-feature-line',
    'selected-feature-circle',
    ...getDrawLayerIds()
  ]
  return overlayIds.find((id) => map?.getLayer(id))
}

function positionBasemapLayer() {
  if (!map?.getLayer(activeBasemapLayerId)) return

  const firstOverlayLayerId = getFirstOverlayLayerId()
  if (!firstOverlayLayerId) return

  try {
    map.moveLayer(activeBasemapLayerId, firstOverlayLayerId)
  } catch (error) {
    console.warn('Failed to position raster basemap layer', error)
  }
}

function applyDataLayerOrder() {
  if (!isMapReady()) return

  const bottomToTopLayerIds = [...getOrderedDataLayerIds()].reverse()
  const mapLayerIds = bottomToTopLayerIds
    .flatMap((layerId) => getDataLayerIds(layerId))
    .filter((mapLayerId) => map.getLayer(mapLayerId))

  mapLayerIds.forEach((mapLayerId) => {
    moveLayerToTop(mapLayerId)
  })
  positionBasemapLayer()
  raiseOverlayLayers()
}

function addMapboxDataLayer(layer) {
  if (!isMapReady()) return

  const sourceId = layer.id

  try {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: layer.geojson
      })
    } else {
      map.getSource(sourceId).setData(layer.geojson)
    }
  } catch (error) {
    console.warn('添加或更新业务图层数据源失败', sourceId, error)
    return
  }

  const visibility = getLayerVisibility(layer.visible)
  const style = getDataLayerStyle(layer)

  if (!map.getLayer(`${layer.id}-fill`)) {
    addOverlayMapLayer({
      id: `${layer.id}-fill`,
      type: 'fill',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      layout: { visibility },
      paint: {
        'fill-color': style.fillColor,
        'fill-opacity': style.fillOpacity
      }
    })
  }

  if (!map.getLayer(`${layer.id}-outline`)) {
    addOverlayMapLayer({
      id: `${layer.id}-outline`,
      type: 'line',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      layout: {
        visibility,
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': style.outlineColor,
        'line-width': style.outlineWidth,
        'line-opacity': style.outlineOpacity
      }
    })
  }

  if (!map.getLayer(`${layer.id}-line`)) {
    addOverlayMapLayer({
      id: `${layer.id}-line`,
      type: 'line',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']],
      layout: {
        visibility,
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': style.lineColor,
        'line-width': style.lineWidth,
        'line-opacity': style.lineOpacity
      }
    })
    map.setPaintProperty(`${layer.id}-line`, 'line-dasharray', getLineDashArray(style.lineDash))
  }

  if (!map.getLayer(`${layer.id}-circle`)) {
    addOverlayMapLayer({
      id: `${layer.id}-circle`,
      type: 'circle',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      layout: { visibility },
      paint: {
        'circle-color': style.circleColor,
        'circle-radius': style.circleRadius,
        'circle-stroke-color': style.circleStrokeColor,
        'circle-stroke-width': style.circleStrokeWidth,
        'circle-opacity': style.circleOpacity
      }
    })
  }
}

function addHeatmapVisualizationLayer(config) {
  const id = config.id
  const colors = getRampColors(config.colorRamp)
  addOverlayMapLayer({
    id: `${id}-heat`,
    type: 'heatmap',
    source: id,
    filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
    paint: {
      'heatmap-weight': config.weightField
        ? ['interpolate', ['linear'], ['to-number', ['get', config.weightField], 0], 0, 0, 100, 1]
        : 1,
      'heatmap-intensity': Number(config.intensity) || 1,
      'heatmap-radius': Number(config.radius) || 34,
      'heatmap-opacity': Number(config.opacity) || 0.78,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(255,255,255,0)',
        0.25,
        colors[0],
        0.5,
        colors[1],
        0.75,
        colors[2],
        1,
        colors[3]
      ]
    }
  })
}

function addClusterVisualizationLayer(config) {
  const id = config.id
  addOverlayMapLayer({
    id: `${id}-cluster`,
    type: 'circle',
    source: id,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step',
        ['get', 'point_count'],
        '#60a5fa',
        20,
        '#f59e0b',
        80,
        '#ef4444'
      ],
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        16,
        20,
        22,
        80,
        30
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': Number(config.opacity) || 0.86
    }
  })
  addOverlayMapLayer({
    id: `${id}-cluster-count`,
    type: 'symbol',
    source: id,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12
    },
    paint: {
      'text-color': '#ffffff'
    }
  })
  addOverlayMapLayer({
    id: `${id}-circle`,
    type: 'circle',
    source: id,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#0f5fc6',
      'circle-radius': 5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': Number(config.opacity) || 0.82
    }
  })
}

function addFlowVisualizationLayer(config) {
  const id = config.id
  addOverlayMapLayer({
    id: `${id}-line`,
    type: 'line',
    source: id,
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': [
        'interpolate',
        ['linear'],
        ['to-number', ['get', config.weightField || '__flow_weight'], 1],
        1,
        '#38bdf8',
        50,
        '#f97316',
        200,
        '#dc2626'
      ],
      'line-width': [
        'interpolate',
        ['linear'],
        ['to-number', ['get', config.weightField || '__flow_weight'], 1],
        1,
        Math.max(1, Number(config.lineWidth) || 3),
        200,
        Math.max(3, (Number(config.lineWidth) || 3) * 2.6)
      ],
      'line-opacity': Number(config.opacity) || 0.78
    }
  })
}

function addGraduatedPointVisualizationLayer(config) {
  const id = config.id
  const colors = getRampColors(config.colorRamp)
  addOverlayMapLayer({
    id: `${id}-circle`,
    type: 'circle',
    source: id,
    filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
    paint: {
      'circle-color': [
        'interpolate',
        ['linear'],
        ['to-number', ['get', config.numericField], 0],
        0,
        colors[0],
        30,
        colors[1],
        70,
        colors[2],
        100,
        colors[3]
      ],
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['to-number', ['get', config.numericField], 0],
        0,
        4,
        100,
        Math.max(8, Number(config.radius) || 24)
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': Number(config.opacity) || 0.78
    }
  })
}

function addChoroplethVisualizationLayer(config) {
  const id = config.id
  const colors = getRampColors(config.colorRamp)
  addOverlayMapLayer({
    id: `${id}-fill`,
    type: 'fill',
    source: id,
    filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
    paint: {
      'fill-color': [
        'interpolate',
        ['linear'],
        ['to-number', ['get', config.numericField], 0],
        0,
        colors[0],
        30,
        colors[1],
        70,
        colors[2],
        100,
        colors[3]
      ],
      'fill-opacity': Number(config.opacity) || 0.72
    }
  })
  addOverlayMapLayer({
    id: `${id}-line`,
    type: 'line',
    source: id,
    filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
    paint: {
      'line-color': '#ffffff',
      'line-width': 1,
      'line-opacity': 0.84
    }
  })
}

function removeVisualizationLayer(id) {
  getVisualizationLayerIds(id).forEach((layerId) => {
    if (map?.getLayer(layerId)) map.removeLayer(layerId)
  })
  if (map?.getSource(id)) map.removeSource(id)
  visualizationLayers.delete(id)
}

function addVisualizationLayer(config) {
  if (!config?.id || !config?.geojson) return
  if (!isMapReady()) {
    whenMapReady(() => addVisualizationLayer(config))
    return
  }

  removeVisualizationLayer(config.id)
  visualizationLayers.set(config.id, config)
  map.addSource(config.id, {
    type: 'geojson',
    data: config.geojson,
    cluster: config.type === 'cluster',
    clusterRadius: Number(config.clusterRadius) || 56,
    clusterMaxZoom: 14
  })

  if (config.type === 'heatmap') addHeatmapVisualizationLayer(config)
  else if (config.type === 'cluster') addClusterVisualizationLayer(config)
  else if (config.type === 'flow') addFlowVisualizationLayer(config)
  else if (config.type === 'graduated-point') addGraduatedPointVisualizationLayer(config)
  else if (config.type === 'choropleth') addChoroplethVisualizationLayer(config)

  raiseOverlayLayers()
  try {
    const bounds = getGeoJsonBounds(config.geojson)
    if (bounds) {
      map.fitBounds(bounds, { padding: 80, duration: 650, maxZoom: 14 })
    }
  } catch (error) {
    console.warn('定位可视化图层失败', error)
  }
}

function stripMapLayerSuffix(mapLayerId) {
  return mapLayerId.replace(/-(fill|outline|line|circle)$/, '')
}

function getFeatureIndex(feature) {
  const value = feature?.properties?.__gisIndex
  const index = Number(value)
  return Number.isFinite(index) ? index : null
}

function handleFeatureClick(event) {
  if (!map) return

  const selectableLayers = getSelectableMapLayerIds()
  if (selectableLayers.length === 0) return

  const features = map.queryRenderedFeatures(event.point, {
    layers: selectableLayers
  })
  const feature = features.find((item) => getFeatureIndex(item) != null)

  if (!feature) {
    setSelectedFeature(null)
    emit('featureSelect', { layerId: null, featureIndex: null })
    return
  }

  const layerId = stripMapLayerSuffix(feature.layer.id)
  const featureIndex = getFeatureIndex(feature)
  setSelectedFeature({ layerId, featureIndex })
  emit('featureSelect', { layerId, featureIndex })
}

function getSelectedFeatureGeoJson() {
  const editingSelected = getEditingSelectedGeoJson()
  if (editingSelected) return editingSelected

  if (!selectedFeature?.layerId || selectedFeature.featureIndex == null) return null

  const layer = dataLayers.get(selectedFeature.layerId)
  const feature = layer?.geojson?.features?.[selectedFeature.featureIndex]
  if (!feature) return null

  return {
    type: 'FeatureCollection',
    features: [feature]
  }
}

function getEditingSelectedGeoJson() {
  if (!draw || !editingLayer) return null
  const selected = draw.getSelected()
  if (!selected?.features?.length) return null
  return selected
}

function updateSelectedFeatureLayer() {
  if (!isMapReady()) return

  const data = getSelectedFeatureGeoJson() || {
    type: 'FeatureCollection',
    features: []
  }

  if (map.getSource('selected-feature')) {
    map.getSource('selected-feature').setData(data)
  } else {
    map.addSource('selected-feature', {
      type: 'geojson',
      data
    })
  }

  if (!map.getLayer('selected-feature-fill')) {
    addOverlayMapLayer({
      id: 'selected-feature-fill',
      type: 'fill',
      source: 'selected-feature',
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      paint: {
        'fill-color': selectedFeatureStyle.fillColor,
        'fill-opacity': 0.36
      }
    })
  }

  if (!map.getLayer('selected-feature-line')) {
    addOverlayMapLayer({
      id: 'selected-feature-line',
      type: 'line',
      source: 'selected-feature',
      filter: [
        'any',
        ['==', ['geometry-type'], 'LineString'],
        ['==', ['geometry-type'], 'MultiLineString'],
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon']
      ],
      paint: {
        'line-color': selectedFeatureStyle.lineColor,
        'line-width': 6,
        'line-opacity': 0.95
      }
    })
  }

  if (!map.getLayer('selected-feature-circle')) {
    addOverlayMapLayer({
      id: 'selected-feature-circle',
      type: 'circle',
      source: 'selected-feature',
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      paint: {
        'circle-color': selectedFeatureStyle.pointColor,
        'circle-radius': 10,
        'circle-stroke-color': selectedFeatureStyle.haloColor,
        'circle-stroke-width': 3
      }
    })
  }

  if (map.getLayer('selected-feature-fill')) {
    map.setPaintProperty('selected-feature-fill', 'fill-color', selectedFeatureStyle.fillColor)
    map.setPaintProperty('selected-feature-fill', 'fill-opacity', 0.36)
  }

  if (map.getLayer('selected-feature-line')) {
    map.setPaintProperty('selected-feature-line', 'line-color', selectedFeatureStyle.lineColor)
    map.setPaintProperty('selected-feature-line', 'line-width', 6)
    map.setPaintProperty('selected-feature-line', 'line-opacity', 0.95)
  }

  if (map.getLayer('selected-feature-circle')) {
    map.setPaintProperty('selected-feature-circle', 'circle-color', selectedFeatureStyle.pointColor)
    map.setPaintProperty('selected-feature-circle', 'circle-radius', 10)
    map.setPaintProperty('selected-feature-circle', 'circle-stroke-color', selectedFeatureStyle.haloColor)
    map.setPaintProperty('selected-feature-circle', 'circle-stroke-width', 3)
  }

  raiseOverlayLayers()
}

function setSelectedFeature(payload) {
  selectedFeature = payload?.layerId && payload.featureIndex != null
    ? { layerId: payload.layerId, featureIndex: Number(payload.featureIndex) }
    : null
  updateSelectedFeatureLayer()
}

function zoomToSelectedFeature() {
  const data = getSelectedFeatureGeoJson()
  if (!map || !data?.features?.length) return

  try {
    const bbox = turf.bbox(data)
    if (bbox.some((value) => !Number.isFinite(value))) return

    if (bbox[0] === bbox[2] && bbox[1] === bbox[3]) {
      map.flyTo({
        center: [bbox[0], bbox[1]],
        zoom: Math.max(map.getZoom(), 15),
        duration: 500
      })
      return
    }

    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]]
      ],
      {
        padding: 80,
        maxZoom: 16,
        duration: 650
      }
    )
  } catch (error) {
    console.warn('定位选中要素失败', error)
  }
}

function restoreDataLayers() {
  if (!isMapReady()) return

  ensureBlankBackgroundLayer()
  dataLayers.forEach((layer) => {
    addMapboxDataLayer(layer)
  })
  Array.from(visualizationLayers.values()).forEach((layer) => {
    addVisualizationLayer(layer)
  })
  applyDataLayerOrder()
  updateSelectedFeatureLayer()
  requestAnimationFrame(() => {
    applyDataLayerOrder()
    updateSelectedFeatureLayer()
  })
}

function normalizeTileUrls(url, subdomains = defaultRasterBasemap.subdomains) {
  if (!url) return []
  const urls = Array.isArray(url) ? url : [url]
  return urls.flatMap((tileUrl) => {
    const match = String(tileUrl).match(/\{s\}/)
    if (!match) return [tileUrl]
    return subdomains.length
      ? subdomains.map((subdomain) => tileUrl.replace(/\{s\}/g, subdomain))
      : [tileUrl.replace(/\{s\}/g, 'a')]
  })
}

function createBaseMapStyle(layer = defaultRasterBasemap) {
  const tiles = normalizeTileUrls(layer.url || defaultRasterBasemap.url, layer.subdomains)
  const sources = {}
  const layers = [
    {
      id: blankBackgroundLayerId,
      type: 'background',
      paint: {
        'background-color': '#ffffff'
      }
    }
  ]

  if (tiles.length) {
    sources[activeBasemapSourceId] = {
      type: 'raster',
      tiles,
      tileSize: 256,
      attribution: layer.attribution
    }
    layers.push({
      id: activeBasemapLayerId,
      type: 'raster',
      source: activeBasemapSourceId
    })
  }

  return {
    version: 8,
    sources,
    layers
  }
}

function ensureBlankBackgroundLayer() {
  if (!isMapReady()) return

  const backgroundLayer = {
    id: blankBackgroundLayerId,
    type: 'background',
    paint: {
      'background-color': '#ffffff'
    }
  }

  if (map.getLayer(blankBackgroundLayerId)) {
    map.setPaintProperty(blankBackgroundLayerId, 'background-color', '#ffffff')
    return
  }

  const firstLayerId = map.getStyle().layers?.[0]?.id

  try {
    map.addLayer(backgroundLayer, firstLayerId)
  } catch (error) {
    try {
      map.addLayer(backgroundLayer)
    } catch (fallbackError) {
      console.warn('添加白板背景失败', fallbackError)
    }
  }
}

function removeActiveBasemapLayer() {
  if (!map) return

  if (map.getLayer(activeBasemapLayerId)) {
    try {
      map.removeLayer(activeBasemapLayerId)
    } catch (error) {
      console.warn('Failed to remove raster basemap layer', error)
    }
  }

  if (map.getSource(activeBasemapSourceId)) {
    try {
      map.removeSource(activeBasemapSourceId)
    } catch (error) {
      console.warn('Failed to remove raster basemap source', error)
    }
  }
}

function createRasterBasemapSource(layer) {
  const source = {
    type: 'raster',
    tiles: normalizeTileUrls(layer.url || defaultRasterBasemap.url, layer.subdomains),
    tileSize: 256
  }

  if (layer.attribution) {
    source.attribution = layer.attribution
  }

  return source
}

function addActiveBasemapLayer(layer) {
  const source = createRasterBasemapSource(layer)
  if (!source.tiles.length) return

  try {
    map.addSource(activeBasemapSourceId, source)
  } catch (error) {
    console.warn('Failed to add raster basemap source', error)
    return
  }

  if (!map.getSource(activeBasemapSourceId)) {
    console.warn('Raster basemap source is not ready; skipped layer add')
    return
  }

  try {
    map.addLayer({
      id: activeBasemapLayerId,
      type: 'raster',
      source: activeBasemapSourceId
    }, getFirstOverlayLayerId())
  } catch (error) {
    console.warn('Failed to add raster basemap layer', error)
  }
}

function applyBlankBasemapLayer() {
  if (!map) return

  if (!isMapReady()) {
    whenMapReady(applyBlankBasemapLayer)
    return
  }

  ensureBlankBackgroundLayer()
  removeActiveBasemapLayer()
  applyDataLayerOrder()
}

function applyBasemapLayer(layer) {
  if (!map) return

  currentBasemapLayer = layer

  if (layer.basemapType === 'blank') {
    applyBlankBasemapLayer()
    return
  }

  if (!isMapReady()) {
    whenMapReady(() => applyBasemapLayer(layer))
    return
  }

  ensureBlankBackgroundLayer()
  removeActiveBasemapLayer()

  addActiveBasemapLayer(layer)
  applyDataLayerOrder()
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

function fitGeoJsonCollection(geojsonList = []) {
  if (!map) return

  const bounds = new mapboxgl.LngLatBounds()
  geojsonList.forEach((geojson) => {
    const itemBounds = getGeoJsonBounds(geojson)
    if (itemBounds) {
      bounds.extend(itemBounds.getSouthWest())
      bounds.extend(itemBounds.getNorthEast())
    }
  })

  if (bounds.isEmpty()) return

  map.fitBounds(bounds, {
    padding: 80,
    duration: 900,
    maxZoom: 16
  })
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

  if (!isMapReady()) {
    whenMapReady(() => {
      addMapboxDataLayer(layer)
      applyDataLayerOrder()
      if (layer.fitOnAdd !== false) fitDataLayer(layer)
    })
    return
  }

  addMapboxDataLayer(layer)
  applyDataLayerOrder()
  if (layer.fitOnAdd !== false) fitDataLayer(layer)
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

function setDataLayerStyle(payload) {
  if (!payload?.id || currentBasemapLayer?.id === payload.id) return

  const layer = dataLayers.get(payload.id)
  if (!layer) return

  layer.color = payload.color || layer.color
  layer.style = {
    ...(layer.style || {}),
    ...(payload.style || {}),
    color: layer.color
  }

  const style = getDataLayerStyle(layer)

  if (map?.getLayer(`${payload.id}-fill`)) {
    map.setPaintProperty(`${payload.id}-fill`, 'fill-color', style.fillColor)
    map.setPaintProperty(`${payload.id}-fill`, 'fill-opacity', style.fillOpacity)
  }

  if (map?.getLayer(`${payload.id}-outline`)) {
    map.setPaintProperty(`${payload.id}-outline`, 'line-color', style.outlineColor)
    map.setPaintProperty(`${payload.id}-outline`, 'line-width', style.outlineWidth)
    map.setPaintProperty(`${payload.id}-outline`, 'line-opacity', style.outlineOpacity)
  }

  if (map?.getLayer(`${payload.id}-line`)) {
    map.setPaintProperty(`${payload.id}-line`, 'line-color', style.lineColor)
    map.setPaintProperty(`${payload.id}-line`, 'line-width', style.lineWidth)
    map.setPaintProperty(`${payload.id}-line`, 'line-opacity', style.lineOpacity)
    map.setPaintProperty(`${payload.id}-line`, 'line-dasharray', getLineDashArray(style.lineDash))
  }

  if (map?.getLayer(`${payload.id}-circle`)) {
    map.setPaintProperty(`${payload.id}-circle`, 'circle-color', style.circleColor)
    map.setPaintProperty(`${payload.id}-circle`, 'circle-radius', style.circleRadius)
    map.setPaintProperty(`${payload.id}-circle`, 'circle-stroke-color', style.circleStrokeColor)
    map.setPaintProperty(`${payload.id}-circle`, 'circle-stroke-width', style.circleStrokeWidth)
    map.setPaintProperty(`${payload.id}-circle`, 'circle-opacity', style.circleOpacity)
  }
}

function removeDataLayer(layerId) {
  if (currentBasemapLayer?.id === layerId) {
    currentBasemapLayer = null
    applyBasemapLayer(defaultRasterBasemap)
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
  if (selectedFeature?.layerId === layerId) {
    setSelectedFeature(null)
  }
}

function reorderDataLayers(layerIds) {
  dataLayerOrder = layerIds.filter((layerId) => dataLayers.has(layerId))
  applyDataLayerOrder()
}

function getLayerRenderDiagnostics() {
  if (!map) return []

  return getOrderedDataLayerIds().map((layerId) => {
    const layer = dataLayers.get(layerId)
    const mapLayerIds = getDataLayerIds(layerId)
    return {
      id: layerId,
      name: layer?.name || layerId,
      featureCount: layer?.geojson?.features?.length || 0,
      geometryTypes: Array.from(new Set((layer?.geojson?.features || []).map((feature) => feature.geometry?.type).filter(Boolean))),
      sourceExists: Boolean(map.getSource(layerId)),
      mapLayers: mapLayerIds.map((mapLayerId) => ({
        id: mapLayerId,
        exists: Boolean(map.getLayer(mapLayerId)),
        visibility: map.getLayer(mapLayerId) ? map.getLayoutProperty(mapLayerId, 'visibility') || 'visible' : ''
      })),
      renderedFeatureCount: mapLayerIds
        .filter((mapLayerId) => map.getLayer(mapLayerId))
        .reduce((sum, mapLayerId) => {
          try {
            return sum + map.queryRenderedFeatures({ layers: [mapLayerId] }).length
          } catch (error) {
            return sum
          }
        }, 0)
    }
  })
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
    addOverlayMapLayer({
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

  raiseOverlayLayers()
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
    addOverlayMapLayer({
      id: 'measure-polygon-fill',
      type: 'fill',
      source: 'measure-polygon',
      paint: {
        'fill-color': '#4a90d9',
        'fill-opacity': 0.2
      }
    })
    addOverlayMapLayer({
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

  raiseOverlayLayers()
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

function getViewportBbox() {
  if (!map) return null
  const bounds = map.getBounds()
  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  ]
}

function getBboxPolygonGeoJson(bbox) {
  return {
    type: 'FeatureCollection',
    features: [
      turf.bboxPolygon(bbox)
    ]
  }
}

function updateBboxSelectionPreview(startLngLat, endLngLat) {
  if (!map || !startLngLat || !endLngLat) return
  const bbox = [
    Math.min(startLngLat.lng, endLngLat.lng),
    Math.min(startLngLat.lat, endLngLat.lat),
    Math.max(startLngLat.lng, endLngLat.lng),
    Math.max(startLngLat.lat, endLngLat.lat)
  ]
  const source = map.getSource('bbox-selection-preview')
  if (source) source.setData(getBboxPolygonGeoJson(bbox))
}

function clearBboxSelectionPreview() {
  if (!map) return
  if (map.getLayer('bbox-selection-preview-fill')) map.removeLayer('bbox-selection-preview-fill')
  if (map.getLayer('bbox-selection-preview-line')) map.removeLayer('bbox-selection-preview-line')
  if (map.getSource('bbox-selection-preview')) map.removeSource('bbox-selection-preview')
}

function ensureBboxSelectionPreview() {
  if (!map || map.getSource('bbox-selection-preview')) return
  map.addSource('bbox-selection-preview', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  })
  map.addLayer({
    id: 'bbox-selection-preview-fill',
    type: 'fill',
    source: 'bbox-selection-preview',
    paint: {
      'fill-color': '#f59e0b',
      'fill-opacity': 0.12
    }
  })
  map.addLayer({
    id: 'bbox-selection-preview-line',
    type: 'line',
    source: 'bbox-selection-preview',
    paint: {
      'line-color': '#f97316',
      'line-width': 2,
      'line-dasharray': [2, 1]
    }
  })
  raiseOverlayLayers()
}

function cancelBboxSelection() {
  if (!bboxSelectionState) return
  const state = bboxSelectionState
  bboxSelectionState = null
  if (map) {
    map.dragPan.enable()
    map.boxZoom.enable()
    map.getCanvas().style.cursor = ''
    map.off('mousedown', state.handleMouseDown)
    map.off('mousemove', state.handleMouseMove)
    map.off('mouseup', state.handleMouseUp)
  }
  window.removeEventListener('keydown', state.handleKeydown)
  clearBboxSelectionPreview()
  if (state.reject && !state.completed) {
    state.reject(new Error('已取消框选范围'))
  }
}

function startBboxSelection() {
  if (!map) return Promise.reject(new Error('地图未初始化'))
  cancelBboxSelection()

  return new Promise((resolve, reject) => {
    const state = {
      startLngLat: null,
      completed: false,
      resolve,
      reject,
      handleMouseDown: null,
      handleMouseMove: null,
      handleMouseUp: null,
      handleKeydown: null
    }

    state.handleMouseDown = (event) => {
      event.preventDefault()
      state.startLngLat = event.lngLat
      ensureBboxSelectionPreview()
      updateBboxSelectionPreview(state.startLngLat, event.lngLat)
    }

    state.handleMouseMove = (event) => {
      if (!state.startLngLat) return
      updateBboxSelectionPreview(state.startLngLat, event.lngLat)
    }

    state.handleMouseUp = (event) => {
      if (!state.startLngLat) return
      const bbox = [
        Math.min(state.startLngLat.lng, event.lngLat.lng),
        Math.min(state.startLngLat.lat, event.lngLat.lat),
        Math.max(state.startLngLat.lng, event.lngLat.lng),
        Math.max(state.startLngLat.lat, event.lngLat.lat)
      ]
      if (bbox[0] === bbox[2] || bbox[1] === bbox[3]) return
      state.completed = true
      resolve(bbox)
      cancelBboxSelection()
    }

    state.handleKeydown = (event) => {
      if (event.key === 'Escape') cancelBboxSelection()
    }

    bboxSelectionState = state
    map.dragPan.disable()
    map.boxZoom.disable()
    map.getCanvas().style.cursor = 'crosshair'
    map.on('mousedown', state.handleMouseDown)
    map.on('mousemove', state.handleMouseMove)
    map.on('mouseup', state.handleMouseUp)
    window.addEventListener('keydown', state.handleKeydown)
  })
}

defineExpose({
  handleSearch,
  addDataLayer,
  setDataLayerVisibility,
  setDataLayerStyle,
  addVisualizationLayer,
  removeVisualizationLayer,
  setSelectedFeature,
  zoomToSelectedFeature,
  removeDataLayer,
  reorderDataLayers,
  fitGeoJsonCollection,
  getLayerRenderDiagnostics,
  resizeMap,
  startLayerEdit,
  setEditMode,
  hasSelectedEditingFeature,
  deleteSelectedEditingFeature,
  undoLayerEdit,
  saveLayerEdit,
  revertLayerEdit,
  cancelLayerEdit,
  getEditingOriginalLayer,
  updateEditingFeatureProperties,
  getViewportBbox,
  startBboxSelection,
  cancelBboxSelection
})

</script>

<template>
  <div class="map-wrapper" :class="{ editing: editingCursorActive }" @click.self="closePanels" @dragover.prevent @drop.prevent="handleMapDrop">
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

.map-wrapper.editing :deep(.mapboxgl-canvas),
.map-wrapper.editing :deep(.mapboxgl-canvas-container),
.map-wrapper.editing :deep(.mapbox-gl-draw_ctrl-draw-btn),
.map-wrapper.editing :deep(.mapboxgl-interactive) {
  cursor: default !important;
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
