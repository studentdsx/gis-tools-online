<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import proj4 from 'proj4'
import { apiClient } from '../api/client'
import DatabaseModal from './DatabaseModal.vue'

const emit = defineEmits(['add-layer', 'toggle-layer', 'remove-layer', 'reorder-layer', 'update-layer-style', 'select-feature', 'request-edit-layer', 'request-exit-edit-layer', 'export-layer'])

const STORAGE_KEYS = {
  connections: 'gis-tools.postgisConnections.v1',
  basemaps: 'gis-tools.customBasemaps.v1',
  folders: 'gis-tools.localFolders.v1'
}
const FOLDER_HANDLE_DB = 'gis-tools-folder-handles'
const FOLDER_HANDLE_STORE = 'handles'

const defaultBasemaps = [
  {
    id: 'basemap-osm',
    name: 'OSM 标准底图',
    kind: 'basemap',
    basemapType: 'raster-xyz',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: '© OpenStreetMap contributors',
    builtIn: true
  },
  {
    id: 'basemap-blank',
    name: '白板背景',
    kind: 'basemap',
    basemapType: 'blank',
    url: '',
    builtIn: true
  },
  {
    id: 'basemap-arcgis-satellite',
    name: 'ArcGIS 卫星影像',
    kind: 'basemap',
    basemapType: 'raster-xyz',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
    builtIn: true
  },
  {
    id: 'basemap-amap-satellite',
    name: '高德卫星影像',
    kind: 'basemap',
    basemapType: 'raster-xyz',
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    attribution: '© 高德地图',
    builtIn: true
  }
]

const connections = ref([])
const customBasemaps = ref([])
const folders = ref([])
const layers = ref([])
const expandedGroups = reactive({
  database: true,
  basemap: true,
  folder: true
})
const expandedConnections = ref([])
const expandedFolders = ref([])
const tablesByConnection = reactive({})
const filesByFolder = reactive({})
const loadingTables = reactive({})
const loadingFolders = reactive({})
const loadingLayerKeys = reactive({})
const databaseModalVisible = ref(false)
const basemapFormVisible = ref(false)
const folderFormVisible = ref(false)
const uploadModalVisible = ref(false)
const exportModalVisible = ref(false)
const uploadTargetConnection = ref(null)
const uploadFiles = ref([])
const uploadRunning = ref(false)
const exportSpatialReferences = ref([])
const exportSpatialReferenceKeyword = ref('')
const exportSpatialReferenceLoading = ref(false)
const exportSpatialReferenceSource = ref('')
const errorMessage = ref('')
const draggingLayerId = ref('')
const selectedLayerId = ref('')
const editingLayerId = ref('')
const activeLayerTool = ref('details')
const layerInspectorVisible = ref(false)
const inspectorPosition = reactive({
  left: 0,
  top: 72,
  ready: false
})
const inspectorDrag = reactive({
  active: false,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0
})
const attributeSearch = ref('')
const attributePage = ref(1)
const attributePageSize = 8
const selectedFeatureIndex = ref(null)
const folderHandles = new Map()
const fileHandles = new Map()
const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window
const dbfEncodingOptions = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK' }
]
const lineStyleOptions = [
  { value: 'solid', label: '直线' },
  { value: 'dash', label: '虚线' },
  { value: 'dot', label: '点线' },
  { value: 'dash-dot', label: '点划线' }
]

const basemapForm = reactive({
  name: '',
  basemapType: 'raster-xyz',
  url: ''
})
const folderForm = reactive({
  name: '',
  path: ''
})
const uploadForm = reactive({
  tableName: '',
  sourceCrs: '',
  encoding: 'utf-8',
  replace: true
})
const exportForm = reactive({
  scope: 'layer',
  targetCrs: 'EPSG:4326',
  outputFormat: 'geojson',
  encoding: 'utf-8',
  outputName: ''
})

const layerColors = ['#2f7d59', '#c47a24', '#356fb3', '#8b5b9f', '#b24444', '#52716b']
const defaultLayerStyle = {
  color: '#0f5fc6',
  fillColor: '#0f5fc6',
  fillOpacity: 0.32,
  outlineColor: '#0f5fc6',
  outlineWidth: 1.6,
  outlineOpacity: 0.95,
  lineColor: '#0f5fc6',
  lineWidth: 2.4,
  lineOpacity: 0.9,
  lineDash: 'solid',
  circleColor: '#0f5fc6',
  circleRadius: 5,
  circleOpacity: 0.92,
  circleStrokeColor: '#ffffff',
  circleStrokeWidth: 1.5
}

const basemaps = computed(() => [...defaultBasemaps, ...customBasemaps.value])
const connectionCount = computed(() => connections.value.length)
const basemapCount = computed(() => basemaps.value.length)
const folderCount = computed(() => folders.value.length)
const layerCount = computed(() => layers.value.length)
const selectedLayer = computed(() => {
  return layers.value.find((layer) => layer.id === selectedLayerId.value)
    || layers.value.find((layer) => layer.kind !== 'basemap')
    || layers.value[0]
    || null
})

function normalizeLayerOrder(nextLayers) {
  const dataLayers = nextLayers.filter((layer) => layer.kind !== 'basemap')
  const basemapLayers = nextLayers.filter((layer) => layer.kind === 'basemap')
  return [...dataLayers, ...basemapLayers]
}

function getDataLayerOrder() {
  return layers.value
    .filter((layer) => layer.kind !== 'basemap')
    .map((layer) => layer.id)
}

const selectedLayerStats = computed(() => getLayerStats(selectedLayer.value))
const attributeFields = computed(() => selectedLayerStats.value?.fields || [])
const attributeRows = computed(() => {
  if (!isDataLayer(selectedLayer.value)) return []

  const keyword = attributeSearch.value.trim().toLowerCase()
  return (selectedLayer.value.geojson.features || [])
    .map((feature, index) => ({
      index,
      selected: selectedFeatureIndex.value === index,
      geometryType: feature.geometry?.type || 'Empty',
      properties: feature.properties || {}
    }))
    .filter((row) => {
      if (!keyword) return true
      return attributeFields.value.some((field) => String(row.properties[field] ?? '').toLowerCase().includes(keyword))
        || row.geometryType.toLowerCase().includes(keyword)
    })
})
const attributePageCount = computed(() => Math.max(1, Math.ceil(attributeRows.value.length / attributePageSize)))
const pagedAttributeRows = computed(() => {
  const currentPage = Math.min(attributePage.value, attributePageCount.value)
  const start = (currentPage - 1) * attributePageSize
  return attributeRows.value.slice(start, start + attributePageSize)
})

watch([selectedLayerId, attributeSearch], () => {
  attributePage.value = 1
})

function getInspectorSize() {
  return {
    width: Math.min(430, Math.max(320, window.innerWidth - 360)),
    height: Math.max(320, window.innerHeight - 90)
  }
}

function clampInspectorPosition(left, top) {
  const { width, height } = getInspectorSize()
  const margin = 12
  return {
    left: Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin)),
    top: Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin))
  }
}

function resetInspectorPosition() {
  if (typeof window === 'undefined') return

  const { width } = getInspectorSize()
  const next = clampInspectorPosition(window.innerWidth - width - 16, 72)
  inspectorPosition.left = next.left
  inspectorPosition.top = next.top
  inspectorPosition.ready = true
}

function handleInspectorPointerDown(event) {
  if (event.button != null && event.button !== 0) return
  if (event.target?.closest?.('button, a, input, select, textarea, label')) return

  inspectorDrag.active = true
  inspectorDrag.startX = event.clientX
  inspectorDrag.startY = event.clientY
  inspectorDrag.startLeft = inspectorPosition.left
  inspectorDrag.startTop = inspectorPosition.top

  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function handleInspectorPointerMove(event) {
  if (!inspectorDrag.active) return

  const next = clampInspectorPosition(
    inspectorDrag.startLeft + event.clientX - inspectorDrag.startX,
    inspectorDrag.startTop + event.clientY - inspectorDrag.startY
  )
  inspectorPosition.left = next.left
  inspectorPosition.top = next.top
}

function handleInspectorPointerUp(event) {
  if (!inspectorDrag.active) return

  inspectorDrag.active = false
  event.currentTarget.releasePointerCapture?.(event.pointerId)
}

function handleWindowResize() {
  if (!inspectorPosition.ready) {
    resetInspectorPosition()
    return
  }

  const next = clampInspectorPosition(inspectorPosition.left, inspectorPosition.top)
  inspectorPosition.left = next.left
  inspectorPosition.top = next.top
}

onMounted(async () => {
  resetInspectorPosition()
  window.addEventListener('resize', handleWindowResize)
  customBasemaps.value = readStorage(STORAGE_KEYS.basemaps)
    .filter((basemap) => basemap.basemapType === 'raster-xyz')
  folders.value = readStorage(STORAGE_KEYS.folders)
  await restoreFolderHandles()
  await restoreConnections()
  addBasemapLayer(defaultBasemaps[0])
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
})

function readStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.warn('读取本地存储失败', error)
    return []
  }
}

function writeStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
}

function openFolderHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FOLDER_HANDLE_DB, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(FOLDER_HANDLE_STORE, { keyPath: 'id' })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveFolderHandle(id, handle) {
  const db = await openFolderHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_HANDLE_STORE, 'readwrite')
    tx.objectStore(FOLDER_HANDLE_STORE).put({ id, handle })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getFolderHandle(id) {
  const db = await openFolderHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_HANDLE_STORE, 'readonly')
    const request = tx.objectStore(FOLDER_HANDLE_STORE).get(id)
    request.onsuccess = () => resolve(request.result?.handle || null)
    request.onerror = () => reject(request.error)
  })
}

async function deleteFolderHandle(id) {
  const db = await openFolderHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_HANDLE_STORE, 'readwrite')
    tx.objectStore(FOLDER_HANDLE_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function restoreFolderHandles() {
  const browserFolders = folders.value.filter((folder) => folder.mode === 'browser')

  for (const folder of browserFolders) {
    const handle = await getFolderHandle(folder.id)
    if (handle) {
      folderHandles.set(folder.id, handle)
    }
  }
}

async function ensureFolderPermission(handle) {
  if (!handle?.queryPermission || !handle?.requestPermission) return true

  const options = { mode: 'read' }
  const current = await handle.queryPermission(options)
  if (current === 'granted') return true

  const requested = await handle.requestPermission(options)
  return requested === 'granted'
}

function toggleGroup(groupId) {
  expandedGroups[groupId] = !expandedGroups[groupId]
}

function connectionPayload(connection) {
  return {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    password: connection.password || ''
  }
}

function writeStoredConnections(items) {
  writeStorage(
    STORAGE_KEYS.connections,
    items.map((item) => ({
      ...connectionPayload(item),
      type: 'postgis'
    }))
  )
}

async function restoreConnections() {
  errorMessage.value = ''
  const storedConnections = readStorage(STORAGE_KEYS.connections)

  if (storedConnections.length === 0) {
    connections.value = []
    return
  }

  const restoredConnections = []
  const failedNames = []

  for (const storedConnection of storedConnections) {
    try {
      const res = await apiClient.post('/api/database', connectionPayload(storedConnection))
      restoredConnections.push({
        ...res.data,
        password: storedConnection.password || ''
      })
    } catch (error) {
      failedNames.push(storedConnection.name)
    }
  }

  connections.value = restoredConnections
  writeStoredConnections(restoredConnections)

  if (failedNames.length > 0) {
    errorMessage.value = `部分本地连接恢复失败：${failedNames.join('、')}`
  }
}

async function handleDatabaseSuccess(connection) {
  connections.value = [
    connection,
    ...connections.value.filter((item) => item.id !== connection.id)
  ]
  writeStoredConnections(connections.value)
  expandedConnections.value = [...new Set([connection.id, ...expandedConnections.value])]
  await loadTables(connection)
}

async function removeConnection(connection) {
  try {
    await apiClient.delete(`/api/database/${connection.id}`)
  } catch (error) {
    errorMessage.value = error.response?.data?.error || error.message
  } finally {
    connections.value = connections.value.filter((item) => item.id !== connection.id)
    delete tablesByConnection[connection.id]
    expandedConnections.value = expandedConnections.value.filter((id) => id !== connection.id)
    writeStoredConnections(connections.value)
  }
}

function isConnectionExpanded(connectionId) {
  return expandedConnections.value.includes(connectionId)
}

async function toggleConnection(connection) {
  const index = expandedConnections.value.indexOf(connection.id)

  if (index > -1) {
    expandedConnections.value.splice(index, 1)
    return
  }

  expandedConnections.value.push(connection.id)

  if (!tablesByConnection[connection.id]) {
    await loadTables(connection)
  }
}

async function loadTables(connection) {
  loadingTables[connection.id] = true
  errorMessage.value = ''

  try {
    const res = await apiClient.get(`/api/database/${connection.id}/tables`)
    tablesByConnection[connection.id] = res.data
  } catch (error) {
    tablesByConnection[connection.id] = []
    errorMessage.value = error.response?.data?.error || error.message
  } finally {
    loadingTables[connection.id] = false
  }
}

function openDatabaseUpload(connection) {
  uploadTargetConnection.value = connection
  uploadFiles.value = []
  uploadForm.tableName = ''
  uploadForm.sourceCrs = ''
  uploadForm.encoding = 'utf-8'
  uploadForm.replace = true
  uploadModalVisible.value = true
}

function closeDatabaseUpload() {
  if (uploadRunning.value) return

  uploadModalVisible.value = false
  uploadTargetConnection.value = null
  uploadFiles.value = []
}

async function handleUploadFileChange(event) {
  uploadFiles.value = Array.from(event.target.files || [])
  uploadForm.sourceCrs = ''
  const primaryFile = uploadFiles.value.find((file) => /\.(shp|geojson|json)$/i.test(file.name))

  if (primaryFile && !uploadForm.tableName) {
    uploadForm.tableName = sanitizeTableName(getFileBaseName(primaryFile.name))
  }

  try {
    const detectedCrs = await detectUploadSourceCrs(uploadFiles.value)
    uploadForm.sourceCrs = detectedCrs || ''
  } catch (error) {
    uploadForm.sourceCrs = ''
  }
}

function getUploadFileType(files) {
  if (files.some((file) => /\.shp$/i.test(file.name))) return 'shp'
  if (files.some((file) => /\.(geojson|json)$/i.test(file.name))) return 'geojson'
  return null
}

function findUploadFile(files, extension) {
  return files.find((file) => file.name.toLowerCase().endsWith(extension))
}

async function detectUploadSourceCrs(files) {
  const fileType = getUploadFileType(files)

  if (fileType === 'geojson') {
    const file = findUploadFile(files, '.geojson') || findUploadFile(files, '.json')
    if (!file) return ''

    const geojson = JSON.parse(await file.text())
    return getGeoJsonCrs(geojson) || ''
  }

  if (fileType === 'shp') {
    const prjFile = findUploadFile(files, '.prj')
    if (!prjFile) return ''

    return getPrjCrs(await prjFile.text()) || ''
  }

  return ''
}

function transformUploadGeoJsonIfNeeded(geojson, sourceCrs) {
  if (!sourceCrs) {
    return {
      geojson,
      targetCrs: ''
    }
  }

  return {
    geojson: transformGeoJsonToWgs84(geojson, sourceCrs).geojson,
    targetCrs: 'EPSG:4326'
  }
}

async function readUploadGeoJson(files) {
  const fileType = getUploadFileType(files)

  if (fileType === 'geojson') {
    const file = findUploadFile(files, '.geojson') || findUploadFile(files, '.json')
    const geojson = JSON.parse(await file.text())
    if (!geojson || geojson.type !== 'FeatureCollection') {
      throw new Error('文件内容不是 FeatureCollection')
    }

    const sourceCrs = normalizeCrs(uploadForm.sourceCrs) || getGeoJsonCrs(geojson)
    return transformUploadGeoJsonIfNeeded(geojson, sourceCrs)
  }

  if (fileType === 'shp') {
    const shpFile = findUploadFile(files, '.shp')
    const dbfFile = findUploadFile(files, '.dbf')
    const prjFile = findUploadFile(files, '.prj')
    const shpBuffer = await shpFile.arrayBuffer()
    const dbfBuffer = dbfFile ? await dbfFile.arrayBuffer() : undefined
    const prjText = prjFile ? await prjFile.text() : ''
    const geojson = await shapefile.read(shpBuffer, dbfBuffer, { encoding: normalizeDbfEncoding(uploadForm.encoding) })
    const sourceCrs = normalizeCrs(uploadForm.sourceCrs) || getPrjCrs(prjText)
    return transformUploadGeoJsonIfNeeded(geojson, sourceCrs)
  }

  throw new Error('请选择 .geojson/.json，或同时选择 Shapefile 的 .shp/.dbf/.prj 文件')
}

async function uploadLayerToDatabase() {
  const connection = uploadTargetConnection.value
  if (!connection) return

  if (!uploadFiles.value.length) {
    errorMessage.value = '请选择要上传的空间数据文件'
    return
  }

  const tableName = sanitizeTableName(uploadForm.tableName)
  if (!tableName) {
    errorMessage.value = '请填写目标表名'
    return
  }

  uploadRunning.value = true
  errorMessage.value = ''

  try {
    const uploadData = await readUploadGeoJson(uploadFiles.value)
    const res = await apiClient.post(`/api/database/${connection.id}/upload`, {
      schema: 'public',
      tableName,
      replace: uploadForm.replace,
      sourceCrs: normalizeCrs(uploadForm.sourceCrs) || '',
      targetCrs: uploadData.targetCrs,
      geojson: uploadData.geojson
    })

    await loadTables(connection)
    expandedConnections.value = [...new Set([connection.id, ...expandedConnections.value])]
    uploadModalVisible.value = false
    uploadTargetConnection.value = null
    uploadFiles.value = []
    uploadForm.tableName = ''
    errorMessage.value = `已上传 ${res.data.inserted || 0} 条要素到 public.${tableName}`
  } catch (error) {
    errorMessage.value = error.response?.data?.error || error.message
  } finally {
    uploadRunning.value = false
  }
}

function addCustomBasemap() {
  if (!basemapForm.name || !basemapForm.url) {
    errorMessage.value = '请填写底图名称和链接'
    return
  }

  const basemap = {
    id: `custom-basemap-${Date.now()}`,
    name: basemapForm.name,
    kind: 'basemap',
    basemapType: 'raster-xyz',
    url: basemapForm.url,
    builtIn: false
  }

  customBasemaps.value.unshift(basemap)
  writeStorage(STORAGE_KEYS.basemaps, customBasemaps.value)
  basemapForm.name = ''
  basemapForm.url = ''
  basemapForm.basemapType = 'raster-xyz'
  basemapFormVisible.value = false
}

function removeCustomBasemap(basemap) {
  customBasemaps.value = customBasemaps.value.filter((item) => item.id !== basemap.id)
  writeStorage(STORAGE_KEYS.basemaps, customBasemaps.value)
}

function addFolderConnection() {
  if (!folderForm.name || !folderForm.path) {
    errorMessage.value = '请填写文件夹名称和路径'
    return
  }

  const folder = {
    id: `folder-${Date.now()}`,
    name: folderForm.name,
    path: folderForm.path,
    mode: 'path'
  }

  folders.value.unshift(folder)
  writeStorage(STORAGE_KEYS.folders, folders.value)
  folderForm.name = ''
  folderForm.path = ''
  folderFormVisible.value = false
}

async function chooseLocalFolder() {
  if (!supportsDirectoryPicker) {
    folderFormVisible.value = true
    errorMessage.value = '当前浏览器不支持直接选择文件夹，请使用手动路径方式。'
    return
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    const allowed = await ensureFolderPermission(handle)

    if (!allowed) {
      errorMessage.value = '未获得读取文件夹的权限'
      return
    }

    const folder = {
      id: `folder-${Date.now()}`,
      name: handle.name,
      path: handle.name,
      mode: 'browser'
    }

    folderHandles.set(folder.id, handle)
    await saveFolderHandle(folder.id, handle)
    folders.value.unshift(folder)
    writeStorage(STORAGE_KEYS.folders, folders.value)
    expandedFolders.value = [...new Set([folder.id, ...expandedFolders.value])]
    await loadFolderFiles(folder)
  } catch (error) {
    if (error.name !== 'AbortError') {
      errorMessage.value = error.message
    }
  }
}

function removeFolder(folder) {
  folders.value = folders.value.filter((item) => item.id !== folder.id)
  delete filesByFolder[folder.id]
  expandedFolders.value = expandedFolders.value.filter((id) => id !== folder.id)
  writeStorage(STORAGE_KEYS.folders, folders.value)
  folderHandles.delete(folder.id)
  deleteFolderHandle(folder.id).catch(() => {})
}

function isFolderExpanded(folderId) {
  return expandedFolders.value.includes(folderId)
}

async function toggleFolder(folder) {
  const index = expandedFolders.value.indexOf(folder.id)

  if (index > -1) {
    expandedFolders.value.splice(index, 1)
    return
  }

  expandedFolders.value.push(folder.id)

  if (!filesByFolder[folder.id]) {
    await loadFolderFiles(folder)
  }
}

async function loadFolderFiles(folder) {
  loadingFolders[folder.id] = true
  errorMessage.value = ''

  try {
    if (folder.mode === 'browser') {
      filesByFolder[folder.id] = await listBrowserFolderFiles(folder)
    } else {
      const res = await apiClient.get('/api/files', {
        params: { path: folder.path }
      })
      filesByFolder[folder.id] = res.data.map((file) => ({
        ...file,
        fileMode: 'path'
      }))
    }
  } catch (error) {
    filesByFolder[folder.id] = []
    errorMessage.value = error.response?.data?.error || error.message
  } finally {
    loadingFolders[folder.id] = false
  }
}

function getSupportedFileType(fileName) {
  const value = fileName.toLowerCase()

  if (value.endsWith('.shp')) return 'shp'
  if (value.endsWith('.geojson') || value.endsWith('.json')) return 'geojson'

  return null
}

function getGeoJsonCrs(geojson) {
  const name = geojson?.crs?.properties?.name
  const match = typeof name === 'string' ? name.match(/EPSG[:/](\d+)/i) : null
  return match ? `EPSG:${match[1]}` : null
}

function getPrjCrs(prjText) {
  if (!prjText) return null

  const epsg = prjText.match(/AUTHORITY\["EPSG","(\d+)"\]/i) || prjText.match(/EPSG[:"]+(\d+)/i)
  return epsg ? `EPSG:${epsg[1]}` : prjText
}

function normalizeCrs(value) {
  if (!value || typeof value !== 'string') return null

  const trimmed = value.trim()
  const epsg = trimmed.match(/^(?:EPSG[:/])?(\d+)$/i)
  return epsg ? `EPSG:${epsg[1]}` : trimmed
}

function normalizeDbfEncoding(value) {
  const encoding = String(value || 'utf-8').trim().toLowerCase()
  return dbfEncodingOptions.some((option) => option.value === encoding) ? encoding : 'utf-8'
}

function promptForSourceCrs(sourceName) {
  const value = window.prompt(
    `${sourceName || '数据'} 缺少坐标系信息，请输入源坐标系（例如 EPSG:4326 或 EPSG:3857）。`,
    'EPSG:4326'
  )
  const crs = normalizeCrs(value)

  if (!crs) {
    throw new Error('已取消加载：缺少源坐标系')
  }

  return crs
}

function isWgs84(crs) {
  return /EPSG:4326/i.test(crs) || /WGS_1984/i.test(crs)
}

function transformCoordinates(coords, fromCrs) {
  if (!Array.isArray(coords)) return coords

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const transformed = proj4(fromCrs, 'EPSG:4326', [coords[0], coords[1]])
    return coords.length > 2 ? [...transformed, ...coords.slice(2)] : transformed
  }

  return coords.map((item) => transformCoordinates(item, fromCrs))
}

function transformGeoJsonToWgs84(geojson, fromCrs) {
  if (!fromCrs) {
    throw new Error('缺少源坐标系，无法安全加载数据')
  }

  if (isWgs84(fromCrs)) {
    return {
      geojson,
      crs: fromCrs || 'EPSG:4326',
      needsTransform: false,
      notices: []
    }
  }

  const transformed = {
    ...geojson,
    crs: undefined,
    features: geojson.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry
        ? {
            ...feature.geometry,
            coordinates: transformCoordinates(feature.geometry.coordinates, fromCrs)
          }
        : feature.geometry
    }))
  }

  delete transformed.crs

  return {
    geojson: transformed,
    crs: fromCrs,
    needsTransform: true,
    notices: ['本地文件图层坐标系不是4326，已转换为4326后加载。']
  }
}

async function listBrowserFolderFiles(folder) {
  let handle = folderHandles.get(folder.id)

  if (!handle) {
    handle = await getFolderHandle(folder.id)
  }

  if (!handle) {
    throw new Error('未找到已选择的文件夹，请重新选择。')
  }

  const allowed = await ensureFolderPermission(handle)
  if (!allowed) {
    throw new Error('未获得读取文件夹的权限')
  }

  folderHandles.set(folder.id, handle)

  const files = []

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue

    const type = getSupportedFileType(name)
    if (!type) continue

    const id = `browser:${folder.id}:${name}`
    fileHandles.set(id, entry)
    files.push({
      id,
      name,
      path: name,
      type,
      folderId: folder.id,
      fileMode: 'browser'
    })
  }

  return files.sort((a, b) => a.name.localeCompare(b.name))
}

function tableKey(connectionId, table) {
  return `${connectionId}:${table.schema}.${table.name}:${table.geometryColumn}`
}

function fileKey(file) {
  if (file.fileMode === 'browser') {
    return file.id || `browser:${file.folderId}:${file.name}`
  }

  return `file:${file.path}`
}

function basemapKey(basemap) {
  return `basemap:${basemap.id}`
}

function createTablePayload(connection, table) {
  return {
    sourceKind: 'database',
    connectionId: connection.id,
    connectionName: connection.name,
    database: connection.database,
    ...table
  }
}

function createBasemapPayload(basemap) {
  return {
    sourceKind: 'basemap',
    ...basemap
  }
}

function createFilePayload(folder, file) {
  return {
    sourceKind: 'file',
    folderId: folder.id,
    folderName: folder.name,
    ...file
  }
}

function isSourceAdded(sourceKey) {
  return layers.value.some((layer) => layer.sourceKey === sourceKey)
}

function getGeometryLabel(type) {
  const value = String(type || 'GEOMETRY').toUpperCase()

  if (value.includes('POINT')) return '点'
  if (value.includes('LINE')) return '线'
  if (value.includes('POLYGON')) return '面'

  return '几何'
}

function getGeometryClass(type) {
  const value = String(type || '').toUpperCase()

  if (value.includes('POINT')) return 'point'
  if (value.includes('LINE')) return 'line'
  if (value.includes('POLYGON')) return 'polygon'

  return 'mixed'
}

function getLayerGeometryKind(layer) {
  if (!isDataLayer(layer)) return 'mixed'

  const features = layer.geojson?.features || []
  const kinds = new Set()

  features.forEach((feature) => {
    const type = String(feature.geometry?.type || '').toUpperCase()
    if (type.includes('POINT')) kinds.add('point')
    if (type.includes('LINE')) kinds.add('line')
    if (type.includes('POLYGON')) kinds.add('polygon')
  })

  if (kinds.size === 1) return Array.from(kinds)[0]

  const declaredType = getGeometryClass(layer.geometryType)
  return declaredType === 'mixed' ? 'mixed' : declaredType
}

function canStyleGeometry(layer, kind) {
  const layerKind = getLayerGeometryKind(layer)
  return layerKind === kind || layerKind === 'mixed'
}

function getBasemapTypeLabel(type) {
  if (type === 'blank') return '白板'
  return 'XYZ'
}

function formatRows(value) {
  if (!value || value < 0) return '-'
  if (value >= 10000) return `${Math.round(value / 1000) / 10}w`
  return value.toLocaleString()
}

function isDataLayer(layer) {
  return layer?.kind !== 'basemap' && layer?.geojson?.type === 'FeatureCollection'
}

function ensureFeatureIndexes(layer) {
  if (!isDataLayer(layer)) return layer

  layer.geojson.features = (layer.geojson.features || []).map((feature, index) => ({
    ...feature,
    properties: {
      ...(feature.properties || {}),
      __gisIndex: index
    }
  }))
  return layer
}

function normalizeLayerStyle(layer) {
  if (!isDataLayer(layer)) return layer

  ensureFeatureIndexes(layer)
  const baseColor = layer.color || layer.style?.color || '#0f5fc6'
  layer.style = {
    ...defaultLayerStyle,
    color: baseColor,
    fillColor: baseColor,
    outlineColor: baseColor,
    lineColor: baseColor,
    circleColor: baseColor,
    ...(layer.style || {})
  }
  layer.color = layer.style.color || layer.style.fillColor || layer.style.lineColor || layer.style.circleColor
  return layer
}

function setSelectedLayerStyleColor(key, value) {
  const layer = selectedLayer.value
  if (!isDataLayer(layer)) return

  normalizeLayerStyle(layer)
  layer.style[key] = value

  if (key === 'fillColor' || key === 'lineColor' || key === 'circleColor') {
    layer.style.color = value
    layer.color = value
  }

  updateSelectedLayerStyle()
}

function updateSelectedLayerStyle() {
  const layer = selectedLayer.value
  if (!isDataLayer(layer)) return

  normalizeLayerStyle(layer)
  emit('update-layer-style', {
    id: layer.id,
    color: layer.color,
    style: { ...layer.style }
  })
}

function selectLayer(layer) {
  normalizeLayerStyle(layer)
  selectedLayerId.value = layer.id
  selectedFeatureIndex.value = null
  emit('select-feature', { layerId: layer.id, featureIndex: null })
  layerInspectorVisible.value = isDataLayer(layer)
  if (!isDataLayer(layer)) {
    activeLayerTool.value = 'details'
  }
}

function selectFeature(index) {
  if (!isDataLayer(selectedLayer.value)) return

  selectedFeatureIndex.value = selectedFeatureIndex.value === index ? null : index
  activeLayerTool.value = 'attributes'
  emit('select-feature', {
    layerId: selectedLayer.value.id,
    featureIndex: selectedFeatureIndex.value
  })
}

function clearFeatureSelection() {
  selectedFeatureIndex.value = null
  emit('select-feature', {
    layerId: selectedLayer.value?.id,
    featureIndex: null
  })
}

function handleMapFeatureSelect(payload) {
  const layer = layers.value.find((item) => item.id === payload?.layerId)
  if (!isDataLayer(layer)) return

  selectedLayerId.value = layer.id
  selectedFeatureIndex.value = Number(payload.featureIndex)
  activeLayerTool.value = 'attributes'
  layerInspectorVisible.value = true

  const rowIndex = attributeRows.value.findIndex((row) => row.index === selectedFeatureIndex.value)
  if (rowIndex >= 0) {
    attributePage.value = Math.floor(rowIndex / attributePageSize) + 1
  }
}

function getLayerById(layerId) {
  return layers.value.find((layer) => layer.id === layerId) || null
}

function getDataLayers() {
  return layers.value
    .filter((layer) => isDataLayer(layer))
    .map((layer) => layer)
}

function setEditingLayer(layerId = '') {
  editingLayerId.value = layerId || ''
}

function requestEditLayer(layer) {
  if (!isDataLayer(layer)) return
  selectLayer(layer)
  emit('request-edit-layer', layer)
}

function requestExitEditLayer(layer) {
  if (!isDataLayer(layer)) return
  emit('request-exit-edit-layer', layer)
}

function updateLayerGeoJson(payload) {
  const layer = layers.value.find((item) => item.id === payload?.id)
  if (!isDataLayer(layer) || !payload?.geojson) return null

  layer.geojson = payload.geojson
  layer.featureCount = payload.geojson.features?.length || 0
  layer.fields = Array.isArray(payload.fields) ? payload.fields : layer.fields
  layer.editable = payload.editable ?? layer.editable
  ensureFeatureIndexes(layer)
  normalizeLayerStyle(layer)
  emit('add-layer', layer)
  return layer
}

function getLayerFields(features) {
  const fields = new Set()
  features.slice(0, 100).forEach((feature) => {
    Object.keys(feature.properties || {}).forEach((key) => fields.add(key))
  })
  return Array.from(fields)
}

function getLayerStats(layer) {
  if (!isDataLayer(layer)) return null

  const features = layer.geojson.features || []
  const geometryCounts = {}
  let totalArea = 0
  let totalLength = 0

  features.forEach((feature) => {
    const geometryType = feature.geometry?.type || 'Empty'
    geometryCounts[geometryType] = (geometryCounts[geometryType] || 0) + 1

    if (geometryType.includes('Polygon')) {
      totalArea += turf.area(feature)
    }

    if (geometryType.includes('LineString')) {
      totalLength += turf.length(feature, { units: 'meters' })
    }
  })

  let bbox = null
  try {
    bbox = features.length > 0 ? turf.bbox(layer.geojson) : null
  } catch (error) {
    bbox = null
  }

  return {
    featureCount: features.length,
    fieldCount: getLayerFields(features).length,
    fields: getLayerFields(features),
    geometryCounts,
    bbox,
    totalArea,
    totalLength
  }
}

function getLayerCrsLabel(layer) {
  if (!layer) return '-'

  const targetCrs = layer.crs || 'EPSG:4326'
  const sourceCrs = layer.sourceCrs || targetCrs
  return layer.needsTransform ? `${sourceCrs} -> ${targetCrs}` : targetCrs
}

function getTransformLabel(layer) {
  if (!layer || layer.needsTransform == null) return '未检测'
  return layer.needsTransform ? '已转换到 WGS84' : '无需转换'
}

function getLayerNotice(layer) {
  return layer?.notices?.length ? layer.notices.join(' / ') : ''
}

function isShapefileLayer(layer) {
  return isDataLayer(layer) && layer.sourceKind === 'file' && layer.file?.type === 'shp'
}

function getLayerEncoding(layer) {
  return normalizeDbfEncoding(layer?.encoding || layer?.file?.encoding)
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '-'
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits
  })
}

function formatArea(value) {
  if (!value) return '-'
  if (value >= 1000000) return `${formatNumber(value / 1000000, 4)} km²`
  return `${formatNumber(value, 2)} m²`
}

function formatLength(value) {
  if (!value) return '-'
  if (value >= 1000) return `${formatNumber(value / 1000, 3)} km`
  return `${formatNumber(value, 2)} m`
}

function formatBbox(bbox) {
  if (!bbox) return '-'
  return bbox.map((value) => Number(value).toFixed(5)).join(', ')
}

function getGeometrySummary(stats) {
  if (!stats) return '-'
  return Object.entries(stats.geometryCounts)
    .map(([type, count]) => `${type} ${count}`)
    .join(' / ') || '-'
}

function formatCellValue(value) {
  if (value == null || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function sanitizeFileName(value) {
  return String(value || 'layer')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

function sanitizeTableName(value) {
  const normalized = String(value || 'uploaded_layer')
    .trim()
    .replace(/\.[^.]+$/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  return (/^[a-z_]/i.test(normalized) ? normalized : `layer_${normalized}`).slice(0, 58) || 'uploaded_layer'
}

function getFileBaseName(name) {
  return String(name || 'uploaded_layer').replace(/\.[^.]+$/g, '')
}

function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function exportLayerGeoJson(layer = selectedLayer.value) {
  if (!isDataLayer(layer)) return

  downloadText(
    `${sanitizeFileName(layer.name)}.geojson`,
    JSON.stringify(layer.geojson, null, 2)
  )
}

async function loadExportSpatialReferences(keyword = exportSpatialReferenceKeyword.value) {
  exportSpatialReferenceLoading.value = true

  try {
    const res = await apiClient.get('/api/spatial-references', {
      params: {
        keyword: keyword || undefined,
        limit: 120
      }
    })
    exportSpatialReferences.value = res.data.items || []
    exportSpatialReferenceSource.value = res.data.source || ''
  } catch (error) {
    exportSpatialReferences.value = []
    exportSpatialReferenceSource.value = ''
    errorMessage.value = error.response?.data?.error || error.message || '坐标系列表加载失败'
  } finally {
    exportSpatialReferenceLoading.value = false
  }
}

function handleExportSpatialReferenceSearch(event) {
  exportSpatialReferenceKeyword.value = event.target.value
  loadExportSpatialReferences(exportSpatialReferenceKeyword.value)
}

async function openLayerExportDialog(scope = 'layer') {
  const layer = selectedLayer.value
  if (!isDataLayer(layer)) return
  exportForm.scope = scope
  exportForm.targetCrs = layer.crs || 'EPSG:4326'
  exportForm.outputFormat = 'geojson'
  exportForm.encoding = getLayerEncoding(layer)
  exportForm.outputName = scope === 'selected' && selectedFeatureIndex.value != null
    ? `${sanitizeFileName(layer.name)}_selected_${selectedFeatureIndex.value + 1}`
    : sanitizeFileName(layer.name)
  exportModalVisible.value = true
  if (!exportSpatialReferences.value.length) {
    await loadExportSpatialReferences()
  }
}

function closeLayerExportDialog() {
  exportModalVisible.value = false
}

function confirmLayerExport() {
  const layer = selectedLayer.value
  if (!isDataLayer(layer)) return
  const featureIndex = exportForm.scope === 'selected' ? selectedFeatureIndex.value : null
  if (exportForm.scope === 'selected' && featureIndex == null) return

  emit('export-layer', {
    layer,
    scope: exportForm.scope,
    featureIndex,
    targetCrs: exportForm.targetCrs,
    outputFormat: exportForm.outputFormat,
    encoding: exportForm.encoding,
    outputName: exportForm.outputName
  })
  exportModalVisible.value = false
}

function exportSelectedFeature() {
  const layer = selectedLayer.value
  if (!isDataLayer(layer) || selectedFeatureIndex.value == null) return

  const feature = layer.geojson.features?.[selectedFeatureIndex.value]
  if (!feature) return

  const output = {
    type: 'FeatureCollection',
    features: [feature]
  }

  downloadText(
    `${sanitizeFileName(layer.name)}-selected-${selectedFeatureIndex.value + 1}.geojson`,
    JSON.stringify(output, null, 2)
  )
}

function setDragPayload(event, payload) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/json', JSON.stringify(payload))
  event.dataTransfer.setData('text/plain', payload.name || payload.fullName || payload.path)
}

async function addDroppedSource(payload) {
  if (!payload) return null

  if (payload.sourceKind === 'basemap') {
    return addBasemapLayer(payload)
  }

  if (payload.sourceKind === 'file') {
    return addFileLayer(payload)
  }

  return addTableLayer(payload)
}

function upsertLayer(layer) {
  ensureFeatureIndexes(layer)
  normalizeLayerStyle(layer)
  layers.value = normalizeLayerOrder([
    layer,
    ...layers.value.filter((item) => item.id !== layer.id && item.sourceKey !== layer.sourceKey)
  ])
  selectedLayerId.value = layer.id
  layerInspectorVisible.value = isDataLayer(layer)
  emit('add-layer', layer)
}

function addExternalLayer(payload) {
  const payloadStyle = payload.style && typeof payload.style === 'object' ? { ...payload.style } : null
  const color = payload.color
    || payloadStyle?.color
    || payloadStyle?.fillColor
    || payloadStyle?.lineColor
    || payloadStyle?.circleColor
    || layerColors[layers.value.filter((layer) => layer.kind !== 'basemap').length % layerColors.length]
  const layer = {
    id: payload.id || `external-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceKey: payload.sourceKey || `external:${payload.name || 'layer'}:${Date.now()}`,
    kind: 'geojson',
    name: payload.name || '未命名图层',
    subtitle: payload.subtitle || '菜单导入',
    visible: payload.visible ?? true,
    color,
    geometryType: payload.geometryType || 'GEOMETRY',
    sourceKind: payload.sourceKind || 'menu-import',
    crs: payload.crs || 'EPSG:4326',
    sourceCrs: payload.sourceCrs || '',
    needsTransform: Boolean(payload.needsTransform),
    notices: payload.notices || [],
    editable: Boolean(payload.editable),
    fields: Array.isArray(payload.fields) ? payload.fields : [],
    featureCount: payload.geojson?.features?.length || 0,
    geojson: payload.geojson,
    style: payloadStyle,
    fitOnAdd: payload.fitOnAdd ?? true
  }

  upsertLayer(layer)
  return layer
}

function openDatabaseConnectionModal() {
  expandedGroups.database = true
  databaseModalVisible.value = true
}

function addBasemapLayer(basemap) {
  const key = basemapKey(basemap)
  const layer = {
    id: `map-${basemap.id}`,
    sourceKey: key,
    kind: 'basemap',
    name: basemap.name,
    subtitle: getBasemapTypeLabel(basemap.basemapType),
    visible: true,
    color: '#394957',
    basemapType: basemap.basemapType,
    url: basemap.url
  }

  layers.value = layers.value.filter((item) => item.kind !== 'basemap')
  upsertLayer(layer)
  return layer
}

async function addTableLayer(payload) {
  const key = `${payload.connectionId}:${payload.schema}.${payload.name}:${payload.geometryColumn}`
  const existingLayer = layers.value.find((layer) => layer.sourceKey === key)

  if (existingLayer) {
    if (!existingLayer.visible) toggleLayer(existingLayer)
    return existingLayer
  }

  if (Number(payload.srid) !== 4326) {
    alert('当前图层坐标系不是4326，因为需要进行坐标转换，所以需要等候加载！')
  }

  loadingLayerKeys[key] = true
  errorMessage.value = ''

  try {
    const res = await apiClient.get(
      `/api/database/${payload.connectionId}/tables/${encodeURIComponent(payload.schema)}/${encodeURIComponent(payload.name)}/geojson`,
      {
        params: {
          geometryColumn: payload.geometryColumn
        }
      }
    )

    if (res.data.notices?.length) {
      alert(res.data.notices.join('\n'))
    }

    const color = layerColors[layers.value.filter((layer) => layer.kind !== 'basemap').length % layerColors.length]
    const layer = {
      id: `postgis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceKey: key,
      kind: 'geojson',
      name: payload.fullName,
      subtitle: `${payload.connectionName} / ${payload.geometryColumn}`,
      visible: true,
      color,
      geometryType: payload.geometryType,
      sourceKind: 'postgis',
      crs: 'EPSG:4326',
      sourceCrs: payload.srid ? `EPSG:${payload.srid}` : 'Unknown',
      needsTransform: Boolean(res.data.needsTransform),
      notices: res.data.notices || [],
      featureCount: res.data.geojson?.features?.length || 0,
      totalFeatures: res.data.totalFeatures,
      table: res.data.table,
      geojson: res.data.geojson
    }

    upsertLayer(layer)
    return layer
  } catch (error) {
    errorMessage.value = error.response?.data?.error || error.message
    return null
  } finally {
    loadingLayerKeys[key] = false
  }
}

async function addFileLayer(payload) {
  const key = fileKey(payload)
  const existingLayer = layers.value.find((layer) => layer.sourceKey === key)

  if (existingLayer) {
    if (!existingLayer.visible) toggleLayer(existingLayer)
    return existingLayer
  }

  loadingLayerKeys[key] = true
  errorMessage.value = ''

  try {
    const encoding = normalizeDbfEncoding(payload.encoding)
    const data = payload.fileMode === 'browser'
      ? await readBrowserFileGeojson(payload, encoding)
      : await readServerFileGeojson(payload, encoding)

    if (data.notices?.length) {
      alert(data.notices.join('\n'))
    }

    const color = layerColors[layers.value.filter((layer) => layer.kind !== 'basemap').length % layerColors.length]
    const layer = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceKey: key,
      kind: 'geojson',
      name: payload.name,
      subtitle: `${payload.folderName} / ${payload.type}`,
      visible: true,
      color,
      geometryType: 'GEOMETRY',
      sourceKind: 'file',
      crs: 'EPSG:4326',
      sourceCrs: data.crs || 'EPSG:4326',
      encoding: payload.type === 'shp' ? encoding : undefined,
      needsTransform: Boolean(data.needsTransform),
      notices: data.notices || [],
      featureCount: data.geojson?.features?.length || 0,
      file: {
        ...(data.file || {}),
        folderId: payload.folderId,
        folderName: payload.folderName,
        fileMode: payload.fileMode || 'path',
        encoding: payload.type === 'shp' ? encoding : undefined
      },
      geojson: data.geojson
    }

    upsertLayer(layer)
    return layer
  } catch (error) {
    errorMessage.value = error.response?.data?.error || error.message
    return null
  } finally {
    loadingLayerKeys[key] = false
  }
}

async function readServerFileGeojson(payload, encoding = 'utf-8') {
  const params = {
    path: payload.path
  }

  if (payload.type === 'shp') {
    params.encoding = normalizeDbfEncoding(encoding)
  }

  const sourceCrs = normalizeCrs(payload.sourceCrs)
  if (sourceCrs) {
    params.sourceCrs = sourceCrs
  }

  try {
    const res = await apiClient.get('/api/files/geojson', {
      params
    })
    return res.data
  } catch (error) {
    if (error.response?.status !== 409 || error.response?.data?.code !== 'CRS_MISSING') {
      throw error
    }

    const sourceCrs = promptForSourceCrs(payload.name)
    const res = await apiClient.get('/api/files/geojson', {
      params: {
        ...params,
        sourceCrs
      }
    })
    return res.data
  }
}

async function readBrowserFileGeojson(payload, encoding = 'utf-8') {
  const handle = fileHandles.get(fileKey(payload))

  if (!handle) {
    throw new Error('未找到文件句柄，请重新展开文件夹。')
  }

  const file = await handle.getFile()
  let geojson

  if (payload.type === 'shp') {
    const shpBuffer = await file.arrayBuffer()
    const folderHandle = folderHandles.get(payload.folderId) || await getFolderHandle(payload.folderId)
    const baseName = payload.name.replace(/\.shp$/i, '')
    let dbfBuffer
    let prjText = ''

    try {
      const dbfHandle = await folderHandle.getFileHandle(`${baseName}.dbf`)
      dbfBuffer = await (await dbfHandle.getFile()).arrayBuffer()
    } catch (error) {
      dbfBuffer = undefined
    }

    try {
      const prjHandle = await folderHandle.getFileHandle(`${baseName}.prj`)
      prjText = await (await prjHandle.getFile()).text()
    } catch (error) {
      prjText = ''
    }

    const dbfEncoding = normalizeDbfEncoding(encoding)
    geojson = await shapefile.read(shpBuffer, dbfBuffer, { encoding: dbfEncoding })
    const detectedCrs = getPrjCrs(prjText)
    const crsMissing = !detectedCrs
    const sourceCrs = detectedCrs || normalizeCrs(payload.sourceCrs) || promptForSourceCrs(payload.name)
    const transformed = transformGeoJsonToWgs84(geojson, sourceCrs)
    const notices = [...transformed.notices]

    if (crsMissing) {
      notices.unshift(`源文件缺少坐标系信息，已按 ${sourceCrs} 读取。`)
    }

    return {
      file: {
        name: payload.name,
        path: payload.path,
        type: payload.type,
        encoding: dbfEncoding
      },
      crs: transformed.crs,
      crsMissing,
      needsTransform: transformed.needsTransform,
      notices,
      geojson: transformed.geojson
    }
  } else {
    geojson = JSON.parse(await file.text())
  }

  if (!geojson || geojson.type !== 'FeatureCollection') {
    throw new Error('文件内容不是 FeatureCollection')
  }

  const detectedCrs = getGeoJsonCrs(geojson)
  const crsMissing = !detectedCrs
  const sourceCrs = detectedCrs || promptForSourceCrs(payload.name)
  const transformed = transformGeoJsonToWgs84(geojson, sourceCrs)
  const notices = [...transformed.notices]

  if (crsMissing) {
    notices.unshift(`源文件缺少坐标系信息，已按 ${sourceCrs} 读取。`)
  }

  return {
    file: {
      name: payload.name,
      path: payload.path,
      type: payload.type
    },
    crs: transformed.crs,
    crsMissing,
    needsTransform: transformed.needsTransform,
    notices,
    geojson: transformed.geojson
  }
}

async function changeLayerEncoding(layer, encoding) {
  if (!isShapefileLayer(layer)) return

  const nextEncoding = normalizeDbfEncoding(encoding)
  if (getLayerEncoding(layer) === nextEncoding) return

  loadingLayerKeys[layer.sourceKey] = true
  errorMessage.value = ''

  try {
    const payload = {
      ...(layer.file || {}),
      sourceKind: 'file',
      folderId: layer.file?.folderId || layer.folderId,
      folderName: layer.file?.folderName || layer.folderName,
      fileMode: layer.file?.fileMode || layer.fileMode || (String(layer.file?.path || '').includes(':') ? 'path' : 'browser'),
      name: layer.file?.name || layer.name,
      path: layer.file?.path,
      type: 'shp',
      encoding: nextEncoding,
      sourceCrs: layer.sourceCrs || layer.crs
    }

    const data = payload.fileMode === 'browser'
      ? await readBrowserFileGeojson(payload, nextEncoding)
      : await readServerFileGeojson(payload, nextEncoding)

    layer.encoding = nextEncoding
    layer.file = {
      ...(data.file || payload),
      folderId: payload.folderId,
      folderName: payload.folderName,
      fileMode: payload.fileMode,
      encoding: nextEncoding
    }
    layer.sourceCrs = data.crs || layer.sourceCrs
    layer.needsTransform = Boolean(data.needsTransform)
    layer.notices = data.notices || []
    layer.featureCount = data.geojson?.features?.length || 0
    layer.geojson = data.geojson

    ensureFeatureIndexes(layer)
    selectedFeatureIndex.value = null
    attributePage.value = 1
    emit('add-layer', layer)
    emit('select-feature', { layerId: layer.id, featureIndex: null })
  } catch (error) {
    errorMessage.value = error.response?.data?.error || error.message
  } finally {
    loadingLayerKeys[layer.sourceKey] = false
  }
}

function handleSourceDrop(event) {
  const raw = event.dataTransfer.getData('application/json')
  if (!raw) return

  try {
    addDroppedSource(JSON.parse(raw))
  } catch (error) {
    errorMessage.value = '拖拽数据无法识别'
  }
}

function toggleLayer(layer) {
  if (layer.kind === 'basemap') return

  layer.visible = !layer.visible
  emit('toggle-layer', { id: layer.id, visible: layer.visible })
}

function removeLayer(layer) {
  layers.value = layers.value.filter((item) => item.id !== layer.id)
  if (selectedLayerId.value === layer.id) {
    selectedLayerId.value = layers.value.find((item) => item.kind !== 'basemap')?.id || layers.value[0]?.id || ''
    layerInspectorVisible.value = isDataLayer(selectedLayer.value)
  }
  emit('remove-layer', layer.id)
}

function handleLayerDragStart(event, layer) {
  event.stopPropagation()
  if (layer.kind === 'basemap') {
    event.preventDefault()
    return
  }

  draggingLayerId.value = layer.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-map-layer-id', layer.id)
  event.dataTransfer.setData('text/plain', layer.id)
}

function handleLayerDragOver(event, targetLayer) {
  event.stopPropagation()
  if (targetLayer.kind === 'basemap') return
  if (!draggingLayerId.value || draggingLayerId.value === targetLayer.id) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

function handleLayerDrop(event, targetLayer) {
  event.preventDefault()
  event.stopPropagation()

  const draggedId = draggingLayerId.value || event.dataTransfer.getData('application/x-map-layer-id')
  if (!draggedId || draggedId === targetLayer.id) return
  if (targetLayer.kind === 'basemap') return

  const fromIndex = layers.value.findIndex((item) => item.id === draggedId)
  const toIndex = layers.value.findIndex((item) => item.id === targetLayer.id)
  if (fromIndex < 0 || toIndex < 0) return

  const nextLayers = [...layers.value]
  const [draggedLayer] = nextLayers.splice(fromIndex, 1)
  if (draggedLayer.kind === 'basemap') return

  const targetIndex = nextLayers.findIndex((item) => item.id === targetLayer.id)
  if (targetIndex < 0) return

  const rect = event.currentTarget.getBoundingClientRect()
  const insertAfterTarget = event.clientY > rect.top + rect.height / 2
  nextLayers.splice(targetIndex + (insertAfterTarget ? 1 : 0), 0, draggedLayer)
  layers.value = normalizeLayerOrder(nextLayers)
  draggingLayerId.value = ''
  emit('reorder-layer', getDataLayerOrder())
}

function handleLayerDragEnd(event) {
  event.stopPropagation()
  draggingLayerId.value = ''
}

defineExpose({
  addDroppedSource,
  addTableLayer,
  addExternalLayer,
  openDatabaseConnectionModal,
  handleMapFeatureSelect,
  updateLayerGeoJson,
  setEditingLayer,
  getLayerById,
  getDataLayers
})
</script>

<template>
  <aside class="resource-panel">
    <section class="panel-zone resources-zone">
      <header class="zone-header">
        <div>
          <p class="zone-kicker">Data Sources</p>
          <h2>数据资源</h2>
        </div>
      </header>

      <div v-if="errorMessage" class="error-strip">
        {{ errorMessage }}
      </div>

      <div class="resource-scroll">
        <article class="resource-group">
          <div class="group-title" @click="toggleGroup('database')">
            <span>{{ expandedGroups.database ? 'v' : '>' }}</span>
            <strong>数据库连接</strong>
            <em>{{ connectionCount }}</em>
            <button class="mini-btn" type="button" @click.stop="databaseModalVisible = true">添加</button>
          </div>

          <div v-if="expandedGroups.database" class="group-body">
            <article v-for="connection in connections" :key="connection.id" class="source-card">
              <div
                class="source-head"
                role="button"
                tabindex="0"
                @click="toggleConnection(connection)"
                @keydown.enter.prevent="toggleConnection(connection)"
                @keydown.space.prevent="toggleConnection(connection)"
              >
                <span class="db-mark">PG</span>
                <span class="source-copy">
                  <strong>{{ connection.name }}</strong>
                  <small>{{ connection.host }}:{{ connection.port }} / {{ connection.database }}</small>
                </span>
                <button class="upload-source-btn" type="button" title="上传数据到数据库" @click.stop="openDatabaseUpload(connection)">
                  上传
                </button>
                <span class="count-pill">{{ tablesByConnection[connection.id]?.length || 0 }}</span>
              </div>

              <div v-if="isConnectionExpanded(connection.id)" class="nested-list">
                <div v-if="loadingTables[connection.id]" class="empty-state compact">正在读取空间表...</div>
                <div v-else-if="!tablesByConnection[connection.id]?.length" class="empty-state compact">
                  没有发现 PostGIS 空间表
                </div>
                <button
                  v-for="table in tablesByConnection[connection.id]"
                  :key="table.fullName + table.geometryColumn"
                  class="source-row"
                  :class="{ added: isSourceAdded(tableKey(connection.id, table)) }"
                  type="button"
                  draggable="true"
                  @dragstart="setDragPayload($event, createTablePayload(connection, table))"
                  @dblclick="addTableLayer(createTablePayload(connection, table))"
                >
                  <span class="geom-pill" :class="getGeometryClass(table.geometryType)">
                    {{ getGeometryLabel(table.geometryType) }}
                  </span>
                  <span class="source-copy">
                    <strong>{{ table.name }}</strong>
                    <small>{{ table.schema }}.{{ table.geometryColumn }} · SRID {{ table.srid || '-' }}</small>
                  </span>
                  <span class="row-count">{{ formatRows(table.estimatedRows) }}</span>
                  <span v-if="loadingLayerKeys[tableKey(connection.id, table)]" class="loading-dot"></span>
                </button>
              </div>

              <button class="delete-source-btn" type="button" @click="removeConnection(connection)">删除连接</button>
            </article>

            <div v-if="connections.length === 0" class="empty-state">
              添加 PostGIS 连接后，这里会显示空间数据表。
            </div>
          </div>
        </article>

        <article class="resource-group">
          <div class="group-title" @click="toggleGroup('basemap')">
            <span>{{ expandedGroups.basemap ? 'v' : '>' }}</span>
            <strong>地图底图</strong>
            <em>{{ basemapCount }}</em>
            <button class="mini-btn" type="button" @click.stop="basemapFormVisible = !basemapFormVisible">添加</button>
          </div>

          <div v-if="expandedGroups.basemap" class="group-body">
            <div v-if="basemapFormVisible" class="inline-form">
              <input v-model.trim="basemapForm.name" type="text" placeholder="底图名称" />
              <input
                v-model.trim="basemapForm.url"
                type="text"
                placeholder="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <button class="primary-inline-btn" type="button" @click="addCustomBasemap">保存底图</button>
            </div>

            <button
              v-for="basemap in basemaps"
              :key="basemap.id"
              class="source-row basemap-row"
              :class="{ added: isSourceAdded(basemapKey(basemap)) }"
              type="button"
              draggable="true"
              @dragstart="setDragPayload($event, createBasemapPayload(basemap))"
              @dblclick="addBasemapLayer(basemap)"
            >
              <span class="geom-pill mixed">{{ getBasemapTypeLabel(basemap.basemapType) }}</span>
              <span class="source-copy">
                <strong>{{ basemap.name }}</strong>
                <small>{{ basemap.url }}</small>
              </span>
              <button v-if="!basemap.builtIn" class="row-action-btn" type="button" @click.stop="removeCustomBasemap(basemap)">删</button>
            </button>
          </div>
        </article>

        <article class="resource-group">
          <div class="group-title" @click="toggleGroup('folder')">
            <span>{{ expandedGroups.folder ? 'v' : '>' }}</span>
            <strong>本地文件夹</strong>
            <em>{{ folderCount }}</em>
            <span class="group-actions">
              <button class="mini-btn" type="button" @click.stop="chooseLocalFolder">选择</button>
              <button class="mini-btn secondary" type="button" @click.stop="folderFormVisible = !folderFormVisible">路径</button>
            </span>
          </div>

          <div v-if="expandedGroups.folder" class="group-body">
            <div v-if="folderFormVisible" class="inline-form">
              <input v-model.trim="folderForm.name" type="text" placeholder="文件夹名称" />
              <input v-model.trim="folderForm.path" type="text" placeholder="浏览器不支持选择时，可输入 D:\data\gis" />
              <button class="primary-inline-btn" type="button" @click="addFolderConnection">保存路径</button>
            </div>

            <article v-for="folder in folders" :key="folder.id" class="source-card">
              <button class="source-head" type="button" @click="toggleFolder(folder)">
                <span class="db-mark folder-mark">DIR</span>
                <span class="source-copy">
                  <strong>{{ folder.name }}</strong>
                  <small>{{ folder.path }}</small>
                </span>
                <span class="count-pill">{{ filesByFolder[folder.id]?.length || 0 }}</span>
              </button>

              <div v-if="isFolderExpanded(folder.id)" class="nested-list">
                <div v-if="loadingFolders[folder.id]" class="empty-state compact">正在读取文件...</div>
                <div v-else-if="!filesByFolder[folder.id]?.length" class="empty-state compact">
                  没有发现 .shp 或 .geojson 文件
                </div>
                <button
                  v-for="file in filesByFolder[folder.id]"
                  :key="file.path"
                  class="source-row"
                  :class="{ added: isSourceAdded(fileKey(file)) }"
                  type="button"
                  draggable="true"
                  @dragstart="setDragPayload($event, createFilePayload(folder, file))"
                  @dblclick="addFileLayer(createFilePayload(folder, file))"
                >
                  <span class="geom-pill file-pill">{{ file.type }}</span>
                  <span class="source-copy">
                    <strong>{{ file.name }}</strong>
                    <small>{{ file.path }}</small>
                  </span>
                  <span v-if="loadingLayerKeys[fileKey(file)]" class="loading-dot"></span>
                </button>
              </div>

              <button class="delete-source-btn" type="button" @click="removeFolder(folder)">删除文件夹</button>
            </article>

            <div v-if="folders.length === 0" class="empty-state">
              添加文件夹路径后，可展开查看其中的 .shp 和 .geojson 文件。
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="panel-zone layers-zone" @dragover.prevent @drop.prevent="handleSourceDrop">
      <header class="zone-header compact-header">
        <div>
          <p class="zone-kicker">Map Layers</p>
          <h2>图层列表</h2>
        </div>
        <span class="layer-total">{{ layerCount }}</span>
      </header>

      <div class="drop-hint">双击资源，或拖到这里 / 地图上添加图层</div>

      <div class="layer-list">
        <article
          v-for="layer in layers"
          :key="layer.id"
          class="map-layer"
          :class="{ muted: !layer.visible, dragging: draggingLayerId === layer.id, selected: selectedLayer?.id === layer.id, editing: editingLayerId === layer.id, basemap: layer.kind === 'basemap' }"
          :draggable="layer.kind !== 'basemap'"
          @click="selectLayer(layer)"
          @dragstart="handleLayerDragStart($event, layer)"
          @dragover="handleLayerDragOver($event, layer)"
          @drop="handleLayerDrop($event, layer)"
          @dragend="handleLayerDragEnd"
        >
          <button
            class="visibility-btn"
            type="button"
            :disabled="layer.kind === 'basemap'"
            :title="layer.kind === 'basemap' ? '底图始终显示' : (layer.visible ? '隐藏图层' : '显示图层')"
            @click.stop="toggleLayer(layer)"
          >
            {{ layer.kind === 'basemap' ? 'B' : (layer.visible ? '●' : '○') }}
          </button>
          <span class="layer-swatch" :style="{ background: layer.color }"></span>
          <span class="layer-copy">
            <strong>{{ layer.name }}</strong>
            <small>{{ layer.subtitle }} · {{ layer.featureCount ?? '底图' }}{{ layer.featureCount != null ? ' 条' : '' }}</small>
          </span>
          <div class="layer-action-stack">
            <button
              v-if="isDataLayer(layer) && editingLayerId !== layer.id"
              class="edit-layer-btn"
              type="button"
              title="进入编辑"
              @click.stop="requestEditLayer(layer)"
            >
              编
            </button>
            <button
              v-else-if="isDataLayer(layer)"
              class="edit-layer-btn active"
              type="button"
              title="退出编辑"
              @click.stop="requestExitEditLayer(layer)"
            >
              退
            </button>
            <button class="remove-layer-btn" type="button" title="移除图层" @click.stop="removeLayer(layer)">x</button>
          </div>
        </article>

        <div v-if="layers.length === 0" class="empty-state compact">
          暂无图层
        </div>
      </div>

      <section
        v-if="layerInspectorVisible && isDataLayer(selectedLayer)"
        class="layer-toolbox"
        :class="{ dragging: inspectorDrag.active }"
        :style="{ left: `${inspectorPosition.left}px`, top: `${inspectorPosition.top}px` }"
      >
        <header
          class="toolbox-head"
          @pointerdown="handleInspectorPointerDown"
          @pointermove="handleInspectorPointerMove"
          @pointerup="handleInspectorPointerUp"
          @pointercancel="handleInspectorPointerUp"
        >
          <div>
            <p class="zone-kicker">Layer Inspector</p>
            <strong>{{ selectedLayer?.name || '选择图层' }}</strong>
          </div>
          <div class="toolbox-actions" @pointerdown.stop @click.stop>
            <button
              class="tool-action-btn"
              type="button"
              :disabled="!isDataLayer(selectedLayer)"
              title="导出图层"
              @click.stop="openLayerExportDialog('layer')"
            >
              Export
            </button>
            <button class="inspector-close-btn" type="button" title="关闭" @click.stop="layerInspectorVisible = false">
              x
            </button>
          </div>
        </header>

        <div v-if="!selectedLayer" class="toolbox-empty">
          添加一个数据图层后可查看统计、属性和样式。
        </div>
        <div v-else-if="!isDataLayer(selectedLayer)" class="toolbox-empty">
          底图不参与统计和空间分析。
        </div>
        <div v-else class="toolbox-body">
          <div class="tool-tabs">
            <button
              type="button"
              :class="{ active: activeLayerTool === 'details' }"
              @click="activeLayerTool = 'details'"
            >
              详情
            </button>
            <button
              type="button"
              :class="{ active: activeLayerTool === 'attributes' }"
              @click="activeLayerTool = 'attributes'"
            >
              属性
            </button>
            <button
              type="button"
              :class="{ active: activeLayerTool === 'style' }"
              @click="activeLayerTool = 'style'"
            >
              样式
            </button>
          </div>

          <div v-if="activeLayerTool === 'details'" class="tool-pane">
            <div class="metric-grid">
              <span>
                <em>要素</em>
                <strong>{{ selectedLayerStats?.featureCount || 0 }}</strong>
              </span>
              <span>
                <em>字段</em>
                <strong>{{ selectedLayerStats?.fieldCount || 0 }}</strong>
              </span>
              <span>
                <em>面积</em>
                <strong>{{ formatArea(selectedLayerStats?.totalArea || 0) }}</strong>
              </span>
              <span>
                <em>长度</em>
                <strong>{{ formatLength(selectedLayerStats?.totalLength || 0) }}</strong>
              </span>
            </div>

            <dl class="detail-list">
              <div>
                <dt>几何</dt>
                <dd>{{ getGeometrySummary(selectedLayerStats) }}</dd>
              </div>
              <div>
                <dt>BBox</dt>
                <dd>{{ formatBbox(selectedLayerStats?.bbox) }}</dd>
              </div>
              <div>
                <dt>CRS</dt>
                <dd>{{ getLayerCrsLabel(selectedLayer) }}</dd>
              </div>
              <div>
                <dt>转换</dt>
                <dd>{{ getTransformLabel(selectedLayer) }}</dd>
              </div>
              <div v-if="getLayerNotice(selectedLayer)">
                <dt>提示</dt>
                <dd>{{ getLayerNotice(selectedLayer) }}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{{ selectedLayer.subtitle }}</dd>
              </div>
            </dl>

            <div class="field-chips" v-if="selectedLayerStats?.fields?.length">
              <span v-for="field in selectedLayerStats.fields.slice(0, 8)" :key="field">{{ field }}</span>
              <span v-if="selectedLayerStats.fields.length > 8">+{{ selectedLayerStats.fields.length - 8 }}</span>
            </div>
          </div>

          <div v-else-if="activeLayerTool === 'attributes'" class="tool-pane">
            <div v-if="isShapefileLayer(selectedLayer)" class="encoding-row">
              <span>属性编码</span>
              <div class="encoding-switch" role="group" aria-label="Shapefile 属性编码">
                <button
                  v-for="option in dbfEncodingOptions"
                  :key="option.value"
                  type="button"
                  :class="{ active: getLayerEncoding(selectedLayer) === option.value }"
                  :disabled="loadingLayerKeys[selectedLayer.sourceKey]"
                  @click="changeLayerEncoding(selectedLayer, option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="attribute-toolbar">
              <input v-model.trim="attributeSearch" type="search" placeholder="搜索属性值或几何类型" />
              <span>{{ attributeRows.length }} / {{ selectedLayerStats?.featureCount || 0 }}</span>
            </div>
            <div class="selection-toolbar">
              <span>{{ selectedFeatureIndex == null ? '未选择要素' : `已选择 #${selectedFeatureIndex + 1}` }}</span>
              <button type="button" :disabled="selectedFeatureIndex == null" @click="openLayerExportDialog('selected')">导出选中</button>
              <button type="button" :disabled="selectedFeatureIndex == null" @click="clearFeatureSelection">清空</button>
            </div>

            <div v-if="attributeFields.length === 0" class="toolbox-empty inline">
              当前图层没有可展示的属性字段。
            </div>
            <div v-else class="attribute-table-wrap">
              <table class="attribute-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Geometry</th>
                    <th v-for="field in attributeFields.slice(0, 6)" :key="field">{{ field }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in pagedAttributeRows"
                    :key="row.index"
                    :class="{ selected: row.selected }"
                    @click="selectFeature(row.index)"
                  >
                    <td>{{ row.index + 1 }}</td>
                    <td>{{ row.geometryType }}</td>
                    <td v-for="field in attributeFields.slice(0, 6)" :key="field" :title="formatCellValue(row.properties[field])">
                      {{ formatCellValue(row.properties[field]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="pager">
              <button type="button" :disabled="attributePage <= 1" @click="attributePage -= 1">上一页</button>
              <span>{{ Math.min(attributePage, attributePageCount) }} / {{ attributePageCount }}</span>
              <button type="button" :disabled="attributePage >= attributePageCount" @click="attributePage += 1">下一页</button>
            </div>
          </div>

          <div v-else-if="activeLayerTool === 'style'" class="tool-pane">
            <div v-if="canStyleGeometry(selectedLayer, 'polygon')" class="style-group">
              <div class="style-group-title">面样式</div>
              <label class="tool-field">
                <span>面颜色</span>
                <input
                  :value="selectedLayer.style.fillColor"
                  type="color"
                  @input="setSelectedLayerStyleColor('fillColor', $event.target.value)"
                />
              </label>
              <label class="tool-field">
                <span>透明度</span>
                <input v-model.number="selectedLayer.style.fillOpacity" type="range" min="0" max="1" step="0.05" @input="updateSelectedLayerStyle" />
              </label>
              <label class="tool-field">
                <span>边线颜色</span>
                <input
                  :value="selectedLayer.style.outlineColor"
                  type="color"
                  @input="setSelectedLayerStyleColor('outlineColor', $event.target.value)"
                />
              </label>
              <label class="tool-field">
                <span>边线宽度</span>
                <input v-model.number="selectedLayer.style.outlineWidth" type="range" min="0" max="8" step="0.1" @input="updateSelectedLayerStyle" />
              </label>
            </div>

            <div v-if="canStyleGeometry(selectedLayer, 'line')" class="style-group">
              <div class="style-group-title">线样式</div>
              <label class="tool-field">
                <span>线型</span>
                <select v-model="selectedLayer.style.lineDash" @change="updateSelectedLayerStyle">
                  <option v-for="option in lineStyleOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label class="tool-field">
                <span>线颜色</span>
                <input
                  :value="selectedLayer.style.lineColor"
                  type="color"
                  @input="setSelectedLayerStyleColor('lineColor', $event.target.value)"
                />
              </label>
              <label class="tool-field">
                <span>线粗细</span>
                <input v-model.number="selectedLayer.style.lineWidth" type="range" min="0.5" max="12" step="0.1" @input="updateSelectedLayerStyle" />
              </label>
            </div>

            <div v-if="canStyleGeometry(selectedLayer, 'point')" class="style-group">
              <div class="style-group-title">点样式</div>
              <label class="tool-field">
                <span>点大小</span>
                <input v-model.number="selectedLayer.style.circleRadius" type="range" min="2" max="24" step="0.5" @input="updateSelectedLayerStyle" />
              </label>
              <label class="tool-field">
                <span>点颜色</span>
                <input
                  :value="selectedLayer.style.circleColor"
                  type="color"
                  @input="setSelectedLayerStyleColor('circleColor', $event.target.value)"
                />
              </label>
              <label class="tool-field">
                <span>描边颜色</span>
                <input
                  :value="selectedLayer.style.circleStrokeColor"
                  type="color"
                  @input="setSelectedLayerStyleColor('circleStrokeColor', $event.target.value)"
                />
              </label>
              <label class="tool-field">
                <span>描边粗细</span>
                <input v-model.number="selectedLayer.style.circleStrokeWidth" type="range" min="0" max="8" step="0.1" @input="updateSelectedLayerStyle" />
              </label>
            </div>
          </div>

        </div>
      </section>
    </section>

    <DatabaseModal
      :visible="databaseModalVisible"
      @close="databaseModalVisible = false"
      @success="handleDatabaseSuccess"
    />

    <div v-if="uploadModalVisible" class="upload-modal-backdrop" @click.self="closeDatabaseUpload">
      <section class="upload-modal" role="dialog" aria-modal="true" aria-label="上传数据到数据库">
        <header class="upload-modal-header">
          <div>
            <p>Upload Layer</p>
            <h3>上传到 {{ uploadTargetConnection?.name }}</h3>
          </div>
          <button type="button" :disabled="uploadRunning" @click="closeDatabaseUpload">x</button>
        </header>

        <div class="upload-modal-body">
          <label class="upload-field">
            <span>空间数据</span>
            <input
              type="file"
              multiple
              accept=".geojson,.json,.shp,.dbf,.prj"
              :disabled="uploadRunning"
              @change="handleUploadFileChange"
            />
          </label>

          <div class="upload-file-hint">
            {{ uploadFiles.length ? uploadFiles.map((file) => file.name).join(' / ') : 'GeoJSON 选择单个文件；Shapefile 请同时选择 .shp、.dbf，可选 .prj。' }}
          </div>

          <label class="upload-field">
            <span>目标表名</span>
            <input v-model.trim="uploadForm.tableName" type="text" :disabled="uploadRunning" placeholder="public 下的新表名" />
          </label>

          <label class="upload-field">
            <span>源坐标系</span>
            <input v-model.trim="uploadForm.sourceCrs" type="text" :disabled="uploadRunning" placeholder="自动解析文件坐标系，解析不到则为空" />
          </label>

          <label class="upload-field">
            <span>属性编码</span>
            <select v-model="uploadForm.encoding" :disabled="uploadRunning">
              <option v-for="option in dbfEncodingOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="upload-check">
            <input v-model="uploadForm.replace" type="checkbox" :disabled="uploadRunning" />
            <span>同名表存在时覆盖</span>
          </label>
        </div>

        <footer class="upload-modal-actions">
          <button type="button" :disabled="uploadRunning" @click="closeDatabaseUpload">取消</button>
          <button class="primary" type="button" :disabled="uploadRunning" @click="uploadLayerToDatabase">
            {{ uploadRunning ? '上传中...' : '上传入库' }}
          </button>
        </footer>
      </section>
    </div>

    <div v-if="exportModalVisible" class="upload-modal-backdrop" @click.self="closeLayerExportDialog">
      <section class="upload-modal" role="dialog" aria-modal="true" aria-label="导出图层">
        <header class="upload-modal-header">
          <div>
            <p>Layer Export</p>
            <h3>{{ exportForm.scope === 'selected' ? '导出选中要素' : '导出图层' }}</h3>
          </div>
          <button type="button" @click="closeLayerExportDialog">x</button>
        </header>

        <div class="upload-modal-body">
          <label>
            <span>输出名称</span>
            <input v-model.trim="exportForm.outputName" type="text" placeholder="默认使用图层名" />
          </label>
          <label>
            <span>搜索坐标系</span>
            <input
              :value="exportSpatialReferenceKeyword"
              type="search"
              placeholder="输入 EPSG、名称或 SRID"
              @input="handleExportSpatialReferenceSearch"
            />
          </label>
          <label>
            <span>输出坐标系</span>
            <select v-model="exportForm.targetCrs" :disabled="exportSpatialReferenceLoading">
              <option value="">{{ exportSpatialReferenceLoading ? '正在加载...' : '请选择坐标系' }}</option>
              <option v-for="item in exportSpatialReferences" :key="item.code" :value="item.code">
                {{ item.code }} · {{ item.name }}
              </option>
            </select>
          </label>
          <label>
            <span>输出格式</span>
            <select v-model="exportForm.outputFormat">
              <option value="geojson">GeoJSON</option>
              <option value="shp">Shapefile (.zip)</option>
            </select>
          </label>
          <label>
            <span>编码方式</span>
            <select v-model="exportForm.encoding">
              <option value="utf-8">UTF-8</option>
              <option value="gbk">GBK</option>
            </select>
          </label>
          <p class="upload-hint">点击确认后调用系统保存弹框选择输出路径。坐标系来源：{{ exportSpatialReferenceSource || '-' }}</p>
        </div>

        <footer class="upload-modal-actions">
          <button type="button" @click="closeLayerExportDialog">取消</button>
          <button class="primary" type="button" @click="confirmLayerExport">确认导出</button>
        </footer>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.resource-panel {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1.4fr) minmax(220px, 0.85fr);
  background: #f5f9fd;
  color: #1f2a37;
  border-right: 1px solid #d7e0ec;
  overflow: hidden;
}

.panel-zone {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.resources-zone {
  border-bottom: 1px solid #d6e2ef;
}

.zone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px;
  background: linear-gradient(180deg, #f9fcff, #eff6ff);
  border-bottom: 1px solid #d8e5f3;
}

.compact-header {
  padding-top: 12px;
  padding-bottom: 10px;
}

.zone-kicker {
  margin: 0 0 3px;
  color: #60738c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #152238;
  font-size: 15px;
  font-weight: 800;
}

.error-strip {
  margin: 10px 12px 0;
  padding: 8px 10px;
  border: 1px solid #e0b7b1;
  border-radius: 6px;
  background: #fff1ef;
  color: #9b3028;
  font-size: 12px;
  line-height: 1.45;
}

.resource-scroll,
.layer-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.resource-group {
  border: 1px solid #d9e5f2;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  box-shadow: var(--gis-shadow-sm, 0 3px 10px rgba(15, 61, 108, 0.08));
}

.resource-group + .resource-group {
  margin-top: 8px;
}

.group-title {
  width: 100%;
  min-height: 40px;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 30px auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid #eef3f8;
  background: #fbfdff;
  color: #152238;
  text-align: left;
  cursor: pointer;
}

.group-title strong {
  font-size: 13px;
}

.group-title em,
.count-pill,
.layer-total {
  min-width: 24px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eaf3ff;
  color: #0f5fc6;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.mini-btn,
.primary-inline-btn {
  height: 26px;
  padding: 0 9px;
  border: 1px solid #0f5fc6;
  border-radius: 6px;
  background: linear-gradient(180deg, #1777e6, #0f5fc6);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.16);
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.group-actions {
  display: inline-flex;
  gap: 6px;
}

.mini-btn.secondary {
  border-color: #c7d6e8;
  background: #fff;
  color: #0f5fc6;
  box-shadow: none;
}

.mini-btn:hover,
.primary-inline-btn:hover,
.mini-btn.secondary:hover {
  border-color: #0b4ea2;
  background: #eaf3ff;
  color: #0f5fc6;
  box-shadow: 0 3px 10px rgba(15, 95, 198, 0.14);
}

.group-body {
  padding: 8px;
}

.inline-form {
  display: grid;
  gap: 7px;
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid #d9e5f2;
  border-radius: 7px;
  background: #f7fbff;
}

.inline-form input,
.inline-form select {
  min-width: 0;
  height: 30px;
  padding: 0 9px;
  border: 1px solid #cad7e8;
  border-radius: 6px;
  background: #fff;
  color: #17231b;
  font-size: 12px;
}

.source-card,
.map-layer {
  position: relative;
  border: 1px solid #d9e5f2;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 61, 108, 0.05);
}

.source-card + .source-card,
.map-layer + .map-layer,
.source-row + .source-row {
  margin-top: 7px;
}

.source-head {
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 54px 28px;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.source-head:hover {
  background: #f3f8ff;
}

.upload-source-btn {
  height: 28px;
  border: 1px solid #bcd0ed;
  border-radius: 6px;
  background: #fff;
  color: #0f5fc6;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.upload-source-btn:hover {
  border-color: #0f5fc6;
  background: #edf5ff;
}

.db-mark {
  width: 30px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #eaf3ff;
  color: #0f5fc6;
  font-size: 11px;
  font-weight: 900;
}

.folder-mark {
  color: #7a4d06;
  background: #fff4de;
}

.source-copy,
.layer-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

strong {
  min-width: 0;
  color: #17231b;
  font-size: 13px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

small {
  min-width: 0;
  color: #60738c;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nested-list {
  padding: 0 8px 8px 38px;
}

.source-row {
  width: 100%;
  min-height: 42px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 34px 12px;
  align-items: center;
  gap: 8px;
  padding: 6px 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #f8fbff;
  text-align: left;
  cursor: grab;
}

.basemap-row {
  grid-template-columns: 58px minmax(0, 1fr) 28px;
}

.source-row:hover {
  border-color: #9ec3ef;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.08);
}

.source-row.added {
  border-color: #abd0fa;
  background: #eef7ff;
}

.geom-pill {
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}

.geom-pill.point {
  background: #356fb3;
}

.geom-pill.line {
  background: #c47a24;
}

.geom-pill.polygon {
  background: #2f7d59;
}

.geom-pill.mixed {
  background: #727d75;
}

.file-pill {
  background: #8b5b9f;
  text-transform: uppercase;
}

.row-count {
  color: #7b857d;
  font-size: 11px;
  text-align: right;
}

.row-action-btn {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #9b4038;
  cursor: pointer;
}

.delete-source-btn {
  margin: 0 8px 8px 46px;
  padding: 3px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #9b4038;
  font-size: 11px;
  cursor: pointer;
}

.row-action-btn:hover,
.delete-source-btn:hover {
  background: #fff1ef;
}

.layers-zone {
  background: #fbfdff;
}

.drop-hint {
  display: block;
  padding: 9px 12px;
  color: #60738c;
  font-size: 12px;
  background: #f7fbff;
  border-bottom: 1px solid #e1ebf5;
}

.map-layer {
  min-height: 52px;
  display: grid;
  grid-template-columns: 26px 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 8px 9px;
  cursor: grab;
}

.map-layer.muted {
  opacity: 0.58;
}

.map-layer.dragging {
  opacity: 0.46;
  outline: 1px dashed #0f5fc6;
}

.map-layer.basemap {
  cursor: default;
}

.map-layer.editing {
  background: #ecfdf3;
  outline: 1px solid #5bbf79;
}

.layer-action-stack {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.visibility-btn,
.remove-layer-btn,
.edit-layer-btn {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #60738c;
  cursor: pointer;
}

.visibility-btn:disabled {
  cursor: default;
  color: #0f5fc6;
  font-weight: 900;
}

.visibility-btn:not(:disabled):hover,
.edit-layer-btn:hover {
  background: #eef6ff;
  color: #0f5fc6;
}

.remove-layer-btn:hover {
  background: #fff1f2;
  color: #c2414b;
}

.edit-layer-btn.active {
  background: #eaf3ff;
  color: #0f5fc6;
  font-weight: 900;
}

.layer-swatch {
  width: 10px;
  height: 30px;
  border-radius: 999px;
}

.empty-state {
  margin: 8px 0;
  padding: 18px 12px;
  border: 1px dashed #cbd8ea;
  border-radius: 7px;
  background: #f8fbff;
  color: #6b7b90;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.empty-state.compact {
  margin: 6px 0;
  padding: 10px;
}

.loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #0f5fc6;
  animation: pulse 0.9s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(0.8);
    opacity: 0.4;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}
.resource-panel {
  grid-template-rows: minmax(0, 1.5fr) minmax(190px, 0.82fr);
  background: #f5f9fd;
  color: #1f2a37;
  border-right-color: #d7e0ec;
  font-size: 12px;
}

.resources-zone {
  border-bottom-color: #d7e0ec;
}

.zone-header {
  min-height: 42px;
  padding: 9px 12px;
  background: linear-gradient(180deg, #ffffff, #f6fbff);
  border-bottom-color: #d7e0ec;
}

.zone-kicker {
  margin-bottom: 1px;
  color: #6b7b90;
  font-size: 9px;
  letter-spacing: 0.06em;
}

h2 {
  color: #172033;
  font-size: 14px;
}

.resource-scroll,
.layer-list {
  padding: 6px;
}

.resource-group,
.source-card,
.map-layer {
  border-color: #d9e2ee;
  border-radius: 7px;
  background: #fff;
}

.resource-group + .resource-group,
.source-card + .source-card,
.map-layer + .map-layer,
.source-row + .source-row {
  margin-top: 5px;
}

.group-title {
  min-height: 34px;
  padding: 6px 8px;
  background: #f8fbff;
  border-bottom: 1px solid #edf2f7;
}

.group-title:hover {
  background: #eef6ff;
}

.group-title strong,
strong {
  color: #1f2a37;
  font-size: 12px;
}

small {
  color: #6b7b90;
  font-size: 10px;
}

.group-title em,
.count-pill,
.layer-total {
  height: 20px;
  min-width: 22px;
  background: #eaf3ff;
  color: #0f5fc6;
  font-size: 10px;
}

.mini-btn,
.primary-inline-btn {
  height: 24px;
  padding: 0 8px;
  border-color: #0f5fc6;
  border-radius: 6px;
  background: linear-gradient(180deg, #1777e6, #0f5fc6);
  font-size: 11px;
}

.mini-btn:hover,
.primary-inline-btn:hover {
  background: linear-gradient(180deg, #2384f2, #0b55b4);
}

.mini-btn.secondary {
  border-color: #c7d5e8;
  background: #fff;
  color: #0f5fc6;
}

.mini-btn.secondary:hover {
  background: #edf5ff;
}

.group-body {
  padding: 6px;
}

.inline-form {
  gap: 6px;
  margin-bottom: 6px;
  padding: 7px;
  border-color: #d9e2ee;
  border-radius: 6px;
  background: #f8fbff;
}

.inline-form input,
.inline-form select {
  height: 28px;
  border-color: #cad7e8;
  border-radius: 6px;
  font-size: 12px;
}

.source-head {
  min-height: 42px;
  grid-template-columns: 28px minmax(0, 1fr) 26px;
  gap: 7px;
  padding: 6px 8px;
}

.source-head:hover,
.source-row:hover {
  background: #f4f8ff;
}

.db-mark {
  width: 26px;
  height: 24px;
  border-radius: 6px;
  background: #eaf3ff;
  color: #0f5fc6;
  font-size: 10px;
}

.folder-mark {
  background: #eef4ff;
  color: #315a91;
}

.nested-list {
  padding: 0 6px 6px 34px;
}

.source-row {
  min-height: 34px;
  grid-template-columns: 36px minmax(0, 1fr) 30px 10px;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 6px;
  background: #fbfdff;
}

.basemap-row {
  grid-template-columns: 50px minmax(0, 1fr) 24px;
}

.source-row.added {
  border-color: #8bbcf7;
  background: #edf6ff;
}

.geom-pill {
  height: 20px;
  border-radius: 6px;
  font-size: 10px;
}

.geom-pill.point,
.geom-pill.line,
.geom-pill.polygon,
.geom-pill.mixed,
.file-pill {
  background: #0f5fc6;
}

.row-count {
  font-size: 10px;
}

.row-action-btn,
.visibility-btn,
.remove-layer-btn,
.edit-layer-btn {
  border-radius: 6px;
}

.delete-source-btn {
  margin: 0 6px 6px 42px;
  color: #7c8798;
  font-size: 10px;
}

.delete-source-btn:hover,
.row-action-btn:hover,
.remove-layer-btn:hover,
.edit-layer-btn:hover {
  background: #fff1f2;
  color: #c2414b;
}

.drop-hint {
  padding: 7px 10px;
  color: #6b7b90;
  background: #f8fbff;
  border-bottom-color: #d7e0ec;
  font-size: 11px;
}

.layers-zone {
  background: #f5f9fd;
}

.map-layer {
  min-height: 42px;
  grid-template-columns: 24px 8px minmax(0, 1fr) 22px;
  gap: 7px;
  padding: 6px 8px;
  cursor: grab;
}

.visibility-btn {
  color: #0f5fc6;
}

.visibility-btn:disabled {
  color: #0f5fc6;
}

.layer-swatch {
  width: 8px;
  height: 28px;
  border-radius: 999px;
}

.empty-state {
  margin: 6px 0;
  padding: 12px 10px;
  border-color: #cbd8ea;
  border-radius: 7px;
  background: #f8fbff;
  color: #6b7b90;
  font-size: 11px;
}

.empty-state.compact {
  padding: 8px;
}

.error-strip {
  margin: 8px 8px 0;
  padding: 7px 9px;
  border-radius: 5px;
  font-size: 11px;
}

.map-layer.selected {
  border-color: #0f5fc6;
  background: #eef7ff;
  box-shadow: inset 3px 0 0 #0f5fc6;
}

.layer-toolbox {
  position: fixed;
  z-index: 30;
  width: min(430px, calc(100vw - 360px));
  max-width: calc(100vw - 24px);
  height: calc(100vh - 90px);
  max-height: calc(100vh - 24px);
  margin: 0;
  border: 1px solid #c9d9eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: var(--gis-shadow-lg, 0 16px 36px rgba(31, 75, 130, 0.22));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  user-select: none;
}

.layer-toolbox.dragging {
  box-shadow: 0 20px 44px rgba(31, 75, 130, 0.3);
  opacity: 0.98;
}

.toolbox-head {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 9px;
  border-bottom: 1px solid #dce6f1;
  background: linear-gradient(180deg, #ffffff, #f7fbff);
  cursor: grab;
  touch-action: none;
}

.toolbox-head:active {
  cursor: grabbing;
}

.toolbox-head strong {
  display: block;
  max-width: 230px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbox-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tool-action-btn {
  min-width: 54px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid #c7d5e8;
  border-radius: 6px;
  background: #fff;
  color: #0f5fc6;
  font-size: 10px;
  font-weight: 900;
  cursor: pointer;
}

.tool-action-btn:hover:not(:disabled) {
  border-color: #0f5fc6;
  background: #eef6ff;
}

.tool-action-btn:disabled {
  color: #9aa8bb;
  cursor: not-allowed;
}

.inspector-close-btn {
  width: 26px;
  height: 26px;
  border: 1px solid #c7d5e8;
  border-radius: 6px;
  background: #fff;
  color: #6b7b90;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.inspector-close-btn:hover {
  border-color: #0f5fc6;
  background: #eef6ff;
  color: #0f5fc6;
}

.toolbox-empty {
  padding: 10px;
  color: #6b7b90;
  font-size: 11px;
  line-height: 1.5;
}

.toolbox-empty.inline {
  padding: 6px 0;
  text-align: left;
}

.toolbox-body {
  min-height: 0;
  flex: 1;
  padding: 8px;
  overflow: auto;
}

.tool-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  margin-bottom: 8px;
  padding: 3px;
  border: 1px solid #d9e2ee;
  border-radius: 7px;
  background: #f3f7fb;
}

.tool-tabs button {
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #5f7188;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.tool-tabs button.active {
  background: #ffffff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(31, 75, 130, 0.14);
}

.tool-pane {
  display: grid;
  gap: 8px;
}

.metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

.metric-grid span {
  min-width: 0;
  padding: 7px;
  border: 1px solid #e0e8f2;
  border-radius: 6px;
  background: #fbfdff;
}

.metric-grid em {
  display: block;
  margin-bottom: 3px;
  color: #6b7b90;
  font-size: 10px;
  font-style: normal;
}

.metric-grid strong {
  display: block;
  overflow: hidden;
  color: #172033;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-list {
  display: grid;
  gap: 5px;
  margin: 0;
}

.detail-list div {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
}

.detail-list dt {
  color: #6b7b90;
  font-size: 10px;
  font-weight: 800;
}

.detail-list dd {
  min-width: 0;
  margin: 0;
  color: #273449;
  font-size: 10px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.field-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.field-chips span {
  max-width: 112px;
  padding: 3px 6px;
  border: 1px solid #d9e2ee;
  border-radius: 999px;
  background: #f8fbff;
  color: #52657d;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attribute-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.encoding-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
  padding: 7px 8px;
  border: 1px solid #d9e2ee;
  border-radius: 7px;
  background: #f8fbff;
}

.encoding-row > span {
  color: #52657d;
  font-size: 11px;
  font-weight: 800;
}

.encoding-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}

.encoding-switch button {
  height: 26px;
  border: 1px solid #c7d5e8;
  border-radius: 6px;
  background: #fff;
  color: #52657d;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.encoding-switch button.active {
  border-color: #0f5fc6;
  background: #eaf3ff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.12);
}

.encoding-switch button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.attribute-toolbar input {
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #cad7e8;
  border-radius: 6px;
  background: #fff;
  color: #1f2a37;
  font-size: 11px;
}

.attribute-toolbar span {
  color: #6b7b90;
  font-size: 10px;
  font-weight: 800;
}

.selection-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 5px;
  align-items: center;
}

.selection-toolbar span {
  min-width: 0;
  color: #52657d;
  font-size: 11px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-toolbar button {
  height: 24px;
  padding: 0 7px;
  border: 1px solid #c7d5e8;
  border-radius: 6px;
  background: #fff;
  color: #0f5fc6;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.selection-toolbar button:disabled {
  color: #9aa8bb;
  cursor: not-allowed;
}

.selection-toolbar button:hover:not(:disabled),
.pager button:hover:not(:disabled),
.tool-action-btn:hover:not(:disabled),
.encoding-switch button:hover:not(:disabled) {
  border-color: #0f5fc6;
  background: #eef6ff;
  color: #0f5fc6;
}

.attribute-table-wrap {
  max-height: 190px;
  border: 1px solid #d9e2ee;
  border-radius: 7px;
  overflow: auto;
  background: #fff;
}

.attribute-table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
  font-size: 10px;
}

.attribute-table th,
.attribute-table td {
  max-width: 130px;
  padding: 5px 6px;
  border-bottom: 1px solid #edf2f7;
  color: #273449;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attribute-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fbff;
  color: #52657d;
  font-weight: 900;
}

.attribute-table tbody tr {
  cursor: pointer;
}

.attribute-table tbody tr:hover td {
  background: #f4f8ff;
}

.attribute-table tbody tr.selected td {
  background: #e7f1ff;
  color: #0f5fc6;
  font-weight: 800;
}

.attribute-table td:first-child,
.attribute-table th:first-child {
  width: 34px;
  color: #6b7b90;
}

.pager {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 6px;
  align-items: center;
}

.pager button {
  height: 26px;
  border: 1px solid #c7d5e8;
  border-radius: 6px;
  background: #fff;
  color: #0f5fc6;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.pager button:disabled {
  color: #9aa8bb;
  cursor: not-allowed;
}

.pager span {
  color: #52657d;
  font-size: 11px;
  font-weight: 800;
}

.style-group {
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid #d9e2ee;
  border-radius: 7px;
  background: #f8fbff;
}

.style-group-title {
  color: #24364d;
  font-size: 11px;
  font-weight: 900;
}

.tool-field {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  color: #52657d;
  font-size: 11px;
  font-weight: 800;
}

.tool-field input,
.tool-field select {
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #cad7e8;
  border-radius: 6px;
  background: #fff;
  color: #1f2a37;
  font-size: 12px;
}

.tool-field input[type="color"] {
  padding: 2px;
}

.tool-field input[type="range"] {
  padding: 0;
  accent-color: #0f5fc6;
}

.upload-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(8, 24, 46, 0.38);
  backdrop-filter: blur(2px);
}

.upload-modal {
  width: min(460px, 100%);
  border: 1px solid #c4d6ea;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--gis-shadow-lg, 0 18px 45px rgba(15, 38, 70, 0.24));
  overflow: hidden;
}

.upload-modal-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  gap: 10px;
  align-items: center;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #dce6f1;
  background: linear-gradient(180deg, #ffffff, #f7fbff);
}

.upload-modal-header p {
  margin: 0 0 3px;
  color: #0f5fc6;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.upload-modal-header h3 {
  margin: 0;
  color: #152238;
  font-size: 16px;
  font-weight: 900;
}

.upload-modal-header button {
  width: 26px;
  height: 26px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #52657d;
  cursor: pointer;
}

.upload-modal-body {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  background: #fbfdff;
}

.upload-field {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: #52657d;
  font-size: 12px;
  font-weight: 800;
}

.upload-field input,
.upload-field select {
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid #cad7e8;
  border-radius: 6px;
  background: #fff;
  color: #1f2a37;
  font-size: 12px;
}

.upload-field input[type="file"] {
  height: auto;
  padding: 6px 8px;
}

.upload-file-hint {
  padding: 7px 9px;
  border: 1px dashed #bfd0e5;
  border-radius: 7px;
  background: #f4f8fd;
  color: #52657d;
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.upload-check {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  color: #52657d;
  font-size: 12px;
  font-weight: 800;
}

.upload-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid #dce6f1;
  background: #fff;
}

.upload-modal-actions button {
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

.upload-modal-actions button:hover:not(:disabled),
.upload-modal-header button:hover:not(:disabled) {
  border-color: #9ec3ef;
  background: #f3f8ff;
  color: #0f5fc6;
  box-shadow: 0 2px 8px rgba(15, 95, 198, 0.12);
}

.upload-modal-actions button.primary {
  border-color: #0f5fc6;
  background: linear-gradient(180deg, #1777e6, #0f5fc6);
  color: #fff;
  box-shadow: 0 4px 12px rgba(15, 95, 198, 0.24);
}

.upload-modal-actions button.primary:hover:not(:disabled) {
  border-color: #0b4ea2;
  background: linear-gradient(180deg, #2384f2, #0b55b4);
  color: #fff;
}

.upload-modal-actions button:disabled,
.upload-modal-header button:disabled,
.upload-field input:disabled,
.upload-field select:disabled {
  opacity: 0.65;
  cursor: wait;
}
</style>
