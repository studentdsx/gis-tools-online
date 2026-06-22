<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import proj4 from 'proj4'
import JSZip from 'jszip'
import { useAppStore } from '../stores/app'
import ResourcePanel from '../components/ResourcePanel.vue'
import MapView from '../components/MapView.vue'
import RightPanel from '../components/RightPanel.vue'
import MapshaperView from './MapshaperView.vue'
import { apiClient } from '../api/client'
import {
  cloneGeoJson,
  getFileBaseName as getVectorFileBaseName,
  getGeoJsonCrs as getGeoJsonCrsFromData,
  getOutputFileName,
  getOutputPickerOptions,
  getPrjCrs as getPrjCrsFromText,
  getSpatialReferencePrj,
  isWgs84 as isWgs84Crs,
  normalizeCrs as normalizeCrsValue,
  outputEncodingOptions,
  outputFormatOptions,
  readVectorFilesAsGeoJson,
  requestSaveFileHandle,
  registerSpatialReferences,
  saveGeoJsonOutput,
  writeBlobToSaveHandle,
  transformGeoJsonCrs
} from '../utils/geoExport'

const appStore = useAppStore()
const emit = defineEmits(['map-click'])
const mapRef = ref(null)
const resourceRef = ref(null)
const leftPanelCollapsed = ref(false)
const activeTool = ref('')
const toolMessage = ref('')
const toolBusy = ref(false)
const appToast = reactive({
  visible: false,
  message: '',
  type: 'success'
})
let appToastTimer = null
const toolDialogCollapsed = ref(false)
const toolDialogPosition = reactive({
  x: null,
  y: null
})
const toolDialogDragging = ref(false)
const pickingDownloadBbox = ref(false)
const mapBboxPicking = ref(false)
const toolDialogDragState = {
  dragging: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  startDialogX: 0,
  startDialogY: 0
}
const vectorFiles = ref([])
const csvFile = ref(null)
const csvColumns = ref([])
const csvPreviewRows = ref([])
const csvRawLines = ref([])
const cadFiles = ref([])
const editingLayer = ref(null)
const editingMode = ref('select')
const editingDirty = ref(false)
const attributeModalVisible = ref(false)
const pendingFeature = ref(null)
const editingAttributeValues = reactive({})
const spatialReferences = ref([])
const spatialReferenceCache = ref([])
const spatialReferenceKeyword = ref('')
const spatialReferenceLoading = ref(false)
const spatialReferenceSource = ref('')
const crsTransformSourceKeyword = ref('')
const crsTransformTargetKeyword = ref('')
const crsTransformSourceReferences = ref([])
const crsTransformTargetReferences = ref([])
const crsTransformReferenceLoading = reactive({
  source: false,
  target: false
})
let csvPreviewRefreshTimer = null
let csvPreviewRequestId = 0
const crsTransformReferenceRequestIds = {
  source: 0,
  target: 0
}

const vectorForm = reactive({
  name: '',
  sourceCrs: '',
  encoding: 'utf-8'
})
const csvForm = reactive({
  name: '',
  xField: '',
  yField: '',
  wktField: '',
  sourceCrs: 'EPSG:4326',
  encoding: 'utf-8',
  delimiterMode: 'comma',
  customDelimiter: '',
  startRow: 1,
  hasHeader: true,
  inferFieldTypes: true,
  geometryMode: 'xy',
  buildSpatialIndex: true
})
const cadForm = reactive({
  sourceCrs: ''
})
const coordConvertForm = reactive({
  direction: '',
  inputMode: 'layer',
  layerId: '',
  outputName: '',
  outputFormat: 'geojson',
  showResult: true
})
const coordConvertFiles = ref([])
const crsTransformForm = reactive({
  inputMode: 'layer',
  layerId: '',
  sourceCrs: '',
  targetCrs: 'EPSG:4326',
  outputName: '',
  outputFormat: 'geojson',
  encoding: 'utf-8',
  showResult: true
})
const crsTransformFiles = ref([])
const analysisForm = reactive({
  inputLayerId: '',
  overlayLayerId: '',
  joinLayerId: '',
  layerIds: [],
  distance: 1000,
  units: 'meters',
  dissolve: false,
  predicate: 'intersects',
  joinMode: 'first',
  dissolveField: '',
  extentMode: 'layer',
  extentLayerId: '',
  bbox: '',
  selectedBbox: '',
  rows: 10,
  cols: 10,
  cellWidth: 1000,
  cellHeight: 1000,
  gridMode: 'rows-cols',
  travelMode: 'distance',
  speedKmh: 40,
  outputName: '',
  outputFormat: 'geojson',
  encoding: 'utf-8',
  targetCrs: 'EPSG:4326',
  showResult: true
})
const analysisSourceModes = reactive({
  input: 'layer',
  overlay: 'layer',
  join: 'layer',
  extent: 'layer',
  merge: 'layer'
})
const analysisSourceFiles = reactive({
  input: [],
  overlay: [],
  join: [],
  extent: [],
  merge: []
})
const downloadForm = reactive({
  rangeMode: 'viewport',
  bbox: '',
  selectedBbox: '',
  outputName: '',
  outputFormat: 'geojson',
  encoding: 'utf-8',
  showResult: true
})
const maxOsmDownloadAreaKm2 = 2000
const osmDownloadForm = reactive({
  featureTypes: ['roads', 'buildings', 'poi'],
  customTags: '',
  timeout: 25,
  previewLimit: 3000
})
const amapPoiForm = reactive({
  key: typeof window !== 'undefined' ? window.localStorage.getItem('gis-tools.amapPoiKey.v1') || '' : '',
  keywords: '',
  types: '',
  city: '',
  cityLimit: false,
  pageSize: 25,
  maxPages: 3,
  outputCoord: 'wgs84'
})
const analysisTargetKeyword = ref('')
const analysisTargetReferences = ref([])
const analysisTargetReferenceLoading = ref(false)
let analysisTargetReferenceRequestId = 0
const visualizationForm = reactive({
  layerId: '',
  outputName: '',
  weightField: '',
  numericField: '',
  categoryField: '',
  startLngField: '',
  startLatField: '',
  endLngField: '',
  endLatField: '',
  radius: 34,
  intensity: 1,
  clusterRadius: 56,
  opacity: 0.78,
  lineWidth: 3,
  colorRamp: 'warm'
})
const visualOverlayRecords = ref([])
const createLayerForm = reactive({
  name: '',
  geometryType: 'Point',
  fields: [
    { name: 'name', type: 'string' }
  ]
})
const fieldTypeOptions = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'integer', label: '整数' },
  { value: 'boolean', label: '布尔' },
  { value: 'date', label: '日期' }
]
const geometryTypeOptions = [
  { value: 'Point', label: '点图层' },
  { value: 'LineString', label: '线图层' },
  { value: 'Polygon', label: '面图层' }
]
const coordConvertOptions = [
  { value: 'bd09-to-gcj02', label: 'BD09 to GCJ02', from: 'BD09', to: 'GCJ02' },
  { value: 'bd09-to-wgs84', label: 'BD09 to WGS', from: 'BD09', to: 'WGS84' },
  { value: 'gcj02-to-bd09', label: 'GCJ02 to BD09', from: 'GCJ02', to: 'BD09' },
  { value: 'gcj02-to-wgs84', label: 'GCJ02 to WGS', from: 'GCJ02', to: 'WGS84' },
  { value: 'wgs84-to-bd09', label: 'WGS to BD09', from: 'WGS84', to: 'BD09' },
  { value: 'wgs84-to-gcj02', label: 'WGS to GCJ02', from: 'WGS84', to: 'GCJ02' }
]
const exportFormatOptions = outputFormatOptions
const coordOutputFormatOptions = outputFormatOptions
const exportEncodingOptions = outputEncodingOptions
const distanceUnitOptions = [
  { value: 'meters', label: '米' },
  { value: 'kilometers', label: '千米' },
  { value: 'miles', label: '英里' }
]
const spatialPredicateOptions = [
  { value: 'intersects', label: '相交' },
  { value: 'contains', label: '连接要素包含目标' },
  { value: 'within', label: '目标包含连接要素' }
]
const analysisVectorAccept = '.geojson,.json,.shp,.dbf,.prj,application/geo+json,application/json'

const toolDefinitions = {
  'local-vector-import': {
    title: '本地矢量文件导入',
    subtitle: '选择 GeoJSON 或 Shapefile 文件，解析后直接加入当前地图图层。'
  },
  'csv-import': {
    title: 'CSV 坐标导入',
    subtitle: '选择 CSV 文件，指定 X/Y 字段后生成点图层。'
  },
  'cad-import': {
    title: 'CAD 数据导入',
    subtitle: '选择 DXF 文件并指定源坐标系，转换后直接加入当前地图图层。'
  },
  'create-layer': {
    title: '新建图层',
    subtitle: '创建空白点、线、面 GeoJSON 图层，并默认进入编辑状态。'
  },
  mapshaper: {
    title: 'mapshaper',
    subtitle: '使用已集成的 mapshaper 工具进行导入、简化和导出。'
  },
  'coord-convert': {
    title: 'China Coord Convert',
    subtitle: 'WGS84、GCJ02（火星坐标）和 BD09（百度坐标）之间互转。'
  },
  'crs-transform': {
    title: '坐标转换',
    subtitle: '选择图层或上传数据，按输入/输出坐标系转换并导出结果。'
  },
  'buffer-analysis': {
    title: '缓冲区生成',
    subtitle: '选择点、线、面图层并设置距离生成缓冲区结果。'
  },
  'spatial-join': {
    title: '空间连接',
    subtitle: '选择目标图层和连接图层，按空间关系合并属性。'
  },
  'layer-intersection': {
    title: '图层求交',
    subtitle: '选择两个图层生成相交区域，并保留字段来源前缀。'
  },
  'layer-clip': {
    title: '图层裁剪',
    subtitle: '使用面图层裁剪目标图层，输出落在裁剪范围内的部分。'
  },
  'layer-merge': {
    title: '图层合并',
    subtitle: '选择多个图层追加合并为一个结果图层。'
  },
  'feature-merge': {
    title: '要素融合',
    subtitle: '融合面要素；融合字段留空时全部融合，选择字段时按字段值分组融合。'
  },
  'accessibility-analysis': {
    title: '可达性分析',
    subtitle: '按距离或时间阈值生成简化服务范围。'
  },
  fishnet: {
    title: '渔网生成',
    subtitle: '按范围、行列或网格尺寸生成规则网格。'
  },
  'osm-download': {
    title: 'OSM 数据下载',
    subtitle: '按当前视窗、BBox 或地图框选范围，通过 Overpass 下载 OSM 矢量数据。'
  },
  'amap-poi-download': {
    title: '高德 POI 下载',
    subtitle: '读取本地保存的高德 Key，按关键词、类型、城市或范围分页下载 POI。'
  },
  heatmap: {
    title: '热力图',
    subtitle: '选择点图层和权重字段生成密度热力效果。'
  },
  'flow-map': {
    title: '流线图',
    subtitle: '选择 OD 坐标字段，将属性表中的起终点绘制为流线效果。'
  },
  'cluster-map': {
    title: '聚合点',
    subtitle: '选择点图层生成地图聚合点和数量标注。'
  },
  'graduated-point': {
    title: '分级点图',
    subtitle: '按数值字段控制点大小和颜色，快速查看点要素强度分布。'
  },
  'choropleth-map': {
    title: '面分级图',
    subtitle: '按数值字段对面图层进行分级设色渲染。'
  }
}
const analysisToolIds = [
  'buffer-analysis',
  'spatial-join',
  'layer-intersection',
  'layer-clip',
  'layer-merge',
  'feature-merge',
  'accessibility-analysis',
  'fishnet'
]
const downloadToolIds = ['osm-download', 'amap-poi-download']
const visualizationToolIds = ['heatmap', 'flow-map', 'cluster-map', 'graduated-point', 'choropleth-map']
const osmFeatureTypeOptions = [
  { value: 'roads', label: '道路' },
  { value: 'buildings', label: '建筑' },
  { value: 'poi', label: 'POI' },
  { value: 'water', label: '水系' },
  { value: 'landuse', label: '土地利用' },
  { value: 'transport', label: '交通设施' },
  { value: 'boundary', label: '行政边界' }
]
const downloadRangeModeOptions = [
  { value: 'viewport', label: '当前视窗' },
  { value: 'bbox', label: '手动 BBox' },
  { value: 'select', label: '地图框选' },
  { value: 'city', label: '城市检索' }
]
const amapOutputCoordOptions = [
  { value: 'wgs84', label: 'WGS84 / EPSG:4326' },
  { value: 'gcj02', label: 'GCJ02 / 高德原始坐标' }
]
const visualizationColorRamps = [
  { value: 'warm', label: '暖色' },
  { value: 'cool', label: '冷色' },
  { value: 'forest', label: '绿蓝' },
  { value: 'fire', label: '火焰' }
]

const activeToolMeta = computed(() => toolDefinitions[activeTool.value] || {
  title: '工具',
  subtitle: '该工具待接入。'
})
const vectorSummary = computed(() => {
  if (!vectorFiles.value.length) return '未选择文件'
  return vectorFiles.value.map((file) => file.name).join(' / ')
})
const cadSummary = computed(() => {
  if (!cadFiles.value.length) return '未选择文件'
  return cadFiles.value.map((file) => file.name).join(' / ')
})
const csvGeometryReady = computed(() => {
  if (!csvFile.value || !csvForm.sourceCrs) return false
  if (csvForm.geometryMode === 'wkt') return Boolean(csvForm.wktField)
  return Boolean(csvForm.xField && csvForm.yField)
})
const selectedCsvSpatialReference = computed(() => {
  return findCachedSpatialReference(csvForm.sourceCrs)
})
const csvPreviewColumns = computed(() => csvColumns.value)
const csvPreviewStatusText = computed(() => {
  if (!csvFile.value) return '等待文件'
  if (!csvColumns.value.length) return '未解析到字段'
  return `${csvPreviewRows.value.length} 行预览 / ${csvColumns.value.length} 个字段`
})
const selectedCadSpatialReference = computed(() => {
  return findCachedSpatialReference(cadForm.sourceCrs)
})
const editingLayerFields = computed(() => Array.isArray(editingLayer.value?.fields) ? editingLayer.value.fields : [])
const createLayerReady = computed(() => {
  return Boolean(createLayerForm.name.trim())
    && createLayerForm.fields.every((field) => field.name.trim())
})
const coordConvertLayers = computed(() => resourceRef.value?.getDataLayers?.() || [])
const coordConvertMeta = computed(() => {
  return coordConvertOptions.find((item) => item.value === coordConvertForm.direction) || coordConvertOptions[0]
})
const coordConvertReady = computed(() => {
  if (!coordConvertForm.direction) return false
  if (coordConvertForm.inputMode === 'upload') return Boolean(coordConvertFiles.value.length)
  return Boolean(coordConvertForm.layerId)
})
const selectedCrsTransformSourceReference = computed(() => {
  return findCachedSpatialReference(crsTransformForm.sourceCrs)
})
const selectedCrsTransformTargetReference = computed(() => {
  return findCachedSpatialReference(crsTransformForm.targetCrs)
})
const crsTransformReady = computed(() => {
  if (!crsTransformForm.sourceCrs || !crsTransformForm.targetCrs) return false
  if (crsTransformForm.inputMode === 'upload') return Boolean(crsTransformFiles.value.length)
  return Boolean(crsTransformForm.layerId)
})
const analysisLayers = computed(() => coordConvertLayers.value)
const analysisPolygonLayers = computed(() => analysisLayers.value.filter((layer) => isPolygonLayer(layer)))
const selectedAnalysisLayer = computed(() => {
  if (analysisSourceModes.input !== 'layer') return null
  return resourceRef.value?.getLayerById?.(analysisForm.inputLayerId) || null
})
const selectedAnalysisLayerFields = computed(() => getLayerFieldNames(selectedAnalysisLayer.value))
const analysisUploadSummaries = computed(() => {
  return Object.fromEntries(Object.entries(analysisSourceFiles).map(([key, files]) => [key, formatAnalysisFilesSummary(files)]))
})
const selectedAnalysisTargetReference = computed(() => findCachedSpatialReference(analysisForm.targetCrs))
const analysisInputReady = computed(() => isAnalysisSourceReady('input'))
const analysisOverlayReady = computed(() => isAnalysisSourceReady('overlay'))
const analysisJoinReady = computed(() => isAnalysisSourceReady('join'))
const analysisExtentReady = computed(() => {
  if (analysisForm.extentMode === 'bbox') return Boolean(parseBboxText(analysisForm.bbox))
  if (analysisForm.extentMode === 'viewport') return true
  if (analysisForm.extentMode === 'select') return Boolean(parseBboxText(analysisForm.selectedBbox))
  return isAnalysisSourceReady('extent')
})
const analysisMergeReady = computed(() => {
  if (analysisSourceModes.merge === 'upload') return countAnalysisUploadDatasets(analysisSourceFiles.merge) >= 2
  return analysisForm.layerIds.length >= 2
})
const analysisReady = computed(() => {
  if (!analysisToolIds.includes(activeTool.value)) return false
  if (activeTool.value === 'buffer-analysis') return analysisInputReady.value && Number(analysisForm.distance) > 0
  if (activeTool.value === 'spatial-join') return analysisInputReady.value && analysisJoinReady.value && analysisForm.predicate
  if (activeTool.value === 'layer-intersection' || activeTool.value === 'layer-clip') return analysisInputReady.value && analysisOverlayReady.value
  if (activeTool.value === 'layer-merge') return analysisMergeReady.value && Boolean(analysisForm.targetCrs)
  if (activeTool.value === 'feature-merge') return analysisInputReady.value
  if (activeTool.value === 'accessibility-analysis') return analysisInputReady.value && Number(analysisForm.distance) > 0
  if (activeTool.value === 'fishnet') {
    return analysisExtentReady.value
      && (analysisForm.gridMode === 'rows-cols'
        ? Number(analysisForm.rows) > 0 && Number(analysisForm.cols) > 0
        : Number(analysisForm.cellWidth) > 0 && Number(analysisForm.cellHeight) > 0)
  }
  return false
})
const downloadReady = computed(() => {
  if (!downloadToolIds.includes(activeTool.value)) return false
  if (downloadForm.rangeMode === 'bbox' && !parseBboxText(downloadForm.bbox)) return false
  if (downloadForm.rangeMode === 'select' && !parseBboxText(downloadForm.selectedBbox)) return false
  if (activeTool.value === 'osm-download') return osmDownloadForm.featureTypes.length > 0 || Boolean(osmDownloadForm.customTags.trim())
  if (activeTool.value === 'amap-poi-download') {
    return Boolean(amapPoiForm.key.trim()) && Boolean(amapPoiForm.keywords.trim() || amapPoiForm.types.trim())
  }
  return false
})
const visualizationLayers = computed(() => {
  if (activeTool.value === 'choropleth-map') return analysisLayers.value.filter((layer) => isPolygonLayer(layer))
  if (['heatmap', 'cluster-map', 'graduated-point'].includes(activeTool.value)) {
    return analysisLayers.value.filter((layer) => isPointLayer(layer))
  }
  return analysisLayers.value
})
const selectedVisualizationLayer = computed(() => {
  return resourceRef.value?.getLayerById?.(visualizationForm.layerId) || null
})
const selectedVisualizationFields = computed(() => getLayerFieldNames(selectedVisualizationLayer.value))
const selectedVisualizationNumericFields = computed(() => getLayerNumericFieldNames(selectedVisualizationLayer.value))
const visualizationReady = computed(() => {
  if (!visualizationToolIds.includes(activeTool.value)) return false
  if (!visualizationForm.layerId) return false
  if (activeTool.value === 'flow-map') {
    return Boolean(
      visualizationForm.startLngField
      && visualizationForm.startLatField
      && visualizationForm.endLngField
      && visualizationForm.endLatField
    )
  }
  if (['graduated-point', 'choropleth-map'].includes(activeTool.value)) return Boolean(visualizationForm.numericField)
  return true
})
const genericToolActive = computed(() => {
  return activeTool.value
    && !['local-vector-import', 'csv-import', 'cad-import', 'create-layer', 'mapshaper', 'coord-convert', 'crs-transform', ...analysisToolIds, ...downloadToolIds, ...visualizationToolIds].includes(activeTool.value)
})
const toolDialogStyle = computed(() => {
  if (toolDialogPosition.x === null || toolDialogPosition.y === null) return {}
  return {
    left: `${toolDialogPosition.x}px`,
    top: `${toolDialogPosition.y}px`
  }
})

function showAppToast(message, type = 'success') {
  window.clearTimeout(appToastTimer)
  appToast.message = message
  appToast.type = type
  appToast.visible = true
  appToastTimer = window.setTimeout(() => {
    appToast.visible = false
  }, 3200)
}

function resetToolDialogWindow() {
  toolDialogCollapsed.value = false
  toolDialogPosition.x = null
  toolDialogPosition.y = null
  endToolDialogDrag(null, true)
}

function getDialogStartPosition() {
  if (toolDialogPosition.x !== null && toolDialogPosition.y !== null) {
    return {
      x: toolDialogPosition.x,
      y: toolDialogPosition.y
    }
  }

  const width = activeTool.value === 'mapshaper' || activeTool.value === 'csv-import' ? Math.min(1180, window.innerWidth - 44) : Math.min(720, window.innerWidth - 44)
  const height = activeTool.value === 'mapshaper' || activeTool.value === 'csv-import' ? window.innerHeight - 44 : Math.min(680, window.innerHeight - 44)
  return {
    x: Math.max(12, (window.innerWidth - width) / 2),
    y: Math.max(12, (window.innerHeight - height) / 2)
  }
}

function clampToolDialogPosition(x, y) {
  const margin = 12
  const maxX = Math.max(margin, window.innerWidth - 220)
  const maxY = Math.max(margin, window.innerHeight - 44)
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY)
  }
}

function startToolDialogDrag(event) {
  if (event.button !== 0 || toolBusy.value) return
  if (event.target?.closest?.('button,input,select,textarea,a,label')) return

  const position = getDialogStartPosition()
  toolDialogDragState.dragging = true
  toolDialogDragging.value = true
  toolDialogDragState.pointerId = event.pointerId
  toolDialogDragState.startX = event.clientX
  toolDialogDragState.startY = event.clientY
  toolDialogDragState.startDialogX = position.x
  toolDialogDragState.startDialogY = position.y
  toolDialogPosition.x = position.x
  toolDialogPosition.y = position.y

  event.currentTarget.setPointerCapture?.(event.pointerId)
  document.body.classList.add('tool-dialog-dragging')
}

function moveToolDialog(event) {
  if (!toolDialogDragState.dragging || event.pointerId !== toolDialogDragState.pointerId) return
  const next = clampToolDialogPosition(
    toolDialogDragState.startDialogX + event.clientX - toolDialogDragState.startX,
    toolDialogDragState.startDialogY + event.clientY - toolDialogDragState.startY
  )
  toolDialogPosition.x = next.x
  toolDialogPosition.y = next.y
}

function endToolDialogDrag(event = null, force = false) {
  if (!force && event && toolDialogDragState.pointerId !== null && event.pointerId !== toolDialogDragState.pointerId) return
  toolDialogDragState.dragging = false
  toolDialogDragging.value = false
  toolDialogDragState.pointerId = null
  document.body.classList.remove('tool-dialog-dragging')
}

function parkToolDialogForMapPicking() {
  endToolDialogDrag(null, true)
  toolDialogPosition.x = null
  toolDialogPosition.y = null
  toolDialogCollapsed.value = true
}

function toggleToolDialogCollapsed() {
  toolDialogCollapsed.value = !toolDialogCollapsed.value
}

onBeforeUnmount(() => {
  window.clearTimeout(appToastTimer)
  endToolDialogDrag()
})

async function toggleLeftPanel() {
  leftPanelCollapsed.value = !leftPanelCollapsed.value
  await nextTick()
  requestAnimationFrame(() => {
    mapRef.value?.resizeMap()
  })
}

async function ensureResourcePanel() {
  if (leftPanelCollapsed.value) {
    leftPanelCollapsed.value = false
    await nextTick()
    requestAnimationFrame(() => {
      mapRef.value?.resizeMap()
    })
  }

  return resourceRef.value
}

function handleSearch(coords) {
  if (mapRef.value) {
    mapRef.value.handleSearch(coords)
  }
}

function handleMapClick(coords) {
  emit('map-click', coords)
}

function handleAddLayer(layer) {
  mapRef.value?.addDataLayer(layer)
}

function handleToggleLayer(payload) {
  mapRef.value?.setDataLayerVisibility(payload.id, payload.visible)
}

function handleUpdateLayerStyle(payload) {
  mapRef.value?.setDataLayerStyle(payload)
}

function handleSelectFeature(payload) {
  mapRef.value?.setSelectedFeature(payload)
  if (payload?.featureIndex != null) {
    mapRef.value?.zoomToSelectedFeature()
  }
}

function handleMapFeatureSelect(payload) {
  resourceRef.value?.handleMapFeatureSelect(payload)
}

function handleLayerUpdated(layer) {
  if (!layer?.id) return
  resourceRef.value?.updateLayerGeoJson(layer)
  mapRef.value?.addDataLayer(layer)
}

function handleRemoveLayer(layerId) {
  mapRef.value?.removeDataLayer(layerId)
  if (editingLayer.value?.id === layerId) {
    editingLayer.value = null
    editingDirty.value = false
    editingMode.value = 'select'
    mapRef.value?.cancelLayerEdit()
  }
}

function handleReorderLayer(layerIds) {
  mapRef.value?.reorderDataLayers(layerIds)
}

function handleTableDrop(payload) {
  resourceRef.value?.addDroppedSource(payload)
}

async function handleLayerExport(payload) {
  if (!payload?.layer?.geojson) return

  toolMessage.value = ''
  try {
    registerSpatialReferences(spatialReferenceCache.value)
    if (!spatialReferenceCache.value.length) {
      await loadSpatialReferences()
      registerSpatialReferences(spatialReferenceCache.value)
    }

    const sourceCrs = normalizeCrs(payload.layer.crs || payload.layer.sourceCrs || 'EPSG:4326') || 'EPSG:4326'
    const targetCrs = normalizeCrs(payload.targetCrs || sourceCrs) || sourceCrs
    await Promise.all([
      ensureSpatialReference(sourceCrs),
      ensureSpatialReference(targetCrs)
    ])
    registerSpatialReferences(spatialReferenceCache.value)
    const targetRef = findCachedSpatialReference(targetCrs)
    const features = payload.scope === 'selected'
      ? [payload.layer.geojson.features?.[payload.featureIndex]].filter(Boolean)
      : payload.layer.geojson.features || []
    const inputGeoJson = {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: sourceCrs } },
      features: cloneGeoJson({ type: 'FeatureCollection', features }).features
    }
    const outputGeoJson = sourceCrs === targetCrs || (isWgs84(sourceCrs) && isWgs84(targetCrs))
      ? { ...inputGeoJson, crs: { type: 'name', properties: { name: targetCrs } } }
      : transformGeoJsonCrs(inputGeoJson, sourceCrs, targetCrs, {
          spatialReferences: spatialReferenceCache.value,
          sourceReference: findCachedSpatialReference(sourceCrs),
          targetReference: targetRef
        })

    await saveGeoJsonOutput({
      geojson: outputGeoJson,
      outputName: payload.outputName || payload.layer.name,
      outputFormat: payload.outputFormat,
      encoding: payload.encoding,
      crs: targetCrs,
      spatialReference: targetRef
    })
  } catch (error) {
    if (error?.name === 'AbortError') return
    window.alert(error.message || '图层导出失败')
  }
}

function addCreateField() {
  createLayerForm.fields.push({ name: '', type: 'string' })
}

function removeCreateField(index) {
  createLayerForm.fields.splice(index, 1)
  if (!createLayerForm.fields.length) {
    createLayerForm.fields.push({ name: 'name', type: 'string' })
  }
}

function normalizeCreateLayerFields() {
  const used = new Set()
  return createLayerForm.fields
    .map((field) => ({
      name: field.name.trim(),
      type: field.type || 'string'
    }))
    .filter((field) => field.name)
    .map((field) => {
      let nextName = field.name
      let suffix = 2
      while (used.has(nextName)) {
        nextName = `${field.name}_${suffix}`
        suffix += 1
      }
      used.add(nextName)
      return { ...field, name: nextName }
    })
}

function getGeometryTypeLabel(type) {
  return geometryTypeOptions.find((item) => item.value === type)?.label || type
}

function getDrawModeForLayer(layer) {
  const type = String(layer?.geometryType || '').toUpperCase()
  if (type.includes('POLYGON')) return 'draw_polygon'
  if (type.includes('LINE')) return 'draw_line_string'
  return 'draw_point'
}

async function createEditableLayer() {
  if (!createLayerReady.value) return

  const fields = normalizeCreateLayerFields()
  const panel = await ensureResourcePanel()
  const layer = panel?.addExternalLayer({
    name: createLayerForm.name.trim(),
    subtitle: `新建图层 / ${getGeometryTypeLabel(createLayerForm.geometryType)} / EPSG:4326`,
    sourceKind: 'created',
    sourceCrs: 'EPSG:4326',
    crs: 'EPSG:4326',
    geometryType: createLayerForm.geometryType,
    editable: true,
    fields,
    geojson: {
      type: 'FeatureCollection',
      features: []
    }
  })

  if (layer) {
    await nextTick()
    await startLayerEdit(layer)
  }

  resetCreateLayerForm()
  closeToolDialog()
}

async function startLayerEdit(layer) {
  const target = layer || resourceRef.value?.getLayerById?.(layer?.id)
  if (!target || target.kind === 'basemap') return

  if (editingLayer.value?.id && editingLayer.value.id !== target.id) {
    const canSwitch = await requestExitEditing(true)
    if (!canSwitch) return
  }

  editingLayer.value = {
    ...target,
    fields: Array.isArray(target.fields) ? target.fields : []
  }
  editingDirty.value = false
  editingMode.value = 'select'
  await nextTick()
  mapRef.value?.startLayerEdit(editingLayer.value)
  resourceRef.value?.setEditingLayer?.(editingLayer.value.id)
}

async function handleRequestLayerEdit(layer) {
  await startLayerEdit(layer)
}

async function requestExitEditing(allowCancel = false) {
  if (!editingLayer.value) return true

  if (editingDirty.value) {
    const shouldSave = window.confirm('当前图层还有未保存编辑记录，是否保存？点击“确定”保存，点击“取消”放弃并回到原始状态。')
    if (shouldSave) {
      saveLayerEditing()
      mapRef.value?.cancelLayerEdit()
      editingLayer.value = null
      editingDirty.value = false
      editingMode.value = 'select'
      resourceRef.value?.setEditingLayer?.('')
      return true
    }

    mapRef.value?.revertLayerEdit()
    const originalLayer = mapRef.value?.getEditingOriginalLayer?.()
    if (originalLayer) {
      handleLayerUpdated(originalLayer)
    }
    mapRef.value?.cancelLayerEdit()
  } else if (allowCancel === true) {
    mapRef.value?.cancelLayerEdit()
  } else {
    mapRef.value?.cancelLayerEdit()
  }

  editingLayer.value = null
  editingDirty.value = false
  editingMode.value = 'select'
  resourceRef.value?.setEditingLayer?.('')
  return true
}

async function handleRequestLayerEditExit() {
  await requestExitEditing()
}

function setEditingMode(mode) {
  if (!editingLayer.value) return
  if (mode === 'vertex' && !mapRef.value?.hasSelectedEditingFeature?.()) {
    window.alert('请先用“选择”工具选中一个要素，再编辑节点。')
    return
  }
  editingMode.value = mode
  if (mode === 'add') {
    mapRef.value?.setEditMode(getDrawModeForLayer(editingLayer.value))
    return
  }
  if (mode === 'vertex') {
    const changed = mapRef.value?.setEditMode('direct_select')
    if (!changed) {
      editingMode.value = 'select'
    }
    return
  }
  mapRef.value?.setEditMode('simple_select')
}

function deleteSelectedEditingFeature() {
  mapRef.value?.deleteSelectedEditingFeature()
}

function undoLayerEditing() {
  mapRef.value?.undoLayerEdit()
}

function saveLayerEditing() {
  if (!editingLayer.value) return
  const layer = mapRef.value?.saveLayerEdit()
  if (layer) {
    handleLayerUpdated(layer)
    editingLayer.value = layer
  }
  editingDirty.value = false
  resourceRef.value?.setEditingLayer?.(editingLayer.value.id)
}

function handleEditLayerChange(payload) {
  if (!payload?.layer) return
  editingLayer.value = {
    ...payload.layer,
    fields: editingLayer.value?.fields || payload.layer.fields || []
  }
  editingDirty.value = Boolean(payload.dirty)
  handleLayerUpdated(editingLayer.value)
}

function normalizeAttributeValue(value, type) {
  if (value === '' || value == null) return null
  if (type === 'integer') return Number.parseInt(value, 10)
  if (type === 'number') return Number.parseFloat(value)
  if (type === 'boolean') return Boolean(value)
  return value
}

function resetAttributeValues(feature = null) {
  Object.keys(editingAttributeValues).forEach((key) => {
    delete editingAttributeValues[key]
  })
  editingLayerFields.value.forEach((field) => {
    editingAttributeValues[field.name] = feature?.properties?.[field.name] ?? (field.type === 'boolean' ? false : '')
  })
}

function handleEditFeatureCreated(payload) {
  pendingFeature.value = payload?.feature || null
  resetAttributeValues(pendingFeature.value)
  attributeModalVisible.value = true
}

function savePendingFeatureAttributes() {
  if (!pendingFeature.value) {
    attributeModalVisible.value = false
    return
  }

  const properties = {}
  editingLayerFields.value.forEach((field) => {
    properties[field.name] = normalizeAttributeValue(editingAttributeValues[field.name], field.type)
  })
  mapRef.value?.updateEditingFeatureProperties(pendingFeature.value.id, properties)
  pendingFeature.value = null
  attributeModalVisible.value = false
}

function skipPendingFeatureAttributes() {
  pendingFeature.value = null
  attributeModalVisible.value = false
}

function resetCreateLayerForm() {
  createLayerForm.name = ''
  createLayerForm.geometryType = 'Point'
  createLayerForm.fields.splice(0, createLayerForm.fields.length, { name: 'name', type: 'string' })
}

function getLayerFieldNames(layer) {
  if (!layer?.geojson?.features) return []
  const fields = new Set()
  layer.geojson.features.slice(0, 200).forEach((feature) => {
    Object.keys(feature.properties || {}).forEach((key) => fields.add(key))
  })
  return Array.from(fields)
}

function isPolygonLayer(layer) {
  const type = String(layer?.geometryType || inferGeometryType(layer?.geojson || { features: [] })).toUpperCase()
  return type.includes('POLYGON') || (layer?.geojson?.features || []).some((feature) => String(feature.geometry?.type || '').includes('Polygon'))
}

function isPointLayer(layer) {
  const type = String(layer?.geometryType || inferGeometryType(layer?.geojson || { features: [] })).toUpperCase()
  return type.includes('POINT') || (layer?.geojson?.features || []).some((feature) => String(feature.geometry?.type || '').includes('Point'))
}

function getLayerNumericFieldNames(layer) {
  if (!layer?.geojson?.features) return []
  const fields = new Set()
  ;(layer.geojson.features || []).slice(0, 500).forEach((feature) => {
    Object.entries(feature.properties || {}).forEach(([key, value]) => {
      if (key.startsWith('__')) return
      const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''))
      if (Number.isFinite(numeric)) fields.add(key)
    })
  })
  return Array.from(fields)
}

function getAnalysisSourceLayerId(key) {
  if (key === 'overlay') return analysisForm.overlayLayerId
  if (key === 'join') return analysisForm.joinLayerId
  if (key === 'extent') return analysisForm.extentLayerId
  return analysisForm.inputLayerId
}

function getAnalysisSourceLabel(key) {
  if (key === 'join') return '连接图层'
  if (key === 'overlay') return activeTool.value === 'layer-clip' ? '裁剪面图层' : '叠加图层'
  if (key === 'extent') return '范围图层'
  if (key === 'merge') return '待合并图层'
  return activeTool.value === 'accessibility-analysis' ? '起点图层' : '输入图层'
}

function isAnalysisSourceReady(key) {
  if (analysisSourceModes[key] === 'upload') return countAnalysisUploadDatasets(analysisSourceFiles[key]) > 0
  return Boolean(getAnalysisSourceLayerId(key))
}

function formatAnalysisFilesSummary(files = []) {
  const fileList = Array.from(files || [])
  if (!fileList.length) return '未选择文件'
  const datasetCount = countAnalysisUploadDatasets(fileList)
  return `${datasetCount || fileList.length} 个数据集 / ${fileList.map((file) => file.name).join(' / ')}`
}

function getAnalysisFileBaseName(name) {
  return getFileBaseName(name).toLowerCase()
}

function groupAnalysisVectorFiles(files = []) {
  const fileList = Array.from(files || [])
  const groups = []
  fileList
    .filter((file) => /\.(geojson|json)$/i.test(file.name))
    .forEach((file) => {
      groups.push({
        name: getFileBaseName(file.name),
        files: [file]
      })
    })

  const shapefileGroups = new Map()
  fileList
    .filter((file) => /\.(shp|dbf|prj)$/i.test(file.name))
    .forEach((file) => {
      const baseName = getAnalysisFileBaseName(file.name)
      if (!shapefileGroups.has(baseName)) {
        shapefileGroups.set(baseName, {
          name: getFileBaseName(file.name),
          files: []
        })
      }
      shapefileGroups.get(baseName).files.push(file)
    })

  shapefileGroups.forEach((group) => {
    if (group.files.some((file) => /\.shp$/i.test(file.name))) groups.push(group)
  })

  return groups
}

function countAnalysisUploadDatasets(files = []) {
  return groupAnalysisVectorFiles(files).length
}

function handleAnalysisSourceFiles(key, event) {
  analysisSourceFiles[key] = Array.from(event.target.files || [])
  if (key === 'merge' && analysisSourceFiles[key].length) {
    analysisSourceModes.merge = 'upload'
  } else if (analysisSourceFiles[key].length) {
    analysisSourceModes[key] = 'upload'
  }
  toolMessage.value = ''
}

function clearAnalysisSourceFiles() {
  Object.keys(analysisSourceFiles).forEach((key) => {
    analysisSourceFiles[key] = []
  })
}

async function readAnalysisUploadDatasets(key, label = '图层') {
  const groups = groupAnalysisVectorFiles(analysisSourceFiles[key])
  if (!groups.length) throw new Error(`请选择${label}本地文件`)

  const datasets = []
  for (const group of groups) {
    const input = await readVectorFilesAsGeoJson(group.files, { encoding: 'utf-8' })
    const sourceCrs = normalizeCrs(input.sourceCrs)
    if (sourceCrs) await ensureSpatialReference(sourceCrs)
    registerSpatialReferences(spatialReferenceCache.value)
    const transformed = transformGeoJsonIfNeeded(input.geojson, sourceCrs)
    const geojson = cloneGeoJson(transformed.geojson)
    datasets.push({
      id: `upload-${key}-${datasets.length + 1}`,
      name: input.name || group.name || label,
      sourceCrs,
      crs: transformed.needsTransform || isWgs84(sourceCrs) ? 'EPSG:4326' : sourceCrs,
      geometryType: inferGeometryType(geojson),
      geojson
    })
  }
  return datasets
}

function combineAnalysisDatasets(datasets, label = '图层') {
  if (!datasets.length) throw new Error(`请选择${label}`)
  if (datasets.length === 1) return datasets[0]

  return {
    id: `combined-${Date.now()}`,
    name: datasets.map((dataset) => dataset.name).join(' + '),
    sourceCrs: 'EPSG:4326',
    crs: 'EPSG:4326',
    geometryType: 'GEOMETRY',
    geojson: {
      type: 'FeatureCollection',
      features: datasets.flatMap((dataset) => {
        return (dataset.geojson.features || []).map((feature, index) => ({
          ...feature,
          properties: {
            ...(feature.properties || {}),
            source_layer: dataset.name,
            source_index: index + 1
          }
        }))
      })
    }
  }
}

async function getAnalysisSourceDataset(key, label = getAnalysisSourceLabel(key)) {
  if (analysisSourceModes[key] === 'upload') {
    return combineAnalysisDatasets(await readAnalysisUploadDatasets(key, label), label)
  }

  const layer = getAnalysisLayer(getAnalysisSourceLayerId(key), label)
  const sourceCrs = getLayerSourceCrs(layer)
  if (sourceCrs) await ensureSpatialReference(sourceCrs)
  registerSpatialReferences(spatialReferenceCache.value)
  const transformed = transformGeoJsonIfNeeded(layer.geojson, sourceCrs)
  const geojson = cloneGeoJson(transformed.geojson)
  return {
    ...layer,
    sourceCrs,
    crs: transformed.needsTransform || isWgs84(sourceCrs) ? 'EPSG:4326' : sourceCrs,
    geojson
  }
}

async function getAnalysisMergeDatasets() {
  if (analysisSourceModes.merge === 'upload') {
    return readAnalysisUploadDatasets('merge', '待合并图层')
  }

  normalizeAnalysisLayerIds()
  return Promise.all(analysisForm.layerIds.map(async (id) => {
    const layer = getAnalysisLayer(id, '待合并图层')
    const sourceCrs = getLayerSourceCrs(layer)
    if (sourceCrs) await ensureSpatialReference(sourceCrs)
    registerSpatialReferences(spatialReferenceCache.value)
    const transformed = transformGeoJsonIfNeeded(layer.geojson, sourceCrs)
    const geojson = cloneGeoJson(transformed.geojson)
    return {
      ...layer,
      sourceCrs,
      crs: transformed.needsTransform || isWgs84(sourceCrs) ? 'EPSG:4326' : sourceCrs,
      geojson
    }
  }))
}

function prefixProperties(properties, prefix) {
  return Object.fromEntries(Object.entries(properties || {}).map(([key, value]) => [`${prefix}_${key}`, value]))
}

function normalizeAnalysisLayerIds() {
  analysisForm.layerIds = analysisForm.layerIds.filter((id) => analysisLayers.value.some((layer) => layer.id === id))
}

function resetAnalysisForm(action = activeTool.value) {
  const layers = analysisLayers.value
  const firstLayer = layers[0]
  const secondLayer = layers.find((layer) => layer.id !== firstLayer?.id)
  const firstPolygon = analysisPolygonLayers.value[0]

  Object.keys(analysisSourceModes).forEach((key) => {
    analysisSourceModes[key] = 'layer'
  })
  clearAnalysisSourceFiles()
  analysisForm.inputLayerId = firstLayer?.id || ''
  analysisForm.overlayLayerId = secondLayer?.id || firstPolygon?.id || ''
  analysisForm.joinLayerId = secondLayer?.id || firstPolygon?.id || ''
  analysisForm.layerIds = layers.slice(0, Math.min(2, layers.length)).map((layer) => layer.id)
  analysisForm.distance = action === 'accessibility-analysis' ? 5000 : 1000
  analysisForm.units = 'meters'
  analysisForm.dissolve = false
  analysisForm.predicate = 'intersects'
  analysisForm.joinMode = 'first'
  analysisForm.dissolveField = ''
  analysisForm.extentMode = 'layer'
  analysisForm.extentLayerId = firstLayer?.id || ''
  analysisForm.bbox = ''
  analysisForm.selectedBbox = ''
  analysisForm.rows = 10
  analysisForm.cols = 10
  analysisForm.cellWidth = 1000
  analysisForm.cellHeight = 1000
  analysisForm.gridMode = 'rows-cols'
  analysisForm.travelMode = 'distance'
  analysisForm.speedKmh = 40
  analysisForm.outputName = `${toolDefinitions[action]?.title || '分析结果'}_${new Date().toISOString().slice(0, 10)}`
  analysisForm.outputFormat = 'geojson'
  analysisForm.encoding = 'utf-8'
  analysisForm.targetCrs = 'EPSG:4326'
  analysisForm.showResult = true
  analysisTargetKeyword.value = ''
  analysisTargetReferences.value = []
}

function getAnalysisLayer(layerId, label = '图层') {
  const layer = resourceRef.value?.getLayerById?.(layerId)
  if (!layer?.geojson) throw new Error(`请选择${label}`)
  return layer
}

function getAnalysisOutputName(defaultName) {
  return analysisForm.outputName || `${defaultName}_${new Date().toISOString().slice(0, 10)}`
}

function getAnalysisTargetReferenceList() {
  const selected = findCachedSpatialReference(analysisForm.targetCrs)
  const merged = new Map()
  ;[selected, ...analysisTargetReferences.value].forEach((item) => {
    const code = normalizeSpatialReferenceCode(item?.code)
    if (code) merged.set(code, item)
  })
  return Array.from(merged.values())
}

async function loadAnalysisTargetReferences(keyword = analysisTargetKeyword.value) {
  const nextRequestId = analysisTargetReferenceRequestId + 1
  analysisTargetReferenceRequestId = nextRequestId
  analysisTargetReferenceLoading.value = true
  toolMessage.value = ''

  try {
    const items = await fetchSpatialReferences(keyword, 200)
    if (analysisTargetReferenceRequestId !== nextRequestId) return
    analysisTargetReferences.value = mergeSelectedSpatialReferences(items)
  } catch (error) {
    if (analysisTargetReferenceRequestId !== nextRequestId) return
    toolMessage.value = error.response?.data?.error || error.message || '坐标系列表加载失败'
    analysisTargetReferences.value = mergeSelectedSpatialReferences([])
  } finally {
    if (analysisTargetReferenceRequestId === nextRequestId) {
      analysisTargetReferenceLoading.value = false
    }
  }
}

function handleAnalysisTargetReferenceSearch(event) {
  analysisTargetKeyword.value = event.target.value
  loadAnalysisTargetReferences(analysisTargetKeyword.value)
}

async function selectAnalysisTargetReference(item) {
  if (!item?.code) return
  analysisForm.targetCrs = item.code
  analysisTargetKeyword.value = `${item.code} ${item.name || ''}`.trim()
  mergeSpatialReferences([item])
  registerSpatialReferences(spatialReferenceCache.value)
}

async function initializeAnalysisTargetReferences() {
  await ensureSpatialReference(analysisForm.targetCrs)
  await loadAnalysisTargetReferences(analysisTargetKeyword.value)
}

async function createAnalysisOutputGeoJson(displayGeoJson) {
  const targetCrs = normalizeCrs(analysisForm.targetCrs || 'EPSG:4326') || 'EPSG:4326'
  await ensureSpatialReference(targetCrs)
  registerSpatialReferences(spatialReferenceCache.value)

  const targetRef = findCachedSpatialReference(targetCrs)
  const sourceRef = findCachedSpatialReference('EPSG:4326') || { code: 'EPSG:4326', srText: getSpatialReferencePrj('EPSG:4326') }
  const outputGeoJson = isWgs84(targetCrs)
    ? {
        ...displayGeoJson,
        crs: { type: 'name', properties: { name: targetCrs } },
        features: (displayGeoJson.features || []).map((feature) => ({ ...feature }))
      }
    : transformGeoJsonCrs(displayGeoJson, 'EPSG:4326', targetCrs, {
        spatialReferences: spatialReferenceCache.value,
        sourceReference: sourceRef,
        targetReference: targetRef
      })

  return {
    outputGeoJson,
    targetCrs,
    targetRef
  }
}

function formatBboxText(bbox) {
  return (bbox || []).map((value) => Number(value).toFixed(6)).join(',')
}

function getBboxAreaKm2(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return 0
  const [west, south, east, north] = bbox.map((value) => Number(value))
  if ([west, south, east, north].some((value) => !Number.isFinite(value))) return 0
  const midLat = ((south + north) / 2) * Math.PI / 180
  const kmPerDegreeLat = 110.574
  const kmPerDegreeLng = 111.320 * Math.cos(midLat)
  return Math.max(0, east - west) * Math.max(0, kmPerDegreeLng) * Math.max(0, north - south) * kmPerDegreeLat
}

function getDownloadBbox() {
  if (downloadForm.rangeMode === 'city') return null
  if (downloadForm.rangeMode === 'bbox') {
    const bbox = parseBboxText(downloadForm.bbox)
    if (!bbox) throw new Error('请输入合法范围：minLon,minLat,maxLon,maxLat')
    return bbox
  }
  if (downloadForm.rangeMode === 'select') {
    const bbox = parseBboxText(downloadForm.selectedBbox)
    if (!bbox) throw new Error('请先在地图上框选下载范围')
    return bbox
  }
  const bbox = mapRef.value?.getViewportBbox?.()
  if (!bbox) throw new Error('无法读取当前地图视窗范围')
  return bbox
}

async function pickDownloadBboxFromMap() {
  if (pickingDownloadBbox.value) return
  if (!mapRef.value?.startBboxSelection) {
    toolMessage.value = '地图框选工具不可用'
    return
  }

  pickingDownloadBbox.value = true
  mapBboxPicking.value = true
  toolMessage.value = '请在地图上拖拽框选下载范围，按 Esc 可取消。'
  parkToolDialogForMapPicking()
  try {
    await nextTick()
    const bbox = await mapRef.value.startBboxSelection()
    downloadForm.rangeMode = 'select'
    downloadForm.selectedBbox = formatBboxText(bbox)
    const areaKm2 = getBboxAreaKm2(bbox)
    toolMessage.value = `框选范围已写入下载参数，面积约 ${Math.round(areaKm2)} 平方公里。确认后可点击“开始下载”。`
  } catch (error) {
    toolMessage.value = error.message || '框选范围已取消'
  } finally {
    pickingDownloadBbox.value = false
    mapBboxPicking.value = false
    toolDialogCollapsed.value = false
  }
}

function repickDownloadBboxFromMap() {
  downloadForm.selectedBbox = ''
  pickDownloadBboxFromMap()
}

async function pickFishnetBboxFromMap() {
  if (!mapRef.value?.startBboxSelection) {
    toolMessage.value = '地图框选工具不可用'
    return
  }

  toolMessage.value = '请在地图上拖拽框选渔网范围，按 Esc 可取消。'
  mapBboxPicking.value = true
  parkToolDialogForMapPicking()
  try {
    await nextTick()
    const bbox = await mapRef.value.startBboxSelection()
    analysisForm.extentMode = 'select'
    analysisForm.selectedBbox = formatBboxText(bbox)
    toolMessage.value = '框选范围已写入渔网参数。'
  } catch (error) {
    toolMessage.value = error.message || '框选范围已取消'
  } finally {
    mapBboxPicking.value = false
    toolDialogCollapsed.value = false
  }
}

async function addAnalysisResultLayer({ geojson, name, subtitle, geometryType }) {
  if (!geojson?.features?.length) {
    throw new Error('分析完成，但没有生成结果要素，请检查输入图层关系或参数。')
  }
  const panel = await ensureResourcePanel()
    panel?.addExternalLayer({
      name,
      subtitle,
      sourceKind: 'analysis',
      sourceCrs: 'EPSG:4326',
      crs: 'EPSG:4326',
      geometryType: geometryType || inferGeometryType(geojson),
      geojson
    })
  return geojson.features.length
}

function resetDownloadForm(action = activeTool.value) {
  downloadForm.rangeMode = action === 'amap-poi-download' ? 'city' : 'viewport'
  downloadForm.bbox = ''
  downloadForm.selectedBbox = ''
  downloadForm.outputName = `${toolDefinitions[action]?.title || '数据下载'}_${new Date().toISOString().slice(0, 10)}`
  downloadForm.outputFormat = 'geojson'
  downloadForm.encoding = 'utf-8'
  downloadForm.showResult = true
  osmDownloadForm.featureTypes = ['roads', 'buildings', 'poi']
  osmDownloadForm.customTags = ''
  osmDownloadForm.timeout = 25
  osmDownloadForm.previewLimit = 3000
  amapPoiForm.key = typeof window !== 'undefined' ? window.localStorage.getItem('gis-tools.amapPoiKey.v1') || amapPoiForm.key || '' : amapPoiForm.key
  amapPoiForm.keywords = ''
  amapPoiForm.types = ''
  amapPoiForm.city = ''
  amapPoiForm.cityLimit = false
  amapPoiForm.pageSize = 25
  amapPoiForm.maxPages = 3
  amapPoiForm.outputCoord = 'wgs84'
}

function getDownloadOutputName(defaultName) {
  return downloadForm.outputName || `${defaultName}_${new Date().toISOString().slice(0, 10)}`
}

function getApiErrorMessage(error, fallback) {
  const status = error?.response?.status
  const serverMessage = error?.response?.data?.error
  if (status === 404) {
    return `${fallback}：后端接口未找到，请确认后端服务已重启并加载最新路由。`
  }
  if (status === 500 && !serverMessage) {
    return `${fallback}：后端服务不可用或前端代理无法连接后端，请先启动/重启后端服务。`
  }
  return serverMessage || error?.message || fallback
}

async function ensureBackendAvailable() {
  try {
    await apiClient.get('/api/health')
  } catch (error) {
    throw new Error(getApiErrorMessage(error, '后端健康检查失败'))
  }
}

async function saveAndMaybeAddDownloadResult({ geojson, displayGeoJson = null, name, subtitle, sourceKind, sourceCrs = 'EPSG:4326', crs = 'EPSG:4326', displayCrs = 'EPSG:4326', saveHandle = null }) {
  if (!geojson?.features?.length) throw new Error('下载完成，但没有返回可用要素')
  if (downloadForm.outputFormat === 'shp' && crs === 'GCJ02') {
    throw new Error('GCJ02 没有标准 Shapefile .prj 定义；请改选 WGS84 输出，或使用 GeoJSON 保存高德原始坐标。')
  }
  const layerGeoJson = displayGeoJson || geojson
  const spatialReference = isWgs84(crs)
    ? { code: 'EPSG:4326', srText: getSpatialReferencePrj('EPSG:4326') }
    : null
  const savedName = await saveGeoJsonOutput({
    geojson: {
      ...geojson,
      crs: { type: 'name', properties: { name: crs } }
    },
    outputName: name,
    outputFormat: downloadForm.outputFormat,
    encoding: downloadForm.encoding,
    crs,
    spatialReference,
    saveHandle
  })

  if (downloadForm.showResult) {
    const panel = await ensureResourcePanel()
    panel?.addExternalLayer({
      name,
      subtitle: `${subtitle} / ${savedName}`,
      sourceKind,
      sourceCrs,
      crs: displayCrs,
      geometryType: inferGeometryType(layerGeoJson),
      geojson: layerGeoJson
    })
  }

  return savedName
}

function getOsmLayerStyle(layer) {
  const key = String(layer?.key || '').toLowerCase()
  const geometryType = String(layer?.geometryType || inferGeometryType(layer?.geojson || { features: [] })).toUpperCase()
  const styles = {
    buildings: {
      color: '#c2410c',
      fillColor: '#f97316',
      fillOpacity: 0.42,
      outlineColor: '#7c2d12',
      outlineWidth: 1.4,
      outlineOpacity: 0.95
    },
    poi: {
      color: '#d946ef',
      circleColor: '#d946ef',
      circleRadius: 7,
      circleOpacity: 0.95,
      circleStrokeColor: '#ffffff',
      circleStrokeWidth: 2.2
    },
    roads: {
      color: '#2563eb',
      lineColor: '#2563eb',
      lineWidth: 3.2,
      lineOpacity: 0.95,
      lineDash: 'solid'
    },
    water: {
      color: '#0284c7',
      lineColor: '#0284c7',
      lineWidth: 2.8,
      lineOpacity: 0.92
    },
    landuse: {
      color: '#65a30d',
      fillColor: '#84cc16',
      fillOpacity: 0.28,
      outlineColor: '#3f6212',
      outlineWidth: 1.2,
      outlineOpacity: 0.82
    },
    transport: {
      color: '#7c3aed',
      lineColor: '#7c3aed',
      lineWidth: 2.6,
      lineOpacity: 0.92,
      lineDash: 'dash'
    },
    boundary: {
      color: '#dc2626',
      fillColor: '#f87171',
      fillOpacity: 0.12,
      outlineColor: '#dc2626',
      outlineWidth: 2.2,
      outlineOpacity: 0.95,
      lineDash: 'dash'
    }
  }

  if (styles[key]) return styles[key]
  if (geometryType.includes('POINT')) {
    return {
      color: '#0891b2',
      circleColor: '#0891b2',
      circleRadius: 6,
      circleOpacity: 0.92,
      circleStrokeColor: '#ffffff',
      circleStrokeWidth: 2
    }
  }
  if (geometryType.includes('LINE')) {
    return {
      color: '#0f766e',
      lineColor: '#0f766e',
      lineWidth: 2.8,
      lineOpacity: 0.92
    }
  }
  if (geometryType.includes('POLYGON')) {
    return {
      color: '#16a34a',
      fillColor: '#22c55e',
      fillOpacity: 0.26,
      outlineColor: '#15803d',
      outlineWidth: 1.2,
      outlineOpacity: 0.85
    }
  }
  return null
}

function getOsmLayerInsertWeight(layer) {
  const key = String(layer?.key || '').toLowerCase()
  if (['buildings', 'landuse', 'boundary'].includes(key)) return getGeometryInsertWeight('POLYGON')
  if (['roads', 'water', 'transport'].includes(key)) return getGeometryInsertWeight('LINESTRING')
  if (key === 'poi') return getGeometryInsertWeight('POINT')
  return getGeometryInsertWeight(layer?.geometryType || inferGeometryType(layer?.geojson || { features: [] }))
}

async function readOsmPreviewFromZipBlob(blob) {
  const zip = await JSZip.loadAsync(blob)
  const previewFile = zip.file('_preview.json')
  if (!previewFile) throw new Error('OSM 下载结果缺少预览信息')
  return JSON.parse(await previewFile.async('string'))
}

async function saveAndMaybeAddOsmLayerResults({ blob, previewInfo, name, saveHandle = null }) {
  const previewLayers = previewInfo?.layers || []
  const displayLayers = previewLayers
    .filter((layer) => layer?.geojson?.features?.length)
    .map((layer) => ({
      key: layer.key,
      name: `${name}_${layer.name}`,
      outputName: `${name}_${layer.name}`,
      geometryType: inferGeometryType(layer.geojson),
      geojson: {
        ...layer.geojson,
        crs: { type: 'name', properties: { name: 'EPSG:4326' } }
      },
      featureCount: layer.featureCount || layer.geojson?.features?.length || 0,
      rawElementCount: layer.rawElementCount,
      truncated: layer.truncated || layer.previewTruncated
    }))

  const savedName = await writeBlobToSaveHandle(saveHandle, blob, `${name}.zip`)

  if (downloadForm.showResult && displayLayers.length) {
    const panel = await ensureResourcePanel()
    const orderedLayers = displayLayers
      .slice()
      .sort((a, b) => getOsmLayerInsertWeight(a) - getOsmLayerInsertWeight(b))

    orderedLayers.forEach((layer) => {
      const previewCount = layer.geojson.features?.length || 0
      panel?.addExternalLayer({
        name: layer.name,
        subtitle: `OSM Overpass / 预览 ${previewCount}/${layer.featureCount} 个要素${layer.truncated ? ' / 预览已截断' : ''} / ${savedName}`,
        sourceKind: 'osm-download',
        sourceCrs: 'EPSG:4326',
        crs: 'EPSG:4326',
        geometryType: layer.geometryType,
        geojson: layer.geojson,
        style: getOsmLayerStyle(layer),
        fitOnAdd: false
      })
    })
    await nextTick()
    requestAnimationFrame(() => {
      mapRef.value?.fitGeoJsonCollection?.(orderedLayers.map((layer) => layer.geojson))
    })
  }

  return {
    savedName,
    layerCount: previewInfo?.layerSummaries?.length || displayLayers.length,
    featureCount: previewInfo?.featureCount || 0,
    previewFeatureCount: downloadForm.showResult
      ? displayLayers.reduce((sum, layer) => sum + (layer.geojson?.features?.length || 0), 0)
      : 0
  }
}

async function runOsmDownload(saveHandle = null) {
  const bbox = getDownloadBbox()
  const areaKm2 = getBboxAreaKm2(bbox)
  if (areaKm2 > maxOsmDownloadAreaKm2) {
    throw new Error(`OSM 下载范围过大，当前约 ${Math.round(areaKm2)} 平方公里，请缩小到 ${maxOsmDownloadAreaKm2} 平方公里以内后重试`)
  }
  const outputName = getDownloadOutputName('OSM 数据下载')
  const res = await apiClient.post('/api/download/osm', {
    bbox,
    featureTypes: osmDownloadForm.featureTypes,
    customTags: osmDownloadForm.customTags.split(',').map((item) => item.trim()).filter(Boolean),
    timeout: osmDownloadForm.timeout,
    previewLimit: downloadForm.showResult ? osmDownloadForm.previewLimit : 0,
    outputFormat: downloadForm.outputFormat,
    encoding: downloadForm.encoding
  }, {
    responseType: 'blob'
  })

  const blob = res.data
  const previewInfo = await readOsmPreviewFromZipBlob(blob)
  const result = await saveAndMaybeAddOsmLayerResults({
    blob,
    previewInfo,
    name: outputName,
    saveHandle
  })

  showAppToast(
    downloadForm.showResult
      ? `OSM 数据下载完成，已保存 ${result.savedName}，完整下载 ${result.featureCount} 个要素，预览叠加 ${result.previewFeatureCount} 个要素。`
      : `OSM 数据下载完成，已保存 ${result.savedName}，生成 ${result.layerCount} 个分类图层、${result.featureCount} 个要素，未叠加到地图。`
  )
}

async function runAmapPoiDownload(saveHandle = null) {
  if (typeof window !== 'undefined' && amapPoiForm.key.trim()) {
    window.localStorage.setItem('gis-tools.amapPoiKey.v1', amapPoiForm.key.trim())
  }

  const outputName = getDownloadOutputName('高德 POI 下载')
  const bbox = downloadForm.rangeMode === 'city' ? null : getDownloadBbox()
  const res = await apiClient.post('/api/download/amap-poi', {
    key: amapPoiForm.key.trim(),
    keywords: amapPoiForm.keywords.trim(),
    types: amapPoiForm.types.trim(),
    city: amapPoiForm.city.trim(),
    cityLimit: amapPoiForm.cityLimit,
    bbox,
    pageSize: amapPoiForm.pageSize,
    maxPages: amapPoiForm.maxPages,
    outputCoord: amapPoiForm.outputCoord
  })

  const outputCrs = amapPoiForm.outputCoord === 'gcj02' ? 'GCJ02' : 'EPSG:4326'
  const displayGeoJson = outputCrs === 'GCJ02'
    ? convertGeoJsonCoordinates(res.data.geojson, 'gcj02-to-wgs84')
    : res.data.geojson
  const savedName = await saveAndMaybeAddDownloadResult({
    geojson: res.data.geojson,
    displayGeoJson,
    name: outputName,
    subtitle: `高德 POI / ${res.data.featureCount} 个要素 / ${outputCrs}`,
    sourceKind: 'amap-poi-download',
    sourceCrs: 'GCJ02',
    crs: outputCrs,
    displayCrs: 'EPSG:4326',
    saveHandle
  })

  showAppToast(
    downloadForm.showResult
      ? `高德 POI 下载完成，已保存 ${savedName}，生成 ${res.data.featureCount} 个要素并叠加到地图。`
      : `高德 POI 下载完成，已保存 ${savedName}，生成 ${res.data.featureCount} 个要素，未叠加到地图。`
  )
}

async function runDownloadTool() {
  if (!downloadReady.value) return

  toolBusy.value = true
  toolMessage.value = ''
  try {
    const outputName = getDownloadOutputName(toolDefinitions[activeTool.value]?.title || '数据下载')
    const saveHandle = await requestSaveFileHandle(
      getOutputFileName({
        outputName,
        outputFormat: downloadForm.outputFormat,
        multi: activeTool.value === 'osm-download'
      }),
      getOutputPickerOptions({
        outputFormat: downloadForm.outputFormat,
        multi: activeTool.value === 'osm-download'
      })
    )
    await ensureBackendAvailable()
    if (activeTool.value === 'osm-download') await runOsmDownload(saveHandle)
    else if (activeTool.value === 'amap-poi-download') await runAmapPoiDownload(saveHandle)
    else throw new Error('当前数据下载工具未实现')
    closeToolDialog()
  } catch (error) {
    if (error?.name === 'AbortError') {
      toolMessage.value = '已取消输出文件保存'
      return
    }
    toolMessage.value = getApiErrorMessage(error, '数据下载失败')
  } finally {
    toolBusy.value = false
  }
}

function resetVisualizationForm(action = activeTool.value) {
  const layers = action === 'choropleth-map'
    ? analysisLayers.value.filter((layer) => isPolygonLayer(layer))
    : ['heatmap', 'cluster-map', 'graduated-point'].includes(action)
      ? analysisLayers.value.filter((layer) => isPointLayer(layer))
      : analysisLayers.value
  const firstLayer = layers[0]
  visualizationForm.layerId = firstLayer?.id || ''
  visualizationForm.outputName = `${toolDefinitions[action]?.title || '可视化'}_${new Date().toISOString().slice(0, 10)}`
  visualizationForm.weightField = ''
  visualizationForm.numericField = ''
  visualizationForm.categoryField = ''
  visualizationForm.startLngField = ''
  visualizationForm.startLatField = ''
  visualizationForm.endLngField = ''
  visualizationForm.endLatField = ''
  visualizationForm.radius = action === 'heatmap' ? 34 : 24
  visualizationForm.intensity = 1
  visualizationForm.clusterRadius = 56
  visualizationForm.opacity = 0.78
  visualizationForm.lineWidth = 3
  visualizationForm.colorRamp = action === 'choropleth-map' ? 'forest' : 'warm'
  nextTick(() => syncVisualizationDefaultFields(action))
}

function syncVisualizationDefaultFields(action = activeTool.value) {
  const fields = selectedVisualizationFields.value
  const numericFields = selectedVisualizationNumericFields.value
  visualizationForm.weightField = visualizationForm.weightField && fields.includes(visualizationForm.weightField)
    ? visualizationForm.weightField
    : numericFields[0] || ''
  visualizationForm.numericField = visualizationForm.numericField && fields.includes(visualizationForm.numericField)
    ? visualizationForm.numericField
    : numericFields[0] || ''
  if (action === 'flow-map') {
    visualizationForm.startLngField = guessCsvField(fields, [/^(start_)?(lng|lon|longitude|from_lng|from_lon|起点经度)$/i, /^x1$/i])
    visualizationForm.startLatField = guessCsvField(fields, [/^(start_)?(lat|latitude|from_lat|起点纬度)$/i, /^y1$/i])
    visualizationForm.endLngField = guessCsvField(fields, [/^(end_)?(lng|lon|longitude|to_lng|to_lon|终点经度)$/i, /^x2$/i])
    visualizationForm.endLatField = guessCsvField(fields, [/^(end_)?(lat|latitude|to_lat|终点纬度)$/i, /^y2$/i])
    visualizationForm.weightField = numericFields[0] || ''
  }
}

function getNormalizedNumericValue(value, min, max) {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''))
  if (!Number.isFinite(numeric)) return 0
  if (max <= min) return 50
  return Math.max(0, Math.min(100, ((numeric - min) / (max - min)) * 100))
}

function createNormalizedGeoJson(geojson, field, normalizedName = '__visual_value') {
  if (!field) return cloneGeoJson(geojson)
  const values = (geojson.features || [])
    .map((feature) => {
      const value = feature.properties?.[field]
      return typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''))
    })
    .filter(Number.isFinite)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  return {
    type: 'FeatureCollection',
    features: (geojson.features || []).map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        [normalizedName]: getNormalizedNumericValue(feature.properties?.[field], min, max),
        __visual_source_field: field
      }
    }))
  }
}

function createFlowGeoJson(layer) {
  const features = []
  ;(layer.geojson.features || []).forEach((feature, index) => {
    const props = feature.properties || {}
    const startLng = Number(props[visualizationForm.startLngField])
    const startLat = Number(props[visualizationForm.startLatField])
    const endLng = Number(props[visualizationForm.endLngField])
    const endLat = Number(props[visualizationForm.endLatField])
    if (![startLng, startLat, endLng, endLat].every(Number.isFinite)) return
    const weight = visualizationForm.weightField ? Number(props[visualizationForm.weightField]) : 1
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [startLng, startLat],
          [endLng, endLat]
        ]
      },
      properties: {
        ...props,
        source_index: index + 1,
        __flow_weight: Number.isFinite(weight) ? weight : 1
      }
    })
  })
  return {
    type: 'FeatureCollection',
    features
  }
}

function getVisualizationType(action = activeTool.value) {
  if (action === 'heatmap') return 'heatmap'
  if (action === 'cluster-map') return 'cluster'
  if (action === 'flow-map') return 'flow'
  if (action === 'graduated-point') return 'graduated-point'
  if (action === 'choropleth-map') return 'choropleth'
  return action
}

function addVisualizationRecord(record) {
  visualOverlayRecords.value = [
    record,
    ...visualOverlayRecords.value.filter((item) => item.id !== record.id)
  ].slice(0, 12)
}

function removeVisualizationRecord(id) {
  mapRef.value?.removeVisualizationLayer?.(id)
  visualOverlayRecords.value = visualOverlayRecords.value.filter((item) => item.id !== id)
}

function runVisualizationTool() {
  if (!visualizationReady.value) return

  const layer = selectedVisualizationLayer.value
  if (!layer?.geojson) {
    toolMessage.value = '请选择输入图层'
    return
  }

  toolBusy.value = true
  toolMessage.value = ''

  try {
    const type = getVisualizationType()
    const id = `visual-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    let geojson = cloneGeoJson(layer.geojson)
    let weightField = visualizationForm.weightField
    let numericField = visualizationForm.numericField

    if (type === 'flow') {
      geojson = createFlowGeoJson(layer)
      weightField = visualizationForm.weightField || '__flow_weight'
    } else if (type === 'graduated-point' || type === 'choropleth') {
      geojson = createNormalizedGeoJson(layer.geojson, visualizationForm.numericField)
      numericField = '__visual_value'
    }

    if (!geojson.features?.length) throw new Error('当前参数没有生成可视化要素，请检查图层类型或字段映射。')

    const name = visualizationForm.outputName || `${toolDefinitions[activeTool.value]?.title || '可视化'}_${layer.name}`
    mapRef.value?.addVisualizationLayer?.({
      id,
      type,
      name,
      geojson,
      weightField,
      numericField,
      colorRamp: visualizationForm.colorRamp,
      radius: visualizationForm.radius,
      intensity: visualizationForm.intensity,
      clusterRadius: visualizationForm.clusterRadius,
      opacity: visualizationForm.opacity,
      lineWidth: visualizationForm.lineWidth
    })
    addVisualizationRecord({
      id,
      name,
      type,
      layerName: layer.name,
      featureCount: geojson.features.length
    })
    showAppToast(`${toolDefinitions[activeTool.value]?.title || '可视化'}已生成，叠加 ${geojson.features.length} 个要素。`)
    closeToolDialog()
  } catch (error) {
    toolMessage.value = error.message || '可视化生成失败'
  } finally {
    toolBusy.value = false
  }
}

function runBufferAnalysis(layer) {
  const distance = Number(analysisForm.distance)
  if (!Number.isFinite(distance) || distance <= 0) throw new Error('缓冲距离必须大于 0')

  const buffered = (layer.geojson.features || [])
    .map((feature, index) => {
      try {
        const result = turf.buffer(feature, distance, { units: analysisForm.units })
        if (!result) return null
        result.properties = {
          ...(feature.properties || {}),
          source_index: index + 1,
          buffer_distance: distance,
          buffer_units: analysisForm.units
        }
        return result
      } catch (error) {
        return null
      }
    })
    .filter(Boolean)

  let features = buffered
  if (analysisForm.dissolve && buffered.length > 1) {
    try {
      const unioned = buffered.slice(1).reduce((acc, feature) => {
        return turf.union(turf.featureCollection([acc, feature])) || acc
      }, buffered[0])
      unioned.properties = {
        source_layer: layer.name,
        buffer_distance: distance,
        buffer_units: analysisForm.units,
        dissolved: true
      }
      features = [unioned]
    } catch (error) {
      // Keep per-feature buffers if union fails on complex geometry.
    }
  }

  return {
    type: 'FeatureCollection',
    features
  }
}

function testSpatialPredicate(target, join, predicate) {
  try {
    if (predicate === 'contains') return turf.booleanContains(join, target)
    if (predicate === 'within') return turf.booleanContains(target, join)
    return turf.booleanIntersects(target, join)
  } catch (error) {
    return false
  }
}

function runSpatialJoinAnalysis(targetLayer, joinLayer) {
  const features = (targetLayer.geojson.features || []).map((targetFeature, targetIndex) => {
    const matches = (joinLayer.geojson.features || []).filter((joinFeature) => {
      return testSpatialPredicate(targetFeature, joinFeature, analysisForm.predicate)
    })
    const picked = analysisForm.joinMode === 'all' ? matches : matches.slice(0, 1)
    const joinedProperties = picked.reduce((acc, feature, index) => {
      Object.assign(acc, prefixProperties(feature.properties, `join${index + 1}`))
      return acc
    }, {})

    return {
      ...targetFeature,
      properties: {
        ...prefixProperties(targetFeature.properties, 'target'),
        target_index: targetIndex + 1,
        join_count: matches.length,
        ...joinedProperties
      }
    }
  })

  return {
    type: 'FeatureCollection',
    features
  }
}

function runIntersectAnalysis(inputLayer, overlayLayer) {
  const features = []

  ;(inputLayer.geojson.features || []).forEach((inputFeature, inputIndex) => {
    ;(overlayLayer.geojson.features || []).forEach((overlayFeature, overlayIndex) => {
      try {
        const result = turf.intersect(turf.featureCollection([inputFeature, overlayFeature]))
        if (!result) return
        result.properties = {
          ...prefixProperties(inputFeature.properties, 'input'),
          ...prefixProperties(overlayFeature.properties, 'overlay'),
          input_index: inputIndex + 1,
          overlay_index: overlayIndex + 1
        }
        features.push(result)
      } catch (error) {
        // Skip invalid geometry pairs and continue.
      }
    })
  })

  return {
    type: 'FeatureCollection',
    features
  }
}

function runClipAnalysis(inputLayer, clipLayer) {
  const clipUnion = unionPolygonFeatures(clipLayer.geojson.features || [])
  if (!clipUnion) throw new Error('裁剪图层没有可用面要素')

  const features = []
  ;(inputLayer.geojson.features || []).forEach((feature, index) => {
    try {
      if (String(feature.geometry?.type || '').includes('Polygon')) {
        const clipped = turf.intersect(turf.featureCollection([feature, clipUnion]))
        if (clipped) {
          clipped.properties = { ...(feature.properties || {}), source_index: index + 1 }
          features.push(clipped)
        }
      } else if (turf.booleanIntersects(feature, clipUnion)) {
        features.push({
          ...feature,
          properties: { ...(feature.properties || {}), source_index: index + 1 }
        })
      }
    } catch (error) {
      // Continue with remaining features.
    }
  })

  return {
    type: 'FeatureCollection',
    features
  }
}

function unionPolygonFeatures(features) {
  const polygons = features.filter((feature) => String(feature.geometry?.type || '').includes('Polygon'))
  if (!polygons.length) return null
  return polygons.slice(1).reduce((acc, feature) => {
    try {
      return turf.union(turf.featureCollection([acc, feature])) || acc
    } catch (error) {
      return acc
    }
  }, polygons[0])
}

function runLayerMergeAnalysis(layers) {
  const features = layers.flatMap((layer) => {
    return (layer.geojson.features || []).map((feature, index) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        source_layer: layer.name,
        source_index: index + 1
      }
    }))
  })

  return {
    type: 'FeatureCollection',
    features
  }
}

function dissolveLayerFeatures(layer) {
  const field = analysisForm.dissolveField
  const groups = new Map()

  ;(layer.geojson.features || []).forEach((feature) => {
    if (!String(feature.geometry?.type || '').includes('Polygon')) return
    const key = field ? String(feature.properties?.[field] ?? '') : '__all__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(feature)
  })

  const features = Array.from(groups.entries()).map(([key, featuresInGroup]) => {
    const merged = unionPolygonFeatures(featuresInGroup)
    if (!merged) return null
    merged.properties = {
      dissolve_field: field || '',
      dissolve_value: field ? key : 'all',
      merged_count: featuresInGroup.length
    }
    return merged
  }).filter(Boolean)

  return {
    type: 'FeatureCollection',
    features
  }
}

function runFeatureMergeAnalysis(layer) {
  const result = dissolveLayerFeatures(layer)
  if (!result.features.length) throw new Error('要素融合仅支持面图层')
  return result
}

function parseBboxText(value) {
  const parts = String(value || '').split(',').map((item) => Number(item.trim()))
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) return null
  if (parts[0] >= parts[2] || parts[1] >= parts[3]) return null
  return parts
}

function getFishnetBbox(extentLayer = null) {
  if (analysisForm.extentMode === 'bbox') {
    const bbox = parseBboxText(analysisForm.bbox)
    if (!bbox) throw new Error('请输入合法范围：minX,minY,maxX,maxY')
    return bbox
  }
  if (analysisForm.extentMode === 'viewport') {
    const bbox = mapRef.value?.getViewportBbox?.()
    if (!bbox) throw new Error('无法读取当前视窗范围')
    return bbox
  }
  if (analysisForm.extentMode === 'select') {
    const bbox = parseBboxText(analysisForm.selectedBbox)
    if (!bbox) throw new Error('请先在地图上框选渔网范围')
    return bbox
  }
  if (!extentLayer?.geojson) throw new Error('请选择范围图层')
  return turf.bbox(extentLayer.geojson)
}

function runFishnetAnalysis(extentLayer = null) {
  const bbox = getFishnetBbox(extentLayer)
  let rows = Number(analysisForm.rows)
  let cols = Number(analysisForm.cols)

  if (analysisForm.gridMode === 'cell-size') {
    const widthKm = Math.max(0.001, turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]], { units: 'kilometers' }))
    const heightKm = Math.max(0.001, turf.distance([bbox[0], bbox[1]], [bbox[0], bbox[3]], { units: 'kilometers' }))
    cols = Math.max(1, Math.ceil((widthKm * 1000) / Number(analysisForm.cellWidth)))
    rows = Math.max(1, Math.ceil((heightKm * 1000) / Number(analysisForm.cellHeight)))
  }

  if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
    throw new Error('渔网行列参数必须大于 0')
  }

  const dx = (bbox[2] - bbox[0]) / cols
  const dy = (bbox[3] - bbox[1]) / rows
  const features = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const minX = bbox[0] + col * dx
      const minY = bbox[1] + row * dy
      const maxX = col === cols - 1 ? bbox[2] : minX + dx
      const maxY = row === rows - 1 ? bbox[3] : minY + dy
      const polygon = turf.bboxPolygon([minX, minY, maxX, maxY])
      polygon.properties = {
        grid_id: row * cols + col + 1,
        row: row + 1,
        col: col + 1
      }
      features.push(polygon)
    }
  }

  return {
    type: 'FeatureCollection',
    features
  }
}

function runAccessibilityAnalysis(layer) {
  let distance = Number(analysisForm.distance)
  if (analysisForm.travelMode === 'time') {
    const speed = Number(analysisForm.speedKmh)
    if (!Number.isFinite(speed) || speed <= 0) throw new Error('速度必须大于 0')
    distance = (speed * 1000 / 60) * distance
  }
  if (!Number.isFinite(distance) || distance <= 0) throw new Error('阈值必须大于 0')

  const features = (layer.geojson.features || []).map((feature, index) => {
    try {
      const result = turf.buffer(feature, distance, { units: 'meters' })
      result.properties = {
        ...(feature.properties || {}),
        source_index: index + 1,
        accessibility_mode: analysisForm.travelMode,
        threshold: Number(analysisForm.distance),
        distance_m: distance
      }
      return result
    } catch (error) {
      return null
    }
  }).filter(Boolean)

  return {
    type: 'FeatureCollection',
    features
  }
}

async function runAnalysisTool() {
  if (!analysisReady.value) return

  toolBusy.value = true
  toolMessage.value = ''

  try {
    let geojson
    if (activeTool.value === 'buffer-analysis') {
      geojson = runBufferAnalysis(await getAnalysisSourceDataset('input', '输入图层'))
    } else if (activeTool.value === 'spatial-join') {
      geojson = runSpatialJoinAnalysis(
        await getAnalysisSourceDataset('input', '目标图层'),
        await getAnalysisSourceDataset('join', '连接图层')
      )
    } else if (activeTool.value === 'layer-intersection') {
      geojson = runIntersectAnalysis(
        await getAnalysisSourceDataset('input', '输入图层'),
        await getAnalysisSourceDataset('overlay', '叠加图层')
      )
    } else if (activeTool.value === 'layer-clip') {
      geojson = runClipAnalysis(
        await getAnalysisSourceDataset('input', '目标图层'),
        await getAnalysisSourceDataset('overlay', '裁剪面图层')
      )
    } else if (activeTool.value === 'layer-merge') {
      geojson = runLayerMergeAnalysis(await getAnalysisMergeDatasets())
    } else if (activeTool.value === 'feature-merge') {
      geojson = runFeatureMergeAnalysis(await getAnalysisSourceDataset('input', '输入面图层'))
    } else if (activeTool.value === 'fishnet') {
      const extentLayer = analysisForm.extentMode === 'layer'
        ? await getAnalysisSourceDataset('extent', '范围图层')
        : null
      geojson = runFishnetAnalysis(extentLayer)
    } else if (activeTool.value === 'accessibility-analysis') {
      geojson = runAccessibilityAnalysis(await getAnalysisSourceDataset('input', '起点图层'))
    }
    else throw new Error('当前分析工具未实现')

    const outputName = getAnalysisOutputName(toolDefinitions[activeTool.value]?.title || '分析结果')
    const { outputGeoJson, targetCrs, targetRef } = await createAnalysisOutputGeoJson(geojson)
    const savedName = await saveGeoJsonOutput({
      geojson: outputGeoJson,
      outputName,
      outputFormat: analysisForm.outputFormat,
      encoding: analysisForm.encoding,
      crs: targetCrs,
      spatialReference: targetRef
    })

    if (analysisForm.showResult) {
      await addAnalysisResultLayer({
        geojson,
        name: outputName,
        subtitle: `${toolDefinitions[activeTool.value]?.title || '分析工具'} / ${geojson.features.length} 个要素 / ${targetCrs} / ${savedName}`,
        geometryType: inferGeometryType(geojson)
      })
    } else if (!geojson?.features?.length) {
      throw new Error('分析完成，但没有生成结果要素，请检查输入图层关系或参数。')
    }
    showAppToast(
      analysisForm.showResult
        ? `${toolDefinitions[activeTool.value]?.title || '空间分析'}完成，已保存 ${savedName}，生成 ${geojson.features.length} 个结果要素并叠加到地图。`
        : `${toolDefinitions[activeTool.value]?.title || '空间分析'}完成，已保存 ${savedName}，生成 ${geojson.features.length} 个结果要素，未叠加到地图。`
    )
    closeToolDialog()
  } catch (error) {
    if (error?.name === 'AbortError') {
      toolMessage.value = '已取消输出文件保存'
      return
    }
    toolMessage.value = error.message || '分析失败'
  } finally {
    toolBusy.value = false
  }
}

async function handleToolAction(action) {
  if (action === 'database-import') {
    const panel = await ensureResourcePanel()
    panel?.openDatabaseConnectionModal()
    return
  }

  resetToolDialogWindow()
  toolMessage.value = ''

  if (action === 'coord-convert') {
    resetCoordConvertForm()
    activeTool.value = 'coord-convert'
    return
  }

  if (action === 'crs-transform') {
    resetCrsTransformForm()
    activeTool.value = 'crs-transform'
    await initializeCrsTransformReferenceLists()
    return
  }

  if (action?.startsWith('coord-convert:')) {
    const direction = action.split(':')[1]
    resetCoordConvertForm(direction)
    activeTool.value = 'coord-convert'
    return
  }

  if (analysisToolIds.includes(action)) {
    resetAnalysisForm(action)
    activeTool.value = action
    await initializeAnalysisTargetReferences()
    return
  }

  if (downloadToolIds.includes(action)) {
    resetDownloadForm(action)
    activeTool.value = action
    return
  }

  if (visualizationToolIds.includes(action)) {
    resetVisualizationForm(action)
    activeTool.value = action
    return
  }

  activeTool.value = action

  if (action === 'csv-import' || action === 'cad-import') {
    await loadSpatialReferences()
  }
}

function closeToolDialog() {
  if (toolBusy.value) return
  if (mapBboxPicking.value) {
    mapRef.value?.cancelBboxSelection?.()
    mapBboxPicking.value = false
    pickingDownloadBbox.value = false
  }
  activeTool.value = ''
  toolMessage.value = ''
  coordConvertFiles.value = []
  crsTransformFiles.value = []
  resetToolDialogWindow()
}

function getFileBaseName(name) {
  return getVectorFileBaseName(name)
}

function getGeoJsonCrs(geojson) {
  return getGeoJsonCrsFromData(geojson)
}

function getPrjCrs(prjText) {
  return getPrjCrsFromText(prjText)
}

defineExpose({
  handleSearch,
  handleToolAction
})

function normalizeCrs(value) {
  return normalizeCrsValue(value)
}

function isWgs84(crs) {
  return isWgs84Crs(crs)
}

function transformCoordinates(coords, fromCrs) {
  if (!Array.isArray(coords)) return coords

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const transformed = proj4(fromCrs, 'EPSG:4326', [coords[0], coords[1]])
    return coords.length > 2 ? [...transformed, ...coords.slice(2)] : transformed
  }

  return coords.map((item) => transformCoordinates(item, fromCrs))
}

function transformGeoJsonIfNeeded(geojson, sourceCrs) {
  const crs = normalizeCrs(sourceCrs)
  if (!crs || isWgs84(crs)) return { geojson, needsTransform: false }

  return {
    needsTransform: true,
    geojson: {
      ...geojson,
      crs: undefined,
      features: (geojson.features || []).map((feature) => ({
        ...feature,
        geometry: feature.geometry
          ? {
              ...feature.geometry,
              coordinates: transformCoordinates(feature.geometry.coordinates, crs)
            }
          : feature.geometry
      }))
    }
  }
}

function resetCoordConvertForm(direction = coordConvertOptions[0].value) {
  coordConvertForm.direction = direction
  coordConvertForm.inputMode = 'layer'
  coordConvertForm.layerId = coordConvertLayers.value[0]?.id || ''
  coordConvertForm.outputName = `${coordConvertOptions.find((item) => item.value === direction)?.label || 'Coord Convert'} Result`
  coordConvertForm.outputFormat = 'geojson'
  coordConvertForm.showResult = true
  coordConvertFiles.value = []
}

function handleCoordConvertFile(event) {
  coordConvertFiles.value = Array.from(event.target.files || [])
  const primary = coordConvertFiles.value.find((file) => /\.(geojson|json|shp)$/i.test(file.name))
  if (primary && !coordConvertForm.outputName) {
    coordConvertForm.outputName = `${getFileBaseName(primary.name)}-${coordConvertMeta.value.label}`
  }
  toolMessage.value = ''
}

const coordConvertUploadSummary = computed(() => {
  if (!coordConvertFiles.value.length) return '未选择文件'
  return coordConvertFiles.value.map((file) => file.name).join(' / ')
})

const crsTransformUploadSummary = computed(() => {
  if (!crsTransformFiles.value.length) return '未选择文件'
  return crsTransformFiles.value.map((file) => file.name).join(' / ')
})

function getLayerSourceCrs(layer) {
  return normalizeCrs(layer?.sourceCrs) || normalizeCrs(layer?.crs) || getGeoJsonCrs(layer?.geojson) || ''
}

function getSelectedCrsTransformLayer() {
  return resourceRef.value?.getLayerById?.(crsTransformForm.layerId)
}

async function syncCrsTransformLayerCrs() {
  if (crsTransformForm.inputMode !== 'layer') return
  const layer = getSelectedCrsTransformLayer()
  crsTransformForm.sourceCrs = getLayerSourceCrs(layer)
  if (layer && !crsTransformForm.outputName) {
    crsTransformForm.outputName = `${layer.name}_坐标转换`
  }
  if (crsTransformForm.sourceCrs) {
    await ensureSpatialReference(crsTransformForm.sourceCrs)
    crsTransformSourceReferences.value = getCrsTransformReferenceList('source')
  }
}

async function initializeCrsTransformReferenceLists() {
  await ensureSelectedSpatialReferences()
  await Promise.all([
    loadCrsTransformReferences('source', crsTransformSourceKeyword.value),
    loadCrsTransformReferences('target', crsTransformTargetKeyword.value)
  ])
}

function resetCrsTransformForm() {
  crsTransformForm.inputMode = 'layer'
  crsTransformForm.layerId = coordConvertLayers.value[0]?.id || ''
  crsTransformForm.targetCrs = 'EPSG:4326'
  crsTransformForm.outputName = ''
  crsTransformForm.outputFormat = 'geojson'
  crsTransformForm.encoding = 'utf-8'
  crsTransformForm.showResult = true
  crsTransformSourceKeyword.value = ''
  crsTransformTargetKeyword.value = ''
  crsTransformSourceReferences.value = []
  crsTransformTargetReferences.value = []
  crsTransformFiles.value = []
  void syncCrsTransformLayerCrs()
}

async function handleCrsTransformFile(event) {
  crsTransformFiles.value = Array.from(event.target.files || [])
  crsTransformForm.sourceCrs = ''
  toolMessage.value = ''

  try {
    const input = await readVectorFilesAsGeoJson(crsTransformFiles.value, { encoding: crsTransformForm.encoding })
    crsTransformForm.sourceCrs = input.sourceCrs || ''
    crsTransformForm.outputName = `${input.name}_坐标转换`
    await ensureSpatialReference(crsTransformForm.sourceCrs)
    crsTransformSourceReferences.value = getCrsTransformReferenceList('source')
  } catch (error) {
    crsTransformForm.sourceCrs = ''
  }
}

async function getCrsTransformInputGeoJson() {
  if (crsTransformForm.inputMode === 'upload') {
    if (!crsTransformFiles.value.length) throw new Error('请选择上传文件')
    return readVectorFilesAsGeoJson(crsTransformFiles.value, {
      sourceCrs: crsTransformForm.sourceCrs,
      encoding: crsTransformForm.encoding
    })
  }

  const layer = getSelectedCrsTransformLayer()
  if (!layer?.geojson) throw new Error('请选择输入图层')
  return {
    geojson: cloneGeoJson(layer.geojson),
    sourceCrs: crsTransformForm.sourceCrs || getLayerSourceCrs(layer),
    name: layer.name
  }
}

async function runCrsTransform() {
  if (!crsTransformReady.value) return

  toolBusy.value = true
  toolMessage.value = ''

  try {
    const input = await getCrsTransformInputGeoJson()
    const sourceCrs = normalizeCrs(crsTransformForm.sourceCrs || input.sourceCrs)
    const targetCrs = normalizeCrs(crsTransformForm.targetCrs)
    await Promise.all([
      ensureSpatialReference(sourceCrs),
      ensureSpatialReference(targetCrs)
    ])
    registerSpatialReferences(spatialReferenceCache.value)
    const sourceRef = findCachedSpatialReference(sourceCrs)
    const targetRef = findCachedSpatialReference(targetCrs)
    const outputGeoJson = transformGeoJsonCrs(input.geojson, sourceCrs, targetCrs, {
      spatialReferences: spatialReferenceCache.value,
      sourceReference: sourceRef,
      targetReference: targetRef
    })
    const outputName = crsTransformForm.outputName || `${input.name}_${sourceCrs}_to_${targetCrs}`
    const savedName = await saveGeoJsonOutput({
      geojson: outputGeoJson,
      outputName,
      outputFormat: crsTransformForm.outputFormat,
      encoding: crsTransformForm.encoding,
      crs: targetCrs,
      spatialReference: targetRef
    })
    if (crsTransformForm.showResult) {
      const displayGeoJson = isWgs84(targetCrs)
        ? outputGeoJson
        : transformGeoJsonCrs(outputGeoJson, targetCrs, 'EPSG:4326', {
            spatialReferences: spatialReferenceCache.value,
            sourceReference: targetRef
          })
      const panel = await ensureResourcePanel()
      panel?.addExternalLayer({
        name: outputName,
        subtitle: `坐标转换 / ${sourceCrs} -> ${targetCrs} / ${savedName}`,
        sourceKind: 'crs-transform',
        sourceCrs: sourceCrs,
        crs: isWgs84(targetCrs) ? targetCrs : 'EPSG:4326',
        needsTransform: !isWgs84(targetCrs),
        notices: isWgs84(targetCrs) ? [] : [`输出文件坐标系为 ${targetCrs}，地图预览已转换为 EPSG:4326。`],
        geometryType: inferGeometryType(displayGeoJson),
        geojson: displayGeoJson
      })
    }
    showAppToast(
      crsTransformForm.showResult
        ? `坐标转换完成，已保存 ${savedName}，并叠加到地图。`
        : `坐标转换完成，已保存 ${savedName}，未叠加到地图。`
    )
    closeToolDialog()
  } catch (error) {
    if (error?.name === 'AbortError') {
      toolMessage.value = '已取消输出文件保存'
      return
    }
    toolMessage.value = error.message || '坐标转换失败'
  } finally {
    toolBusy.value = false
  }
}

const coordPi = Math.PI
const coordXPi = Math.PI * 3000.0 / 180.0
const coordA = 6378245.0
const coordEe = 0.00669342162296594323

function isOutOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(lng, lat) {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  ret += (20.0 * Math.sin(6.0 * lng * coordPi) + 20.0 * Math.sin(2.0 * lng * coordPi)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(lat * coordPi) + 40.0 * Math.sin(lat / 3.0 * coordPi)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(lat / 12.0 * coordPi) + 320 * Math.sin(lat * coordPi / 30.0)) * 2.0 / 3.0
  return ret
}

function transformLng(lng, lat) {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  ret += (20.0 * Math.sin(6.0 * lng * coordPi) + 20.0 * Math.sin(2.0 * lng * coordPi)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(lng * coordPi) + 40.0 * Math.sin(lng / 3.0 * coordPi)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(lng / 12.0 * coordPi) + 300.0 * Math.sin(lng / 30.0 * coordPi)) * 2.0 / 3.0
  return ret
}

function wgs84ToGcj02(lng, lat) {
  if (isOutOfChina(lng, lat)) return [lng, lat]
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * coordPi
  let magic = Math.sin(radLat)
  magic = 1 - coordEe * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((coordA * (1 - coordEe)) / (magic * sqrtMagic) * coordPi)
  dLng = (dLng * 180.0) / (coordA / sqrtMagic * Math.cos(radLat) * coordPi)
  return [lng + dLng, lat + dLat]
}

function gcj02ToWgs84(lng, lat) {
  if (isOutOfChina(lng, lat)) return [lng, lat]
  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat)
  return [lng * 2 - gcjLng, lat * 2 - gcjLat]
}

function gcj02ToBd09(lng, lat) {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * coordXPi)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * coordXPi)
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006]
}

function bd09ToGcj02(lng, lat) {
  const x = lng - 0.0065
  const y = lat - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * coordXPi)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * coordXPi)
  return [z * Math.cos(theta), z * Math.sin(theta)]
}

function convertCoord(lng, lat, direction) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [lng, lat]
  if (direction === 'wgs84-to-gcj02') return wgs84ToGcj02(lng, lat)
  if (direction === 'gcj02-to-wgs84') return gcj02ToWgs84(lng, lat)
  if (direction === 'gcj02-to-bd09') return gcj02ToBd09(lng, lat)
  if (direction === 'bd09-to-gcj02') return bd09ToGcj02(lng, lat)
  if (direction === 'wgs84-to-bd09') return gcj02ToBd09(...wgs84ToGcj02(lng, lat))
  if (direction === 'bd09-to-wgs84') return gcj02ToWgs84(...bd09ToGcj02(lng, lat))
  return [lng, lat]
}

function convertCoordArray(coords, direction) {
  if (!Array.isArray(coords)) return coords
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const converted = convertCoord(Number(coords[0]), Number(coords[1]), direction)
    return coords.length > 2 ? [...converted, ...coords.slice(2)] : converted
  }
  return coords.map((item) => convertCoordArray(item, direction))
}

function convertGeometry(geometry, direction) {
  if (!geometry) return geometry
  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: (geometry.geometries || []).map((item) => convertGeometry(item, direction))
    }
  }
  return {
    ...geometry,
    coordinates: convertCoordArray(geometry.coordinates, direction)
  }
}

function convertGeoJsonCoordinates(geojson, direction) {
  if (!geojson || geojson.type !== 'FeatureCollection') {
    throw new Error('输入数据不是 GeoJSON FeatureCollection')
  }
  return {
    type: 'FeatureCollection',
    features: (geojson.features || []).map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        __coord_convert: coordConvertMeta.value.label
      },
      geometry: convertGeometry(feature.geometry, direction)
    }))
  }
}

async function getCoordConvertInputGeoJson() {
  if (coordConvertForm.inputMode === 'upload') {
    if (!coordConvertFiles.value.length) throw new Error('请选择上传文件')
    const geojsonFile = coordConvertFiles.value.find((file) => /\.(geojson|json)$/i.test(file.name))
    if (geojsonFile) {
      const geojson = JSON.parse(await geojsonFile.text())
      return {
        geojson,
        name: getFileBaseName(geojsonFile.name)
      }
    }

    const shpFile = coordConvertFiles.value.find((file) => /\.shp$/i.test(file.name))
    if (!shpFile) {
      throw new Error('上传 Shapefile 时至少需要选择 .shp 文件，可同时选择 .dbf/.prj')
    }
    const dbfFile = coordConvertFiles.value.find((file) => /\.dbf$/i.test(file.name))
    const geojson = await shapefile.read(
      await shpFile.arrayBuffer(),
      dbfFile ? await dbfFile.arrayBuffer() : undefined,
      { encoding: 'utf-8' }
    )
    return {
      geojson,
      name: getFileBaseName(shpFile.name)
    }
  }

  const layer = resourceRef.value?.getLayerById?.(coordConvertForm.layerId)
  if (!layer?.geojson) throw new Error('请选择输入图层')
  return {
    geojson: layer.geojson,
    name: layer.name
  }
}

async function runCoordConvert() {
  if (!coordConvertReady.value) return

  toolBusy.value = true
  toolMessage.value = ''

  try {
    const input = await getCoordConvertInputGeoJson()
    const meta = coordConvertMeta.value
    const geojson = convertGeoJsonCoordinates(input.geojson, coordConvertForm.direction)
    const outputName = coordConvertForm.outputName || `${input.name}-${meta.label}`
    const savedName = await saveGeoJsonOutput({
      geojson,
      outputName,
      outputFormat: coordConvertForm.outputFormat,
      encoding: 'utf-8',
      crs: meta.to === 'WGS84' ? 'EPSG:4326' : meta.to,
      spatialReference: meta.to === 'WGS84' ? { code: 'EPSG:4326', srText: getSpatialReferencePrj('EPSG:4326') } : null
    })
    if (coordConvertForm.showResult) {
      const panel = await ensureResourcePanel()
      panel?.addExternalLayer({
        name: outputName,
        subtitle: `China Coord Convert / ${meta.from} -> ${meta.to} / ${savedName}`,
        sourceKind: 'coord-convert',
        sourceCrs: meta.to,
        crs: meta.to,
        geometryType: inferGeometryType(geojson),
        geojson
      })
    }
    showAppToast(
      coordConvertForm.showResult
        ? `坐标转换完成，已保存 ${savedName}，并叠加到地图。`
        : `坐标转换完成，已保存 ${savedName}，未叠加到地图。`
    )
    closeToolDialog()
  } catch (error) {
    if (error?.name === 'AbortError') {
      toolMessage.value = '已取消输出文件保存'
      return
    }
    toolMessage.value = error.message || '坐标转换失败'
  } finally {
    toolBusy.value = false
  }
}

function inferGeometryType(geojson) {
  const types = new Set((geojson.features || []).map((feature) => feature.geometry?.type).filter(Boolean))
  if (types.size === 1) return Array.from(types)[0]
  return 'GEOMETRY'
}

function getGeometryInsertWeight(geometryType) {
  const type = String(geometryType || '').toUpperCase()
  if (type.includes('POLYGON')) return 1
  if (type.includes('LINE')) return 2
  if (type.includes('POINT')) return 3
  return 0
}

function getCadGeometryLayerLabel(layer) {
  const key = String(layer?.key || '').toLowerCase()
  const type = String(layer?.geometryType || '').toUpperCase()

  if (key === 'point' || type.includes('POINT')) return '点'
  if (key === 'line' || type.includes('LINE')) return '线'
  if (key === 'polygon' || type.includes('POLYGON')) return '面'

  return layer?.name || '其他'
}

function getCadGeometryType(layer) {
  const key = String(layer?.key || '').toLowerCase()
  if (key === 'point') return 'POINT'
  if (key === 'line') return 'LINESTRING'
  if (key === 'polygon') return 'POLYGON'
  return layer?.geometryType || inferGeometryType(layer?.geojson || { features: [] })
}

function getCadLayerInsertWeight(layer) {
  const key = String(layer?.key || '').toLowerCase()
  const type = String(layer?.geometryType || '').toUpperCase()

  if (key === 'polygon' || type.includes('POLYGON')) return getGeometryInsertWeight('POLYGON')
  if (key === 'line' || type.includes('LINE')) return getGeometryInsertWeight('LINESTRING')
  if (key === 'point' || type.includes('POINT')) return getGeometryInsertWeight('POINT')

  return 0
}

function getCsvDelimiter() {
  if (csvForm.delimiterMode === 'tab') return '\t'
  if (csvForm.delimiterMode === 'space') return ' '
  if (csvForm.delimiterMode === 'custom') return csvForm.customDelimiter || ','
  return ','
}

function parseCsvLine(line, delimiter = ',') {
  const cells = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (delimiter === ' ' && /\s/.test(char) && !quoted) {
      if (current.length > 0) {
        cells.push(current.trim())
        current = ''
      }
      while (index + 1 < line.length && /\s/.test(line[index + 1])) {
        index += 1
      }
    } else if (line.startsWith(delimiter, index) && !quoted) {
      cells.push(current.trim())
      current = ''
      index += delimiter.length - 1
    } else {
      current += char
    }
  }

  cells.push(current.trim())
  return cells.map((cell) => cell.replace(/^"|"$/g, ''))
}

function guessCsvField(columns, patterns) {
  return columns.find((column) => patterns.some((pattern) => pattern.test(column))) || ''
}

function normalizeCsvStartRow() {
  const value = Number.parseInt(csvForm.startRow, 10)
  csvForm.startRow = Number.isFinite(value) && value > 0 ? value : 1
}

async function readCsvText() {
  if (!csvFile.value) return ''

  const buffer = await csvFile.value.arrayBuffer()
  const decoder = new TextDecoder(csvForm.encoding === 'gbk' ? 'gbk' : 'utf-8')
  return decoder.decode(buffer)
}

function buildCsvColumns(rows) {
  const source = rows[0] || []
  const usedNames = new Set()

  return source.map((cell, index) => {
    const base = csvForm.hasHeader ? String(cell || '').trim() || `field_${index + 1}` : `field_${index + 1}`
    let name = base
    let suffix = 2

    while (usedNames.has(name)) {
      name = `${base}_${suffix}`
      suffix += 1
    }

    usedNames.add(name)
    return name
  })
}

function preserveCsvField(previousValue, fallbackPatterns) {
  if (previousValue && csvColumns.value.includes(previousValue)) return previousValue
  return guessCsvField(csvColumns.value, fallbackPatterns)
}

function syncCsvFieldSelections(previousFields = {}) {
  csvForm.xField = preserveCsvField(previousFields.xField, [/^(lng|lon|longitude|经度)$/i, /^x$/i])
  csvForm.yField = preserveCsvField(previousFields.yField, [/^(lat|latitude|纬度)$/i, /^y$/i])
  csvForm.wktField = preserveCsvField(previousFields.wktField, [/^(wkt|geom|geometry|the_geom)$/i])
}

async function refreshCsvPreview() {
  const requestId = csvPreviewRequestId + 1
  csvPreviewRequestId = requestId
  const previousFields = {
    xField: csvForm.xField,
    yField: csvForm.yField,
    wktField: csvForm.wktField
  }
  csvColumns.value = []
  csvPreviewRows.value = []
  csvRawLines.value = []
  toolMessage.value = ''

  if (!csvFile.value) return

  try {
    normalizeCsvStartRow()
    const delimiter = getCsvDelimiter()
    const text = await readCsvText()
    if (requestId !== csvPreviewRequestId) return

    csvRawLines.value = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
    const rows = csvRawLines.value
      .slice(csvForm.startRow - 1)
      .filter((line) => String(line || '').trim())
      .slice(0, 30)
      .map((line) => parseCsvLine(line, delimiter))

    if (!rows.length) return

    csvColumns.value = buildCsvColumns(rows)
    const dataRows = csvForm.hasHeader ? rows.slice(1) : rows
    csvPreviewRows.value = dataRows.slice(0, 10).map((row) => {
      return Object.fromEntries(csvColumns.value.map((column, index) => [column, row[index] || '']))
    })
    syncCsvFieldSelections(previousFields)
  } catch (error) {
    toolMessage.value = error.message || 'CSV 预览失败'
  }
}

function normalizeSpatialReferenceCode(value) {
  return normalizeCrs(value).toUpperCase()
}

function mergeSpatialReferences(items = []) {
  const merged = new Map(spatialReferenceCache.value.map((item) => [normalizeSpatialReferenceCode(item.code), item]))
  items.forEach((item) => {
    const code = normalizeSpatialReferenceCode(item?.code)
    if (code) merged.set(code, item)
  })
  spatialReferenceCache.value = Array.from(merged.values())
}

function mergeSelectedSpatialReferences(items = []) {
  const selectedCodes = [
    csvForm.sourceCrs,
    cadForm.sourceCrs,
    crsTransformForm.sourceCrs,
    crsTransformForm.targetCrs
  ].map(normalizeSpatialReferenceCode).filter(Boolean)

  const selected = selectedCodes
    .map((code) => findCachedSpatialReference(code))
    .filter(Boolean)
  const merged = new Map()
  ;[...selected, ...items].forEach((item) => {
    const code = normalizeSpatialReferenceCode(item?.code)
    if (code) merged.set(code, item)
  })
  return Array.from(merged.values())
}

function findCachedSpatialReference(code) {
  const normalized = normalizeSpatialReferenceCode(code)
  if (!normalized) return null
  return spatialReferenceCache.value.find((item) => normalizeSpatialReferenceCode(item.code) === normalized) || null
}

async function fetchSpatialReferences(keyword = '', limit = 200) {
  const res = await apiClient.get('/api/spatial-references', {
    params: {
      keyword: keyword || undefined,
      limit
    }
  })
  const items = res.data.items || []
  spatialReferenceSource.value = res.data.source || ''
  mergeSpatialReferences(items)
  registerSpatialReferences(spatialReferenceCache.value)
  return items
}

async function ensureSpatialReference(code) {
  const normalized = normalizeSpatialReferenceCode(code)
  if (!normalized) return null

  const cached = findCachedSpatialReference(normalized)
  if (cached) return cached

  try {
    const items = await fetchSpatialReferences(normalized, 20)
    return items.find((item) => normalizeSpatialReferenceCode(item.code) === normalized) || findCachedSpatialReference(normalized)
  } catch (error) {
    return null
  }
}

async function ensureSelectedSpatialReferences() {
  await Promise.all([
    ensureSpatialReference(csvForm.sourceCrs),
    ensureSpatialReference(cadForm.sourceCrs),
    ensureSpatialReference(crsTransformForm.sourceCrs),
    ensureSpatialReference(crsTransformForm.targetCrs)
  ])
}

async function loadSpatialReferences(keyword = spatialReferenceKeyword.value) {
  spatialReferenceLoading.value = true
  toolMessage.value = ''

  try {
    const items = await fetchSpatialReferences(keyword, 200)
    spatialReferences.value = mergeSelectedSpatialReferences(items)
  } catch (error) {
    toolMessage.value = error.response?.data?.error || error.message || '坐标系列表加载失败'
    spatialReferences.value = mergeSelectedSpatialReferences([])
    spatialReferenceSource.value = ''
  } finally {
    spatialReferenceLoading.value = false
  }
}

function handleSpatialReferenceSearch(event) {
  spatialReferenceKeyword.value = event.target.value
  loadSpatialReferences(spatialReferenceKeyword.value)
}

function getCrsTransformReferenceList(type) {
  const list = type === 'source' ? crsTransformSourceReferences.value : crsTransformTargetReferences.value
  const selectedCode = type === 'source' ? crsTransformForm.sourceCrs : crsTransformForm.targetCrs
  const selected = findCachedSpatialReference(selectedCode)
  if (!selected) return list

  const merged = new Map()
  ;[selected, ...list].forEach((item) => {
    const code = normalizeSpatialReferenceCode(item?.code)
    if (code) merged.set(code, item)
  })
  return Array.from(merged.values())
}

async function loadCrsTransformReferences(type, keyword = '') {
  const nextRequestId = crsTransformReferenceRequestIds[type] + 1
  crsTransformReferenceRequestIds[type] = nextRequestId
  crsTransformReferenceLoading[type] = true
  toolMessage.value = ''

  try {
    const items = await fetchSpatialReferences(keyword, 200)
    if (crsTransformReferenceRequestIds[type] !== nextRequestId) return
    if (type === 'source') {
      crsTransformSourceReferences.value = mergeSelectedSpatialReferences(items)
    } else {
      crsTransformTargetReferences.value = mergeSelectedSpatialReferences(items)
    }
  } catch (error) {
    if (crsTransformReferenceRequestIds[type] !== nextRequestId) return
    toolMessage.value = error.response?.data?.error || error.message || '坐标系列表加载失败'
    if (type === 'source') {
      crsTransformSourceReferences.value = mergeSelectedSpatialReferences([])
    } else {
      crsTransformTargetReferences.value = mergeSelectedSpatialReferences([])
    }
  } finally {
    if (crsTransformReferenceRequestIds[type] === nextRequestId) {
      crsTransformReferenceLoading[type] = false
    }
  }
}

function handleCrsTransformReferenceSearch(type, event) {
  const keyword = event.target.value
  if (type === 'source') {
    crsTransformSourceKeyword.value = keyword
  } else {
    crsTransformTargetKeyword.value = keyword
  }
  loadCrsTransformReferences(type, keyword)
}

async function selectCrsTransformReference(type, item) {
  if (!item?.code) return

  if (type === 'source') {
    crsTransformForm.sourceCrs = item.code
    crsTransformSourceKeyword.value = `${item.code} ${item.name || ''}`.trim()
  } else {
    crsTransformForm.targetCrs = item.code
    crsTransformTargetKeyword.value = `${item.code} ${item.name || ''}`.trim()
  }

  mergeSpatialReferences([item])
  registerSpatialReferences(spatialReferenceCache.value)
}

function scheduleCsvPreviewRefresh() {
  if (!csvFile.value) return
  clearTimeout(csvPreviewRefreshTimer)
  csvPreviewRefreshTimer = setTimeout(() => {
    refreshCsvPreview()
  }, 120)
}

function getCsvPreviewColumnClass(column) {
  return {
    'is-x-field': csvForm.geometryMode === 'xy' && column === csvForm.xField,
    'is-y-field': csvForm.geometryMode === 'xy' && column === csvForm.yField,
    'is-wkt-field': csvForm.geometryMode === 'wkt' && column === csvForm.wktField
  }
}

watch(
  () => [csvForm.encoding, csvForm.delimiterMode, csvForm.customDelimiter, csvForm.startRow, csvForm.hasHeader],
  scheduleCsvPreviewRefresh
)

watch(
  () => visualizationForm.layerId,
  () => {
    if (visualizationToolIds.includes(activeTool.value)) {
      syncVisualizationDefaultFields(activeTool.value)
    }
  }
)

watch(
  () => downloadForm.rangeMode,
  (mode, previousMode) => {
    if (mode !== 'select' || previousMode === 'select') return
    if (!downloadToolIds.includes(activeTool.value)) return
    if (downloadForm.selectedBbox) return
    requestAnimationFrame(() => {
      pickDownloadBboxFromMap()
    })
  }
)

async function handleCsvFile(event) {
  const [file] = Array.from(event.target.files || [])
  csvFile.value = file || null
  csvColumns.value = []
  csvPreviewRows.value = []
  csvRawLines.value = []
  csvForm.xField = ''
  csvForm.yField = ''
  csvForm.wktField = ''
  csvForm.name = file ? getFileBaseName(file.name) : ''
  toolMessage.value = ''

  if (!file) return

  await refreshCsvPreview()
}

function readFileAsDataUrl(file) {
  return readFileAs(file, 'dataUrl')
}

async function importCsvLayer() {
  if (!csvGeometryReady.value) return

  toolBusy.value = true
  toolMessage.value = ''

  try {
    const content = await readFileAsDataUrl(csvFile.value)
    const res = await apiClient.post('/api/csv/convert', {
      file: {
        name: csvFile.value.name,
        encoding: 'base64',
        content: String(content).split(',')[1]
      },
      config: {
        encoding: csvForm.encoding,
        delimiterMode: csvForm.delimiterMode,
        customDelimiter: csvForm.customDelimiter,
        startRow: csvForm.startRow,
        hasHeader: csvForm.hasHeader,
        inferFieldTypes: csvForm.inferFieldTypes,
        geometryMode: csvForm.geometryMode,
        xField: csvForm.xField,
        yField: csvForm.yField,
        wktField: csvForm.wktField,
        sourceCrs: csvForm.sourceCrs,
        buildSpatialIndex: csvForm.buildSpatialIndex
      }
    })

    const panel = await ensureResourcePanel()
    panel?.addExternalLayer({
      name: csvForm.name || getFileBaseName(csvFile.value.name),
      subtitle: `CSV / ${res.data.geometryType} / ${res.data.sourceCrs}`,
      sourceKind: 'csv',
      sourceCrs: res.data.sourceCrs,
      needsTransform: Boolean(res.data.needsTransform),
      notices: res.data.notices || [],
      geometryType: res.data.geometryType || inferGeometryType(res.data.geojson),
      buildSpatialIndex: Boolean(res.data.buildSpatialIndex),
      geojson: res.data.geojson
    })
    closeToolDialog()
  } catch (error) {
    toolMessage.value = error.response?.data?.error || error.message || 'CSV 导入失败'
  } finally {
    toolBusy.value = false
  }
}

async function handleVectorFiles(event) {
  vectorFiles.value = Array.from(event.target.files || [])
  const primary = vectorFiles.value.find((file) => /\.(geojson|json|shp)$/i.test(file.name))
  vectorForm.name = primary ? getFileBaseName(primary.name) : ''
  vectorForm.sourceCrs = ''
  toolMessage.value = ''

  try {
    const geojsonFile = vectorFiles.value.find((file) => /\.(geojson|json)$/i.test(file.name))
    const prjFile = vectorFiles.value.find((file) => /\.prj$/i.test(file.name))

    if (geojsonFile) {
      const geojson = JSON.parse(await geojsonFile.text())
      vectorForm.sourceCrs = getGeoJsonCrs(geojson) || ''
      return
    }

    if (prjFile) {
      vectorForm.sourceCrs = getPrjCrs(await prjFile.text()) || ''
    }
  } catch (error) {
    vectorForm.sourceCrs = ''
  }
}

async function readVectorGeoJson() {
  const geojsonFile = vectorFiles.value.find((file) => /\.(geojson|json)$/i.test(file.name))

  if (geojsonFile) {
    const geojson = JSON.parse(await geojsonFile.text())
    if (!geojson || geojson.type !== 'FeatureCollection') {
      throw new Error('文件内容不是 FeatureCollection')
    }
    const sourceCrs = normalizeCrs(vectorForm.sourceCrs) || getGeoJsonCrs(geojson)
    return { geojson, sourceCrs }
  }

  const shpFile = vectorFiles.value.find((file) => /\.shp$/i.test(file.name))
  if (!shpFile) {
    throw new Error('请选择 GeoJSON，或同时选择 Shapefile 的 .shp/.dbf，可选 .prj。')
  }

  const dbfFile = vectorFiles.value.find((file) => /\.dbf$/i.test(file.name))
  const prjFile = vectorFiles.value.find((file) => /\.prj$/i.test(file.name))
  const geojson = await shapefile.read(
    await shpFile.arrayBuffer(),
    dbfFile ? await dbfFile.arrayBuffer() : undefined,
    { encoding: vectorForm.encoding }
  )
  const sourceCrs = normalizeCrs(vectorForm.sourceCrs) || (prjFile ? getPrjCrs(await prjFile.text()) : '')
  return { geojson, sourceCrs }
}

async function importVectorLayer() {
  if (!vectorFiles.value.length) return

  toolBusy.value = true
  toolMessage.value = ''

  try {
    const { geojson, sourceCrs } = await readVectorGeoJson()
    const transformed = transformGeoJsonIfNeeded(geojson, sourceCrs)
    const panel = await ensureResourcePanel()
    panel?.addExternalLayer({
      name: vectorForm.name || '本地矢量图层',
      subtitle: sourceCrs ? `本地文件 / ${sourceCrs}` : '本地文件 / 源坐标系未解析',
      sourceKind: 'local-vector',
      sourceCrs,
      needsTransform: transformed.needsTransform,
      geometryType: inferGeometryType(transformed.geojson),
      geojson: transformed.geojson
    })
    closeToolDialog()
  } catch (error) {
    toolMessage.value = error.message || '本地矢量导入失败'
  } finally {
    toolBusy.value = false
  }
}

function handleCadFiles(event) {
  cadFiles.value = Array.from(event.target.files || [])
  toolMessage.value = ''
}

function readFileAs(file, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    mode === 'dataUrl' ? reader.readAsDataURL(file) : reader.readAsText(file)
  })
}

async function encodeCadFiles(files) {
  const encoded = []

  for (const file of files) {
    const content = await readFileAs(file, 'dataUrl')
    encoded.push({
      name: file.name,
      encoding: 'base64',
      content: String(content).split(',')[1]
    })
  }

  return encoded
}

async function importCadLayer() {
  if (!cadFiles.value.length) return

  toolBusy.value = true
  toolMessage.value = ''

  try {
    const res = await apiClient.post('/api/cad/convert', {
      files: await encodeCadFiles(cadFiles.value),
      sourceCrs: cadForm.sourceCrs
    })
    const firstFile = cadFiles.value[0]
    const layerName = cadFiles.value.length === 1
      ? getFileBaseName(firstFile.name)
      : `CAD 导入 ${cadFiles.value.length} 个文件`
    const panel = await ensureResourcePanel()
    const cadLayers = Array.isArray(res.data.layers) && res.data.layers.length
      ? res.data.layers
      : [{
          key: 'mixed',
          name: '',
          geometryType: res.data.geometryType || inferGeometryType(res.data.geojson),
          geojson: res.data.geojson
        }]

    cadLayers
      .slice()
      .sort((a, b) => getCadLayerInsertWeight(a) - getCadLayerInsertWeight(b))
      .forEach((cadLayer) => {
      const label = getCadGeometryLayerLabel(cadLayer)
      panel?.addExternalLayer({
        name: label ? `${layerName}-${label}` : layerName,
        subtitle: `CAD ${label || '图层'} / ${res.data.sourceCrs || cadForm.sourceCrs}`,
        sourceKind: 'cad',
        sourceCrs: res.data.sourceCrs || cadForm.sourceCrs,
        needsTransform: Boolean(res.data.needsTransform),
        notices: res.data.notices || [],
        geometryType: getCadGeometryType(cadLayer),
        geojson: cadLayer.geojson
      })
    })
    closeToolDialog()
  } catch (error) {
    toolMessage.value = error.response?.data?.error || error.message || 'CAD 导入失败'
  } finally {
    toolBusy.value = false
  }
}
</script>

<template>
  <div class="main-view">
    <div class="content-area">
      <div v-if="!leftPanelCollapsed" class="left-panel">
        <ResourcePanel
          ref="resourceRef"
          @add-layer="handleAddLayer"
          @toggle-layer="handleToggleLayer"
          @update-layer-style="handleUpdateLayerStyle"
          @select-feature="handleSelectFeature"
          @remove-layer="handleRemoveLayer"
          @reorder-layer="handleReorderLayer"
          @request-edit-layer="handleRequestLayerEdit"
          @request-exit-edit-layer="handleRequestLayerEditExit"
          @export-layer="handleLayerExport"
        />
        <div class="left-toggle" @click="toggleLeftPanel">
          <span class="toggle-icon">◀</span>
        </div>
      </div>
      <div v-else class="left-collapsed" @click="toggleLeftPanel">
        <span class="collapsed-icon">▶</span>
      </div>
      <div class="map-container">
        <MapView
          ref="mapRef"
          @map-click="handleMapClick"
          @table-drop="handleTableDrop"
          @feature-select="handleMapFeatureSelect"
          @edit-layer-change="handleEditLayerChange"
          @edit-feature-created="handleEditFeatureCreated"
        />
        <div v-if="editingLayer" class="edit-toolbar">
          <div class="edit-toolbar-title">
            <strong>{{ editingLayer.name }}</strong>
            <span>{{ editingDirty ? '有未保存编辑' : '编辑中' }}</span>
          </div>
          <div class="edit-toolbar-actions">
            <button type="button" :class="{ active: editingMode === 'select' }" @click="setEditingMode('select')">选择</button>
            <button type="button" :class="{ active: editingMode === 'vertex' }" @click="setEditingMode('vertex')">编辑节点</button>
            <button type="button" :class="{ active: editingMode === 'add' }" @click="setEditingMode('add')">新增要素</button>
            <button type="button" @click="deleteSelectedEditingFeature">删除</button>
            <button type="button" :disabled="!editingDirty" @click="undoLayerEditing">撤销</button>
            <button type="button" class="primary" :disabled="!editingDirty" @click="saveLayerEditing">保存</button>
            <button type="button" @click="requestExitEditing()">退出编辑</button>
          </div>
        </div>
      </div>
      <RightPanel 
        v-if="appStore.rightPanelVisible" 
        :title="appStore.rightPanelTitle"
      />
    </div>

    <div
      v-if="appToast.visible"
      class="app-toast"
      :class="appToast.type"
      role="status"
      aria-live="polite"
    >
      {{ appToast.message }}
    </div>

    <div
      v-if="activeTool"
      class="tool-dialog-backdrop"
      :class="{ 'map-picking': mapBboxPicking }"
      @click.self="!mapBboxPicking && closeToolDialog()"
    >
      <section
        class="tool-dialog"
        :class="{
          wide: activeTool === 'mapshaper' || activeTool === 'csv-import',
          collapsed: toolDialogCollapsed,
          dragging: toolDialogDragging,
          'map-picking': mapBboxPicking
        }"
        :style="toolDialogStyle"
        role="dialog"
        aria-modal="true"
      >
        <header
          class="tool-dialog-head"
          @pointerdown="startToolDialogDrag"
          @pointermove="moveToolDialog"
          @pointerup="endToolDialogDrag"
          @pointercancel="endToolDialogDrag"
        >
          <div>
            <p>{{ activeTool === 'mapshaper' ? 'Data Edit' : 'GIS Tool' }}</p>
            <h2>{{ activeToolMeta.title }}</h2>
            <span>{{ activeToolMeta.subtitle }}</span>
          </div>
          <div class="tool-dialog-window-actions">
            <button type="button" :title="toolDialogCollapsed ? '展开' : '收起'" @click="toggleToolDialogCollapsed">
              {{ toolDialogCollapsed ? '展开' : '收起' }}
            </button>
            <button type="button" :disabled="toolBusy" title="关闭" @click="closeToolDialog">x</button>
          </div>
        </header>

        <template v-if="!toolDialogCollapsed">
        <div v-if="activeTool === 'local-vector-import'" class="tool-dialog-body">
          <label class="tool-drop-field">
            <input type="file" multiple accept=".geojson,.json,.shp,.dbf,.prj" @change="handleVectorFiles" />
            <strong>选择空间数据文件</strong>
            <small>{{ vectorSummary }}</small>
          </label>
          <div class="tool-form-grid">
            <label>
              <span>图层名称</span>
              <input v-model.trim="vectorForm.name" type="text" placeholder="默认使用文件名" />
            </label>
            <label>
              <span>源坐标系</span>
              <input v-model.trim="vectorForm.sourceCrs" type="text" placeholder="自动解析文件坐标信息，解析不出来则空" />
            </label>
            <label>
              <span>DBF 编码</span>
              <select v-model="vectorForm.encoding">
                <option value="utf-8">UTF-8</option>
                <option value="gbk">GBK</option>
              </select>
            </label>
          </div>
        </div>

        <div v-else-if="activeTool === 'csv-import'" class="tool-dialog-body csv-import-body">
          <label class="tool-drop-field">
            <input type="file" accept=".csv,text/csv,text/plain" @change="handleCsvFile" />
            <strong>选择 CSV 文件</strong>
            <small>{{ csvFile?.name || '未选择文件' }}</small>
          </label>

          <div class="csv-config-section">
            <div class="csv-section-title">
              <strong>文件解析</strong>
              <span>{{ csvRawLines.length ? `${csvRawLines.length} 行原始记录` : '等待文件' }}</span>
            </div>
            <div class="tool-form-grid">
              <label>
                <span>图层名称</span>
                <input v-model.trim="csvForm.name" type="text" placeholder="默认使用文件名" />
              </label>
              <label>
                <span>编码方式</span>
                <select v-model="csvForm.encoding">
                  <option value="utf-8">UTF-8</option>
                  <option value="gbk">GBK</option>
                </select>
              </label>
              <label>
                <span>分隔符</span>
                <select v-model="csvForm.delimiterMode">
                  <option value="comma">逗号 ,</option>
                  <option value="tab">Tab</option>
                  <option value="space">空格</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label v-if="csvForm.delimiterMode === 'custom'">
                <span>自定义分隔符</span>
                <input v-model="csvForm.customDelimiter" type="text" maxlength="8" />
              </label>
              <label>
                <span>记录开始行</span>
                <input v-model.number="csvForm.startRow" type="number" min="1" step="1" />
              </label>
            </div>
            <div class="csv-option-row">
              <label>
                <input v-model="csvForm.hasHeader" type="checkbox" />
                <span>首行是字段名</span>
              </label>
              <label>
                <input v-model="csvForm.inferFieldTypes" type="checkbox" />
                <span>自动识别字段类型</span>
              </label>
              <label>
                <input v-model="csvForm.buildSpatialIndex" type="checkbox" />
                <span>构建空间索引</span>
              </label>
            </div>
          </div>

          <div class="csv-preview">
            <div class="preview-head">
              <small>{{ csvPreviewStatusText }}</small>
              <strong>样例数据预览</strong>
              <span :class="{ ok: csvGeometryReady }">{{ csvGeometryReady ? '配置可加载' : '等待配置完整' }}</span>
            </div>
            <div v-if="csvPreviewRows.length" class="csv-preview-table">
              <table>
                <thead>
                  <tr>
                    <th
                      v-for="column in csvPreviewColumns"
                      :key="column"
                      :class="getCsvPreviewColumnClass(column)"
                    >
                      {{ column }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in csvPreviewRows" :key="index">
                    <td
                      v-for="column in csvPreviewColumns"
                      :key="column"
                      :class="getCsvPreviewColumnClass(column)"
                    >
                      {{ row[column] }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="csv-preview-empty">选择文件后显示前 10 行样例数据</div>
          </div>

          <div class="csv-config-section">
            <div class="csv-section-title">
              <strong>几何定义</strong>
              <span>{{ csvForm.geometryMode === 'wkt' ? 'WKT 文本' : '点坐标字段' }}</span>
            </div>
            <div class="csv-option-row compact">
              <label>
                <input v-model="csvForm.geometryMode" type="radio" value="xy" />
                <span>点图层</span>
              </label>
              <label>
                <input v-model="csvForm.geometryMode" type="radio" value="wkt" />
                <span>WKT 文本</span>
              </label>
            </div>
            <div class="tool-form-grid">
              <template v-if="csvForm.geometryMode === 'xy'">
                <label>
                  <span>X / 经度字段</span>
                  <select v-model="csvForm.xField">
                    <option value="">请选择</option>
                    <option v-for="column in csvColumns" :key="column" :value="column">{{ column }}</option>
                  </select>
                </label>
                <label>
                  <span>Y / 纬度字段</span>
                  <select v-model="csvForm.yField">
                    <option value="">请选择</option>
                    <option v-for="column in csvColumns" :key="column" :value="column">{{ column }}</option>
                  </select>
                </label>
              </template>
              <label v-else>
                <span>WKT 字段</span>
                <select v-model="csvForm.wktField">
                  <option value="">请选择</option>
                  <option v-for="column in csvColumns" :key="column" :value="column">{{ column }}</option>
                </select>
              </label>
            </div>
          </div>

          <div class="csv-config-section">
            <div class="csv-section-title">
              <strong>坐标系</strong>
              <span>{{ selectedCsvSpatialReference?.source || spatialReferenceSource || '-' }}</span>
            </div>
            <div class="tool-form-grid">
              <label>
                <span>搜索坐标系</span>
                <input
                  :value="spatialReferenceKeyword"
                  type="search"
                  placeholder="输入 EPSG、名称或 SRID"
                  @input="handleSpatialReferenceSearch"
                />
              </label>
              <label>
                <span>源坐标系</span>
                <select v-model="csvForm.sourceCrs" :disabled="spatialReferenceLoading">
                  <option value="">{{ spatialReferenceLoading ? '正在加载...' : '请选择坐标系' }}</option>
                  <option
                    v-for="item in spatialReferences"
                    :key="item.code"
                    :value="item.code"
                  >
                    {{ item.code }} · {{ item.name }}
                  </option>
                </select>
              </label>
            </div>
            <div class="spatial-reference-detail">
              <strong>{{ selectedCsvSpatialReference?.code || csvForm.sourceCrs || '未选择坐标系' }}</strong>
              <span>{{ selectedCsvSpatialReference?.name || 'CSV 坐标会按源坐标系转换为 EPSG:4326 后加载。' }}</span>
              <small>
                {{ selectedCsvSpatialReference ? `SRID ${selectedCsvSpatialReference.srid} / 来源 ${selectedCsvSpatialReference.source || spatialReferenceSource || '-'}` : `来源 ${spatialReferenceSource || '-'}` }}
              </small>
            </div>
          </div>
        </div>

        <div v-else-if="activeTool === 'cad-import'" class="tool-dialog-body">
          <label class="tool-drop-field">
            <input type="file" multiple accept=".dxf,.dwg" @change="handleCadFiles" />
            <strong>选择 CAD 文件</strong>
            <small>{{ cadSummary }}</small>
          </label>
          <div class="tool-form-grid">
            <label>
              <span>搜索坐标系</span>
              <input
                :value="spatialReferenceKeyword"
                type="search"
                placeholder="输入 EPSG、名称或 SRID"
                @input="handleSpatialReferenceSearch"
              />
            </label>
            <label>
              <span>源坐标系</span>
              <select v-model="cadForm.sourceCrs" :disabled="spatialReferenceLoading">
                <option value="">{{ spatialReferenceLoading ? '正在加载...' : '请选择坐标系' }}</option>
                <option
                  v-for="item in spatialReferences"
                  :key="item.code"
                  :value="item.code"
                >
                  {{ item.code }} · {{ item.name }}
                </option>
              </select>
            </label>
          </div>
          <div class="spatial-reference-detail">
            <strong>{{ selectedCadSpatialReference?.code || cadForm.sourceCrs || '未选择坐标系' }}</strong>
            <span>{{ selectedCadSpatialReference?.name || '坐标系列表会优先读取数据库，读取不到时使用内置常用 EPSG 清单。' }}</span>
            <small>
              {{ selectedCadSpatialReference ? `SRID ${selectedCadSpatialReference.srid} / 来源 ${selectedCadSpatialReference.source || spatialReferenceSource || '-'}` : `来源 ${spatialReferenceSource || '-'}` }}
            </small>
          </div>
          <div class="tool-info-grid">
            <span>首期 DXF 转 GeoJSON</span>
            <span>支持 POINT、LINE、POLYLINE、CIRCLE、ARC、TEXT 等常见实体</span>
            <span>转换时按所选源坐标系读取并统一输出 EPSG:4326</span>
          </div>
        </div>

        <div v-else-if="activeTool === 'create-layer'" class="tool-dialog-body">
          <div class="tool-form-grid">
            <label>
              <span>图层名称</span>
              <input v-model.trim="createLayerForm.name" type="text" placeholder="例如：巡检点位" />
            </label>
            <label>
              <span>图层类型</span>
              <select v-model="createLayerForm.geometryType">
                <option v-for="item in geometryTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
          </div>

          <div class="create-layer-fields">
            <div class="csv-section-title">
              <strong>属性字段</strong>
              <span>GeoJSON / EPSG:4326</span>
            </div>
            <div
              v-for="(field, index) in createLayerForm.fields"
              :key="index"
              class="field-row"
            >
              <input v-model.trim="field.name" type="text" placeholder="字段名" />
              <select v-model="field.type">
                <option v-for="item in fieldTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
              <button type="button" title="删除字段" @click="removeCreateField(index)">x</button>
            </div>
            <button class="secondary-inline-btn" type="button" @click="addCreateField">新增字段</button>
          </div>
        </div>

        <div v-else-if="activeTool === 'coord-convert'" class="tool-dialog-body">
          <div class="coord-convert-summary">
            <strong>{{ coordConvertMeta.label }}</strong>
            <span>{{ coordConvertMeta.from }} -> {{ coordConvertMeta.to }}</span>
          </div>
          <div class="csv-option-row compact">
            <label>
              <input v-model="coordConvertForm.inputMode" type="radio" value="layer" />
              <span>图层列表</span>
            </label>
            <label>
              <input v-model="coordConvertForm.inputMode" type="radio" value="upload" />
              <span>上传文件</span>
            </label>
          </div>
          <div v-if="coordConvertForm.inputMode === 'layer'" class="tool-form-grid">
            <label>
              <span>输入图层</span>
              <select v-model="coordConvertForm.layerId">
                <option value="">请选择图层</option>
                <option v-for="layer in coordConvertLayers" :key="layer.id" :value="layer.id">
                  {{ layer.name }} / {{ layer.geometryType || 'GEOMETRY' }}
                </option>
              </select>
            </label>
            <label>
              <span>转换方向</span>
              <select v-model="coordConvertForm.direction">
                <option v-for="item in coordConvertOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>
          </div>
          <template v-else>
            <label class="tool-drop-field">
              <input type="file" multiple accept=".geojson,.json,.shp,.dbf,.prj,application/geo+json,application/json" @change="handleCoordConvertFile" />
              <strong>选择 GeoJSON 或 Shapefile</strong>
              <small>{{ coordConvertUploadSummary }}</small>
            </label>
            <div class="tool-form-grid">
              <label>
                <span>转换方向</span>
                <select v-model="coordConvertForm.direction">
                  <option v-for="item in coordConvertOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </label>
            </div>
          </template>
          <div class="tool-form-grid">
            <label>
              <span>输出图层名</span>
              <input v-model.trim="coordConvertForm.outputName" type="text" placeholder="默认使用输入图层名和转换方向" />
            </label>
          </div>
          <div class="csv-config-section output-format-section">
            <div class="csv-section-title">
              <strong>输出格式</strong>
              <span>当前支持 GeoJSON / Shapefile，后续可扩展其他格式</span>
            </div>
            <div class="format-segment-list">
              <button
                v-for="item in coordOutputFormatOptions"
                :key="`coord-format-${item.value}`"
                type="button"
                :class="{ active: coordConvertForm.outputFormat === item.value }"
                @click="coordConvertForm.outputFormat = item.value"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
          <div class="coord-output-picker">
            <span>输出文件</span>
            <strong>点击“开始转换”后选择保存位置</strong>
            <small>GeoJSON 保存为 .geojson；Shapefile 保存为包含 .shp/.shx/.dbf/.prj 的 .zip。</small>
          </div>
          <label class="inline-check result-display-toggle">
            <input v-model="coordConvertForm.showResult" type="checkbox" />
            <span>转换完成后显示结果图层</span>
            <small>关闭后只保存输出文件，不叠加到地图，可减少前端渲染压力。</small>
          </label>
          <div class="tool-info-grid">
            <span>支持 Point、LineString、Polygon、Multi* 和 GeometryCollection。</span>
            <span>勾选显示结果时，转换结果会作为新图层添加到图层列表并叠加到地图。</span>
          </div>
        </div>

        <div v-else-if="activeTool === 'crs-transform'" class="tool-dialog-body">
          <div class="csv-option-row compact">
            <label>
              <input v-model="crsTransformForm.inputMode" type="radio" value="layer" @change="syncCrsTransformLayerCrs" />
              <span>图层列表</span>
            </label>
            <label>
              <input v-model="crsTransformForm.inputMode" type="radio" value="upload" />
              <span>上传文件</span>
            </label>
          </div>

          <div v-if="crsTransformForm.inputMode === 'layer'" class="tool-form-grid">
            <label>
              <span>输入图层</span>
              <select v-model="crsTransformForm.layerId" @change="syncCrsTransformLayerCrs">
                <option value="">请选择图层</option>
                <option v-for="layer in coordConvertLayers" :key="layer.id" :value="layer.id">
                  {{ layer.name }} / {{ layer.sourceCrs || layer.crs || 'CRS 未知' }}
                </option>
              </select>
            </label>
          </div>
          <label v-else class="tool-drop-field">
            <input type="file" multiple accept=".geojson,.json,.shp,.dbf,.prj,application/geo+json,application/json" @change="handleCrsTransformFile" />
            <strong>选择 GeoJSON 或 Shapefile</strong>
            <small>{{ crsTransformUploadSummary }}</small>
          </label>

          <div class="csv-config-section">
            <div class="csv-section-title">
              <strong>坐标系</strong>
              <span>{{ spatialReferenceSource || '内置/数据库清单' }}</span>
            </div>
            <div class="tool-form-grid crs-transform-grid">
              <div class="crs-search-field">
                <span>搜索输入坐标系</span>
                <input
                  :value="crsTransformSourceKeyword"
                  type="search"
                  placeholder="输入 EPSG、名称或 SRID"
                  @input="handleCrsTransformReferenceSearch('source', $event)"
                />
                <div class="crs-search-results">
                  <small v-if="crsTransformReferenceLoading.source">正在搜索...</small>
                  <template v-else>
                    <button
                      v-for="item in getCrsTransformReferenceList('source')"
                      :key="`source-search-${item.code}`"
                      type="button"
                      :class="{ active: item.code === crsTransformForm.sourceCrs }"
                      @click="selectCrsTransformReference('source', item)"
                    >
                      <strong>{{ item.code }}</strong>
                      <span>{{ item.name }}</span>
                    </button>
                  </template>
                  <small v-if="!crsTransformReferenceLoading.source && !getCrsTransformReferenceList('source').length">
                    没有匹配坐标系
                  </small>
                </div>
              </div>
              <label>
                <span>输入坐标系</span>
                <select v-model="crsTransformForm.sourceCrs" :disabled="crsTransformReferenceLoading.source">
                  <option value="">{{ crsTransformReferenceLoading.source ? '正在加载...' : '解析不到时请选择' }}</option>
                  <option
                    v-for="item in getCrsTransformReferenceList('source')"
                    :key="`source-${item.code}`"
                    :value="item.code"
                  >
                    {{ item.code }} · {{ item.name }}
                  </option>
                </select>
              </label>
              <div class="crs-search-field">
                <span>搜索输出坐标系</span>
                <input
                  :value="crsTransformTargetKeyword"
                  type="search"
                  placeholder="输入 EPSG、名称或 SRID"
                  @input="handleCrsTransformReferenceSearch('target', $event)"
                />
                <div class="crs-search-results">
                  <small v-if="crsTransformReferenceLoading.target">正在搜索...</small>
                  <template v-else>
                    <button
                      v-for="item in getCrsTransformReferenceList('target')"
                      :key="`target-search-${item.code}`"
                      type="button"
                      :class="{ active: item.code === crsTransformForm.targetCrs }"
                      @click="selectCrsTransformReference('target', item)"
                    >
                      <strong>{{ item.code }}</strong>
                      <span>{{ item.name }}</span>
                    </button>
                  </template>
                  <small v-if="!crsTransformReferenceLoading.target && !getCrsTransformReferenceList('target').length">
                    没有匹配坐标系
                  </small>
                </div>
              </div>
              <label>
                <span>输出坐标系</span>
                <select v-model="crsTransformForm.targetCrs" :disabled="crsTransformReferenceLoading.target">
                  <option value="">{{ crsTransformReferenceLoading.target ? '正在加载...' : '请选择输出坐标系' }}</option>
                  <option
                    v-for="item in getCrsTransformReferenceList('target')"
                    :key="`target-${item.code}`"
                    :value="item.code"
                  >
                    {{ item.code }} · {{ item.name }}
                  </option>
                </select>
              </label>
            </div>
            <div class="spatial-reference-detail">
              <strong>{{ selectedCrsTransformSourceReference?.code || crsTransformForm.sourceCrs || '未选择输入坐标系' }}</strong>
              <span>{{ selectedCrsTransformSourceReference?.name || '输入图层解析不到坐标系时，需要在上方搜索并选择。' }}</span>
              <small>
                输入来源 {{ selectedCrsTransformSourceReference?.source || spatialReferenceSource || '-' }}
              </small>
            </div>
            <div class="spatial-reference-detail">
              <strong>{{ selectedCrsTransformTargetReference?.code || crsTransformForm.targetCrs || '未选择输出坐标系' }}</strong>
              <span>{{ selectedCrsTransformTargetReference?.name || '输出文件会按该坐标系保存。' }}</span>
              <small>
                输出来源 {{ selectedCrsTransformTargetReference?.source || spatialReferenceSource || '-' }}
              </small>
            </div>
          </div>

          <div class="tool-form-grid">
            <label>
              <span>输出图层名</span>
              <input v-model.trim="crsTransformForm.outputName" type="text" placeholder="默认使用输入名和坐标系" />
            </label>
            <label>
              <span>编码方式</span>
              <select v-model="crsTransformForm.encoding">
                <option v-for="item in exportEncodingOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
          </div>
          <div class="csv-config-section output-format-section">
            <div class="csv-section-title">
              <strong>输出格式</strong>
              <span>当前支持 GeoJSON / Shapefile，后续可扩展其他格式</span>
            </div>
            <div class="format-segment-list">
              <button
                v-for="item in exportFormatOptions"
                :key="`crs-format-${item.value}`"
                type="button"
                :class="{ active: crsTransformForm.outputFormat === item.value }"
                @click="crsTransformForm.outputFormat = item.value"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
          <div class="coord-output-picker">
            <span>输出路径</span>
            <strong>点击“开始转换”后选择保存位置</strong>
            <small>输出文件按所选坐标系保存；地图叠加预览会统一转换为 EPSG:4326。</small>
          </div>
          <label class="inline-check result-display-toggle">
            <input v-model="crsTransformForm.showResult" type="checkbox" />
            <span>转换完成后显示结果图层</span>
            <small>关闭后只保存输出文件，不叠加到地图，可减少前端渲染压力。</small>
          </label>
        </div>

        <div v-else-if="analysisToolIds.includes(activeTool)" class="tool-dialog-body">
          <div v-if="!['fishnet', 'layer-merge'].includes(activeTool)" class="analysis-source-grid">
            <div class="analysis-source-card">
              <div class="analysis-source-head">
                <strong>{{ activeTool === 'accessibility-analysis' ? '起点图层' : '输入图层' }}</strong>
                <div class="analysis-source-mode">
                  <label>
                    <input v-model="analysisSourceModes.input" type="radio" value="layer" />
                    <span>图层列表</span>
                  </label>
                  <label>
                    <input v-model="analysisSourceModes.input" type="radio" value="upload" />
                    <span>本地文件</span>
                  </label>
                </div>
              </div>
              <label v-if="analysisSourceModes.input === 'layer'">
                <span>选择图层</span>
                <select v-model="analysisForm.inputLayerId">
                  <option value="">请选择图层</option>
                  <option v-for="layer in analysisLayers" :key="layer.id" :value="layer.id">
                    {{ layer.name }} / {{ layer.geometryType || 'GEOMETRY' }}
                  </option>
                </select>
              </label>
              <label v-else class="tool-drop-field compact">
                <input type="file" multiple :accept="analysisVectorAccept" @change="handleAnalysisSourceFiles('input', $event)" />
                <strong>选择 GeoJSON 或 Shapefile</strong>
                <small>{{ analysisUploadSummaries.input }}</small>
              </label>
            </div>

            <div v-if="['layer-intersection', 'layer-clip'].includes(activeTool)" class="analysis-source-card">
              <div class="analysis-source-head">
                <strong>{{ activeTool === 'layer-clip' ? '裁剪面图层' : '叠加图层' }}</strong>
                <div class="analysis-source-mode">
                  <label>
                    <input v-model="analysisSourceModes.overlay" type="radio" value="layer" />
                    <span>图层列表</span>
                  </label>
                  <label>
                    <input v-model="analysisSourceModes.overlay" type="radio" value="upload" />
                    <span>本地文件</span>
                  </label>
                </div>
              </div>
              <label v-if="analysisSourceModes.overlay === 'layer'">
                <span>选择图层</span>
                <select v-model="analysisForm.overlayLayerId">
                  <option value="">请选择图层</option>
                  <option v-for="layer in (activeTool === 'layer-clip' ? analysisPolygonLayers : analysisLayers)" :key="layer.id" :value="layer.id">
                    {{ layer.name }} / {{ layer.geometryType || 'GEOMETRY' }}
                  </option>
                </select>
              </label>
              <label v-else class="tool-drop-field compact">
                <input type="file" multiple :accept="analysisVectorAccept" @change="handleAnalysisSourceFiles('overlay', $event)" />
                <strong>选择 GeoJSON 或 Shapefile</strong>
                <small>{{ analysisUploadSummaries.overlay }}</small>
              </label>
            </div>

            <div v-if="activeTool === 'spatial-join'" class="analysis-source-card">
              <div class="analysis-source-head">
                <strong>连接图层</strong>
                <div class="analysis-source-mode">
                  <label>
                    <input v-model="analysisSourceModes.join" type="radio" value="layer" />
                    <span>图层列表</span>
                  </label>
                  <label>
                    <input v-model="analysisSourceModes.join" type="radio" value="upload" />
                    <span>本地文件</span>
                  </label>
                </div>
              </div>
              <label v-if="analysisSourceModes.join === 'layer'">
                <span>选择图层</span>
                <select v-model="analysisForm.joinLayerId">
                  <option value="">请选择图层</option>
                  <option v-for="layer in analysisLayers" :key="layer.id" :value="layer.id">
                    {{ layer.name }} / {{ layer.geometryType || 'GEOMETRY' }}
                  </option>
                </select>
              </label>
              <label v-else class="tool-drop-field compact">
                <input type="file" multiple :accept="analysisVectorAccept" @change="handleAnalysisSourceFiles('join', $event)" />
                <strong>选择 GeoJSON 或 Shapefile</strong>
                <small>{{ analysisUploadSummaries.join }}</small>
              </label>
            </div>
          </div>

          <div v-if="activeTool === 'layer-merge'" class="analysis-source-card">
            <div class="analysis-source-head">
              <strong>待合并图层</strong>
              <div class="analysis-source-mode">
                <label>
                  <input v-model="analysisSourceModes.merge" type="radio" value="layer" />
                  <span>图层列表</span>
                </label>
                <label>
                  <input v-model="analysisSourceModes.merge" type="radio" value="upload" />
                  <span>本地文件</span>
                </label>
              </div>
            </div>
            <div v-if="analysisSourceModes.merge === 'layer'" class="layer-check-list">
              <label v-for="layer in analysisLayers" :key="layer.id">
                <input v-model="analysisForm.layerIds" type="checkbox" :value="layer.id" />
                <span>{{ layer.name }} / {{ layer.geometryType || 'GEOMETRY' }}</span>
              </label>
            </div>
            <label v-else class="tool-drop-field compact">
              <input type="file" multiple :accept="analysisVectorAccept" @change="handleAnalysisSourceFiles('merge', $event)" />
              <strong>选择多个 GeoJSON 或 Shapefile 文件组</strong>
              <small>{{ analysisUploadSummaries.merge }}</small>
            </label>
          </div>

          <div v-if="activeTool === 'buffer-analysis'" class="tool-form-grid">
            <label>
              <span>缓冲距离</span>
              <input v-model.number="analysisForm.distance" type="number" min="0" step="1" />
            </label>
            <label>
              <span>单位</span>
              <select v-model="analysisForm.units">
                <option v-for="item in distanceUnitOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label class="inline-check">
              <input v-model="analysisForm.dissolve" type="checkbox" />
              <span>融合缓冲区</span>
            </label>
          </div>

          <div v-if="activeTool === 'spatial-join'" class="tool-form-grid">
            <label>
              <span>空间关系</span>
              <select v-model="analysisForm.predicate">
                <option v-for="item in spatialPredicateOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label>
              <span>匹配模式</span>
              <select v-model="analysisForm.joinMode">
                <option value="first">只取第一个匹配</option>
                <option value="all">合并全部匹配属性</option>
              </select>
            </label>
          </div>

          <div v-if="activeTool === 'feature-merge'" class="tool-form-grid">
            <label v-if="analysisSourceModes.input === 'layer'">
              <span>融合字段</span>
              <select v-model="analysisForm.dissolveField">
                <option value="">全部融合为一组</option>
                <option v-for="field in selectedAnalysisLayerFields" :key="field" :value="field">{{ field }}</option>
              </select>
            </label>
            <label v-else>
              <span>融合字段</span>
              <input v-model.trim="analysisForm.dissolveField" type="text" placeholder="留空则全部融合为一组" />
            </label>
          </div>

          <div v-if="activeTool === 'accessibility-analysis'" class="tool-form-grid">
            <label>
              <span>阈值模式</span>
              <select v-model="analysisForm.travelMode">
                <option value="distance">距离</option>
                <option value="time">时间</option>
              </select>
            </label>
            <label>
              <span>{{ analysisForm.travelMode === 'time' ? '时间（分钟）' : '距离（米）' }}</span>
              <input v-model.number="analysisForm.distance" type="number" min="0" step="1" />
            </label>
            <label v-if="analysisForm.travelMode === 'time'">
              <span>速度（km/h）</span>
              <input v-model.number="analysisForm.speedKmh" type="number" min="1" step="1" />
            </label>
          </div>

          <div v-if="activeTool === 'fishnet'" class="csv-config-section">
            <div class="csv-option-row compact">
              <label>
                <input v-model="analysisForm.extentMode" type="radio" value="layer" />
                <span>图层范围</span>
              </label>
              <label>
                <input v-model="analysisForm.extentMode" type="radio" value="bbox" />
                <span>手动 BBox</span>
              </label>
              <label>
                <input v-model="analysisForm.extentMode" type="radio" value="viewport" />
                <span>当前视窗</span>
              </label>
              <label>
                <input v-model="analysisForm.extentMode" type="radio" value="select" />
                <span>地图框选</span>
              </label>
            </div>
            <div v-if="analysisForm.extentMode === 'layer'" class="analysis-source-card">
              <div class="analysis-source-head">
                <strong>范围图层</strong>
                <div class="analysis-source-mode">
                  <label>
                    <input v-model="analysisSourceModes.extent" type="radio" value="layer" />
                    <span>图层列表</span>
                  </label>
                  <label>
                    <input v-model="analysisSourceModes.extent" type="radio" value="upload" />
                    <span>本地文件</span>
                  </label>
                </div>
              </div>
              <label v-if="analysisSourceModes.extent === 'layer'">
                <span>选择图层</span>
                <select v-model="analysisForm.extentLayerId">
                  <option value="">请选择图层</option>
                  <option v-for="layer in analysisLayers" :key="layer.id" :value="layer.id">{{ layer.name }}</option>
                </select>
              </label>
              <label v-else class="tool-drop-field compact">
                <input type="file" multiple :accept="analysisVectorAccept" @change="handleAnalysisSourceFiles('extent', $event)" />
                <strong>选择 GeoJSON 或 Shapefile</strong>
                <small>{{ analysisUploadSummaries.extent }}</small>
              </label>
            </div>
            <div class="tool-form-grid">
              <label v-if="analysisForm.extentMode === 'bbox'">
                <span>BBox</span>
                <input v-model.trim="analysisForm.bbox" type="text" placeholder="minX,minY,maxX,maxY" />
              </label>
              <label v-if="analysisForm.extentMode === 'viewport'">
                <span>当前视窗范围</span>
                <input :value="formatBboxText(mapRef?.getViewportBbox?.() || [])" type="text" readonly />
              </label>
              <label v-if="analysisForm.extentMode === 'select'">
                <span>框选范围</span>
                <input v-model.trim="analysisForm.selectedBbox" type="text" readonly placeholder="点击右侧按钮后在地图上拖拽框选" />
              </label>
              <button
                v-if="analysisForm.extentMode === 'select'"
                class="secondary-inline-btn"
                type="button"
                @click="pickFishnetBboxFromMap"
              >
                开始框选
              </button>
              <label>
                <span>生成模式</span>
                <select v-model="analysisForm.gridMode">
                  <option value="rows-cols">行列数</option>
                  <option value="cell-size">网格尺寸（米）</option>
                </select>
              </label>
              <template v-if="analysisForm.gridMode === 'rows-cols'">
                <label>
                  <span>行数</span>
                  <input v-model.number="analysisForm.rows" type="number" min="1" step="1" />
                </label>
                <label>
                  <span>列数</span>
                  <input v-model.number="analysisForm.cols" type="number" min="1" step="1" />
                </label>
              </template>
              <template v-else>
                <label>
                  <span>网格宽度（米）</span>
                  <input v-model.number="analysisForm.cellWidth" type="number" min="1" step="1" />
                </label>
                <label>
                  <span>网格高度（米）</span>
                  <input v-model.number="analysisForm.cellHeight" type="number" min="1" step="1" />
                </label>
              </template>
            </div>
          </div>

          <label>
            <span>输出图层名</span>
            <input v-model.trim="analysisForm.outputName" type="text" placeholder="默认使用工具名和日期" />
          </label>
          <div class="tool-form-grid">
            <div class="crs-search-field">
              <span>搜索输出坐标系</span>
              <input
                :value="analysisTargetKeyword"
                type="search"
                placeholder="输入 EPSG、名称或 SRID"
                @input="handleAnalysisTargetReferenceSearch"
              />
              <div class="crs-search-results">
                <small v-if="analysisTargetReferenceLoading">正在搜索...</small>
                <template v-else>
                  <button
                    v-for="item in getAnalysisTargetReferenceList()"
                    :key="`analysis-target-search-${item.code}`"
                    type="button"
                    :class="{ active: item.code === analysisForm.targetCrs }"
                    @click="selectAnalysisTargetReference(item)"
                  >
                    <strong>{{ item.code }}</strong>
                    <span>{{ item.name }}</span>
                  </button>
                </template>
                <small v-if="!analysisTargetReferenceLoading && !getAnalysisTargetReferenceList().length">
                  没有匹配坐标系
                </small>
              </div>
            </div>
            <label>
              <span>输出坐标系</span>
              <select v-model="analysisForm.targetCrs" :disabled="analysisTargetReferenceLoading">
                <option value="">{{ analysisTargetReferenceLoading ? '正在加载...' : '请选择输出坐标系' }}</option>
                <option
                  v-for="item in getAnalysisTargetReferenceList()"
                  :key="`analysis-target-${item.code}`"
                  :value="item.code"
                >
                  {{ item.code }} · {{ item.name }}
                </option>
              </select>
            </label>
            <label>
              <span>输出格式</span>
              <select v-model="analysisForm.outputFormat">
                <option v-for="item in exportFormatOptions" :key="`analysis-format-${item.value}`" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label>
              <span>编码方式</span>
              <select v-model="analysisForm.encoding">
                <option v-for="item in exportEncodingOptions" :key="`analysis-encoding-${item.value}`" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
          </div>
          <div class="spatial-reference-detail">
            <strong>{{ selectedAnalysisTargetReference?.code || analysisForm.targetCrs || '未选择输出坐标系' }}</strong>
            <span>{{ selectedAnalysisTargetReference?.name || '输出文件会按该坐标系保存；地图预览仍使用 EPSG:4326。' }}</span>
            <small>输出来源 {{ selectedAnalysisTargetReference?.source || spatialReferenceSource || '-' }}</small>
          </div>
          <div class="coord-output-picker">
            <span>输出路径</span>
            <strong>点击“开始分析”后选择保存位置</strong>
            <small>GeoJSON 保存为 .geojson；Shapefile 保存为包含 .shp/.shx/.dbf/.prj 的 .zip。</small>
          </div>
          <label class="inline-check result-display-toggle">
            <input v-model="analysisForm.showResult" type="checkbox" />
            <span>分析完成后显示结果图层</span>
            <small>关闭后只完成分析计算，不叠加到地图，可减少前端渲染压力。</small>
          </label>
          <div class="tool-info-grid">
            <span>勾选显示结果时，运行成功后会自动生成结果图层并叠加到地图。</span>
            <span v-if="activeTool === 'accessibility-analysis'">当前实现为简化服务范围：按距离或时间换算距离生成缓冲区。</span>
          </div>
        </div>

        <div v-else-if="downloadToolIds.includes(activeTool)" class="tool-dialog-body">
          <div class="csv-config-section">
            <div class="csv-section-title">
              <strong>下载范围</strong>
              <span>{{ activeTool === 'amap-poi-download' ? '支持城市或地图范围' : `Overpass 小范围查询，最大约 ${maxOsmDownloadAreaKm2} 平方公里` }}</span>
            </div>
            <div class="csv-option-row compact">
              <label
                v-for="item in downloadRangeModeOptions.filter((option) => activeTool === 'amap-poi-download' || option.value !== 'city')"
                :key="`download-range-${item.value}`"
              >
                <input v-model="downloadForm.rangeMode" type="radio" :value="item.value" />
                <span>{{ item.label }}</span>
              </label>
            </div>
            <div class="tool-form-grid">
              <label v-if="downloadForm.rangeMode === 'viewport'">
                <span>当前视窗 BBox</span>
                <input :value="formatBboxText(mapRef?.getViewportBbox?.() || [])" type="text" readonly />
              </label>
              <label v-if="downloadForm.rangeMode === 'bbox'">
                <span>BBox</span>
                <input v-model.trim="downloadForm.bbox" type="text" placeholder="minLon,minLat,maxLon,maxLat" />
              </label>
              <label v-if="downloadForm.rangeMode === 'select'">
                <span>框选范围</span>
                <input v-model.trim="downloadForm.selectedBbox" type="text" readonly placeholder="点击右侧按钮后在地图上拖拽框选" />
              </label>
              <button
                v-if="downloadForm.rangeMode === 'select'"
                class="secondary-inline-btn"
                type="button"
                :disabled="pickingDownloadBbox"
                @click="repickDownloadBboxFromMap"
              >
                {{ pickingDownloadBbox ? '正在框选' : (downloadForm.selectedBbox ? '重新框选' : '开始框选') }}
              </button>
            </div>
          </div>

          <div v-if="activeTool === 'osm-download'" class="csv-config-section">
            <div class="csv-section-title">
              <strong>OSM 要素</strong>
              <span>每个类别生成一个图层，下载结果统一打包为 .zip</span>
            </div>
            <div class="layer-check-list compact-check-list">
              <label v-for="item in osmFeatureTypeOptions" :key="item.value">
                <input v-model="osmDownloadForm.featureTypes" type="checkbox" :value="item.value" />
                <span>{{ item.label }}</span>
              </label>
            </div>
            <div class="tool-form-grid">
              <label>
                <span>自定义标签</span>
                <input v-model.trim="osmDownloadForm.customTags" type="text" placeholder="例如 amenity=school,shop" />
              </label>
              <label>
                <span>每类最大预览要素数</span>
                <input v-model.number="osmDownloadForm.previewLimit" type="number" min="1" max="20000" step="100" :disabled="!downloadForm.showResult" />
              </label>
              <label>
                <span>远端超时（秒）</span>
                <input v-model.number="osmDownloadForm.timeout" type="number" min="5" max="60" step="1" />
              </label>
            </div>
            <div class="tool-info-grid">
              <span>下载文件保留完整要素，不按预览数量截断。</span>
              <span>勾选显示结果时，只叠加每类前 {{ osmDownloadForm.previewLimit || 0 }} 个要素用于预览。</span>
            </div>
          </div>

          <div v-if="activeTool === 'amap-poi-download'" class="csv-config-section">
            <div class="csv-section-title">
              <strong>POI 查询</strong>
              <span>Key 保存在浏览器本地，下次自动读取</span>
            </div>
            <div class="tool-form-grid">
              <label>
                <span>高德 Web 服务 Key</span>
                <input v-model.trim="amapPoiForm.key" type="password" placeholder="读取不到本地 Key 时需要输入" autocomplete="off" />
              </label>
              <label>
                <span>关键词</span>
                <input v-model.trim="amapPoiForm.keywords" type="text" placeholder="例如 学校、停车场、咖啡" />
              </label>
              <label>
                <span>类型编码</span>
                <input v-model.trim="amapPoiForm.types" type="text" placeholder="例如 050000，可留空" />
              </label>
              <label v-if="downloadForm.rangeMode === 'city'">
                <span>城市</span>
                <input v-model.trim="amapPoiForm.city" type="text" placeholder="例如 深圳、440300，可留空全国检索" />
              </label>
              <label>
                <span>每页数量</span>
                <input v-model.number="amapPoiForm.pageSize" type="number" min="1" max="25" step="1" />
              </label>
              <label>
                <span>最大页数</span>
                <input v-model.number="amapPoiForm.maxPages" type="number" min="1" max="40" step="1" />
              </label>
              <label>
                <span>输出坐标</span>
                <select v-model="amapPoiForm.outputCoord">
                  <option v-for="item in amapOutputCoordOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                </select>
              </label>
              <label class="inline-check" v-if="downloadForm.rangeMode === 'city'">
                <input v-model="amapPoiForm.cityLimit" type="checkbox" />
                <span>限制在城市内</span>
              </label>
            </div>
          </div>

          <div class="tool-form-grid">
            <label>
              <span>输出图层名</span>
              <input v-model.trim="downloadForm.outputName" type="text" placeholder="默认使用工具名和日期" />
            </label>
            <label>
              <span>输出格式</span>
              <select v-model="downloadForm.outputFormat">
                <option v-for="item in exportFormatOptions" :key="`download-format-${item.value}`" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label>
              <span>编码方式</span>
              <select v-model="downloadForm.encoding">
                <option v-for="item in exportEncodingOptions" :key="`download-encoding-${item.value}`" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
          </div>
          <div class="coord-output-picker">
            <span>输出路径</span>
            <strong>点击“开始下载”后选择保存位置</strong>
            <small>OSM 默认 WGS84；高德 POI 默认转换为 WGS84，可选择保留 GCJ02 GeoJSON。</small>
          </div>
          <label class="inline-check result-display-toggle">
            <input v-model="downloadForm.showResult" type="checkbox" />
            <span>下载完成后显示结果图层</span>
            <small>关闭后只保存输出文件，不叠加到地图；开启后仅加载预览要素，完整数据仍保存到文件。</small>
          </label>
        </div>

        <div v-else-if="visualizationToolIds.includes(activeTool)" class="tool-dialog-body">
          <div class="tool-form-grid">
            <label>
              <span>输入图层</span>
              <select v-model="visualizationForm.layerId">
                <option value="">请选择图层</option>
                <option v-for="layer in visualizationLayers" :key="layer.id" :value="layer.id">
                  {{ layer.name }} / {{ layer.geometryType || 'GEOMETRY' }}
                </option>
              </select>
            </label>
            <label>
              <span>可视化名称</span>
              <input v-model.trim="visualizationForm.outputName" type="text" placeholder="默认使用工具名和日期" />
            </label>
          </div>

          <div v-if="activeTool === 'heatmap'" class="tool-form-grid">
            <label>
              <span>权重字段</span>
              <select v-model="visualizationForm.weightField">
                <option value="">无权重</option>
                <option v-for="field in selectedVisualizationNumericFields" :key="field" :value="field">{{ field }}</option>
              </select>
            </label>
            <label>
              <span>热力半径</span>
              <input v-model.number="visualizationForm.radius" type="number" min="5" max="120" step="1" />
            </label>
            <label>
              <span>强度</span>
              <input v-model.number="visualizationForm.intensity" type="number" min="0.1" max="5" step="0.1" />
            </label>
          </div>

          <div v-if="activeTool === 'cluster-map'" class="tool-form-grid">
            <label>
              <span>聚合半径</span>
              <input v-model.number="visualizationForm.clusterRadius" type="number" min="10" max="160" step="1" />
            </label>
          </div>

          <div v-if="activeTool === 'flow-map'" class="tool-form-grid">
            <label>
              <span>起点经度字段</span>
              <select v-model="visualizationForm.startLngField">
                <option value="">请选择</option>
                <option v-for="field in selectedVisualizationFields" :key="`slng-${field}`" :value="field">{{ field }}</option>
              </select>
            </label>
            <label>
              <span>起点纬度字段</span>
              <select v-model="visualizationForm.startLatField">
                <option value="">请选择</option>
                <option v-for="field in selectedVisualizationFields" :key="`slat-${field}`" :value="field">{{ field }}</option>
              </select>
            </label>
            <label>
              <span>终点经度字段</span>
              <select v-model="visualizationForm.endLngField">
                <option value="">请选择</option>
                <option v-for="field in selectedVisualizationFields" :key="`elng-${field}`" :value="field">{{ field }}</option>
              </select>
            </label>
            <label>
              <span>终点纬度字段</span>
              <select v-model="visualizationForm.endLatField">
                <option value="">请选择</option>
                <option v-for="field in selectedVisualizationFields" :key="`elat-${field}`" :value="field">{{ field }}</option>
              </select>
            </label>
            <label>
              <span>权重字段</span>
              <select v-model="visualizationForm.weightField">
                <option value="">无权重</option>
                <option v-for="field in selectedVisualizationNumericFields" :key="`w-${field}`" :value="field">{{ field }}</option>
              </select>
            </label>
            <label>
              <span>线宽</span>
              <input v-model.number="visualizationForm.lineWidth" type="number" min="1" max="16" step="0.5" />
            </label>
          </div>

          <div v-if="['graduated-point', 'choropleth-map'].includes(activeTool)" class="tool-form-grid">
            <label>
              <span>数值字段</span>
              <select v-model="visualizationForm.numericField">
                <option value="">请选择</option>
                <option v-for="field in selectedVisualizationNumericFields" :key="field" :value="field">{{ field }}</option>
              </select>
            </label>
            <label v-if="activeTool === 'graduated-point'">
              <span>最大点半径</span>
              <input v-model.number="visualizationForm.radius" type="number" min="8" max="64" step="1" />
            </label>
          </div>

          <div class="tool-form-grid">
            <label>
              <span>透明度</span>
              <input v-model.number="visualizationForm.opacity" type="range" min="0.1" max="1" step="0.05" />
            </label>
            <label>
              <span>色带</span>
              <select v-model="visualizationForm.colorRamp">
                <option v-for="item in visualizationColorRamps" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
          </div>

          <div v-if="visualOverlayRecords.length" class="csv-config-section">
            <div class="csv-section-title">
              <strong>已叠加可视化</strong>
              <span>{{ visualOverlayRecords.length }} 个</span>
            </div>
            <div class="visual-layer-list">
              <div v-for="record in visualOverlayRecords" :key="record.id" class="visual-layer-item">
                <span>{{ record.name }}</span>
                <small>{{ record.layerName }} / {{ record.type }} / {{ record.featureCount }} 个要素</small>
                <button type="button" @click="removeVisualizationRecord(record.id)">移除</button>
              </div>
            </div>
          </div>
          <div class="tool-info-grid">
            <span>第一版使用 Mapbox GL 原生图层实现，避免额外大包；门户中已整理 deck.gl 和 L7 官方文档入口。</span>
            <span>可视化图层独立叠加在地图上，不进入业务图层列表，也不会影响已有图层编辑和导出。</span>
          </div>
        </div>

        <div v-else-if="activeTool === 'mapshaper'" class="tool-mapshaper-body">
          <MapshaperView embedded @close="closeToolDialog" />
        </div>

        <div v-else-if="genericToolActive" class="tool-dialog-body">
          <div class="tool-placeholder">
            <strong>{{ activeToolMeta.title }}</strong>
            <span>{{ activeToolMeta.subtitle }}</span>
            <small>当前入口已按二级菜单弹框方式接入，后续可直接在此补充参数表单、执行按钮和结果图层生成逻辑。</small>
          </div>
        </div>

        <p v-if="toolMessage" class="tool-message">{{ toolMessage }}</p>

        <footer v-if="activeTool !== 'mapshaper'" class="tool-dialog-actions">
          <button type="button" :disabled="toolBusy" @click="closeToolDialog">取消</button>
          <button
            v-if="activeTool === 'local-vector-import'"
            class="primary"
            type="button"
            :disabled="toolBusy || !vectorFiles.length"
            @click="importVectorLayer"
          >
            {{ toolBusy ? '导入中...' : '导入为图层' }}
          </button>
          <button
            v-else-if="activeTool === 'csv-import'"
            class="primary"
            type="button"
            :disabled="toolBusy || !csvGeometryReady"
            @click="importCsvLayer"
          >
            {{ toolBusy ? '加载中...' : '加载并转换' }}
          </button>
          <button
            v-else-if="activeTool === 'cad-import'"
            class="primary"
            type="button"
            :disabled="toolBusy || !cadFiles.length || !cadForm.sourceCrs"
            @click="importCadLayer"
          >
            {{ toolBusy ? '转换中...' : '导入为图层' }}
          </button>
          <button
            v-else-if="activeTool === 'create-layer'"
            class="primary"
            type="button"
            :disabled="toolBusy || !createLayerReady"
            @click="createEditableLayer"
          >
            创建并编辑
          </button>
          <button
            v-else-if="activeTool === 'coord-convert'"
            class="primary"
            type="button"
            :disabled="toolBusy || !coordConvertReady"
            @click="runCoordConvert"
          >
            {{ toolBusy ? '转换中...' : '开始转换' }}
          </button>
          <button
            v-else-if="activeTool === 'crs-transform'"
            class="primary"
            type="button"
            :disabled="toolBusy || !crsTransformReady"
            @click="runCrsTransform"
          >
            {{ toolBusy ? '转换中...' : '开始转换' }}
          </button>
          <button
            v-else-if="analysisToolIds.includes(activeTool)"
            class="primary"
            type="button"
            :disabled="toolBusy || !analysisReady"
            @click="runAnalysisTool"
          >
            {{ toolBusy ? '分析中...' : '开始分析' }}
          </button>
          <button
            v-else-if="downloadToolIds.includes(activeTool)"
            class="primary"
            type="button"
            :disabled="toolBusy || !downloadReady"
            @click="runDownloadTool"
          >
            {{ toolBusy ? '下载中...' : '开始下载' }}
          </button>
          <button
            v-else-if="visualizationToolIds.includes(activeTool)"
            class="primary"
            type="button"
            :disabled="toolBusy || !visualizationReady"
            @click="runVisualizationTool"
          >
            {{ toolBusy ? '生成中...' : '生成可视化' }}
          </button>
          <button v-else class="primary" type="button" disabled>
            待实现
          </button>
        </footer>
        </template>
      </section>
    </div>

    <div v-if="attributeModalVisible" class="attribute-modal-backdrop">
      <section class="attribute-modal" role="dialog" aria-modal="true">
        <header>
          <div>
            <p>Feature Properties</p>
            <h3>填写要素属性</h3>
          </div>
          <button type="button" @click="skipPendingFeatureAttributes">x</button>
        </header>
        <div class="attribute-form">
          <label v-for="field in editingLayerFields" :key="field.name">
            <span>{{ field.name }} · {{ field.type }}</span>
            <input
              v-if="field.type === 'boolean'"
              v-model="editingAttributeValues[field.name]"
              type="checkbox"
            />
            <input
              v-else
              v-model="editingAttributeValues[field.name]"
              :type="field.type === 'date' ? 'date' : (field.type === 'number' || field.type === 'integer' ? 'number' : 'text')"
            />
          </label>
          <div v-if="!editingLayerFields.length" class="tool-placeholder">
            <strong>当前图层没有自定义属性字段</strong>
            <small>可以直接保存空属性要素。</small>
          </div>
        </div>
        <footer>
          <button type="button" @click="skipPendingFeatureAttributes">跳过</button>
          <button class="primary" type="button" @click="savePendingFeatureAttributes">保存属性</button>
        </footer>
      </section>
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
  border: 1px solid #c7d6e8;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  z-index: 11;
  box-shadow: -2px 0 10px rgba(15, 61, 108, 0.12);
}

.left-toggle:hover {
  border-color: #9ec3ef;
  background: #f3f8ff;
  box-shadow: -3px 0 14px rgba(15, 95, 198, 0.14);
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

.edit-toolbar {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100% - 32px);
  padding: 9px 10px;
  border: 1px solid #bdd2ec;
  border-radius: var(--gis-radius, 7px);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--gis-shadow-md, 0 10px 28px rgba(16, 42, 74, 0.18));
  transform: translateX(-50%);
}

.edit-toolbar-title {
  display: grid;
  gap: 2px;
  min-width: 130px;
}

.edit-toolbar-title strong {
  color: #17231b;
  font-size: 13px;
}

.edit-toolbar-title span {
  color: #6b7b90;
  font-size: 11px;
  font-weight: 800;
}

.edit-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.edit-toolbar-actions button,
.secondary-inline-btn {
  height: 30px;
  padding: 0 10px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.edit-toolbar-actions button:hover:not(:disabled),
.secondary-inline-btn:hover:not(:disabled) {
  border-color: #9ec3ef;
  background: #f3f8ff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.12);
}

.edit-toolbar-actions button.active,
.edit-toolbar-actions button.primary,
.attribute-modal footer button.primary {
  border-color: #0f5fc6;
  background: linear-gradient(180deg, #1777e6, #0f5fc6);
  color: #fff;
  box-shadow: 0 4px 12px rgba(15, 95, 198, 0.24);
}

.edit-toolbar-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tool-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  padding: 22px;
  background: rgba(8, 24, 46, 0.38);
  backdrop-filter: blur(2px);
}

.tool-dialog-backdrop.map-picking {
  pointer-events: none;
  background: transparent;
}

.tool-dialog {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(720px, 100%);
  max-height: calc(100vh - 44px);
  display: flex;
  flex-direction: column;
  border: 1px solid #c4d6ea;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: var(--gis-shadow-lg, 0 18px 45px rgba(15, 38, 70, 0.24));
  overflow: hidden;
}

.tool-dialog[style] {
  transform: none;
}

.tool-dialog.wide {
  width: min(1180px, 100%);
  height: calc(100vh - 44px);
}

.tool-dialog.collapsed {
  width: min(520px, calc(100vw - 24px));
  height: auto;
  max-height: none;
}

.tool-dialog.map-picking {
  pointer-events: auto;
}

.tool-dialog.map-picking.collapsed {
  left: 50%;
  top: 70px;
  transform: translateX(-50%);
  width: min(520px, calc(100vw - 24px));
  max-height: none;
  box-shadow: 0 12px 30px rgba(15, 38, 70, 0.22);
}

.tool-dialog.dragging {
  user-select: none;
  box-shadow: 0 24px 58px rgba(15, 38, 70, 0.3);
}

.tool-dialog-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 15px 17px 13px;
  border-bottom: 1px solid #dce6f1;
  background:
    linear-gradient(180deg, #ffffff, #f7fbff);
  cursor: move;
  touch-action: none;
}

.tool-dialog-head p,
.tool-dialog-head h2,
.tool-dialog-head span {
  margin: 0;
}

.tool-dialog-head p {
  margin-bottom: 3px;
  color: #0f5fc6;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tool-dialog-head h2 {
  color: #152238;
  font-size: 16px;
  font-weight: 900;
}

.tool-dialog-head span {
  display: block;
  margin-top: 4px;
  color: #52657d;
  font-size: 12px;
}

.tool-dialog-window-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.tool-dialog-head button {
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #52657d;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.tool-dialog-head button:hover:not(:disabled) {
  border-color: #9ec3ef;
  background: #edf5ff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.12);
}

.tool-dialog-window-actions button:last-child {
  width: 26px;
  min-width: 26px;
  padding: 0;
}

.tool-dialog-body {
  display: grid;
  gap: 12px;
  padding: 15px 17px;
  overflow: auto;
  background: #fbfdff;
}

.tool-dialog-body.csv-import-body {
  grid-template-columns: minmax(420px, 1fr) minmax(420px, 0.9fr);
  align-items: start;
}

.analysis-source-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}

.analysis-source-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid #dce6f1;
  border-radius: 7px;
  background: #f8fbff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.analysis-source-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.analysis-source-head strong {
  min-width: 0;
  color: #24364d;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analysis-source-mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.analysis-source-mode label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #52657d;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.analysis-source-card > label {
  display: grid;
  gap: 5px;
  color: #52657d;
  font-size: 12px;
  font-weight: 900;
}

.analysis-source-card select {
  height: 32px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid #cad7e8;
  border-radius: 6px;
  background: #fff;
  color: #1f2a37;
}

.tool-drop-field.compact {
  min-height: 82px;
  padding: 12px;
}

.tool-drop-field.compact strong {
  font-size: 13px;
}

.csv-import-body .tool-drop-field,
.csv-import-body .csv-config-section {
  grid-column: 1;
}

.csv-import-body .csv-preview {
  grid-column: 2;
  grid-row: 1 / span 4;
  position: sticky;
  top: 0;
  align-self: start;
}

.tool-mapshaper-body {
  min-height: 0;
  flex: 1;
}

.tool-drop-field {
  min-height: 116px;
  display: grid;
  gap: 8px;
  align-content: center;
  padding: 16px;
  border: 1px dashed #9ec3ef;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(244, 249, 255, 0.96)),
    #f4f8fd;
  color: #24364d;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.tool-drop-field input {
  max-width: 420px;
}

.tool-drop-field strong {
  font-size: 15px;
  font-weight: 900;
}

.tool-drop-field small {
  color: #52657d;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.tool-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.tool-form-grid label,
.tool-form-grid .crs-search-field {
  display: grid;
  gap: 5px;
  color: #52657d;
  font-size: 12px;
  font-weight: 900;
}

.tool-form-grid input,
.tool-form-grid select {
  height: 33px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid #cad7e8;
  border-radius: 6px;
  background: #fff;
  color: #1f2a37;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.analysis-source-card select:focus,
.tool-form-grid input:focus,
.tool-form-grid select:focus,
.field-row input:focus,
.field-row select:focus {
  border-color: #7eb4ec;
  box-shadow: 0 0 0 3px rgba(23, 119, 230, 0.12);
  outline: 0;
}

.crs-search-field {
  align-self: start;
}

.crs-search-results {
  display: grid;
  gap: 6px;
  max-height: 188px;
  margin-top: 8px;
  padding: 6px;
  border: 1px solid #d7e3f1;
  border-radius: 7px;
  background: #f8fbff;
  overflow: auto;
}

.crs-search-results button {
  display: grid;
  grid-template-columns: 98px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 32px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #fff;
  color: #24364d;
  text-align: left;
  cursor: pointer;
}

.crs-search-results button:hover,
.crs-search-results button.active {
  border-color: #0f5fc6;
  background: #edf5ff;
}

.crs-search-results strong,
.crs-search-results span,
.crs-search-results small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crs-search-results strong {
  color: #0f5fc6;
  font-size: 12px;
}

.crs-search-results span,
.crs-search-results small {
  color: #52657d;
  font-size: 12px;
}

.tool-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.tool-info-grid span,
.tool-placeholder {
  min-height: 62px;
  padding: 10px;
  border: 1px solid #dce6f1;
  border-radius: 7px;
  background: #fff;
  color: #52657d;
  font-size: 12px;
  font-weight: 800;
}

.inline-check {
  min-height: 32px;
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  padding-top: 18px;
}

.inline-check input {
  width: auto;
  height: auto;
}

.result-display-toggle {
  display: grid !important;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid #dce6f1;
  border-radius: 7px;
  background: #fbfdff;
  color: #24364d;
  font-size: 12px;
  font-weight: 900;
}

.result-display-toggle small {
  grid-column: 2;
  color: #6b7b90;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.45;
}

.layer-check-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  padding: 10px;
  border: 1px solid #dce6f1;
  border-radius: 7px;
  background: #f8fbff;
}

.compact-check-list {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  padding: 8px;
}

.layer-check-list label {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #24364d;
  font-size: 12px;
  font-weight: 800;
}

.layer-check-list input {
  flex: 0 0 auto;
}

.layer-check-list span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-layer-list {
  display: grid;
  gap: 8px;
}

.visual-layer-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
  align-items: center;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid #dce6f1;
  border-radius: 7px;
  background: #fff;
  box-shadow: var(--gis-shadow-sm, 0 3px 10px rgba(15, 61, 108, 0.08));
}

.visual-layer-item span,
.visual-layer-item small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-layer-item span {
  color: #1f2a37;
  font-size: 12px;
  font-weight: 900;
}

.visual-layer-item small {
  color: #6b7b90;
  font-size: 11px;
}

.visual-layer-item button {
  grid-row: 1 / span 2;
  grid-column: 2;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #f0c4c4;
  border-radius: 6px;
  background: #fff5f5;
  color: #9b1c1c;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.coord-convert-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #dce6f1;
  border-radius: 7px;
  background: #f8fbff;
}

.coord-convert-summary strong {
  color: #17231b;
  font-size: 15px;
  font-weight: 900;
}

.coord-convert-summary span {
  color: #0f5fc6;
  font-size: 12px;
  font-weight: 900;
}

.coord-output-picker {
  min-height: 32px;
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid #cad7e8;
  border-radius: 6px;
  background: #fff;
  color: #52657d;
}

.coord-output-picker span {
  font-size: 12px;
  font-weight: 900;
}

.coord-output-picker strong {
  color: #1f2a37;
  font-size: 12px;
}

.coord-output-picker small {
  color: #728197;
  font-size: 11px;
}

.spatial-reference-detail {
  display: grid;
  gap: 5px;
  padding: 10px;
  border: 1px solid #dce6f1;
  border-radius: 7px;
  background: #f8fbff;
}

.spatial-reference-detail strong {
  color: #17231b;
  font-size: 13px;
  font-weight: 900;
}

.spatial-reference-detail span,
.spatial-reference-detail small {
  color: #52657d;
  font-size: 12px;
  line-height: 1.45;
}

.csv-config-section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dce6f1;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--gis-shadow-sm, 0 3px 10px rgba(15, 61, 108, 0.08));
}

.output-format-section {
  gap: 10px;
}

.format-segment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.format-segment-list button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #52657d;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.format-segment-list button:hover,
.format-segment-list button.active {
  border-color: #0f5fc6;
  background: #edf5ff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.12);
}

.csv-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.csv-section-title strong {
  color: #17231b;
  font-size: 13px;
  font-weight: 900;
}

.csv-section-title span {
  color: #6b7b90;
  font-size: 11px;
  font-weight: 800;
}

.csv-option-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.csv-option-row.compact {
  gap: 8px;
}

.csv-option-row label {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #3d4d63;
  font-size: 12px;
  font-weight: 800;
}

.csv-option-row input {
  margin: 0;
}

.create-layer-fields {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dce6f1;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--gis-shadow-sm, 0 3px 10px rgba(15, 61, 108, 0.08));
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px 30px;
  gap: 8px;
  align-items: center;
}

.field-row input,
.field-row select {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #24364d;
  font-size: 13px;
}

.field-row button {
  height: 30px;
  border: 1px solid #f0c4c4;
  border-radius: 6px;
  background: #fff5f5;
  color: #9b1c1c;
  cursor: pointer;
}

.tool-placeholder {
  display: grid;
  gap: 6px;
}

.tool-placeholder strong {
  color: #17231b;
  font-size: 15px;
}

.tool-placeholder small {
  color: #6b7b90;
  line-height: 1.5;
}

.csv-preview {
  border: 1px solid #dce6f1;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  box-shadow: var(--gis-shadow-sm, 0 8px 22px rgba(28, 52, 84, 0.08));
}

.preview-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-bottom: 1px solid #edf2f7;
  background: #f8fbff;
}

.preview-head strong {
  order: 0;
  margin-right: auto;
  color: #17231b;
  font-size: 13px;
}

.preview-head small {
  order: 1;
  color: #6b7b90;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.preview-head span {
  order: 2;
  color: #8a5a10;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.preview-head span.ok {
  color: #16803c;
}

.csv-preview-table {
  max-height: 420px;
  overflow-x: auto;
  overflow-y: auto;
}

.csv-preview table {
  min-width: 100%;
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.csv-preview th,
.csv-preview td {
  max-width: 150px;
  padding: 7px 8px;
  border-bottom: 1px solid #edf2f7;
  color: #273449;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.csv-preview th {
  position: sticky;
  top: 0;
  z-index: 1;
  color: #52657d;
  background: #f8fbff;
  font-weight: 900;
}

.csv-preview th.is-x-field,
.csv-preview td.is-x-field {
  background: #eef7ff;
  color: #09588d;
}

.csv-preview th.is-y-field,
.csv-preview td.is-y-field {
  background: #f0fbf4;
  color: #176534;
}

.csv-preview th.is-wkt-field,
.csv-preview td.is-wkt-field {
  background: #fff7e8;
  color: #8a4b05;
}

.csv-preview th.is-x-field,
.csv-preview th.is-y-field,
.csv-preview th.is-wkt-field {
  box-shadow: inset 0 -2px 0 currentColor;
}

.csv-preview-empty {
  padding: 18px 10px;
  color: #6b7b90;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}

.tool-message {
  margin: 0 16px 12px;
  padding: 9px 11px;
  border: 1px solid #b7d7ff;
  border-radius: 7px;
  background: #f2f8ff;
  color: #0b4ea2;
  font-size: 12px;
  font-weight: 800;
}

.tool-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 17px 15px;
  border-top: 1px solid #dce6f1;
  background: #ffffff;
}

.tool-dialog-actions button {
  height: 32px;
  padding: 0 13px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #52657d;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.tool-dialog-actions button:hover:not(:disabled) {
  border-color: #9ec3ef;
  background: #f3f8ff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.12);
}

.csv-import-body .tool-drop-field {
  min-height: 82px;
  align-content: center;
}

.tool-dialog-actions button.primary {
  border-color: #0f5fc6;
  background: linear-gradient(180deg, #1777e6, #0f5fc6);
  color: #fff;
  box-shadow: 0 4px 12px rgba(15, 95, 198, 0.24);
}

.tool-dialog-actions button.primary:hover:not(:disabled) {
  border-color: #0b4ea2;
  background: linear-gradient(180deg, #2384f2, #0b55b4);
  color: #fff;
}

.tool-dialog-actions button:disabled,
.tool-dialog-head button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.app-toast {
  position: fixed;
  top: 76px;
  right: 22px;
  z-index: 120;
  max-width: min(420px, calc(100vw - 44px));
  padding: 11px 14px;
  border: 1px solid #9ccbad;
  border-radius: 8px;
  background: #f2fbf4;
  color: #146233;
  box-shadow: 0 14px 36px rgba(15, 38, 70, 0.18);
  font-size: 13px;
  font-weight: 900;
}

.app-toast.success {
  border-color: #9ccbad;
  background: #f2fbf4;
  color: #146233;
}

.app-toast.error {
  border-color: #f0aaaa;
  background: #fff5f5;
  color: #9b1c1c;
}

:global(body.tool-dialog-dragging) {
  cursor: move;
  user-select: none;
}

.attribute-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(8, 24, 46, 0.38);
  backdrop-filter: blur(2px);
}

.attribute-modal {
  width: min(430px, 100%);
  border: 1px solid #c4d6ea;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--gis-shadow-lg, 0 20px 46px rgba(15, 38, 70, 0.26));
  overflow: hidden;
}

.attribute-modal header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid #dce6f1;
  background: linear-gradient(180deg, #ffffff, #f7fbff);
}

.attribute-modal header p,
.attribute-modal header h3 {
  margin: 0;
}

.attribute-modal header p {
  color: #0f5fc6;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.attribute-modal header h3 {
  margin-top: 3px;
  color: #152238;
  font-size: 15px;
  font-weight: 900;
}

.attribute-modal header button {
  width: 26px;
  height: 26px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #52657d;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.attribute-modal header button:hover {
  border-color: #9ec3ef;
  background: #edf5ff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.12);
}

.attribute-form {
  display: grid;
  gap: 10px;
  max-height: min(56vh, 420px);
  padding: 14px;
  background: #fbfdff;
  overflow: auto;
}

.attribute-form label {
  display: grid;
  gap: 5px;
}

.attribute-form label span {
  color: #52657d;
  font-size: 12px;
  font-weight: 800;
}

.attribute-form input:not([type='checkbox']) {
  height: 34px;
  padding: 0 10px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  color: #24364d;
}

.attribute-form input:not([type='checkbox']):focus {
  border-color: #7eb4ec;
  box-shadow: 0 0 0 3px rgba(23, 119, 230, 0.12);
  outline: 0;
}

.attribute-form input[type='checkbox'] {
  width: 18px;
  height: 18px;
}

.attribute-modal footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid #dce6f1;
  background: #fff;
}

.attribute-modal footer button {
  height: 32px;
  padding: 0 13px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #52657d;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.attribute-modal footer button:hover:not(:disabled) {
  border-color: #9ec3ef;
  background: #f3f8ff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.12);
}

@media (max-width: 860px) {
  .tool-dialog-backdrop {
    padding: 12px;
  }

  .tool-dialog,
  .tool-dialog.wide {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .tool-dialog:not(.collapsed) {
    height: auto;
  }

  .tool-form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1040px) {
  .tool-dialog-body.csv-import-body {
    grid-template-columns: 1fr;
  }

  .csv-import-body .tool-drop-field,
  .csv-import-body .csv-config-section,
  .csv-import-body .csv-preview {
    grid-column: 1;
  }

  .csv-import-body .csv-preview {
    grid-row: auto;
    position: static;
  }
}
</style>
