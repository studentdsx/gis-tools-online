const express = require('express')
const JSZip = require('jszip')
const mapshaper = require('mapshaper')

const router = express.Router()

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
]
const AMAP_TEXT_ENDPOINT = 'https://restapi.amap.com/v3/place/text'
const AMAP_POLYGON_ENDPOINT = 'https://restapi.amap.com/v3/place/polygon'
const MAX_OSM_DOWNLOAD_AREA_KM2 = 2000
const DEFAULT_OSM_PREVIEW_LIMIT = 3000
const MAX_OSM_PREVIEW_LIMIT = 20000

const OSM_TAG_PRESETS = {
  roads: ['highway'],
  buildings: ['building'],
  poi: ['amenity', 'shop', 'tourism', 'leisure'],
  water: ['waterway', 'natural=water', 'water'],
  landuse: ['landuse'],
  transport: ['railway', 'public_transport', 'aeroway'],
  boundary: ['boundary=administrative']
}

const OSM_TYPE_LABELS = {
  roads: '道路',
  buildings: '建筑',
  poi: 'POI',
  water: '水系',
  landuse: '土地利用',
  transport: '交通设施',
  boundary: '行政边界',
  custom: '自定义'
}

const OSM_GEOMETRY_MODES = {
  roads: 'line',
  buildings: 'polygon',
  poi: 'point',
  water: 'line',
  landuse: 'polygon',
  transport: 'line',
  boundary: 'polygon',
  custom: 'mixed'
}

const coordPi = Math.PI
const coordXPi = Math.PI * 3000.0 / 180.0
const coordA = 6378245.0
const coordEe = 0.00669342162296594323

function getErrorMessage(error) {
  return error?.message || String(error || '未知错误')
}

function normalizeBbox(value) {
  if (!Array.isArray(value)) return null
  const bbox = value.map((item) => Number(item))
  if (bbox.length !== 4 || bbox.some((item) => !Number.isFinite(item))) return null
  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return null
  if (bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90) return null
  return bbox
}

function getBboxAreaKm2(bbox) {
  const [west, south, east, north] = bbox
  const midLat = ((south + north) / 2) * Math.PI / 180
  const kmPerDegreeLat = 110.574
  const kmPerDegreeLng = 111.320 * Math.cos(midLat)
  const widthKm = Math.max(0, east - west) * Math.max(0, kmPerDegreeLng)
  const heightKm = Math.max(0, north - south) * kmPerDegreeLat
  return widthKm * heightKm
}

function uniqueList(items = []) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
}

function sanitizeFileName(name, fallback = 'layer') {
  const value = String(name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
  return value || fallback
}

function normalizeOsmFilters(featureTypes = [], customTags = []) {
  const presetTags = uniqueList(featureTypes)
    .flatMap((type) => OSM_TAG_PRESETS[type] || [])
  const tags = uniqueList([...presetTags, ...customTags])
  return tags.length ? tags : ['highway', 'building', 'amenity']
}

function normalizeOsmLayerRequests(featureTypes = [], customTags = []) {
  const types = uniqueList(featureTypes).filter((type) => OSM_TAG_PRESETS[type])
  const custom = uniqueList(customTags)
  const requests = types.map((type) => ({
    key: type,
    name: OSM_TYPE_LABELS[type] || type,
    tags: OSM_TAG_PRESETS[type],
    geometryMode: OSM_GEOMETRY_MODES[type] || 'mixed'
  }))
  if (custom.length) {
    requests.push({
      key: 'custom',
      name: OSM_TYPE_LABELS.custom,
      tags: custom,
      geometryMode: OSM_GEOMETRY_MODES.custom
    })
  }
  return requests.length ? requests : [
    {
      key: 'roads',
      name: OSM_TYPE_LABELS.roads,
      tags: OSM_TAG_PRESETS.roads,
      geometryMode: OSM_GEOMETRY_MODES.roads
    }
  ]
}

function createOsmTagFilter(tag) {
  const [key, ...rest] = String(tag).split('=')
  const cleanKey = key.trim()
  const cleanValue = rest.join('=').trim()
  if (!cleanKey) return ''
  if (!cleanValue) return `["${cleanKey.replace(/"/g, '\\"')}"]`
  return `["${cleanKey.replace(/"/g, '\\"')}"="${cleanValue.replace(/"/g, '\\"')}"]`
}

function buildOverpassQuery({ bbox, featureTypes, customTags, timeout = 25 }) {
  const filters = normalizeOsmFilters(featureTypes, customTags)
    .map(createOsmTagFilter)
    .filter(Boolean)
  const [west, south, east, north] = bbox
  const overpassBbox = `(${south},${west},${north},${east})`
  const clauses = []

  filters.forEach((filter) => {
    clauses.push(`node${filter}${overpassBbox};`)
    clauses.push(`way${filter}${overpassBbox};`)
    clauses.push(`relation${filter}${overpassBbox};`)
  })

  return `[out:json][timeout:${Math.min(Math.max(Number(timeout) || 25, 5), 60)}];
(
${clauses.join('\n')}
);
out body geom;`
}

function buildOverpassQueryByTags({ bbox, tags, geometryMode = 'mixed', timeout = 25 }) {
  const filters = uniqueList(tags)
    .map(createOsmTagFilter)
    .filter(Boolean)
  const [west, south, east, north] = bbox
  const overpassBbox = `(${south},${west},${north},${east})`
  const clauses = []

  filters.forEach((filter) => {
    if (geometryMode === 'point') {
      clauses.push(`node${filter}${overpassBbox};`)
      return
    }
    if (geometryMode === 'line') {
      clauses.push(`way${filter}${overpassBbox};`)
      clauses.push(`relation${filter}${overpassBbox};`)
      return
    }
    if (geometryMode === 'polygon') {
      clauses.push(`way${filter}${overpassBbox};`)
      clauses.push(`relation${filter}${overpassBbox};`)
      return
    }
    clauses.push(`node${filter}${overpassBbox};`)
    clauses.push(`way${filter}${overpassBbox};`)
    clauses.push(`relation${filter}${overpassBbox};`)
  })

  return `[out:json][timeout:${Math.min(Math.max(Number(timeout) || 25, 5), 60)}];
(
${clauses.join('\n')}
);
out body geom;`
}

function nodeToFeature(element) {
  if (!Number.isFinite(element.lon) || !Number.isFinite(element.lat)) return null
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [element.lon, element.lat]
    },
    properties: createOsmProperties(element)
  }
}

function isSameCoord(a, b) {
  return Array.isArray(a)
    && Array.isArray(b)
    && Math.abs(a[0] - b[0]) < 1e-10
    && Math.abs(a[1] - b[1]) < 1e-10
}

function getMemberCoords(member) {
  return (member?.geometry || [])
    .map((coord) => [coord.lon, coord.lat])
    .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
}

function stitchWaySegments(segments) {
  const pending = segments
    .map((coords) => coords.filter((coord) => Array.isArray(coord)))
    .filter((coords) => coords.length >= 2)
    .map((coords) => coords.map((coord) => [...coord]))
  const rings = []
  const openLines = []

  while (pending.length) {
    let line = pending.shift()
    let changed = true

    while (!isSameCoord(line[0], line[line.length - 1]) && changed) {
      changed = false

      for (let index = 0; index < pending.length; index += 1) {
        const segment = pending[index]
        const lineStart = line[0]
        const lineEnd = line[line.length - 1]
        const segmentStart = segment[0]
        const segmentEnd = segment[segment.length - 1]

        if (isSameCoord(lineEnd, segmentStart)) {
          line = line.concat(segment.slice(1))
        } else if (isSameCoord(lineEnd, segmentEnd)) {
          line = line.concat([...segment].reverse().slice(1))
        } else if (isSameCoord(lineStart, segmentEnd)) {
          line = segment.slice(0, -1).concat(line)
        } else if (isSameCoord(lineStart, segmentStart)) {
          line = [...segment].reverse().slice(0, -1).concat(line)
        } else {
          continue
        }

        pending.splice(index, 1)
        changed = true
        break
      }
    }

    if (isSameCoord(line[0], line[line.length - 1]) && line.length >= 4) {
      rings.push(line)
    } else {
      openLines.push(line)
    }
  }

  return { rings, openLines }
}

function pointInRing(point, ring) {
  if (!Array.isArray(point) || !Array.isArray(ring) || ring.length < 4) return false

  const [x, y] = point
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi)
    if (intersects) inside = !inside
  }

  return inside
}

function isAreaWay(element, coords) {
  if (!coords.length || !isSameCoord(coords[0], coords[coords.length - 1])) return false
  const tags = element.tags || {}
  if (tags.area === 'no') return false
  if (tags.highway && !tags.area) return false
  return Boolean(
    tags.area === 'yes'
    || tags.building
    || tags.landuse
    || tags.natural
    || tags.water
    || tags.leisure
    || tags.amenity
    || tags.boundary
  )
}

function wayToFeature(element, geometryMode = 'mixed') {
  const coords = (element.geometry || [])
    .map((coord) => [coord.lon, coord.lat])
    .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
  if (coords.length < 2) return null

  if (isAreaWay(element, coords)) {
    if (geometryMode === 'line') return null
    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: createOsmProperties(element)
    }
  }

  if (geometryMode === 'polygon') return null

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords
    },
    properties: createOsmProperties(element)
  }
}

function relationToFeature(element, geometryMode = 'mixed') {
  const tags = element.tags || {}
  const members = element.members || []
  const outerSegments = members
    .filter((member) => member.type === 'way' && member.role !== 'inner')
    .map(getMemberCoords)
    .filter((coords) => coords.length >= 2)
  const innerSegments = members
    .filter((member) => member.type === 'way' && member.role === 'inner')
    .map(getMemberCoords)
    .filter((coords) => coords.length >= 2)

  if (!outerSegments.length) return null

  if (tags.type === 'multipolygon' || tags.boundary || tags.landuse || tags.natural || tags.building) {
    if (geometryMode === 'line') return null

    const { rings: outerRings } = stitchWaySegments(outerSegments)
    if (!outerRings.length) return null

    const { rings: innerRings } = stitchWaySegments(innerSegments)
    const polygons = outerRings.map((ring) => [ring])

    innerRings.forEach((innerRing) => {
      const targetPolygon = polygons.find((polygon) => pointInRing(innerRing[0], polygon[0]))
      if (targetPolygon) {
        targetPolygon.push(innerRing)
      } else if (polygons[0]) {
        polygons[0].push(innerRing)
      }
    })

    return {
      type: 'Feature',
      geometry: polygons.length === 1
        ? { type: 'Polygon', coordinates: polygons[0] }
        : { type: 'MultiPolygon', coordinates: polygons },
      properties: createOsmProperties(element)
    }
  }

  if (geometryMode === 'polygon') return null

  const { rings, openLines } = stitchWaySegments(outerSegments)
  const lines = [...rings, ...openLines]
  if (!lines.length) return null

  return {
    type: 'Feature',
    geometry: lines.length === 1
      ? { type: 'LineString', coordinates: lines[0] }
      : { type: 'MultiLineString', coordinates: lines },
    properties: createOsmProperties(element)
  }
}

function createOsmProperties(element) {
  return {
    osm_id: element.id,
    osm_type: element.type,
    ...(element.tags || {})
  }
}

function normalizePreviewLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_OSM_PREVIEW_LIMIT
  return Math.min(Math.max(Math.round(parsed), 0), MAX_OSM_PREVIEW_LIMIT)
}

function limitGeoJsonFeatures(geojson, limit) {
  const features = geojson?.features || []
  return {
    type: 'FeatureCollection',
    features: features.slice(0, limit)
  }
}

function normalizeOutputFormat(value) {
  return String(value || 'geojson').toLowerCase() === 'shp' ? 'shp' : 'geojson'
}

function normalizeOutputEncoding(value) {
  return String(value || 'utf-8').toLowerCase() === 'gbk' ? 'gbk' : 'utf-8'
}

async function createShapefileZipBuffer(layer, encoding) {
  const inputName = `${sanitizeFileName(layer.name, 'layer')}.geojson`
  const outputName = `${sanitizeFileName(layer.name, 'layer')}.zip`
  const commands = [
    `-i ${inputName}`,
    `-o format=shapefile encoding=${encoding === 'gbk' ? 'gbk' : 'utf8'} ${outputName}`
  ].join(' ')
  const output = await mapshaper.applyCommands(commands, {
    [inputName]: JSON.stringify(layer.geojson)
  })
  const buffer = output[outputName] || Object.values(output)[0]
  return Buffer.from(buffer)
}

async function createOsmDownloadZipBuffer({ layers, previewLayers, outputFormat, encoding, metadata }) {
  const zip = new JSZip()
  zip.file('_metadata.json', JSON.stringify(metadata, null, 2))
  zip.file('_preview.json', JSON.stringify({ ...metadata, layers: previewLayers }, null, 2))

  for (const layer of layers) {
    const baseName = sanitizeFileName(layer.name, layer.key || 'osm')
    if (outputFormat === 'shp') {
      zip.file(`${baseName}.zip`, await createShapefileZipBuffer(layer, encoding))
    } else {
      zip.file(`${baseName}.geojson`, JSON.stringify({
        ...layer.geojson,
        crs: { type: 'name', properties: { name: 'EPSG:4326' } }
      }, null, 2))
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function overpassToGeoJson(data, geometryMode = 'mixed') {
  const features = []

  for (const element of data?.elements || []) {
    let feature = null
    if (element.type === 'node' && (geometryMode === 'point' || geometryMode === 'mixed')) feature = nodeToFeature(element)
    if (element.type === 'way') feature = wayToFeature(element, geometryMode)
    if (element.type === 'relation') feature = relationToFeature(element, geometryMode)
    if (feature) features.push(feature)
  }

  return {
    geojson: {
      type: 'FeatureCollection',
      features
    },
    rawElementCount: (data?.elements || []).length
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch (error) {
      throw new Error(text.slice(0, 300) || '远程服务返回内容不是 JSON')
    }
    if (!response.ok) {
      throw new Error(data?.remark || data?.info || text.slice(0, 300) || `HTTP ${response.status}`)
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOverpassJson(query, timeoutMs) {
  const errors = []
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await fetchJsonWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'gis-tools-online/1.0'
        },
        body: new URLSearchParams({ data: query }).toString()
      }, timeoutMs)
    } catch (error) {
      errors.push(`${endpoint}: ${getErrorMessage(error)}`)
    }
  }
  throw new Error(errors.join('；'))
}

router.post('/osm', async (req, res) => {
  const bbox = normalizeBbox(req.body.bbox)
  if (!bbox) {
    return res.status(400).json({ error: '请提供合法下载范围 bbox：[minLon,minLat,maxLon,maxLat]' })
  }

  const areaKm2 = getBboxAreaKm2(bbox)
  if (areaKm2 > MAX_OSM_DOWNLOAD_AREA_KM2) {
    return res.status(400).json({
      error: `OSM 下载范围过大，当前约 ${Math.round(areaKm2)} 平方公里，请缩小到 ${MAX_OSM_DOWNLOAD_AREA_KM2} 平方公里以内后重试`
    })
  }

  try {
    const layerRequests = normalizeOsmLayerRequests(req.body.featureTypes, req.body.customTags)
    const previewLimit = normalizePreviewLimit(req.body.previewLimit)
    const outputFormat = normalizeOutputFormat(req.body.outputFormat)
    const encoding = normalizeOutputEncoding(req.body.encoding)
    const layers = []
    const previewLayers = []
    let totalRawElementCount = 0
    let totalFeatureCount = 0
    let totalPreviewFeatureCount = 0
    let anyPreviewTruncated = false
    const queries = []

    for (const layerRequest of layerRequests) {
      const query = buildOverpassQueryByTags({
        bbox,
        tags: layerRequest.tags,
        geometryMode: layerRequest.geometryMode,
        timeout: req.body.timeout
      })
      const data = await fetchOverpassJson(query, 65000)
      const { geojson, rawElementCount } = overpassToGeoJson(data, layerRequest.geometryMode)
      const previewGeoJson = limitGeoJsonFeatures(geojson, previewLimit)
      const previewTruncated = geojson.features.length > previewGeoJson.features.length
      totalRawElementCount += rawElementCount
      totalFeatureCount += geojson.features.length
      totalPreviewFeatureCount += previewGeoJson.features.length
      anyPreviewTruncated = anyPreviewTruncated || previewTruncated
      queries.push({ key: layerRequest.key, query })
      layers.push({
        key: layerRequest.key,
        name: layerRequest.name,
        featureCount: geojson.features.length,
        rawElementCount,
        truncated: false,
        tags: layerRequest.tags,
        geojson
      })
      previewLayers.push({
        key: layerRequest.key,
        name: layerRequest.name,
        featureCount: geojson.features.length,
        previewFeatureCount: previewGeoJson.features.length,
        rawElementCount,
        truncated: previewTruncated,
        tags: layerRequest.tags,
        geojson: previewGeoJson
      })
    }

    const metadata = {
      source: 'OpenStreetMap Overpass API',
      targetCrs: 'EPSG:4326',
      bbox,
      areaKm2,
      featureCount: totalFeatureCount,
      previewFeatureCount: totalPreviewFeatureCount,
      rawElementCount: totalRawElementCount,
      truncated: false,
      previewTruncated: anyPreviewTruncated,
      previewLimit,
      outputFormat,
      encoding,
      query: queries.map((item) => item.query).join('\n\n'),
      queries,
      layerSummaries: layers.map((layer, index) => ({
        key: layer.key,
        name: layer.name,
        featureCount: layer.featureCount,
        previewFeatureCount: previewLayers[index]?.previewFeatureCount || 0,
        rawElementCount: layer.rawElementCount,
        previewTruncated: Boolean(previewLayers[index]?.truncated),
        tags: layer.tags
      }))
    }
    const zipBuffer = await createOsmDownloadZipBuffer({
      layers,
      previewLayers,
      outputFormat,
      encoding,
      metadata
    })

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="osm-download.zip"')
    res.setHeader('X-GIS-Download-Meta', encodeURIComponent(JSON.stringify({
      featureCount: totalFeatureCount,
      previewFeatureCount: totalPreviewFeatureCount,
      layerCount: layers.length,
      previewTruncated: anyPreviewTruncated,
      areaKm2
    })))
    res.send(zipBuffer)
  } catch (error) {
    res.status(400).json({ error: `OSM 数据下载失败：${getErrorMessage(error)}` })
  }
})

function isOutOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(lng, lat) {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  ret += (20.0 * Math.sin(6.0 * lng * coordPi) + 20.0 * Math.sin(2.0 * lng * coordPi)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(lat * coordPi) + 40.0 * Math.sin(lat / 3.0 * coordPi)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(lat / 12.0 * coordPi) + 320 * Math.sin(lat * coordPi / 30.0)) * 2.0 / 3.0
  return ret
}

function transformLng(lng, lat) {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  ret += (20.0 * Math.sin(6.0 * lng * coordPi) + 20.0 * Math.sin(2.0 * lng * coordPi)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(lng * coordPi) + 40.0 * Math.sin(lng / 3.0 * coordPi)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(lng / 12.0 * coordPi) + 300.0 * Math.sin(lng / 30.0 * coordPi)) * 2.0 / 3.0
  return ret
}

function wgs84ToGcj02(lng, lat) {
  if (isOutOfChina(lng, lat)) return [lng, lat]
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * coordPi
  let magic = Math.sin(radLat)
  magic = 1 - coordEe * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((coordA * (1 - coordEe)) / (magic * sqrtMagic) * coordPi)
  dLng = (dLng * 180.0) / (coordA / sqrtMagic * Math.cos(radLat) * coordPi)
  return [lng + dLng, lat + dLat]
}

function gcj02ToWgs84(lng, lat) {
  if (isOutOfChina(lng, lat)) return [lng, lat]
  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat)
  return [lng * 2 - gcjLng, lat * 2 - gcjLat]
}

function parseLngLat(value) {
  const [lng, lat] = String(value || '').split(',').map((item) => Number(item))
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return [lng, lat]
}

function createAmapPolygonParam(bbox) {
  const [west, south, east, north] = bbox
  const corners = [
    [west, south],
    [east, south],
    [east, north],
    [west, north]
  ].map(([lng, lat]) => wgs84ToGcj02(lng, lat))
  return corners.map(([lng, lat]) => `${lng},${lat}`).join('|')
}

function amapPoiToFeature(poi, outputCoord) {
  const coord = parseLngLat(poi.location)
  if (!coord) return null
  const coordinates = outputCoord === 'gcj02' ? coord : gcj02ToWgs84(coord[0], coord[1])

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates
    },
    properties: {
      id: poi.id || '',
      name: poi.name || '',
      type: poi.type || '',
      typecode: poi.typecode || '',
      address: Array.isArray(poi.address) ? poi.address.join(' ') : poi.address || '',
      tel: Array.isArray(poi.tel) ? poi.tel.join(';') : poi.tel || '',
      pname: poi.pname || '',
      cityname: poi.cityname || '',
      adname: poi.adname || '',
      business_area: poi.business_area || '',
      gcj02_lng: coord[0],
      gcj02_lat: coord[1]
    }
  }
}

router.post('/amap-poi', async (req, res) => {
  const key = String(req.body.key || '').trim()
  const keywords = String(req.body.keywords || '').trim()
  const types = String(req.body.types || '').trim()
  const city = String(req.body.city || '').trim()
  const bbox = normalizeBbox(req.body.bbox)
  const outputCoord = req.body.outputCoord === 'gcj02' ? 'gcj02' : 'wgs84'
  const pageSize = Math.min(Math.max(Number(req.body.pageSize) || 25, 1), 25)
  const maxPages = Math.min(Math.max(Number(req.body.maxPages) || 3, 1), 40)

  if (!key) return res.status(400).json({ error: '请输入高德 Web 服务 Key' })
  if (!keywords && !types) return res.status(400).json({ error: '请输入关键词或 POI 类型编码' })

  try {
    const allPois = []
    for (let page = 1; page <= maxPages; page += 1) {
      const params = new URLSearchParams({
        key,
        output: 'JSON',
        offset: String(pageSize),
        page: String(page),
        extensions: 'all'
      })
      if (keywords) params.set('keywords', keywords)
      if (types) params.set('types', types)

      let endpoint = AMAP_TEXT_ENDPOINT
      if (bbox) {
        endpoint = AMAP_POLYGON_ENDPOINT
        params.set('polygon', createAmapPolygonParam(bbox))
      } else if (city) {
        params.set('city', city)
        params.set('citylimit', req.body.cityLimit ? 'true' : 'false')
      }

      const data = await fetchJsonWithTimeout(`${endpoint}?${params.toString()}`, {}, 25000)
      if (data.status !== '1') {
        throw new Error(data.info || data.infocode || '高德服务返回失败')
      }

      const pois = Array.isArray(data.pois) ? data.pois : []
      allPois.push(...pois)
      if (pois.length < pageSize) break
    }

    const features = allPois
      .map((poi) => amapPoiToFeature(poi, outputCoord))
      .filter(Boolean)

    res.json({
      source: 'AMap Web Service POI',
      sourceCrs: 'GCJ02',
      targetCrs: outputCoord === 'gcj02' ? 'GCJ02' : 'EPSG:4326',
      keywords,
      types,
      city,
      bbox,
      featureCount: features.length,
      geojson: {
        type: 'FeatureCollection',
        crs: { type: 'name', properties: { name: outputCoord === 'gcj02' ? 'GCJ02' : 'EPSG:4326' } },
        features
      }
    })
  } catch (error) {
    res.status(400).json({ error: `高德 POI 下载失败：${getErrorMessage(error)}` })
  }
})

module.exports = router
