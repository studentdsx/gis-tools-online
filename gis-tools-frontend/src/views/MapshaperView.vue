<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiClient } from '../api/client'

defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['close'])
const router = useRouter()
const files = ref([])
const sourceName = ref('')
const inputGeojson = ref(null)
const outputGeojson = ref(null)
const simplify = ref(10)
const algorithm = ref('weighted')
const outputFormat = ref('geojson')
const clean = ref(true)
const loading = ref(false)
const errorMessage = ref('')
const commandText = ref('')
const messages = ref(['Ready.'])
const outputFiles = ref([])
const zoom = ref(1)
let previewTimer = null

const inputSummary = computed(() => summarize(inputGeojson.value))
const outputSummary = computed(() => summarize(outputGeojson.value))
const previewBounds = computed(() => getBounds([inputGeojson.value, outputGeojson.value].filter(Boolean)))
const inputPreviewElements = computed(() => buildSvgElements(inputGeojson.value, previewBounds.value))
const outputPreviewElements = computed(() => buildSvgElements(outputGeojson.value, previewBounds.value))
const previewViewBox = computed(() => {
  const width = 800 / zoom.value
  const height = 500 / zoom.value
  const x = (800 - width) / 2
  const y = (500 - height) / 2
  return `${x} ${y} ${width} ${height}`
})

function summarize(geojson) {
  if (!geojson) return { features: 0, type: 'No data' }
  return {
    features: geojson.type === 'FeatureCollection' ? geojson.features?.length || 0 : 1,
    type: geojson.type || 'GeoJSON'
  }
}

function log(message) {
  messages.value.unshift(`${new Date().toLocaleTimeString()}  ${message}`)
}

function readFileAs(file, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    mode === 'dataUrl' ? reader.readAsDataURL(file) : reader.readAsText(file)
  })
}

async function encodeFiles(fileList) {
  const encoded = []

  for (const file of fileList) {
    const isBinary = /\.(shp|dbf|shx|zip|gz|gpkg|fgb|flatgeobuf|parquet|geoparquet|tif|tiff|geotiff)$/i.test(file.name)
    const content = await readFileAs(file, isBinary ? 'dataUrl' : 'text')
    encoded.push({
      name: file.name,
      encoding: isBinary ? 'base64' : 'text',
      content: isBinary ? String(content).split(',')[1] : content
    })
  }

  return encoded
}

async function importFiles(fileList) {
  const nextFiles = Array.from(fileList || [])
  if (nextFiles.length === 0) return

  files.value = nextFiles
  sourceName.value = nextFiles.map((file) => file.name).join(', ')
  outputGeojson.value = null
  outputFiles.value = []
  commandText.value = ''
  errorMessage.value = ''
  log(`Imported ${nextFiles.length} file(s).`)

  const geojsonFile = nextFiles.find((file) => /\.(geojson|json)$/i.test(file.name))
  if (geojsonFile) {
    try {
      inputGeojson.value = JSON.parse(await geojsonFile.text())
    } catch (error) {
      inputGeojson.value = null
    }
  } else {
    inputGeojson.value = null
  }

  await runMapshaper()
}

async function handleFileChange(event) {
  await importFiles(event.target.files)
}

async function handleDrop(event) {
  event.preventDefault()
  await importFiles(event.dataTransfer.files)
}

function schedulePreview() {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    if (files.value.length > 0) {
      runMapshaper(true)
    }
  }, 320)
}

async function runMapshaper(isPreview = false) {
  if (files.value.length === 0) return

  loading.value = true
  errorMessage.value = ''

  try {
    const res = await apiClient.post('/api/mapshaper/process-files', {
      files: await encodeFiles(files.value),
      simplify: simplify.value,
      algorithm: algorithm.value,
      outputFormat: outputFormat.value,
      clean: clean.value
    })

    outputGeojson.value = res.data.geojson
    outputFiles.value = res.data.files || []
    commandText.value = res.data.commands
    if (!inputGeojson.value) inputGeojson.value = res.data.geojson
    log(`${isPreview ? 'Preview' : 'Applied'}: ${res.data.featureCount} feature(s).`)
  } catch (error) {
    errorMessage.value = error.response?.data?.error || error.message
    log(`Error: ${errorMessage.value}`)
  } finally {
    loading.value = false
  }
}

function downloadOutput() {
  if (outputFiles.value.length === 0) return

  outputFiles.value.forEach((file, index) => {
    const data = file.encoding === 'base64'
      ? Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0))
      : file.content
    const blob = new Blob([data])
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name || `mapshaper-output-${index + 1}`
    link.click()
    URL.revokeObjectURL(url)
  })
  log(`Exported ${outputFiles.value.length} file(s).`)
}

function collectCoords(geometry, coords = []) {
  if (!geometry) return coords

  function walk(value) {
    if (!Array.isArray(value)) return
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      coords.push(value)
      return
    }
    value.forEach(walk)
  }

  walk(geometry.coordinates)
  return coords
}

function getBounds(geojsonList) {
  const coords = geojsonList.flatMap((geojson) => {
    const features = geojson?.type === 'FeatureCollection' ? geojson.features || [] : geojson ? [geojson] : []
    return features.flatMap((feature) => collectCoords(feature.geometry, []))
  })

  if (coords.length === 0) return null

  const xs = coords.map((coord) => coord[0])
  const ys = coords.map((coord) => coord[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  }
}

function buildSvgElements(geojson, bounds) {
  if (!geojson || !bounds) return []

  const features = geojson.type === 'FeatureCollection' ? geojson.features || [] : [geojson]
  const width = Math.max(bounds.maxX - bounds.minX, 1e-9)
  const height = Math.max(bounds.maxY - bounds.minY, 1e-9)

  function project(coord) {
    const x = 28 + ((coord[0] - bounds.minX) / width) * 744
    const y = 28 + (1 - ((coord[1] - bounds.minY) / height)) * 444
    return [x, y]
  }

  function pathFromCoordinates(value) {
    if (!Array.isArray(value)) return ''
    if (typeof value[0]?.[0] === 'number') {
      return value.map((coord, index) => {
        const [x, y] = project(coord)
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      }).join(' ')
    }
    return value.map(pathFromCoordinates).join(' ')
  }

  return features.map((feature, index) => {
    const geometry = feature.geometry
    if (!geometry) return null

    if (geometry.type === 'Point') {
      const [x, y] = project(geometry.coordinates)
      return { type: 'circle', key: index, x, y }
    }

    if (geometry.type === 'MultiPoint') {
      return { type: 'multipoint', key: index, points: geometry.coordinates.map(project) }
    }

    return {
      type: geometry.type.includes('Polygon') ? 'polygon' : 'path',
      key: index,
      d: pathFromCoordinates(geometry.coordinates)
    }
  }).filter(Boolean)
}

function setZoom(nextZoom) {
  zoom.value = Math.min(Math.max(nextZoom, 1), 8)
}

function handlePreviewWheel(event) {
  event.preventDefault()
  setZoom(zoom.value + (event.deltaY > 0 ? -0.25 : 0.25))
}
</script>

<template>
  <main class="mapshaper-shell">
    <header class="topbar" :class="{ embedded }">
      <button v-if="!embedded" class="plain-btn" type="button" @click="router.push('/')">返回地图</button>
      <div class="brand">mapshaper</div>
      <button class="plain-btn" type="button" :disabled="outputFiles.length === 0" @click="downloadOutput">Export</button>
      <button v-if="embedded" class="plain-btn" type="button" @click="emit('close')">关闭</button>
    </header>

    <section class="workspace">
      <aside class="side-panel">
        <h2>Layers</h2>
        <div v-if="files.length === 0" class="empty">No layers</div>
        <div v-else class="layer-item active">
          <strong>{{ sourceName }}</strong>
          <small>{{ outputSummary.features || inputSummary.features }} features</small>
        </div>
      </aside>

      <section class="viewport" @dragover.prevent @drop="handleDrop">
        <div v-if="files.length === 0" class="import-dialog">
          <p>
            Drop, paste or
            <label class="select-link">
              select
              <input
                type="file"
                multiple
                accept=".json,.geojson,.topojson,.shp,.dbf,.shx,.prj,.cpg,.csv,.tsv,.kml,.gpx,.svg,.zip,.gz,.gpkg,.fgb,.flatgeobuf,.parquet,.geoparquet,.tif,.tiff,.geotiff,.geojsonl,.ndjson"
                @change="handleFileChange"
              />
            </label>
            files to import.
            Shapefile, GeoJSON, TopoJSON, GeoPackage, FlatGeobuf, GeoParquet, GeoTIFF, KML, CSV and more are supported.
            Files can be zipped or gzipped.
          </p>
        </div>

        <div v-if="files.length > 0" class="preview-tools">
          <button type="button" @click="setZoom(zoom + 0.5)">+</button>
          <button type="button" @click="setZoom(zoom - 0.5)">-</button>
          <button type="button" @click="setZoom(1)">1:1</button>
          <span>zoom {{ zoom.toFixed(1) }}x</span>
        </div>

        <svg
          v-if="files.length > 0"
          :viewBox="previewViewBox"
          class="map-preview"
          role="img"
          aria-label="mapshaper preview"
          @wheel="handlePreviewWheel"
        >
          <rect width="800" height="500" />
          <g class="original-layer">
            <template v-for="item in inputPreviewElements" :key="`input-${item.key}`">
              <path v-if="item.type === 'polygon'" :d="item.d" />
              <path v-else-if="item.type === 'path'" :d="item.d" class="line" />
              <circle v-else-if="item.type === 'circle'" :cx="item.x" :cy="item.y" r="4" />
              <template v-else>
                <circle
                  v-for="(point, idx) in item.points || []"
                  :key="idx"
                  :cx="point[0]"
                  :cy="point[1]"
                  r="4"
                />
              </template>
            </template>
          </g>
          <g class="output-layer">
            <template v-for="item in outputPreviewElements" :key="`output-${item.key}`">
              <path v-if="item.type === 'polygon'" :d="item.d" />
              <path v-else-if="item.type === 'path'" :d="item.d" class="line" />
              <circle v-else-if="item.type === 'circle'" :cx="item.x" :cy="item.y" r="4" />
              <template v-else>
                <circle
                  v-for="(point, idx) in item.points || []"
                  :key="idx"
                  :cx="point[0]"
                  :cy="point[1]"
                  r="4"
                />
              </template>
            </template>
          </g>
        </svg>
      </section>

      <aside class="control-panel">
        <h2>Simplify</h2>
        <label class="field">
          <span>Method</span>
          <select v-model="algorithm" @change="schedulePreview">
            <option value="weighted">weighted Visvalingam</option>
            <option value="visvalingam">Visvalingam</option>
            <option value="dp">Douglas-Peucker</option>
          </select>
        </label>
        <label class="field">
          <span>Retain</span>
          <input v-model.number="simplify" type="range" min="1" max="100" @input="schedulePreview" />
          <b>{{ simplify }}%</b>
        </label>
        <label class="field">
          <span>Export format</span>
          <select v-model="outputFormat" @change="schedulePreview">
            <option value="geojson">GeoJSON</option>
            <option value="topojson">TopoJSON</option>
            <option value="shapefile">Shapefile</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="tsv">TSV</option>
            <option value="svg">SVG</option>
            <option value="kml">KML</option>
            <option value="flatgeobuf">FlatGeobuf</option>
            <option value="geopackage">GeoPackage</option>
            <option value="geoparquet">GeoParquet</option>
          </select>
        </label>
        <label class="check">
          <input v-model="clean" type="checkbox" @change="schedulePreview" />
          clean
        </label>
        <p class="live-note">{{ loading ? 'previewing...' : 'Changes apply automatically.' }}</p>
        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      </aside>
    </section>

    <footer class="console">
      <code>{{ commandText || 'No command' }}</code>
      <span v-for="message in messages.slice(0, 3)" :key="message">{{ message }}</span>
    </footer>
  </main>
</template>

<style scoped>
.mapshaper-shell {
  height: 100%;
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr) 86px;
  background: #d6d9dd;
  color: #222;
  font: 13px/1.4 "Helvetica Neue", Arial, sans-serif;
}

.topbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 9px;
  background: #f4f4f4;
  border-bottom: 1px solid #b9bec5;
}

.topbar.embedded {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.brand {
  color: #222;
  font-size: 18px;
  font-weight: 700;
}

.plain-btn {
  height: 27px;
  padding: 0 10px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #334966;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.plain-btn:hover:not(:disabled) {
  border-color: #9ec3ef;
  background: #f3f8ff;
  color: #0f5fc6;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: 215px minmax(0, 1fr) 258px;
  gap: 1px;
  background: #d7e2ef;
}

.side-panel,
.control-panel,
.viewport {
  background: #f8fbff;
}

.side-panel,
.control-panel {
  padding: 10px;
}

h1,
h2,
p {
  margin: 0;
}

h2 {
  margin-bottom: 9px;
  font-size: 13px;
}

.empty {
  color: #777;
  font-size: 12px;
}

.layer-item {
  padding: 8px;
  border: 1px solid #d9e2ee;
  border-radius: 6px;
  background: #fff;
}

.layer-item.active {
  border-color: #bcd3ef;
  background: #edf6ff;
}

.layer-item strong,
.layer-item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-item small {
  color: #666;
}

.viewport {
  position: relative;
  display: flex;
}

.preview-tools {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid #c7d6e8;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 5px 14px rgba(31, 75, 130, 0.1);
}

.preview-tools button {
  height: 24px;
  min-width: 28px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.preview-tools span {
  padding: 0 6px;
  color: #555;
  font-size: 12px;
}

.import-dialog {
  width: 430px;
  margin: auto;
  padding: 24px 18px;
  border: 1px dashed #9ec3ef;
  border-radius: 10px;
  background: #f7fbff;
  color: #334966;
  text-align: left;
}

.import-dialog p {
  font-size: 23px;
  line-height: 1.48;
}

.select-link {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 6px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
  color: #0f5fc6;
  line-height: 1;
  cursor: pointer;
}

.select-link:hover {
  border-color: #9ec3ef;
  background: #eef6ff;
}

.select-link input {
  display: none;
}

.map-preview {
  width: 100%;
  height: 100%;
}

.map-preview rect {
  fill: #fff;
}

.map-preview path {
  fill: rgba(61, 109, 158, 0.18);
  stroke: #335f8f;
  stroke-width: 2;
}

.map-preview path.line {
  fill: none;
}

.map-preview circle {
  fill: #335f8f;
}

.original-layer {
  opacity: 0.35;
}

.original-layer path {
  fill: rgba(120, 120, 120, 0.14);
  stroke: #777;
}

.original-layer circle {
  fill: #777;
}

.output-layer path {
  fill: rgba(61, 109, 158, 0.2);
  stroke: #285f9f;
}

.output-layer circle {
  fill: #285f9f;
}

.field {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin-bottom: 12px;
}

.field select,
.field input[type="range"] {
  width: 100%;
}

.field select {
  height: 28px;
  border: 1px solid #c7d6e8;
  border-radius: 6px;
  background: #fff;
}

.field input[type="range"],
.check input {
  accent-color: #0f5fc6;
}

.field b {
  color: #333;
}

.check {
  display: flex;
  gap: 7px;
  align-items: center;
  margin-bottom: 12px;
}

.live-note {
  color: #666;
  font-size: 12px;
}

.error {
  margin-top: 10px;
  color: #b4232e;
  font-size: 12px;
}

.console {
  display: grid;
  grid-template-rows: 28px repeat(3, 1fr);
  padding: 6px 10px;
  border-top: 1px solid #b9bec5;
  background: #f4f4f4;
  color: #555;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
}

.console code,
.console span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
