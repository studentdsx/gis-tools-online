const buildTimeConfig = {
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '',
  VITE_MAPBOX_ACCESS_TOKEN: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''
}

function getRuntimeValue(key) {
  const runtimeConfig = typeof window !== 'undefined' ? window.__GIS_TOOLS_CONFIG__ || {} : {}
  const value = runtimeConfig[key] ?? buildTimeConfig[key] ?? ''
  return String(value).trim()
}

export const runtimeConfig = {
  apiBaseUrl: getRuntimeValue('VITE_API_BASE_URL').replace(/\/$/, ''),
  mapboxAccessToken: getRuntimeValue('VITE_MAPBOX_ACCESS_TOKEN')
}
