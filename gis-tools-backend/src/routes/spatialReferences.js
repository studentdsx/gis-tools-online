const express = require('express')
const db = require('../config/db')

const router = express.Router()

const FALLBACK_REFERENCES = [
  {
    code: 'EPSG:4326',
    authName: 'EPSG',
    srid: 4326,
    name: 'WGS 84',
    proj4Text: '+proj=longlat +datum=WGS84 +no_defs',
    srText: '',
    source: 'builtin_common_epsg'
  },
  {
    code: 'EPSG:3857',
    authName: 'EPSG',
    srid: 3857,
    name: 'WGS 84 / Pseudo-Mercator',
    proj4Text: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
    srText: '',
    source: 'builtin_common_epsg'
  },
  {
    code: 'EPSG:4490',
    authName: 'EPSG',
    srid: 4490,
    name: 'China Geodetic Coordinate System 2000',
    proj4Text: '+proj=longlat +ellps=GRS80 +no_defs',
    srText: '',
    source: 'builtin_common_epsg'
  },
  {
    code: 'EPSG:3395',
    authName: 'EPSG',
    srid: 3395,
    name: 'WGS 84 / World Mercator',
    proj4Text: '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
    srText: '',
    source: 'builtin_common_epsg'
  },
  {
    code: 'EPSG:32649',
    authName: 'EPSG',
    srid: 32649,
    name: 'WGS 84 / UTM zone 49N',
    proj4Text: '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs',
    srText: '',
    source: 'builtin_common_epsg'
  },
  {
    code: 'EPSG:32650',
    authName: 'EPSG',
    srid: 32650,
    name: 'WGS 84 / UTM zone 50N',
    proj4Text: '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs',
    srText: '',
    source: 'builtin_common_epsg'
  },
  {
    code: 'EPSG:32651',
    authName: 'EPSG',
    srid: 32651,
    name: 'WGS 84 / UTM zone 51N',
    proj4Text: '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs',
    srText: '',
    source: 'builtin_common_epsg'
  }
]

let initialized = false

function normalizeLimit(value) {
  const limit = Number.parseInt(value, 10)
  if (!Number.isFinite(limit)) return 80
  return Math.min(Math.max(limit, 1), 200)
}

function normalizeKeyword(value) {
  return String(value || '').trim()
}

function toApiRow(row) {
  return {
    code: row.code,
    authName: row.auth_name,
    srid: Number(row.srid),
    name: row.name,
    proj4Text: row.proj4_text || '',
    srText: row.sr_text || '',
    source: row.source || ''
  }
}

function filterFallback(keyword, limit) {
  const lowerKeyword = keyword.toLowerCase()
  return FALLBACK_REFERENCES
    .filter((item) => {
      if (!lowerKeyword) return true
      return item.code.toLowerCase().includes(lowerKeyword)
        || item.name.toLowerCase().includes(lowerKeyword)
        || String(item.srid).includes(lowerKeyword)
    })
    .slice(0, limit)
}

async function ensureSpatialReferenceTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS spatial_references (
      code TEXT PRIMARY KEY,
      auth_name TEXT NOT NULL,
      srid INTEGER NOT NULL,
      name TEXT NOT NULL,
      proj4_text TEXT,
      sr_text TEXT,
      source TEXT NOT NULL DEFAULT 'postgis_spatial_ref_sys',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.query('CREATE INDEX IF NOT EXISTS spatial_references_srid_idx ON spatial_references (srid)')
  await db.query('CREATE INDEX IF NOT EXISTS spatial_references_name_idx ON spatial_references (name)')
}

async function seedFallbackReferences() {
  for (const item of FALLBACK_REFERENCES) {
    await db.query(
      `
        INSERT INTO spatial_references (code, auth_name, srid, name, proj4_text, sr_text, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          proj4_text = EXCLUDED.proj4_text,
          sr_text = EXCLUDED.sr_text,
          source = EXCLUDED.source,
          updated_at = NOW()
      `,
      [item.code, item.authName, item.srid, item.name, item.proj4Text, item.srText, item.source]
    )
  }
}

async function syncFromPostgisSpatialRefSys() {
  const existsResult = await db.query(`
    SELECT to_regclass('public.spatial_ref_sys') AS table_name
  `)

  if (!existsResult.rows[0]?.table_name) {
    return 0
  }

  const result = await db.query(`
    INSERT INTO spatial_references (code, auth_name, srid, name, proj4_text, sr_text, source)
    SELECT
      UPPER(COALESCE(NULLIF(auth_name, ''), 'EPSG')) || ':' || COALESCE(NULLIF(auth_srid, 0), srid) AS code,
      UPPER(COALESCE(NULLIF(auth_name, ''), 'EPSG')) AS auth_name,
      COALESCE(NULLIF(auth_srid, 0), srid)::integer AS srid,
      COALESCE(
        NULLIF(substring(srtext FROM '^[A-Z_]+\\["([^"]+)"'), ''),
        UPPER(COALESCE(NULLIF(auth_name, ''), 'EPSG')) || ':' || COALESCE(NULLIF(auth_srid, 0), srid)
      ) AS name,
      proj4text AS proj4_text,
      srtext AS sr_text,
      'postgis_spatial_ref_sys' AS source
    FROM spatial_ref_sys
    WHERE COALESCE(NULLIF(auth_srid, 0), srid) IS NOT NULL
    ON CONFLICT (code) DO UPDATE SET
      auth_name = EXCLUDED.auth_name,
      srid = EXCLUDED.srid,
      name = EXCLUDED.name,
      proj4_text = EXCLUDED.proj4_text,
      sr_text = EXCLUDED.sr_text,
      source = EXCLUDED.source,
      updated_at = NOW()
  `)

  return result.rowCount || 0
}

async function initializeSpatialReferences() {
  if (initialized) return

  await ensureSpatialReferenceTable()

  const countResult = await db.query('SELECT COUNT(*)::integer AS count FROM spatial_references')
  if (countResult.rows[0]?.count === 0) {
    try {
      await syncFromPostgisSpatialRefSys()
    } catch (error) {
      console.warn('同步 PostGIS spatial_ref_sys 失败，将使用内置常用坐标系清单:', error.message)
    }
    await seedFallbackReferences()
  }

  initialized = true
}

async function querySpatialReferences(keyword, limit) {
  const search = `%${keyword}%`
  const params = keyword ? [search, keyword, limit] : [limit]
  const whereSql = keyword
    ? `
      WHERE code ILIKE $1
         OR name ILIKE $1
         OR srid::text = $2
    `
    : ''
  const limitParam = keyword ? '$3' : '$1'

  const result = await db.query(
    `
      SELECT code, auth_name, srid, name, proj4_text, sr_text, source
      FROM spatial_references
      ${whereSql}
      ORDER BY
        CASE code
          WHEN 'EPSG:4326' THEN 0
          WHEN 'EPSG:3857' THEN 1
          WHEN 'EPSG:4490' THEN 2
          ELSE 10
        END,
        srid
      LIMIT ${limitParam}
    `,
    params
  )

  return result.rows.map(toApiRow)
}

router.get('/', async (req, res) => {
  const keyword = normalizeKeyword(req.query.keyword)
  const limit = normalizeLimit(req.query.limit)

  try {
    await initializeSpatialReferences()
    const items = await querySpatialReferences(keyword, limit)
    res.json({
      source: 'database',
      items
    })
  } catch (error) {
    res.json({
      source: 'fallback',
      warning: error.message,
      items: filterFallback(keyword, limit)
    })
  }
})

router.post('/sync', async (req, res) => {
  try {
    await ensureSpatialReferenceTable()
    const synced = await syncFromPostgisSpatialRefSys()
    await seedFallbackReferences()
    initialized = true

    res.json({
      synced,
      message: '坐标系清单已同步'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
