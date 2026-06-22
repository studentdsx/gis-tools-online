import * as shapefile from 'shapefile'
import * as shpwrite from '@mapbox/shp-write'
import JSZip from 'jszip'
import proj4 from 'proj4'
import iconv from 'iconv-lite'
import { Buffer } from 'buffer'

if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  globalThis.Buffer = Buffer
}

export const outputFormatOptions = [
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'shp', label: 'Shapefile (.zip)' }
]

export const outputEncodingOptions = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK' }
]

export function sanitizeFileName(name, fallback = 'layer') {
  return String(name || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || fallback
}

export function normalizeCrs(value) {
  if (!value || typeof value !== 'string') return ''
  const trimmed = value.trim()
  const epsg = trimmed.match(/^(?:EPSG[:/])?(\d+)$/i)
  return epsg ? `EPSG:${epsg[1]}` : trimmed
}

export function isWgs84(crs) {
  return !crs || /EPSG:4326/i.test(crs) || /WGS_1984/i.test(crs)
}

export function getGeoJsonCrs(geojson) {
  const name = geojson?.crs?.properties?.name
  const match = typeof name === 'string' ? name.match(/EPSG[:/](\d+)/i) : null
  return match ? `EPSG:${match[1]}` : ''
}

export function getPrjCrs(prjText) {
  if (!prjText) return ''
  const epsg = prjText.match(/AUTHORITY\["EPSG","(\d+)"\]/i) || prjText.match(/EPSG[:"]+(\d+)/i)
  return epsg ? `EPSG:${epsg[1]}` : prjText
}

export function getWgs84Prj() {
  return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'
}

const FALLBACK_PRJ = {
  'EPSG:4326': getWgs84Prj(),
  'EPSG:3857': 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",0],PARAMETER["Standard_Parallel_1",0],PARAMETER["Auxiliary_Sphere_Type",0],UNIT["Meter",1]]',
  'EPSG:4490': 'GEOGCS["China_Geodetic_Coordinate_System_2000",DATUM["D_China_2000",SPHEROID["CGCS2000",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]',
  'EPSG:3395': 'PROJCS["WGS_1984_World_Mercator",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Mercator"],PARAMETER["False_Easting",0],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",0],PARAMETER["Standard_Parallel_1",0],UNIT["Meter",1]]',
  'EPSG:32649': 'PROJCS["WGS_1984_UTM_Zone_49N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",111],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0],UNIT["Meter",1]]',
  'EPSG:32650': 'PROJCS["WGS_1984_UTM_Zone_50N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",117],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0],UNIT["Meter",1]]',
  'EPSG:32651': 'PROJCS["WGS_1984_UTM_Zone_51N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",123],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0],UNIT["Meter",1]]'
}

export function getSpatialReferencePrj(crs, spatialReference = null) {
  if (spatialReference?.srText) return spatialReference.srText
  const normalized = normalizeCrs(crs).toUpperCase()
  if (FALLBACK_PRJ[normalized]) return FALLBACK_PRJ[normalized]
  return isWgs84(crs) ? getWgs84Prj() : ''
}

export function registerSpatialReference(spatialReference) {
  if (!spatialReference?.code || !spatialReference?.proj4Text) return
  try {
    proj4.defs(normalizeCrs(spatialReference.code), spatialReference.proj4Text)
  } catch (error) {
    // Bad external CRS definitions should fail at transform time with a clear message.
  }
}

export function registerSpatialReferences(spatialReferences = []) {
  spatialReferences.forEach(registerSpatialReference)
}

function transformCoord(coord, sourceCrs, targetCrs) {
  const transformed = proj4(sourceCrs, targetCrs, [Number(coord[0]), Number(coord[1])])
  return coord.length > 2 ? [...transformed, ...coord.slice(2)] : transformed
}

export function transformCoordinates(coords, sourceCrs, targetCrs) {
  if (!Array.isArray(coords)) return coords
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return transformCoord(coords, sourceCrs, targetCrs)
  }
  return coords.map((item) => transformCoordinates(item, sourceCrs, targetCrs))
}

export function transformGeometry(geometry, sourceCrs, targetCrs) {
  if (!geometry) return geometry
  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: (geometry.geometries || []).map((item) => transformGeometry(item, sourceCrs, targetCrs))
    }
  }
  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates, sourceCrs, targetCrs)
  }
}

export function transformGeoJsonCrs(geojson, sourceCrs, targetCrs, options = {}) {
  const fromCrs = normalizeCrs(sourceCrs)
  const toCrs = normalizeCrs(targetCrs)
  if (!geojson || geojson.type !== 'FeatureCollection') {
    throw new Error('输入数据不是 GeoJSON FeatureCollection')
  }
  if (!fromCrs) throw new Error('请选择输入坐标系')
  if (!toCrs) throw new Error('请选择输出坐标系')

  registerSpatialReferences(options.spatialReferences || [])
  registerSpatialReference(options.sourceReference)
  registerSpatialReference(options.targetReference)

  if (fromCrs === toCrs || (isWgs84(fromCrs) && isWgs84(toCrs))) {
    return {
      ...geojson,
      crs: { type: 'name', properties: { name: toCrs } },
      features: (geojson.features || []).map((feature) => ({ ...feature }))
    }
  }

  return {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: toCrs } },
    features: (geojson.features || []).map((feature) => ({
      ...feature,
      geometry: transformGeometry(feature.geometry, fromCrs, toCrs)
    }))
  }
}

export function cloneGeoJson(geojson) {
  return JSON.parse(JSON.stringify(geojson || { type: 'FeatureCollection', features: [] }))
}

export function encodeText(text, encoding = 'utf-8') {
  if (String(encoding).toLowerCase() === 'gbk') {
    return iconv.encode(text, 'gbk')
  }
  return new TextEncoder().encode(text)
}

export function getFileBaseName(name) {
  return String(name || 'layer').replace(/\.[^.]+$/g, '')
}

export async function readVectorFilesAsGeoJson(files, options = {}) {
  const fileList = Array.from(files || [])
  const geojsonFile = fileList.find((file) => /\.(geojson|json)$/i.test(file.name))
  const encoding = options.encoding || 'utf-8'

  if (geojsonFile) {
    const geojson = JSON.parse(await geojsonFile.text())
    return {
      geojson,
      sourceCrs: normalizeCrs(options.sourceCrs) || getGeoJsonCrs(geojson),
      name: getFileBaseName(geojsonFile.name)
    }
  }

  const shpFile = fileList.find((file) => /\.shp$/i.test(file.name))
  if (!shpFile) {
    throw new Error('请选择 GeoJSON，或同时选择 Shapefile 的 .shp/.dbf，可选 .prj。')
  }

  const dbfFile = fileList.find((file) => /\.dbf$/i.test(file.name))
  const prjFile = fileList.find((file) => /\.prj$/i.test(file.name))
  const geojson = await shapefile.read(
    await shpFile.arrayBuffer(),
    dbfFile ? await dbfFile.arrayBuffer() : undefined,
    { encoding }
  )

  return {
    geojson,
    sourceCrs: normalizeCrs(options.sourceCrs) || (prjFile ? getPrjCrs(await prjFile.text()) : ''),
    name: getFileBaseName(shpFile.name)
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export async function saveBlobWithPicker(blob, fileName, pickerOptions) {
  try {
    const saveHandle = await requestSaveFileHandle(fileName, pickerOptions)
    if (saveHandle) {
      return writeBlobToSaveHandle(saveHandle, blob, fileName)
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
  }

  downloadBlob(blob, fileName)
  return fileName
}

export async function requestSaveFileHandle(fileName, pickerOptions) {
  if (typeof window === 'undefined' || !window.showSaveFilePicker) return null
  return window.showSaveFilePicker({
    suggestedName: fileName,
    types: pickerOptions
  })
}

export async function writeBlobToSaveHandle(handle, blob, fallbackName) {
  if (!handle) {
    downloadBlob(blob, fallbackName)
    return fallbackName
  }
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
  return handle.name || fallbackName
}

function formatDbfDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function getDbfValueType(values) {
  const definedValues = values.filter((value) => value != null && value !== '')
  if (!definedValues.length) return 'C'
  if (definedValues.every((value) => typeof value === 'boolean')) return 'L'
  if (definedValues.every((value) => Number.isFinite(Number(value)))) return 'N'
  if (definedValues.every((value) => value instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(value)))) return 'D'
  return 'C'
}

function normalizeDbfFieldName(name, index, usedNames) {
  const ascii = String(name || `field_${index + 1}`)
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() || `FIELD_${index + 1}`
  let fieldName = ascii.slice(0, 10)
  let suffix = 2
  while (usedNames.has(fieldName)) {
    const tag = String(suffix)
    fieldName = `${ascii.slice(0, Math.max(1, 10 - tag.length))}${tag}`
    suffix += 1
  }
  usedNames.add(fieldName)
  return fieldName
}

function inferDbfFields(rows, encoding) {
  const keys = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key))
    return set
  }, new Set()))
  const sourceKeys = keys.length ? keys : ['FID']
  const usedNames = new Set()

  return sourceKeys.map((key, index) => {
    const values = rows.map((row, rowIndex) => key === 'FID' ? rowIndex + 1 : row?.[key])
    const type = getDbfValueType(values)
    let length = 1
    let decimals = 0

    if (type === 'N') {
      const hasDecimal = values.some((value) => String(value ?? '').includes('.'))
      length = hasDecimal ? 24 : 18
      decimals = hasDecimal ? 8 : 0
    } else if (type === 'D') {
      length = 8
    } else if (type === 'L') {
      length = 1
    } else {
      length = Math.max(1, ...values.map((value) => encodeText(value == null ? '' : String(value), encoding).length))
      length = Math.min(Math.max(length, 8), 254)
    }

    return {
      sourceKey: key,
      name: normalizeDbfFieldName(key, index, usedNames),
      type,
      length,
      decimals
    }
  })
}

function writeAscii(target, offset, value, length) {
  const text = String(value || '').slice(0, length)
  for (let index = 0; index < length; index += 1) {
    target[offset + index] = index < text.length ? text.charCodeAt(index) : 0
  }
}

function getDbfFieldText(value, field) {
  if (value == null || value === '') return ''
  if (field.type === 'N') {
    const number = Number(value)
    return Number.isFinite(number) ? number.toFixed(field.decimals).replace(/\.?0+$/, '') : ''
  }
  if (field.type === 'L') return value ? 'T' : 'F'
  if (field.type === 'D') return formatDbfDate(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function encodeDbfField(value, field, encoding) {
  let text = getDbfFieldText(value, field)
  if (field.type === 'N') return encodeText(text.padStart(field.length, ' '), 'utf-8')
  if (field.type === 'L' || field.type === 'D') return encodeText(text.padEnd(field.length, ' '), 'utf-8')

  while (encodeText(text, encoding).length > field.length) {
    text = text.slice(0, -1)
  }
  const encoded = encodeText(text, encoding)
  const output = new Uint8Array(field.length)
  output.fill(0x20)
  output.set(encoded.slice(0, field.length))
  return output
}

export function createDbfBuffer(rows = [], encoding = 'utf-8') {
  const normalizedRows = rows.length ? rows : [{}]
  const fields = inferDbfFields(normalizedRows, encoding)
  const headerLength = 32 + fields.length * 32 + 1
  const recordLength = 1 + fields.reduce((sum, field) => sum + field.length, 0)
  const buffer = new ArrayBuffer(headerLength + normalizedRows.length * recordLength + 1)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const now = new Date()

  bytes.fill(0)
  view.setUint8(0, 0x03)
  view.setUint8(1, now.getFullYear() - 1900)
  view.setUint8(2, now.getMonth() + 1)
  view.setUint8(3, now.getDate())
  view.setUint32(4, normalizedRows.length, true)
  view.setUint16(8, headerLength, true)
  view.setUint16(10, recordLength, true)
  view.setUint8(29, String(encoding).toLowerCase() === 'gbk' ? 0x4d : 0x57)

  fields.forEach((field, index) => {
    const offset = 32 + index * 32
    writeAscii(bytes, offset, field.name, 11)
    view.setUint8(offset + 11, field.type.charCodeAt(0))
    view.setUint8(offset + 16, field.length)
    view.setUint8(offset + 17, field.decimals)
  })
  bytes[headerLength - 1] = 0x0d

  normalizedRows.forEach((row, rowIndex) => {
    let offset = headerLength + rowIndex * recordLength
    bytes[offset] = 0x20
    offset += 1
    fields.forEach((field) => {
      const value = field.sourceKey === 'FID' ? rowIndex + 1 : row?.[field.sourceKey]
      const encoded = encodeDbfField(value, field, encoding)
      bytes.set(encoded.slice(0, field.length), offset)
      offset += field.length
    })
  })
  bytes[bytes.length - 1] = 0x1a

  return buffer
}

function pushShpGeometry(groups, geometry, properties) {
  if (!geometry) return
  if (geometry.type === 'GeometryCollection') {
    ;(geometry.geometries || []).forEach((item) => pushShpGeometry(groups, item, properties))
    return
  }

  const row = { ...(properties || {}) }
  if (geometry.type === 'Point') {
    groups.point.rows.push(row)
    groups.point.geometries.push(geometry.coordinates)
    return
  }
  if (geometry.type === 'MultiPoint') {
    ;(geometry.coordinates || []).forEach((coordinates, index) => {
      groups.point.rows.push({ ...row, PART_INDEX: index + 1 })
      groups.point.geometries.push(coordinates)
    })
    return
  }
  if (geometry.type === 'LineString') {
    groups.line.rows.push(row)
    groups.line.geometries.push([geometry.coordinates])
    return
  }
  if (geometry.type === 'MultiLineString') {
    groups.line.rows.push(row)
    groups.line.geometries.push(geometry.coordinates)
    return
  }
  if (geometry.type === 'Polygon') {
    groups.polygon.rows.push(row)
    groups.polygon.geometries.push(geometry.coordinates)
    return
  }
  if (geometry.type === 'MultiPolygon') {
    groups.polygon.rows.push(row)
    groups.polygon.geometries.push(geometry.coordinates)
  }
}

function getShpExportGroups(geojson) {
  const groups = {
    point: { type: 'POINT', rows: [], geometries: [] },
    line: { type: 'POLYLINE', rows: [], geometries: [] },
    polygon: { type: 'POLYGON', rows: [], geometries: [] }
  }

  ;(geojson.features || []).forEach((feature) => {
    pushShpGeometry(groups, feature.geometry, feature.properties)
  })

  if (!Object.values(groups).some((group) => group.geometries.length)) {
    throw new Error('当前结果没有可导出的点、线、面几何')
  }

  return groups
}

function writeShpGroup(rows, geometryType, geometries) {
  return new Promise((resolve, reject) => {
    shpwrite.write(rows, geometryType, geometries, (error, files) => {
      if (error) reject(error)
      else resolve(files)
    })
  })
}

async function addShpGroupToZip(zipFolder, fileName, group, options) {
  if (!group.geometries.length) return
  const files = await writeShpGroup(group.rows, group.type, group.geometries)
  zipFolder.file(`${fileName}.shp`, files.shp.buffer, { binary: true })
  zipFolder.file(`${fileName}.shx`, files.shx.buffer, { binary: true })
  zipFolder.file(`${fileName}.dbf`, createDbfBuffer(group.rows, options.encoding), { binary: true })
  zipFolder.file(`${fileName}.prj`, options.prjText || '')
  zipFolder.file(`${fileName}.cpg`, String(options.encoding).toLowerCase() === 'gbk' ? 'GBK' : 'UTF-8')
}

export async function createShpZipBlob(geojson, options = {}) {
  const baseName = sanitizeFileName(options.outputName, 'layer')
  const groups = getShpExportGroups(geojson)
  const zip = new JSZip()
  const folder = zip.folder(baseName) || zip
  const context = {
    encoding: options.encoding || 'utf-8',
    prjText: options.prjText || getSpatialReferencePrj(options.crs, options.spatialReference)
  }

  await addShpGroupToZip(folder, `${baseName}_point`, groups.point, context)
  await addShpGroupToZip(folder, `${baseName}_line`, groups.line, context)
  await addShpGroupToZip(folder, `${baseName}_polygon`, groups.polygon, context)

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function addGeoJsonOutputToZip(zip, layer, options = {}) {
  const outputName = sanitizeFileName(layer.outputName || layer.name, 'layer')
  const crs = normalizeCrs(options.crs || layer.crs || 'EPSG:4326')
  const encoding = options.encoding || 'utf-8'
  const text = JSON.stringify({
    ...layer.geojson,
    crs: crs ? { type: 'name', properties: { name: crs } } : layer.geojson?.crs
  }, null, 2)
  zip.file(`${outputName}.geojson`, encodeText(text, encoding))
}

export async function addShpOutputToZip(zip, layer, options = {}) {
  const outputName = sanitizeFileName(layer.outputName || layer.name, 'layer')
  const blob = await createShpZipBlob(layer.geojson, {
    outputName,
    encoding: options.encoding || 'utf-8',
    crs: options.crs || layer.crs || 'EPSG:4326',
    spatialReference: options.spatialReference
  })
  const layerZip = await JSZip.loadAsync(blob)
  const folder = zip.folder(outputName) || zip
  const entries = Object.values(layerZip.files)
  await Promise.all(entries.map(async (entry) => {
    if (entry.dir) return
    const relativePath = entry.name.split('/').slice(1).join('/') || entry.name
    folder.file(relativePath, await entry.async('arraybuffer'), { binary: true })
  }))
}

export async function createMultiGeoJsonOutputZipBlob(layers = [], options = {}) {
  const zip = new JSZip()
  const validLayers = layers.filter((layer) => layer?.geojson?.features?.length)
  if (!validLayers.length) throw new Error('没有可导出的结果图层')

  for (const layer of validLayers) {
    if (options.outputFormat === 'shp') {
      await addShpOutputToZip(zip, layer, options)
    } else {
      await addGeoJsonOutputToZip(zip, layer, options)
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function saveGeoJsonOutput(options = {}) {
  const output = await createGeoJsonOutputBlob(options)
  if (options.saveHandle) {
    return writeBlobToSaveHandle(options.saveHandle, output.blob, output.fileName)
  }
  return saveBlobWithPicker(output.blob, output.fileName, output.pickerOptions)
}

export function getOutputFileName(options = {}) {
  const outputName = sanitizeFileName(options.outputName, 'layer')
  const outputFormat = options.outputFormat || 'geojson'
  if (options.multi) return `${outputName}.zip`
  return outputFormat === 'shp' ? `${outputName}.zip` : `${outputName}.geojson`
}

export function getOutputPickerOptions(options = {}) {
  const outputFormat = options.outputFormat || 'geojson'
  if (outputFormat === 'shp' || options.multi) {
    return [
      {
        description: options.multi ? '下载结果压缩包' : 'Shapefile 压缩包',
        accept: { 'application/zip': ['.zip'] }
      }
    ]
  }
  return [
    {
      description: 'GeoJSON 文件',
      accept: {
        'application/geo+json': ['.geojson'],
        'application/json': ['.json']
      }
    }
  ]
}

export async function createGeoJsonOutputBlob(options = {}) {
  const outputName = sanitizeFileName(options.outputName, 'layer')
  const outputFormat = options.outputFormat || 'geojson'
  const encoding = options.encoding || 'utf-8'
  const crs = normalizeCrs(options.crs || 'EPSG:4326')
  const spatialReference = options.spatialReference || null

  if (outputFormat === 'shp') {
    const fileName = `${outputName}.zip`
    const blob = await createShpZipBlob(options.geojson, {
      outputName,
      encoding,
      crs,
      spatialReference
    })
    return {
      blob,
      fileName,
      pickerOptions: getOutputPickerOptions(options)
    }
  }

  const fileName = `${outputName}.geojson`
  const text = JSON.stringify({
    ...options.geojson,
    crs: crs ? { type: 'name', properties: { name: crs } } : options.geojson?.crs
  }, null, 2)
  const blob = new Blob([encodeText(text, encoding)], {
    type: `application/geo+json;charset=${encoding}`
  })
  return {
    blob,
    fileName,
    pickerOptions: getOutputPickerOptions(options)
  }
}
