// Dhun Service Worker - Offline Audio & Shell Cache with Range Request Handling

const CACHE_NAME = 'dhun-shell-v1'
const AUDIO_CACHE = 'dhun-offline-audio-v1'

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/logo_vector.svg'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {})
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== AUDIO_CACHE) {
            return caches.delete(key)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Handle Range requests for audio
  if (req.headers.has('range')) {
    event.respondWith(handleRangeRequest(req))
    return
  }

  // Handle navigation requests
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match('/index.html')
      })
    )
    return
  }

  // General cache-first for offline audio or static assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((response) => {
        return response
      }).catch(() => {
        // Return empty or fallback if unavailable offline
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' })
      })
    })
  )
})

async function handleRangeRequest(request) {
  const cache = await caches.open(AUDIO_CACHE)
  let response = await cache.match(request.url)
  if (!response) {
    try {
      response = await fetch(request)
      return response
    } catch (err) {
      return new Response('Audio stream unavailable offline', { status: 503 })
    }
  }

  const rangeHeader = request.headers.get('range')
  if (!rangeHeader) return response

  const arrayBuffer = await response.arrayBuffer()
  const bytes = /^bytes=(\d+)-(\d+)?$/g.exec(rangeHeader)

  if (bytes) {
    const start = Number(bytes[1])
    const end = Number(bytes[2]) || arrayBuffer.byteLength - 1
    const sliced = arrayBuffer.slice(start, end + 1)

    return new Response(sliced, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Range': `bytes ${start}-${end}/${arrayBuffer.byteLength}`,
        'Content-Length': String(sliced.byteLength),
        'Accept-Ranges': 'bytes'
      }
    })
  }

  return response
}
