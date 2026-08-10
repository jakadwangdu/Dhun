import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY || ''

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
              url.searchParams.set('key', YOUTUBE_API_KEY)
              proxyReq.path = url.pathname + url.search
            })
          }
        }
      }
    }
  }
})
