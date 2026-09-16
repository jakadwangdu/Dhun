// Background Audio & Media Session Engine for Dhun

let silentAudioEl = null
let isInitialized = false

/**
 * Initialize visibility interceptors to prevent YouTube iframe
 * from auto-pausing when screen turns off or app is backgrounded.
 */
export function initBackgroundAudioShield() {
  if (typeof window === 'undefined' || isInitialized) return
  isInitialized = true

  try {
    // Intercept visibilitychange event in capturing phase
    window.addEventListener(
      'visibilitychange',
      (e) => {
        // Prevent embedded iframe players from receiving the visibility pause trigger
        e.stopImmediatePropagation()
      },
      true
    )

    // Override document.hidden and document.visibilityState
    try {
      Object.defineProperty(document, 'hidden', {
        get: () => false,
        configurable: true
      })
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'visible',
        configurable: true
      })
    } catch (e) {
      // Ignore if browser prevents redefining
    }
  } catch (err) {
    console.warn('Background shield warning:', err)
  }
}

/**
 * Anchors Android OS Audio Focus using a minimal, silent looping audio element.
 * This signals to Android AudioManager that the app is actively playing media,
 * preventing the system from killing the WebView or dropping audio in background.
 */
export function startAudioKeeper() {
  if (typeof document === 'undefined') return

  try {
    if (!silentAudioEl) {
      silentAudioEl = document.createElement('audio')
      silentAudioEl.id = 'dhun-audio-keeper'
      silentAudioEl.setAttribute('loop', 'true')
      silentAudioEl.setAttribute('playsinline', 'true')
      silentAudioEl.setAttribute('webkit-playsinline', 'true')
      // 1-second silent stereo wav data URI
      silentAudioEl.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
      silentAudioEl.volume = 0.01 // barely above 0 so Android registers active audio output
      document.body.appendChild(silentAudioEl)
    }

    if (silentAudioEl.paused) {
      silentAudioEl.play().catch(() => {})
    }
  } catch (e) {}
}

export function pauseAudioKeeper() {
  if (silentAudioEl && !silentAudioEl.paused) {
    try {
      silentAudioEl.pause()
    } catch (e) {}
  }
}

/**
 * Updates native OS media notification & lock screen controls
 */
export function updateMediaSession(track, isPlaying, handlers = {}) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

  try {
    if (track) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Dhun Audio',
        artist: track.artist || 'Dhun',
        album: 'Dhun • Ultra HD',
        artwork: track.thumbnail
          ? [
              { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '128x128', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '192x192', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '384x384', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }
            ]
          : []
      })
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    if (handlers.onPlay) {
      navigator.mediaSession.setActionHandler('play', handlers.onPlay)
    }
    if (handlers.onPause) {
      navigator.mediaSession.setActionHandler('pause', handlers.onPause)
    }
    if (handlers.onPrev) {
      navigator.mediaSession.setActionHandler('previoustrack', handlers.onPrev)
    }
    if (handlers.onNext) {
      navigator.mediaSession.setActionHandler('nexttrack', handlers.onNext)
    }
    if (handlers.onSeek) {
      navigator.mediaSession.setActionHandler('seekto', handlers.onSeek)
    }
  } catch (err) {
    console.warn('MediaSession update warning:', err)
  }
}
