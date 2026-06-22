const proj4 = require('proj4')
const db = require('../config/db')

const BUILTIN_PROJ4_DEFS = {
  'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
  'EPSG:4490': '+proj=longlat +ellps=GRS80 +no_defs',
  'EPSG:32649': '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs',
  'EPSG:32650': '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs',
  'EPSG:32651': '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs'
}

const registeredCrs = new Set()
const registeredProjectionDefs = new Map()

function normalizeCrs(value) {
  if (!value || typeof value !== 'string') return ''
  const trimmed = value.trim()
  const epsg = trimmed.match(/^(?:EPSG[:/])?(\d+)$/i)
  return epsg ? `EPSG:${epsg[1]}` : trimmed
}

function registerProjection(code, definition) {
  proj4.defs(code, definition)
  registeredCrs.add(code)
  registeredProjectionDefs.set(code.toUpperCase(), definition)
}

Object.entries(BUILTIN_PROJ4_DEFS).forEach(([code, definition]) => {
  registerProjection(code, definition)
})

function isWgs84(crs) {
  return !crs || /EPSG:4326/i.test(crs) || /WGS_1984/i.test(crs)
}

function isGeographicCrs(crs, definition = '') {
  return isWgs84(crs)
    || /EPSG:4490/i.test(crs)
    || /\+proj=longlat/i.test(definition)
    || /^GEOGCS\[/i.test(definition)
}

function getCrsParts(crs) {
  const match = String(crs || '').trim().match(/^([A-Z]+):(\d+)$/i)
  if (!match) return null
  return {
    authName: match[1].toUpperCase(),
    srid: Number(match[2])
  }
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== '{}') return serialized
  } catch (serializeError) {
    // ignore serialization fallback errors
  }
  return '未知错误'
}

async function findProjectionDefinition(sourceCrs) {
  const crs = normalizeCrs(sourceCrs)
  if (!crs) return ''

  const builtin = BUILTIN_PROJ4_DEFS[crs.toUpperCase()]
  if (builtin) return builtin

  const parts = getCrsParts(crs)

  try {
    const result = await db.query(
      `
        SELECT proj4_text, sr_text
        FROM spatial_references
        WHERE UPPER(code) = UPPER($1)
           OR ($2::text IS NOT NULL AND $3::integer IS NOT NULL AND auth_name = $2 AND srid = $3)
        LIMIT 1
      `,
      [crs, parts?.authName || null, parts?.srid || null]
    )

    const row = result.rows[0]
    if (row?.proj4_text) return row.proj4_text
    if (row?.sr_text) return row.sr_text
  } catch (error) {
    // Lightweight deployments may not have the local spatial reference cache yet.
  }

  if (!parts) return ''

  try {
    const result = await db.query(
      `
        SELECT proj4text AS proj4_text, srtext AS sr_text
        FROM spatial_ref_sys
        WHERE UPPER(auth_name) = $1 AND auth_srid = $2
        LIMIT 1
      `,
      [parts.authName, parts.srid]
    )

    const row = result.rows[0]
    if (row?.proj4_text) return row.proj4_text
    if (row?.sr_text) return row.sr_text
  } catch (error) {
    // PostGIS spatial_ref_sys is optional.
  }

  return ''
}

function canUseProjection(sourceCrs) {
  try {
    proj4(sourceCrs, 'EPSG:4326', [0, 0])
    return true
  } catch (error) {
    return false
  }
}

async function ensureProjectionDefinition(sourceCrs) {
  const crs = normalizeCrs(sourceCrs)
  if (!crs) return ''
  if (crs.startsWith('+proj=')) return crs
  if (isWgs84(crs)) return registeredProjectionDefs.get(crs.toUpperCase()) || ''

  if (registeredCrs.has(crs) || canUseProjection(crs)) {
    registeredCrs.add(crs)
    return registeredProjectionDefs.get(crs.toUpperCase()) || ''
  }

  const definition = await findProjectionDefinition(crs)
  if (definition) {
    try {
      registerProjection(crs, definition.trim())
      if (canUseProjection(crs)) {
        return definition.trim()
      }
    } catch (error) {
      throw new Error(`坐标系 ${crs} 的投影定义不可用：${getErrorMessage(error)}`)
    }
  }

  throw new Error(`坐标系 ${crs} 缺少可用的 proj4 定义，请先同步坐标系清单或选择其他坐标系`)
}

function isValidLonLat(coord) {
  return Array.isArray(coord)
    && Number.isFinite(coord[0])
    && Number.isFinite(coord[1])
    && coord[0] >= -180
    && coord[0] <= 180
    && coord[1] >= -90
    && coord[1] <= 90
}

function formatCoord(coord) {
  if (!Array.isArray(coord)) return ''
  return `${Number(coord[0]).toFixed(6)}, ${Number(coord[1]).toFixed(6)}`
}

function getFalseEasting(definition = '') {
  const proj4Match = definition.match(/\+x_0=([-.\d]+)/i)
  if (proj4Match) return Number(proj4Match[1])

  const wktMatch = definition.match(/PARAMETER\["false_easting",\s*([-.\d]+)/i)
  return wktMatch ? Number(wktMatch[1]) : NaN
}

function projectCoord(coord, sourceCrs) {
  return proj4(sourceCrs, 'EPSG:4326', [coord[0], coord[1]])
}

function tryGaussKrugerZonePrefix(coord, context) {
  const falseEasting = getFalseEasting(context.definition)
  if (!Number.isFinite(falseEasting) || Math.abs(falseEasting) < 10000000 || Math.abs(coord[0]) >= 10000000) {
    return null
  }

  const offset = falseEasting - 500000
  const adjustedCoord = [coord[0] + offset, coord[1]]
  const transformed = projectCoord(adjustedCoord, context.sourceCrs)
  if (!isValidLonLat(transformed)) return null

  if (!context.gaussKrugerPrefixAdjusted) {
    context.notices?.push(`检测到 ${context.sourceCrs} 使用带带号高斯投影，X 坐标未包含带号前缀，已按 ${offset} 自动修正。`)
    context.gaussKrugerPrefixAdjusted = true
  }

  return transformed
}

function transformCoord(coord, context) {
  const sourceCrs = context.sourceCrs
  if (!sourceCrs) return coord

  if (isGeographicCrs(sourceCrs, context.definition)) {
    if (!isValidLonLat(coord)) {
      throw new Error(`源坐标系 ${sourceCrs} 是经纬度坐标系，但坐标 ${formatCoord(coord)} 超出经纬度范围，请选择正确的投影坐标系`)
    }
    return coord
  }

  let transformed = projectCoord(coord, sourceCrs)
  if (!isValidLonLat(transformed)) {
    transformed = tryGaussKrugerZonePrefix(coord, context) || transformed
  }

  if (!isValidLonLat(transformed)) {
    throw new Error(`按 ${sourceCrs} 转换后得到无效经纬度，请确认源坐标系是否与数据一致。原始坐标：${formatCoord(coord)}`)
  }

  return coord.length > 2 ? [...transformed, ...coord.slice(2)] : transformed
}

function transformGeometryCoordinates(coords, context) {
  if (!Array.isArray(coords)) return coords

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return transformCoord(coords, context)
  }

  return coords.map((item) => transformGeometryCoordinates(item, context))
}

module.exports = {
  ensureProjectionDefinition,
  getErrorMessage,
  isWgs84,
  normalizeCrs,
  transformCoord,
  transformGeometryCoordinates
}
