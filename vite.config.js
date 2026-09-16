import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const YOUTUBE_API_KEY = env.VITE_YOUTUBE_API_KEY || env.YOUTUBE_API_KEY || ''

  return {
    plugins: [react()],
    base: './',
    server: {
      proxy: {
        '/api/youtube': {
          target: 'https://www.googleapis.com/youtube/v3',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/youtube/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const url = new URL(proxyReq.path, 'https://www.googleapis.com')
              url.searchParams.delete('key')
              proxyReq.path = url.pathname + url.search

              const clientKey = proxyReq.getHeader('x-goog-api-key')
              if (!clientKey && YOUTUBE_API_KEY) {
                proxyReq.setHeader('x-goog-api-key', YOUTUBE_API_KEY)
              }
            })
          }
        }
      }
    }
  }
})
