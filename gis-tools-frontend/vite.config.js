import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_DEV_API_PROXY || 'http://localhost:3000'
  const configureApiProxy = (proxy) => {
    proxy.on('error', (err, req, res) => {
      if (res.headersSent) return
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        error: `后端服务不可用：无法连接 ${apiProxyTarget}，请先启动或重启后端服务。`
      }))
    })
  }

  return {
    plugins: [
      vue(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        buffer: 'buffer'
      },
    },
    define: {
      global: 'globalThis'
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          configure: configureApiProxy,
        },
      },
    },
    preview: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          configure: configureApiProxy,
        },
      },
    },
  }
})
