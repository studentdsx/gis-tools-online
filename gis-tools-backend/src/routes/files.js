const express = require('express')
const fs = require('fs/promises')
const path = require('path')
const shapefile = require('shapefile')
const proj4 = require('proj4')

const router = express.Router()
const SUPPORTED_EXTENSIONS = new Set(['.shp', '.geojson', '.json'])
const SUPPORTED_DBF_ENCODINGS = new Set(['utf-8', 'gbk'])

function normalizeFilePath(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('缺少路径')
  }

  return path.resolve(value)
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.shp') return 'shp'
  if (ext === '.geojson' || ext === '.json') return 'geojson'

  return 'unsupported'
}

function normalizeCrs(value) {
  if (!value || typeof value !== 'string') return null

  const trimmed = value.trim()
  const epsg = trimmed.match(/^(?:EPSG[:/])?(\d+)$/i)
  return epsg ? `EPSG:${epsg[1]}` : trimmed
}

function normalizeDbfEncoding(value) {
  const encoding = String(value || 'utf-8').trim().toLowerCase()
  return SUPPORTED_DBF_ENCODINGS.has(encoding) ? encoding : 'utf-8'
}

function getGeoJsonCrs(geojson) {
  const name = geojson?.crs?.properties?.name
  const match = typeof name === 'string' ? name.match(/EPSG[:/](\d+)/i) : null
  return match ? `EPSG:${match[1]}` : null
}

async function getShapefileCrs(filePath) {
  const prjPath = filePath.replace(/\.shp$/i, '.prj')

  try {
    const prj = await fs.readFile(prjPath, 'utf8')
    const epsg = prj.match(/AUTHORITY\["EPSG","(\d+)"\]/i) || prj.match(/EPSG[:"]+(\d+)/i)
    return epsg ? `EPSG:${epsg[1]}` : prj
  } catch (error) {
    return null
  }
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
    throw new Error('文件缺少坐标系信息，请指定源坐标系后再加载')
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

router.get('/', async (req, res) => {
  try {
    const folderPath = normalizeFilePath(req.query.path)
    const stat = await fs.stat(folderPath)

    if (!stat.isDirectory()) {
      return res.status(400).json({ error: '路径不是文件夹' })
    }

    const entries = await fs.readdir(folderPath, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => {
        const filePath = path.join(folderPath, entry.name)
        return {
          id: filePath,
          name: entry.name,
          path: filePath,
          type: getFileType(filePath)
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    res.json(files)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/geojson', async (req, res) => {
  try {
    const filePath = normalizeFilePath(req.query.path)
    const ext = path.extname(filePath).toLowerCase()
    const requestedCrs = normalizeCrs(req.query.sourceCrs || req.query.crs)
    const encoding = normalizeDbfEncoding(req.query.encoding)

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: '仅支持 .shp、.geojson 和 .json 文件' })
    }

    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      return res.status(400).json({ error: '路径不是文件' })
    }

    let geojson

    let detectedCrs = null

    if (ext === '.shp') {
      geojson = await shapefile.read(filePath, undefined, { encoding })
      detectedCrs = await getShapefileCrs(filePath)
    } else {
      const raw = await fs.readFile(filePath, 'utf8')
      geojson = JSON.parse(raw)
      detectedCrs = getGeoJsonCrs(geojson)
    }

    if (!geojson || geojson.type !== 'FeatureCollection') {
      return res.status(400).json({ error: '文件内容不是 FeatureCollection' })
    }

    const crsMissing = !detectedCrs
    const sourceCrs = requestedCrs || detectedCrs

    if (!sourceCrs) {
      return res.status(409).json({
        code: 'CRS_MISSING',
        error: '文件缺少坐标系信息，请指定源坐标系后再加载',
        file: {
          name: path.basename(filePath),
          path: filePath,
          type: getFileType(filePath),
          encoding: ext === '.shp' ? encoding : undefined
        }
      })
    }

    const transformed = transformGeoJsonToWgs84(geojson, sourceCrs)
    const notices = [...transformed.notices]

    if (crsMissing && requestedCrs) {
      notices.unshift(`源文件缺少坐标系信息，已按 ${requestedCrs} 读取。`)
    }

    res.json({
      file: {
        name: path.basename(filePath),
        path: filePath,
        type: getFileType(filePath),
        encoding: ext === '.shp' ? encoding : undefined
      },
      crs: transformed.crs,
      crsMissing,
      needsTransform: transformed.needsTransform,
      notices,
      geojson: transformed.geojson
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
