const express = require('express')
const mapshaper = require('mapshaper')

const router = express.Router()

function normalizePercent(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 10
  return Math.min(Math.max(parsed, 1), 100)
}

function normalizeAlgorithm(value) {
  const allowed = new Set(['dp', 'visvalingam', 'weighted'])
  return allowed.has(value) ? value : 'weighted'
}

function normalizeOutputFormat(value) {
  const allowed = new Set([
    'geojson',
    'topojson',
    'json',
    'shapefile',
    'csv',
    'tsv',
    'svg',
    'kml',
    'flatgeobuf',
    'geopackage',
    'geoparquet'
  ])
  return allowed.has(value) ? value : 'geojson'
}

function getOutputName(format) {
  const extensions = {
    geojson: 'geojson',
    topojson: 'topojson',
    json: 'json',
    shapefile: 'shp',
    csv: 'csv',
    tsv: 'tsv',
    svg: 'svg',
    kml: 'kml',
    flatgeobuf: 'fgb',
    geopackage: 'gpkg',
    geoparquet: 'parquet'
  }
  return `output.${extensions[format] || 'geojson'}`
}

function isMainInputFile(name) {
  return /\.(shp|geojson|json|topojson|csv|tsv|kml|gpx|svg|zip|gz|gpkg|fgb|flatgeobuf|parquet|geoparquet|tif|tiff|geotiff|geojsonl|ndjson)$/i.test(name)
}

function serializeOutputFile(name, content) {
  const isBuffer = Buffer.isBuffer(content) || content instanceof Uint8Array
  return {
    name,
    encoding: isBuffer ? 'base64' : 'text',
    content: isBuffer ? Buffer.from(content).toString('base64') : String(content)
  }
}

function ensureGeoJson(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('请输入 GeoJSON 对象')
  }

  if (input.type === 'FeatureCollection' || input.type === 'Feature') {
    return input
  }

  throw new Error('当前仅支持 FeatureCollection 或 Feature')
}

router.post('/process', async (req, res) => {
  try {
    const geojson = ensureGeoJson(req.body.geojson)
    const simplify = normalizePercent(req.body.simplify)
    const algorithm = normalizeAlgorithm(req.body.algorithm)
    const outputFormat = normalizeOutputFormat(req.body.outputFormat)
    const outputName = getOutputName(outputFormat)
    const shouldClean = req.body.clean !== false
    const commands = [
      '-i input.geojson',
      shouldClean ? '-clean' : '',
      `-simplify ${simplify}% ${algorithm} keep-shapes`,
      '-o format=geojson output.geojson'
    ].filter(Boolean).join(' ')

    const input = {
      'input.geojson': JSON.stringify(geojson)
    }
    const output = await mapshaper.applyCommands(commands, input)
    const rawOutput = output['output.geojson'] || Object.values(output)[0]
    const result = JSON.parse(rawOutput)

    res.json({
      commands,
      geojson: result,
      featureCount: result.type === 'FeatureCollection' ? result.features.length : 1
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/process-files', async (req, res) => {
  try {
    const files = Array.isArray(req.body.files) ? req.body.files : []
    if (files.length === 0) {
      return res.status(400).json({ error: '请上传文件' })
    }

    const simplify = normalizePercent(req.body.simplify)
    const algorithm = normalizeAlgorithm(req.body.algorithm)
    const outputFormat = normalizeOutputFormat(req.body.outputFormat)
    const outputName = getOutputName(outputFormat)
    const shouldClean = req.body.clean !== false
    const input = {}
    let mainFile = null

    files.forEach((file) => {
      if (!file?.name || !file?.content) return

      const safeName = String(file.name).replace(/[\\/]/g, '_')
      input[safeName] = file.encoding === 'base64'
        ? Buffer.from(file.content, 'base64')
        : String(file.content)

      if (!mainFile || isMainInputFile(safeName)) {
        mainFile = safeName
      }
    })

    if (!mainFile) {
      return res.status(400).json({ error: '未找到可处理的主文件' })
    }

    const commands = [
      `-i ${mainFile}`,
      shouldClean ? '-clean' : '',
      `-simplify ${simplify}% ${algorithm} keep-shapes`,
      '-o format=geojson preview.geojson',
      `-o format=${outputFormat} ${outputName}`
    ].filter(Boolean).join(' ')
    const output = await mapshaper.applyCommands(commands, input)
    const rawOutput = output['preview.geojson'] || output['output.geojson'] || Object.values(output)[0]
    const result = JSON.parse(rawOutput)
    const outputFiles = Object.entries(output)
      .filter(([name]) => name !== 'preview.geojson')
      .map(([name, content]) => serializeOutputFile(name, content))

    res.json({
      commands,
      geojson: result,
      outputFormat,
      files: outputFiles,
      featureCount: result.type === 'FeatureCollection' ? result.features.length : 1
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

module.exports = router
