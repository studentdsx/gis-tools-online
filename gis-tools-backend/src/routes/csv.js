const express = require('express')
const iconv = require('iconv-lite')
const wkx = require('wkx')
const {
  ensureProjectionDefinition,
  getErrorMessage,
  isWgs84,
  normalizeCrs,
  transformCoord,
  transformGeometryCoordinates
} = require('../utils/projection')

const router = express.Router()

const SUPPORTED_ENCODINGS = new Set(['utf-8', 'utf8', 'gbk'])
const DELIMITER_MAP = {
  comma: ',',
  tab: '\t',
  space: ' '
}

function normalizeEncoding(value) {
  const encoding = String(value || 'utf-8').trim().toLowerCase()
  if (!SUPPORTED_ENCODINGS.has(encoding)) return 'utf-8'
  return encoding === 'utf8' ? 'utf-8' : encoding
}

function getDelimiter(config = {}) {
  if (config.delimiterMode === 'custom') {
    const custom = String(config.customDelimiter || '')
    if (!custom) throw new Error('请选择自定义分隔符')
    return custom
  }

  return DELIMITER_MAP[config.delimiterMode] || ','
}

function decodeCsvFile(file, encoding) {
  if (file.encoding === 'base64') {
    return iconv.decode(Buffer.from(file.content || '', 'base64'), encoding)
  }

  return String(file.content || '')
}

function splitLines(text) {
  return String(text || '').replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
}

function parseDelimitedLine(line, delimiter) {
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
      continue
    }

    if (delimiter === ' ' && /\s/.test(char) && !quoted) {
      if (current.length > 0) {
        cells.push(current.trim())
        current = ''
      }
      while (index + 1 < line.length && /\s/.test(line[index + 1])) {
        index += 1
      }
      continue
    }

    if (line.startsWith(delimiter, index) && !quoted) {
      cells.push(current.trim())
      current = ''
      index += delimiter.length - 1
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells.map((cell) => cell.replace(/^"|"$/g, ''))
}

function normalizeStartRow(value) {
  const row = Number.parseInt(value, 10)
  return Number.isFinite(row) && row > 0 ? row : 1
}

function normalizeColumnName(value, index, usedNames) {
  const base = String(value || '').trim() || `field_${index + 1}`
  let name = base
  let suffix = 2

  while (usedNames.has(name)) {
    name = `${base}_${suffix}`
    suffix += 1
  }

  usedNames.add(name)
  return name
}

function buildColumns(rows, hasHeader) {
  const usedNames = new Set()
  const source = hasHeader ? rows[0] || [] : rows[0] || []
  return source.map((value, index) => normalizeColumnName(hasHeader ? value : `field_${index + 1}`, index, usedNames))
}

function normalizeRows(lines, delimiter, startRow, hasHeader) {
  const startIndex = startRow - 1
  const parsed = lines
    .slice(startIndex)
    .filter((line) => String(line || '').trim())
    .map((line) => parseDelimitedLine(line, delimiter))

  if (parsed.length === 0) return { columns: [], dataRows: [] }

  const columns = buildColumns(parsed, hasHeader)
  const dataRows = hasHeader ? parsed.slice(1) : parsed
  return { columns, dataRows }
}

function parseNumber(value) {
  const normalized = String(value ?? '').trim().replace(/,/g, '')
  if (!normalized) return NaN
  return Number(normalized)
}

function parseWktGeometry(value) {
  const text = String(value || '').trim()
  if (!text) return null

  const geometry = wkx.Geometry.parse(text).toGeoJSON()
  return geometry && geometry.type ? geometry : null
}

function inferFieldValue(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''

  const number = Number(text)
  if (Number.isFinite(number) && /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(text)) return number

  if (/^(true|false)$/i.test(text)) return /^true$/i.test(text)

  const time = Date.parse(text)
  if (!Number.isNaN(time) && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) {
    return new Date(time).toISOString()
  }

  return value
}

function buildProperties(row, columns, config) {
  return Object.fromEntries(columns.map((column, index) => {
    const value = row[index] ?? ''
    return [column, config.inferFieldTypes ? inferFieldValue(value) : value]
  }))
}

function getGeometryType(features) {
  const types = new Set(features.map((feature) => feature.geometry?.type).filter(Boolean))
  if (types.size === 1) return Array.from(types)[0]
  return 'GEOMETRY'
}

function transformGeometry(geometry, context) {
  if (!geometry || !context.sourceCrs) return geometry
  return {
    ...geometry,
    coordinates: transformGeometryCoordinates(geometry.coordinates, context)
  }
}

function createFeature(row, columns, config, context, rowNumber) {
  const geometryMode = config.geometryMode || 'xy'
  let geometry = null

  if (geometryMode === 'wkt') {
    const wktIndex = columns.indexOf(config.wktField)
    if (wktIndex === -1) return null
    geometry = parseWktGeometry(row[wktIndex])
    geometry = transformGeometry(geometry, context)
  } else {
    const xIndex = columns.indexOf(config.xField)
    const yIndex = columns.indexOf(config.yField)
    if (xIndex === -1 || yIndex === -1) return null

    const x = parseNumber(row[xIndex])
    const y = parseNumber(row[yIndex])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    geometry = {
      type: 'Point',
      coordinates: transformCoord([x, y], context)
    }
  }

  if (!geometry) return null

  return {
    type: 'Feature',
    geometry,
    properties: {
      ...buildProperties(row, columns, config),
      __sourceRow: rowNumber
    }
  }
}

router.post('/convert', async (req, res) => {
  const file = req.body.file
  const config = req.body.config || {}
  const sourceCrs = normalizeCrs(config.sourceCrs) || 'EPSG:4326'

  if (!file?.content) {
    return res.status(400).json({ error: '请上传 CSV 文件' })
  }

  try {
    const delimiter = getDelimiter(config)
    const encoding = normalizeEncoding(config.encoding)
    const startRow = normalizeStartRow(config.startRow)
    const projectionDefinition = await ensureProjectionDefinition(sourceCrs)
    const text = decodeCsvFile(file, encoding)
    const { columns, dataRows } = normalizeRows(splitLines(text), delimiter, startRow, Boolean(config.hasHeader))

    if (columns.length === 0) {
      return res.status(400).json({ error: 'CSV 中没有可解析的字段' })
    }

    const notices = []
    const context = {
      sourceCrs,
      definition: projectionDefinition,
      notices
    }

    const skippedRows = []
    const rowErrors = []
    const features = []

    dataRows.forEach((row, index) => {
      const rowNumber = startRow + (config.hasHeader ? 1 : 0) + index
      try {
        const feature = createFeature(row, columns, config, context, rowNumber)
        if (feature) {
          features.push(feature)
        } else {
          skippedRows.push(rowNumber)
        }
      } catch (error) {
        skippedRows.push(rowNumber)
        if (rowErrors.length < 5) {
          rowErrors.push(`第 ${rowNumber} 行：${getErrorMessage(error)}`)
        }
      }
    })

    if (features.length === 0) {
      return res.status(400).json({
        error: rowErrors[0] || 'CSV 中没有解析到有效几何，请检查字段映射、分隔符和坐标系配置',
        columns,
        rowCount: dataRows.length,
        rowErrors,
        skippedRows: skippedRows.slice(0, 20)
      })
    }

    if (skippedRows.length) {
      notices.push(`已跳过 ${skippedRows.length} 行无法生成几何的记录。`)
    }

    res.json({
      sourceCrs,
      targetCrs: 'EPSG:4326',
      needsTransform: !isWgs84(sourceCrs),
      encoding,
      delimiterMode: config.delimiterMode || 'comma',
      delimiter,
      hasHeader: Boolean(config.hasHeader),
      inferFieldTypes: Boolean(config.inferFieldTypes),
      buildSpatialIndex: Boolean(config.buildSpatialIndex),
      rowCount: dataRows.length,
      featureCount: features.length,
      skippedRowCount: skippedRows.length,
      skippedRows: skippedRows.slice(0, 20),
      rowErrors,
      geometryType: getGeometryType(features),
      columns,
      notices: [...new Set(notices)].slice(0, 10),
      geojson: {
        type: 'FeatureCollection',
        features
      }
    })
  } catch (error) {
    res.status(400).json({ error: `CSV 转换失败：${getErrorMessage(error)}` })
  }
})

module.exports = router
