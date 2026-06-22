const express = require('express')
const { Pool } = require('pg')

const router = express.Router()
const dbConnections = []

function createPool(conn) {
  return new Pool({
    host: conn.host,
    port: parseInt(conn.port, 10),
    database: conn.database,
    user: conn.username,
    password: conn.password || '',
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 5000
  })
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function normalizeIdent(value, fallback = 'uploaded_layer') {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  const safe = /^[a-z_]/i.test(normalized) ? normalized : `layer_${normalized}`
  return (safe || fallback).slice(0, 58)
}

function publicConnection(conn) {
  return {
    id: conn.id,
    name: conn.name,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    type: 'postgis',
    created_at: conn.created_at
  }
}

function findConnection(id) {
  return dbConnections.find((conn) => conn.id === id)
}

async function findSpatialTable(pool, schema, table, geometryColumn) {
  const result = await pool.query(
    `
      WITH spatial_columns AS (
        SELECT
          f_table_schema AS schema,
          f_table_name AS name,
          f_geometry_column AS geometry_column,
          type AS geometry_type,
          srid,
          'geometry' AS column_type
        FROM geometry_columns
        UNION ALL
        SELECT
          f_table_schema AS schema,
          f_table_name AS name,
          f_geography_column AS geometry_column,
          type AS geometry_type,
          srid,
          'geography' AS column_type
        FROM geography_columns
      )
      SELECT *
      FROM spatial_columns
      WHERE schema = $1
        AND name = $2
        AND ($3::text IS NULL OR geometry_column = $3)
      LIMIT 1
    `,
    [schema, table, geometryColumn || null]
  )

  return result.rows[0]
}

router.get('/', (req, res) => {
  res.json(dbConnections.map(publicConnection))
})

router.post('/test', async (req, res) => {
  const { host, port, database, username, password } = req.body

  if (!host || !port || !database || !username) {
    return res.status(400).json({ success: false, message: '请填写主机、端口、数据库和用户名' })
  }

  const testPool = createPool({ host, port, database, username, password })

  try {
    const client = await testPool.connect()
    await client.query('SELECT 1')
    await client.query('SELECT postgis_version()')
    client.release()
    res.json({ success: true, message: 'PostGIS 连接成功' })
  } catch (error) {
    res.json({ success: false, message: error.message })
  } finally {
    await testPool.end().catch(() => {})
  }
})

router.post('/', (req, res) => {
  const { id, name, host, port, database, username, password } = req.body

  if (!name || !host || !port || !database || !username) {
    return res.status(400).json({ error: '请填写连接名称、主机、端口、数据库和用户名' })
  }

  const newConn = {
    id: id || Date.now().toString(),
    name,
    host,
    port,
    database,
    username,
    password: password || '',
    created_at: new Date().toISOString()
  }

  const existingIndex = dbConnections.findIndex((conn) => conn.id === newConn.id)

  if (existingIndex > -1) {
    dbConnections.splice(existingIndex, 1, newConn)
    res.json(publicConnection(newConn))
  } else {
    dbConnections.push(newConn)
    res.status(201).json(publicConnection(newConn))
  }
})

router.delete('/:id', (req, res) => {
  const index = dbConnections.findIndex((conn) => conn.id === req.params.id)

  if (index === -1) {
    return res.status(404).json({ error: '连接不存在' })
  }

  dbConnections.splice(index, 1)
  res.json({ message: '删除成功' })
})

router.post('/:id/upload', async (req, res) => {
  const conn = findConnection(req.params.id)

  if (!conn) {
    return res.status(404).json({ error: '连接不存在' })
  }

  const { schema = 'public', tableName, geojson, replace = true, targetCrs } = req.body
  const safeSchema = normalizeIdent(schema, 'public')
  const safeTable = normalizeIdent(tableName)
  const features = Array.isArray(geojson?.features) ? geojson.features : []
  const targetSrid = /EPSG:4326/i.test(String(targetCrs || '')) ? 4326 : 0

  if (!safeTable) {
    return res.status(400).json({ error: '请填写目标表名' })
  }

  if (!geojson || geojson.type !== 'FeatureCollection') {
    return res.status(400).json({ error: '上传内容不是 FeatureCollection' })
  }

  if (features.length === 0) {
    return res.status(400).json({ error: '没有可导入的要素' })
  }

  if (features.length > 50000) {
    return res.status(400).json({ error: '单次上传最多支持 50000 个要素' })
  }

  const pool = createPool(conn)
  const client = await pool.connect()
  const tableRef = `${quoteIdent(safeSchema)}.${quoteIdent(safeTable)}`

  try {
    await client.query('BEGIN')
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis')
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(safeSchema)}`)

    if (replace) {
      await client.query(`DROP TABLE IF EXISTS ${tableRef}`)
    } else {
      const exists = await client.query(
        `
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2
          LIMIT 1
        `,
        [safeSchema, safeTable]
      )

      if (exists.rowCount > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: '目标表已存在，请勾选覆盖或修改表名' })
      }
    }

    await client.query(`
      CREATE TABLE ${tableRef} (
        id BIGSERIAL PRIMARY KEY,
        properties JSONB NOT NULL DEFAULT '{}'::jsonb,
        geom geometry(Geometry, ${targetSrid})
      )
    `)
    await client.query(`CREATE INDEX ${quoteIdent(`${safeTable}_geom_gix`)} ON ${tableRef} USING GIST (geom)`)

    const insertSql = `
      INSERT INTO ${tableRef} (properties, geom)
      VALUES ($1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2), $3))
    `
    let inserted = 0

    for (const feature of features) {
      if (!feature?.geometry) continue

      await client.query(insertSql, [
        JSON.stringify(feature.properties || {}),
        JSON.stringify(feature.geometry),
        targetSrid
      ])
      inserted += 1
    }

    if (inserted === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: '没有包含几何的要素可导入' })
    }

    await client.query(`ANALYZE ${tableRef}`)
    await client.query('COMMIT')

    res.json({
      schema: safeSchema,
      tableName: safeTable,
      fullName: `${safeSchema}.${safeTable}`,
      inserted
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: error.message })
  } finally {
    client.release()
    await pool.end().catch(() => {})
  }
})

router.get('/:id/tables', async (req, res) => {
  const conn = findConnection(req.params.id)

  if (!conn) {
    return res.status(404).json({ error: '连接不存在' })
  }

  const pool = createPool(conn)

  try {
    const result = await pool.query(`
      WITH spatial_columns AS (
        SELECT
          f_table_schema AS schema,
          f_table_name AS name,
          f_geometry_column AS geometry_column,
          type AS geometry_type,
          srid,
          'geometry' AS column_type
        FROM geometry_columns
        UNION ALL
        SELECT
          f_table_schema AS schema,
          f_table_name AS name,
          f_geography_column AS geometry_column,
          type AS geometry_type,
          srid,
          'geography' AS column_type
        FROM geography_columns
      )
      SELECT
        s.schema,
        s.name,
        s.geometry_column,
        s.geometry_type,
        s.srid,
        s.column_type,
        COALESCE(c.reltuples, 0)::bigint AS estimated_rows
      FROM spatial_columns s
      LEFT JOIN pg_namespace n ON n.nspname = s.schema
      LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = s.name
      WHERE s.schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY s.schema, s.name, s.geometry_column
    `)

    const tables = result.rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      fullName: `${row.schema}.${row.name}`,
      geometryColumn: row.geometry_column,
      geometryType: row.geometry_type,
      srid: row.srid,
      columnType: row.column_type,
      estimatedRows: Number(row.estimated_rows || 0)
    }))

    res.json(tables)
  } catch (error) {
    res.status(500).json({ error: error.message })
  } finally {
    await pool.end().catch(() => {})
  }
})

router.get('/:id/tables/:schema/:table/geojson', async (req, res) => {
  const conn = findConnection(req.params.id)

  if (!conn) {
    return res.status(404).json({ error: '连接不存在' })
  }

  const pool = createPool(conn)
  try {
    const tableInfo = await findSpatialTable(
      pool,
      req.params.schema,
      req.params.table,
      req.query.geometryColumn
    )

    if (!tableInfo) {
      return res.status(404).json({ error: '空间表不存在' })
    }

    const tableRef = `${quoteIdent(tableInfo.schema)}.${quoteIdent(tableInfo.name)}`
    const geomRef = `feature_row.${quoteIdent(tableInfo.geometry_column)}`
    const geomValue = tableInfo.column_type === 'geography' ? `${geomRef}::geometry` : geomRef
    const srid = Number(tableInfo.srid || 0)
    const needsTransform = srid > 0 && srid !== 4326
    const projectedGeom = needsTransform
      ? `
        CASE
          WHEN ST_SRID(${geomValue}) = 0 THEN ST_SetSRID(${geomValue}, 4326)
          ELSE ST_Transform(${geomValue}, 4326)
        END
      `
      : geomValue
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS total
        FROM ${tableRef}
        WHERE ${quoteIdent(tableInfo.geometry_column)} IS NOT NULL
      `
    )
    const totalFeatures = countResult.rows[0]?.total || 0
    const featureLimit = totalFeatures > 20000 ? 2000 : totalFeatures
    const notices = []

    if (totalFeatures > 20000) {
      notices.push('要素数量过多，返回要素上限为2000！')
    }

    if (needsTransform) {
      notices.push('图层坐标系不是4326，后端已进行坐标转换后返回。')
    }

    if (srid === 0) {
      notices.push('图层坐标系未知，已按原始坐标返回。')
    }

    const result = await pool.query(
      `
        SELECT json_build_object(
          'type', 'FeatureCollection',
          'features', COALESCE(
            json_agg(
              json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(${projectedGeom})::json,
                'properties', to_jsonb(feature_row) - $2
              )
            ),
            '[]'::json
          )
        ) AS geojson
        FROM (
          SELECT *
          FROM ${tableRef}
          WHERE ${quoteIdent(tableInfo.geometry_column)} IS NOT NULL
          LIMIT $1
        ) AS feature_row
      `,
      [featureLimit, tableInfo.geometry_column]
    )

    res.json({
      table: {
        schema: tableInfo.schema,
        name: tableInfo.name,
        fullName: `${tableInfo.schema}.${tableInfo.name}`,
        geometryColumn: tableInfo.geometry_column,
        geometryType: tableInfo.geometry_type,
        srid: tableInfo.srid,
        columnType: tableInfo.column_type
      },
      totalFeatures,
      featureLimit,
      needsTransform,
      notices,
      geojson: result.rows[0]?.geojson || { type: 'FeatureCollection', features: [] }
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  } finally {
    await pool.end().catch(() => {})
  }
})

module.exports = router
