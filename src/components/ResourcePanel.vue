<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import * as shapefile from 'shapefile'
import proj4 from 'proj4'
import { apiClient } from '../api/client'
import DatabaseModal from './DatabaseModal.vue'

const emit = defineEmits(['add-layer', 'toggle-layer', 'remove-layer', 'reorder-layer'])

const STORAGE_KEYS = {
  connections: 'gis-tools.postgisConnections.v1',
  basemaps: 'gis-tools.customBasemaps.v1',
  folders: 'gis-tools.localFolders.v1'
}
const FOLDER_HANDLE_DB = 'gis-tools-folder-handles'
const FOLDER_HANDLE_STORE = 'handles'

const defaultBasemaps = [
  {
    id: 'basemap-satellite',
    name: '卫星影像',
    kind: 'basemap',
    basemapType: 'mapbox-style',
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
    builtIn: true
  },
  {
    id: 'basemap-light',
    name: '清新风',
    kind: 'basemap',
    basemapType: 'mapbox-style',
    url: 'mapbox://styles/mapbox/light-v11',
    builtIn: true
  },
  {
    id: 'basemap-dark',
    name: '暗黑色',
    kind: 'basemap',
    basemapType: 'mapbox-style',
    url: 'mapbox://styles/mapbox/dark-v11',
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
const errorMessage = ref('')
const draggingLayerId = ref('')
const folderHandles = new Map()
const fileHandles = new Map()
const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window

const basemapForm = reactive({
  name: '',
  basemapType: 'mapbox-style',
  url: ''
})
const folderForm = reactive({
  name: '',
  path: ''
})

const layerColors = ['#2f7d59', '#c47a24', '#356fb3', '#8b5b9f', '#b24444', '#52716b']

const basemaps = computed(() => [...defaultBasemaps, ...customBasemaps.value])
const connectionCount = computed(() => connections.value.length)
const basemapCount = computed(() => basemaps.value.length)
const folderCount = computed(() => folders.value.length)
const layerCount = computed(() => layers.value.length)

onMounted(async () => {
  customBasemaps.value = readStorage(STORAGE_KEYS.basemaps)
  folders.value = readStorage(STORAGE_KEYS.folders)
  await restoreFolderHandles()
  await restoreConnections()
  addBasemapLayer(defaultBasemaps[0])
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

function addCustomBasemap() {
  if (!basemapForm.name || !basemapForm.url) {
    errorMessage.value = '请填写底图名称和链接'
    return
  }

  const basemap = {
    id: `custom-basemap-${Date.now()}`,
    name: basemapForm.name,
    kind: 'basemap',
    basemapType: basemapForm.basemapType,
    url: basemapForm.url,
    builtIn: false
  }

  customBasemaps.value.unshift(basemap)
  writeStorage(STORAGE_KEYS.basemaps, customBasemaps.value)
  basemapForm.name = ''
  basemapForm.url = ''
  basemapForm.basemapType = 'mapbox-style'
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
  return match ? `EPSG:${match[1]}` : 'EPSG:4326'
}

function getPrjCrs(prjText) {
  if (!prjText) return 'EPSG:4326'

  const epsg = prjText.match(/AUTHORITY\["EPSG","(\d+)"\]/i) || prjText.match(/EPSG[:"]+(\d+)/i)
  return epsg ? `EPSG:${epsg[1]}` : prjText
}

function isWgs84(crs) {
  return !crs || /EPSG:4326/i.test(crs) || /WGS_1984/i.test(crs)
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

function getBasemapTypeLabel(type) {
  return type === 'raster-xyz' ? 'XYZ' : 'Mapbox'
}

function formatRows(value) {
  if (!value || value < 0) return '-'
  if (value >= 10000) return `${Math.round(value / 1000) / 10}w`
  return value.toLocaleString()
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
  layers.value = [
    layer,
    ...layers.value.filter((item) => item.id !== layer.id && item.sourceKey !== layer.sourceKey)
  ]
  emit('add-layer', layer)
}

function addBasemapLayer(basemap) {
  const key = basemapKey(basemap)
  const oldBasemap = layers.value.find((layer) => layer.kind === 'basemap')
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

  if (oldBasemap && oldBasemap.id !== layer.id) {
    emit('remove-layer', oldBasemap.id)
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
    const data = payload.fileMode === 'browser'
      ? await readBrowserFileGeojson(payload)
      : await readServerFileGeojson(payload)

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
      featureCount: data.geojson?.features?.length || 0,
      file: data.file,
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

async function readServerFileGeojson(payload) {
  const res = await apiClient.get('/api/files/geojson', {
    params: { path: payload.path }
  })
  return res.data
}

async function readBrowserFileGeojson(payload) {
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

    geojson = await shapefile.read(shpBuffer, dbfBuffer)
    const transformed = transformGeoJsonToWgs84(geojson, getPrjCrs(prjText))
    return {
      file: {
        name: payload.name,
        path: payload.path,
        type: payload.type
      },
      crs: transformed.crs,
      needsTransform: transformed.needsTransform,
      notices: transformed.notices,
      geojson: transformed.geojson
    }
  } else {
    geojson = JSON.parse(await file.text())
  }

  if (!geojson || geojson.type !== 'FeatureCollection') {
    throw new Error('文件内容不是 FeatureCollection')
  }

  const transformed = transformGeoJsonToWgs84(geojson, getGeoJsonCrs(geojson))

  return {
    file: {
      name: payload.name,
      path: payload.path,
      type: payload.type
    },
    crs: transformed.crs,
    needsTransform: transformed.needsTransform,
    notices: transformed.notices,
    geojson: transformed.geojson
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
  emit('remove-layer', layer.id)
}

function handleLayerDragStart(event, layer) {
  event.stopPropagation()
  draggingLayerId.value = layer.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-map-layer-id', layer.id)
  event.dataTransfer.setData('text/plain', layer.id)
}

function handleLayerDragOver(event, targetLayer) {
  event.stopPropagation()
  if (!draggingLayerId.value || draggingLayerId.value === targetLayer.id) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

function handleLayerDrop(event, targetLayer) {
  event.preventDefault()
  event.stopPropagation()

  const draggedId = draggingLayerId.value || event.dataTransfer.getData('application/x-map-layer-id')
  if (!draggedId || draggedId === targetLayer.id) return

  const fromIndex = layers.value.findIndex((item) => item.id === draggedId)
  const toIndex = layers.value.findIndex((item) => item.id === targetLayer.id)
  if (fromIndex < 0 || toIndex < 0) return

  const nextLayers = [...layers.value]
  const [draggedLayer] = nextLayers.splice(fromIndex, 1)
  const targetIndex = nextLayers.findIndex((item) => item.id === targetLayer.id)
  if (targetIndex < 0) return

  const rect = event.currentTarget.getBoundingClientRect()
  const insertAfterTarget = event.clientY > rect.top + rect.height / 2
  nextLayers.splice(targetIndex + (insertAfterTarget ? 1 : 0), 0, draggedLayer)
  layers.value = nextLayers
  draggingLayerId.value = ''
  emit('reorder-layer', layers.value.map((layer) => layer.id))
}

function handleLayerDragEnd(event) {
  event.stopPropagation()
  draggingLayerId.value = ''
}

defineExpose({ addDroppedSource, addTableLayer })
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
              <button class="source-head" type="button" @click="toggleConnection(connection)">
                <span class="db-mark">PG</span>
                <span class="source-copy">
                  <strong>{{ connection.name }}</strong>
                  <small>{{ connection.host }}:{{ connection.port }} / {{ connection.database }}</small>
                </span>
                <span class="count-pill">{{ tablesByConnection[connection.id]?.length || 0 }}</span>
              </button>

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
              <select v-model="basemapForm.basemapType">
                <option value="mapbox-style">Mapbox 矢量样式</option>
                <option value="raster-xyz">XYZ 栅格瓦片</option>
              </select>
              <input
                v-model.trim="basemapForm.url"
                type="text"
                :placeholder="basemapForm.basemapType === 'mapbox-style' ? 'mapbox://styles/mapbox/streets-v12' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'"
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
          :class="{ muted: !layer.visible, dragging: draggingLayerId === layer.id }"
          draggable="true"
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
            @click="toggleLayer(layer)"
          >
            {{ layer.kind === 'basemap' ? 'B' : (layer.visible ? '●' : '○') }}
          </button>
          <span class="layer-swatch" :style="{ background: layer.color }"></span>
          <span class="layer-copy">
            <strong>{{ layer.name }}</strong>
            <small>{{ layer.subtitle }} · {{ layer.featureCount ?? '底图' }}{{ layer.featureCount != null ? ' 条' : '' }}</small>
          </span>
          <button class="remove-layer-btn" type="button" title="移除图层" @click="removeLayer(layer)">x</button>
        </article>

        <div v-if="layers.length === 0" class="empty-state compact">
          暂无图层
        </div>
      </div>
    </section>

    <DatabaseModal
      :visible="databaseModalVisible"
      @close="databaseModalVisible = false"
      @success="handleDatabaseSuccess"
    />
  </aside>
</template>

<style scoped>
.resource-panel {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1.4fr) minmax(220px, 0.85fr);
  background: #f4f6f2;
  color: #162118;
  border-right: 1px solid #cbd6c8;
  overflow: hidden;
}

.panel-zone {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.resources-zone {
  border-bottom: 1px solid #cbd6c8;
}

.zone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px;
  background: #e9efe7;
  border-bottom: 1px solid #d5dfd2;
}

.compact-header {
  padding-top: 12px;
  padding-bottom: 10px;
}

.zone-kicker {
  margin: 0 0 3px;
  color: #6e7b70;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #142017;
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
  border: 1px solid #dbe3d7;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
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
  background: #f9faf7;
  color: #17231b;
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
  background: #edf1eb;
  color: #506258;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.mini-btn,
.primary-inline-btn {
  height: 26px;
  padding: 0 9px;
  border: 1px solid #315f40;
  border-radius: 5px;
  background: #356f49;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.group-actions {
  display: inline-flex;
  gap: 6px;
}

.mini-btn.secondary {
  border-color: #c6d2c4;
  background: #fff;
  color: #315f40;
}

.group-body {
  padding: 8px;
}

.inline-form {
  display: grid;
  gap: 7px;
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid #dbe3d7;
  border-radius: 7px;
  background: #f7f9f5;
}

.inline-form input,
.inline-form select {
  min-width: 0;
  height: 30px;
  padding: 0 9px;
  border: 1px solid #cfd8ca;
  border-radius: 5px;
  background: #fff;
  color: #17231b;
  font-size: 12px;
}

.source-card,
.map-layer {
  position: relative;
  border: 1px solid #dbe3d7;
  border-radius: 7px;
  background: #fff;
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
  grid-template-columns: 32px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.source-head:hover {
  background: #f5f8f3;
}

.db-mark {
  width: 30px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #dfe9dd;
  color: #2d6240;
  font-size: 11px;
  font-weight: 900;
}

.folder-mark {
  color: #6f4e1f;
  background: #f2e5cd;
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
  color: #6a776d;
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
  background: #f7f9f5;
  text-align: left;
  cursor: grab;
}

.basemap-row {
  grid-template-columns: 58px minmax(0, 1fr) 28px;
}

.source-row:hover {
  border-color: #b6c9b3;
  background: #fff;
}

.source-row.added {
  border-color: #b9d7bf;
  background: #eff8f0;
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
  border-radius: 5px;
  background: transparent;
  color: #9b4038;
  cursor: pointer;
}

.delete-source-btn {
  margin: 0 8px 8px 46px;
  padding: 3px 7px;
  border: 0;
  border-radius: 4px;
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
  background: #fbfcfa;
}

.drop-hint {
  display: block;
  padding: 9px 12px;
  color: #6c776f;
  font-size: 12px;
  background: #f9faf7;
  border-bottom: 1px solid #e0e7dc;
}

.map-layer {
  min-height: 52px;
  display: grid;
  grid-template-columns: 26px 10px minmax(0, 1fr) 24px;
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

.visibility-btn,
.remove-layer-btn {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #526158;
  cursor: pointer;
}

.visibility-btn:disabled {
  cursor: default;
  color: #2f5d43;
  font-weight: 900;
}

.visibility-btn:not(:disabled):hover,
.remove-layer-btn:hover {
  background: #edf1eb;
}

.layer-swatch {
  width: 10px;
  height: 30px;
  border-radius: 999px;
}

.empty-state {
  margin: 8px 0;
  padding: 18px 12px;
  border: 1px dashed #cbd6c8;
  border-radius: 7px;
  background: #fbfcfa;
  color: #6d7a70;
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
  background: #34794a;
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
  background: #f6f8fb;
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
  background: #ffffff;
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
  border-radius: 6px;
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
  border-radius: 4px;
  background: #0f5fc6;
  font-size: 11px;
}

.mini-btn:hover,
.primary-inline-btn:hover {
  background: #0b55b4;
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
  border-radius: 4px;
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
  border-radius: 5px;
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
  border-radius: 5px;
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
  border-radius: 4px;
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
.remove-layer-btn {
  border-radius: 4px;
}

.delete-source-btn {
  margin: 0 6px 6px 42px;
  color: #7c8798;
  font-size: 10px;
}

.delete-source-btn:hover,
.row-action-btn:hover,
.remove-layer-btn:hover {
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
  background: #f6f8fb;
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
  border-radius: 4px;
}

.empty-state {
  margin: 6px 0;
  padding: 12px 10px;
  border-color: #cbd8ea;
  border-radius: 6px;
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
</style>
