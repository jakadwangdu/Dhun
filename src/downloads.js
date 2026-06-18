const DB_NAME = 'dhun_downloads'
const DB_VERSION = 1
const STORE_NAME = 'audio'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('folder', 'folder', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = (e) => resolve(e.target.result)
    request.onerror = (e) => reject(e.target.error)
  })
}

export async function getAllDownloads() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export async function saveDownload(entry) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(entry)
    request.onsuccess = () => resolve()
    request.onerror = (e) => reject(e.target.error)
  })
}

export async function deleteDownload(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = (e) => reject(e.target.error)
  })
}

export async function captureYouTubeAudio() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: false
  })

  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) {
    stream.getTracks().forEach(t => t.stop())
    throw new Error('No audio captured. Please enable "Share audio" when selecting the tab.')
  }

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4'

  return new Promise((resolve, reject) => {
    const chunks = []
    let finished = false
    const recorder = new MediaRecorder(stream, { mimeType })

    const finish = () => {
      if (finished) return
      finished = true
      if (recorder.state === 'recording') recorder.stop()
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunks, { type: mimeType })
      resolve(blob)
    }

    recorder.onerror = () => {
      stream.getTracks().forEach(t => t.stop())
      reject(new Error('Recording failed'))
    }

    recorder.start(1000)

    setTimeout(finish, 300000)

    audioTracks[0].addEventListener('ended', finish)
  })
}

export async function readFileAsBlob(file) {
  const arrayBuffer = await file.arrayBuffer()
  return new Blob([arrayBuffer], { type: file.type })
}

export function timestamp() {
  return Date.now()
}

export function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read video file'))
    }
    video.src = url
  })
}
