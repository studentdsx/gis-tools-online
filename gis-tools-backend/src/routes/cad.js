const express = require('express')
const DxfParser = require('dxf-parser')
const iconv = require('iconv-lite')
const {
  ensureProjectionDefinition,
  getErrorMessage,
  isWgs84,
  normalizeCrs,
  transformCoord
} = require('../utils/projection')

const router = express.Router()
const parser = new DxfParser()

const DXF_CODEPAGE_ENCODINGS = {
  ANSI_936: 'gbk',
  GBK: 'gbk',
  GB2312: 'gbk',
  ANSI_950: 'big5',
  BIG5: 'big5',
  ANSI_932: 'shift_jis',
  ANSI_949: 'cp949',
  ANSI_1250: 'win1250',
  ANSI_1251: 'win1251',
  ANSI_1252: 'win1252',
  ANSI_1253: 'win1253',
  ANSI_1254: 'win1254',
  ANSI_1255: 'win1255',
  ANSI_1256: 'win1256',
  ANSI_1257: 'win1257',
  ANSI_1258: 'win1258',
  UTF8: 'utf8',
  'UTF-8': 'utf8'
}

function pointFromEntity(entity) {
  const point = entity.position || entity.startPoint || entity.center || entity.vertices?.[0]
  if (!point) return null
  return [Number(point.x), Number(point.y), Number(point.z || 0)].filter((value, index) => index < 2 || Number.isFinite(value))
}

function coordFromVertex(vertex) {
  if (!vertex) return null
  if (Array.isArray(vertex)) return [Number(vertex[0]), Number(vertex[1])]
  return [Number(vertex.x), Number(vertex.y), Number(vertex.z || 0)].filter((value, index) => index < 2 || Number.isFinite(value))
}

function cleanCoords(coords) {
  return coords.filter((coord) => {
    return Array.isArray(coord)
      && Number.isFinite(coord[0])
      && Number.isFinite(coord[1])
  })
}

function getEntityProps(entity, fileName) {
  return {
    source_file: fileName,
    cad_type: entity.type || '',
    cad_layer: entity.layer || '',
    color_number: entity.colorNumber ?? entity.color ?? null,
    line_type: entity.lineType || '',
    text: entity.text || entity.string || ''
  }
}

function createFeature(geometry, entity, fileName, sourceCrs) {
  return {
    type: 'Feature',
    geometry,
    properties: getEntityProps(entity, fileName),
    sourceCrs
  }
}

function approximateCircle(center, radius, transformContext, segments = 96) {
  const coords = []
  for (let index = 0; index <= segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments
    coords.push(transformCoord([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius
    ], transformContext))
  }
  return coords
}

function approximateArc(center, radius, startAngle, endAngle, transformContext, segments = 64) {
  let start = Number(startAngle || 0)
  let end = Number(endAngle || 0)
  if (end < start) end += 360

  const steps = Math.max(8, Math.ceil(((end - start) / 360) * segments))
  const coords = []
  for (let index = 0; index <= steps; index += 1) {
    const angle = ((start + ((end - start) * index) / steps) * Math.PI) / 180
    coords.push(transformCoord([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius
    ], transformContext))
  }
  return coords
}

function entityToFeatures(entity, fileName, transformContext) {
  const sourceCrs = transformContext.sourceCrs
  const type = String(entity.type || '').toUpperCase()
  const features = []

  if (type === 'POINT' || type === 'TEXT' || type === 'MTEXT') {
    const coord = pointFromEntity(entity)
    if (coord) {
      features.push(createFeature({
        type: 'Point',
        coordinates: transformCoord(coord, transformContext)
      }, entity, fileName, sourceCrs))
    }
    return features
  }

  if (type === 'LINE') {
    const start = coordFromVertex(entity.startPoint || entity.vertices?.[0])
    const end = coordFromVertex(entity.endPoint || entity.vertices?.[1])
    const coords = cleanCoords([start, end])
    if (coords.length >= 2) {
      features.push(createFeature({
        type: 'LineString',
        coordinates: coords.map((coord) => transformCoord(coord, transformContext))
      }, entity, fileName, sourceCrs))
    }
    return features
  }

  if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
    const coords = cleanCoords((entity.vertices || []).map(coordFromVertex))
    if (coords.length >= 2) {
      const closed = Boolean(entity.closed || entity.shape)
      const lineCoords = [...coords]
      if (closed) {
        const first = lineCoords[0]
        const last = lineCoords[lineCoords.length - 1]
        if (first[0] !== last[0] || first[1] !== last[1]) {
          lineCoords.push([...first])
        }
      }

      features.push(createFeature({
        type: closed && lineCoords.length >= 4 ? 'Polygon' : 'LineString',
        coordinates: closed && lineCoords.length >= 4
          ? [lineCoords.map((coord) => transformCoord(coord, transformContext))]
          : lineCoords.map((coord) => transformCoord(coord, transformContext))
      }, entity, fileName, sourceCrs))
    }
    return features
  }

  if (type === 'CIRCLE') {
    const center = coordFromVertex(entity.center)
    const radius = Number(entity.radius)
    if (center && Number.isFinite(radius) && radius > 0) {
      features.push(createFeature({
        type: 'Polygon',
        coordinates: [approximateCircle(center, radius, transformContext)]
      }, entity, fileName, sourceCrs))
    }
    return features
  }

  if (type === 'ARC') {
    const center = coordFromVertex(entity.center)
    const radius = Number(entity.radius)
    if (center && Number.isFinite(radius) && radius > 0) {
      features.push(createFeature({
        type: 'LineString',
        coordinates: approximateArc(center, radius, entity.startAngle, entity.endAngle, transformContext)
      }, entity, fileName, sourceCrs))
    }
    return features
  }

  return features
}

function detectDxfCodePage(text) {
  const lines = String(text || '').split(/\r?\n/)
  const index = lines.findIndex((line) => line.trim().toUpperCase() === '$DWGCODEPAGE')
  if (index === -1) return ''

  for (let offset = 1; offset <= 4; offset += 1) {
    const value = lines[index + offset]?.trim()
    if (value && !/^\d+$/.test(value)) return value
  }

  return ''
}

function normalizeTextEncoding(value) {
  const normalized = String(value || '').trim().replace(/[-\s]/g, '_').toUpperCase()
  if (!normalized) return ''
  const mapped = DXF_CODEPAGE_ENCODINGS[normalized] || DXF_CODEPAGE_ENCODINGS[normalized.replace(/^CP_/, 'ANSI_')]
  if (mapped) return mapped

  const lower = normalized.toLowerCase().replace(/_/g, '-')
  return iconv.encodingExists(lower) ? lower : ''
}

function decodeDxfBuffer(buffer, requestedEncoding) {
  const asciiHeader = buffer.toString('latin1', 0, Math.min(buffer.length, 200000))
  const codePage = detectDxfCodePage(asciiHeader)
  const encoding = normalizeTextEncoding(requestedEncoding)
    || normalizeTextEncoding(codePage)
    || 'utf8'

  return {
    text: iconv.decode(buffer, encoding),
    codePage,
    decodedEncoding: encoding
  }
}

function decodeFile(file) {
  if (file.encoding === 'base64') {
    return decodeDxfBuffer(Buffer.from(file.content || '', 'base64'), file.textEncoding || file.charset)
  }

  const text = String(file.content || '')
  return {
    text,
    codePage: detectDxfCodePage(text),
    decodedEncoding: 'browser-text'
  }
}

function getGeometryType(features) {
  const types = new Set(features.map((feature) => feature.geometry?.type).filter(Boolean))
  if (types.size === 1) return Array.from(types)[0]
  return 'GEOMETRY'
}

function getGeometryGroup(geometryType) {
  const type = String(geometryType || '').toUpperCase()
  if (type.includes('POINT')) return 'point'
  if (type.includes('LINE')) return 'line'
  if (type.includes('POLYGON')) return 'polygon'
  return 'other'
}

function getCadLayerMeta(group) {
  return {
    point: {
      key: 'point',
      name: '点',
      geometryType: 'POINT'
    },
    line: {
      key: 'line',
      name: '线',
      geometryType: 'LINESTRING'
    },
    polygon: {
      key: 'polygon',
      name: '面',
      geometryType: 'POLYGON'
    },
    other: {
      key: 'other',
      name: '其他',
      geometryType: 'GEOMETRY'
    }
  }[group]
}

function splitFeaturesByGeometry(features) {
  const groups = {
    point: [],
    line: [],
    polygon: [],
    other: []
  }

  features.forEach((feature) => {
    const group = getGeometryGroup(feature.geometry?.type)
    groups[group].push(feature)
  })

  return ['point', 'line', 'polygon', 'other']
    .map((group) => {
      const groupFeatures = groups[group]
      if (groupFeatures.length === 0) return null

      const meta = getCadLayerMeta(group)
      return {
        ...meta,
        featureCount: groupFeatures.length,
        geojson: {
          type: 'FeatureCollection',
          features: groupFeatures
        }
      }
    })
    .filter(Boolean)
}

router.post('/convert', async (req, res) => {
  const files = Array.isArray(req.body.files) ? req.body.files : []
  const sourceCrs = normalizeCrs(req.body.sourceCrs) || 'EPSG:4326'

  if (files.length === 0) {
    return res.status(400).json({ error: '请上传 DXF 文件' })
  }

  const unsupported = files.find((file) => /\.dwg$/i.test(file.name || ''))
  if (unsupported) {
    return res.status(400).json({ error: '当前仅支持 DXF。DWG 是专有二进制格式，需要后续接入 ODA/LibreDWG 等转换器。' })
  }

  const dxfFiles = files.filter((file) => /\.dxf$/i.test(file.name || ''))
  if (dxfFiles.length === 0) {
    return res.status(400).json({ error: '请选择 .dxf 文件' })
  }

  try {
    const projectionDefinition = await ensureProjectionDefinition(sourceCrs)

    const features = []
    const notices = []
    const decodedFiles = []
    let entityCount = 0
    const transformContext = {
      sourceCrs,
      definition: projectionDefinition,
      notices
    }

    dxfFiles.forEach((file) => {
      const decoded = decodeFile(file)
      const text = decoded.text
      decodedFiles.push({
        name: file.name,
        codePage: decoded.codePage || '',
        encoding: decoded.decodedEncoding || ''
      })
      const dxf = parser.parseSync(text)
      const entities = dxf.entities || []
      entityCount += entities.length

      entities.forEach((entity) => {
        const converted = entityToFeatures(entity, file.name, transformContext)
        if (converted.length === 0 && entity?.type) {
          notices.push(`已跳过暂不支持的 CAD 实体：${entity.type}`)
        }
        features.push(...converted)
      })
    })

    const uniqueNotices = [...new Set(notices)].slice(0, 10)
    if (features.length === 0) {
      return res.status(400).json({
        error: 'DXF 中没有解析到可转换的点、线或面实体',
        entityCount,
        notices: uniqueNotices
      })
    }

    const layers = splitFeaturesByGeometry(features)

    res.json({
      sourceCrs,
      targetCrs: 'EPSG:4326',
      needsTransform: !isWgs84(sourceCrs),
      entityCount,
      featureCount: features.length,
      geometryType: getGeometryType(features),
      notices: uniqueNotices,
      decodedFiles,
      layers,
      geojson: {
        type: 'FeatureCollection',
        features
      }
    })
  } catch (error) {
    res.status(400).json({ error: `CAD 转换失败：${getErrorMessage(error)}` })
  }
})

module.exports = router
