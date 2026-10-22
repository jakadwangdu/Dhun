// Offline Downloads Manager using Cache Storage & LocalStorage for Dhun

const CACHE_NAME = 'dhun-offline-audio-v1'
const META_KEY = 'dhun_offline_tracks_meta'

export const getDownloadedTracks = () => {
  try {
    const raw = localStorage.getItem(META_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.warn('Failed to parse downloaded tracks metadata:', e)
    return []
  }
}

export const isTrackDownloaded = (trackId) => {
  if (!trackId) return false
  const list = getDownloadedTracks()
  return list.some((t) => String(t.id) === String(trackId))
}

export const requestPersistentStorage = async () => {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist()
    } catch (e) {
      return false
    }
  }
  return false
}

export const getStorageUsageEstimate = async () => {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const { quota, usage } = await navigator.storage.estimate()
      return {
        quotaBytes: quota || 0,
        usageBytes: usage || 0,
        usageMB: ((usage || 0) / (1024 * 1024)).toFixed(1),
        quotaMB: ((quota || 0) / (1024 * 1024)).toFixed(1)
      }
    } catch (e) {
      return null
    }
  }
  return null
}

export const downloadTrack = async (track, onProgress) => {
  if (!track) throw new Error('No track specified')
  if (!track.src) {
    throw new Error('Direct audio source is not available for offline download')
  }

  if (isTrackDownloaded(track.id)) {
    return { status: 'already_saved' }
  }

  if (typeof window === 'undefined' || !('caches' in window)) {
    throw new Error('Cache Storage is not supported in this environment')
  }

  const response = await fetch(track.src)
  if (!response.ok) {
    throw new Error(`Failed to fetch audio stream (${response.status})`)
  }

  const contentLength = response.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : 0
  let loaded = 0

  const reader = response.body.getReader()
  const chunks = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total > 0 && onProgress) {
      onProgress(Math.round((loaded / total) * 100))
    }
  }

  const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' })
  const cache = await caches.open(CACHE_NAME)
  const cachedResponse = new Response(blob, {
    headers: {
      'Content-Type': blob.type,
      'Content-Length': String(blob.size),
      'Accept-Ranges': 'bytes'
    }
  })

  // Store in Cache Storage under track.src key or track.id URL
  await cache.put(track.src, cachedResponse)

  // Save metadata
  const list = getDownloadedTracks()
  const meta = {
    id: String(track.id),
    title: track.title,
    artist: track.artist,
    album: track.album || 'Downloaded',
    year: track.year || '',
    d: track.d || 0,
    img: track.img || '',
    src: track.src,
    sizeBytes: blob.size,
    downloadedAt: new Date().toISOString()
  }

  list.unshift(meta)
  localStorage.setItem(META_KEY, JSON.stringify(list))

  return { status: 'saved', meta }
}

export const getOfflineAudioBlobUrl = async (track) => {
  if (!track || !track.src) return null
  if (typeof window === 'undefined' || !('caches' in window)) return null

  try {
    const cache = await caches.open(CACHE_NAME)
    const match = await cache.match(track.src)
    if (!match) return null
    const blob = await match.blob()
    return URL.createObjectURL(blob)
  } catch (e) {
    console.warn('Error reading offline cached audio:', e)
    return null
  }
}

export const removeDownloadedTrack = async (trackId) => {
  const list = getDownloadedTracks()
  const target = list.find((t) => String(t.id) === String(trackId))
  if (!target) return false

  if (typeof window !== 'undefined' && 'caches' in window && target.src) {
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.delete(target.src)
    } catch (e) {}
  }

  const updated = list.filter((t) => String(t.id) !== String(trackId))
  localStorage.setItem(META_KEY, JSON.stringify(updated))
  return true
}

export const removeAllDownloads = async () => {
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      await caches.delete(CACHE_NAME)
    } catch (e) {}
  }
  localStorage.removeItem(META_KEY)
  return true
}
