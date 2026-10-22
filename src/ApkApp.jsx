import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { Icon } from './components/Icons'
import { NowPlayingView } from './components/NowPlayingView'
import { playbackEngine } from './utils/audioEngine'
import {
  getDownloadedTracks,
  isTrackDownloaded,
  downloadTrack,
  removeDownloadedTrack,
  removeAllDownloads,
  getStorageUsageEstimate,
  requestPersistentStorage
} from './utils/downloadManager'
import { fetchLastFmTrackInfo, verifyLastFmConnection, searchLastFmTracks } from './utils/lastFmApi'
import { extractAmbianceColor, getAmbianceStyle, createFallbackAmbiance } from './utils/ambianceEngine'
import { DEFAULT_CURATED_PLAYLISTS } from './data/defaultPlaylists'
import { initBackgroundAudioShield, startAudioKeeper, pauseAudioKeeper } from './utils/backgroundAudio'

initBackgroundAudioShield()

const DEFAULT_YOUTUBE_API_KEY =
  import.meta.env.VITE_YOUTUBE_API_KEY ||
  import.meta.env.YOUTUBE_API_KEY ||
  'AIzaSyAqEPfSJl94sJgYWPlWYx-ia8wpZ3PgNOY'
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

function getYoutubeApiKey() {
  try {
    const custom = localStorage.getItem('dhun_youtube_api_key')
    return custom && custom.trim() ? custom.trim() : DEFAULT_YOUTUBE_API_KEY
  } catch {
    return DEFAULT_YOUTUBE_API_KEY
  }
}

function decodeHtml(html) {
  if (!html) return ''
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

// Initial Curated Fallback Tracks
const DEMO_SEED = [
  ['Starlit Reverie', 'Budiarti', 'From Zero'],
  ['Midnight Confessions', 'Alexiao', 'From Zero'],
  ['Lost in the Echo', 'Alexiao', 'From Zero'],
  ['Letters I Never Sent', 'Alexiao', 'From Zero'],
  ['Breaking the Silence', 'Mira Vale', 'From Zero'],
  ['Heavy Is the Crown', 'Northgate', 'From Zero'],
  ['Tears on the Vinyl', 'Mira Vale', 'From Zero'],
  ['Toxicity Hours', 'Static Orchard', 'From Zero'],
  ['Back in Black Sand', 'The Lowlights', 'From Zero'],
  ['Echoes to Blank', 'Budiarti', 'From Zero']
]

function norm(x, i = 0) {
  const id = String(x.id || x.videoId || 'track-' + i)
  const title = x.title || x.name || 'Untitled Track'
  const artist = x.artist || x.channel || x.author || 'Dhun Artist'
  const album = x.album || 'Single'
  const year = x.year || '2025'
  const songs = x.songs || 1
  const d = Math.round(x.duration || x.d || 210)
  const img =
    x.thumbnail ||
    x.thumb ||
    x.image ||
    x.img ||
    (x.id && !x.id.startsWith('demo-') && !x.id.startsWith('lastfm-') && !x.id.startsWith('yt-')
      ? `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg`
      : '')
  const src = x.url || x.stream || x.src || ''
  const h = (i * 47 + 20) % 360
  const searchQuery = x.searchQuery || ''
  return { id, title, artist, album, year, songs, d, img, src, h, searchQuery }
}

function enforceHighestQuality(player) {
  if (!player) return
  try {
    const available = typeof player.getAvailableQualityLevels === 'function' ? player.getAvailableQualityLevels() : []
    const hierarchy = ['highres', 'hd1440', 'hd1080', 'hd720', 'large', 'medium']
    for (const q of hierarchy) {
      if (available.includes(q)) {
        player.setPlaybackQuality(q)
        break
      }
    }
  } catch {
    // Ignore quality level error
  }
}

export default function ApkApp() {
  // Body class hook for standalone mobile APK display
  useEffect(() => {
    document.body.classList.add('apk-mode')
    return () => {
      document.body.classList.remove('apk-mode')
    }
  }, [])

  // Navigation & Screen States
  const [tab, setTab] = useState('home') // 'home' | 'mymusic' | 'library' | 'search'
  const [chip, setChip] = useState('All') // 'All' | 'New Release' | 'Trending' | 'Top'
  const [chipLib, setChipLib] = useState('All') // 'All' | 'Playlists' | 'Liked Songs' | 'Downloads'
  const [playerOpen, setPlayerOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)

  // User Profile & Customization Studio
  const [profileOpen, setProfileOpen] = useState(false)
  const [lastFmConnected, setLastFmConnected] = useState(true)
  const [userName, setUserName] = useState(() => {
    try {
      return localStorage.getItem('dhun_user_name') || 'Dhun Listener'
    } catch {
      return 'Dhun Listener'
    }
  })

  // User Customization Settings
  const [userSettings, setUserSettings] = useState(() => {
    try {
      const raw = localStorage.getItem('dhun_user_settings')
      return raw ? JSON.parse(raw) : {
        ambianceMode: 'dynamic', // 'dynamic' | 'aurora' | 'neon' | 'noir'
        ambianceIntensity: 0.75, // 0.2 to 1.0
        hapticsEnabled: true,
        swipeDismissEnabled: true,
        artworkSwipeEnabled: true,
        audioQuality: 'highres', // 'highres' | 'studio' | 'low'
        customLastFmKey: ''
      }
    } catch {
      return {
        ambianceMode: 'dynamic',
        ambianceIntensity: 0.75,
        hapticsEnabled: true,
        swipeDismissEnabled: true,
        artworkSwipeEnabled: true,
        audioQuality: 'highres',
        customLastFmKey: ''
      }
    }
  })

  const updateSettings = useCallback((key, value) => {
    setUserSettings((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem('dhun_user_settings', JSON.stringify(next))
      } catch {
        // Ignore storage error
      }
      return next
    })
  }, [])

  // Dynamic Ambiance & Gesture States
  const [ambianceData, setAmbianceData] = useState(() => createFallbackAmbiance('dhun'))
  const [artSwipeOffset, setArtSwipeOffset] = useState(0)

  // Playback & Queue
  const [tracks, setTracks] = useState(() => {
    const list = []
    let counter = 0
    DEFAULT_CURATED_PLAYLISTS.forEach((pl) => {
      pl.songs.forEach((s) => {
        list.push(norm({ ...s, album: pl.name }, counter++))
      })
    })
    if (list.length === 0) {
      return DEMO_SEED.map((item, idx) =>
        norm({ id: 'demo-' + idx, title: item[0], artist: item[1], album: item[2], d: 180 + idx * 12 }, idx)
      )
    }
    return list
  })

  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [trackDuration, setTrackDuration] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeatMode, setRepeatMode] = useState('off') // 'off' | 'all' | 'one'

  // User Library & Offline
  const [liked, setLiked] = useState(() => {
    try {
      const raw = localStorage.getItem('dhun-liked')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [downloads, setDownloads] = useState(() => getDownloadedTracks())
  const [downloadProgress, setDownloadProgress] = useState({})
  const [storageInfo, setStorageInfo] = useState(null)

  // Search
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const searchInputRef = useRef(null)
  const searchTimer = useRef(null)

  // Toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  // Touch Swipe Gesture Refs for Now Playing Sheet
  const sheetTouchStartY = useRef(0)
  const sheetTouchStartX = useRef(0)
  const sheetTouchDeltaY = useRef(0)
  const sheetTouchTime = useRef(0)
  const [sheetDragY, setSheetDragY] = useState(0)

  // Artwork swipe left/right refs
  const artTouchStartX = useRef(0)
  const artTouchStartY = useRef(0)

  // Mini player touch gesture refs
  const miniTouchStartY = useRef(0)
  const miniTouchStartX = useRef(0)

  // Refs for audio engine
  const tracksRef = useRef(tracks)
  const curRef = useRef(cur)
  const shuffleRef = useRef(shuffle)
  const repeatModeRef = useRef(repeatMode)

  useEffect(() => {
    tracksRef.current = tracks
    curRef.current = cur
    shuffleRef.current = shuffle
    repeatModeRef.current = repeatMode
  }, [tracks, cur, shuffle, repeatMode])

  // Current track
  const currentTrack = useMemo(() => {
    return tracks[cur] || tracks[0] || norm({ title: 'Dhun Audio', artist: 'Dhun' }, 0)
  }, [tracks, cur])

  const showToast = useCallback((msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => {
      setToast(null)
    }, 2800)
  }, [])

  const vibrate = useCallback((ms = 12) => {
    if (!userSettings.hapticsEnabled) return
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms)
      }
    } catch {
      // Ignore vibration error
    }
  }, [userSettings.hapticsEnabled])

  // Derived Dynamic Ambiance Style
  const ambianceStyle = useMemo(() => {
    return getAmbianceStyle(ambianceData, userSettings.ambianceMode, userSettings.ambianceIntensity)
  }, [ambianceData, userSettings.ambianceMode, userSettings.ambianceIntensity])

  // Extract vibrant ambiance color whenever current track changes
  useEffect(() => {
    if (!currentTrack) return
    let isCancelled = false

    const updateAmbiance = async () => {
      const img =
        currentTrack.img ||
        (currentTrack.id && !currentTrack.id.startsWith('demo-')
          ? `https://i.ytimg.com/vi/${currentTrack.id}/hqdefault.jpg`
          : '')
      const amb = await extractAmbianceColor(img, currentTrack.title || 'dhun')
      if (!isCancelled && amb) {
        setAmbianceData(amb)
      }
    }

    updateAmbiance()
    return () => {
      isCancelled = true
    }
  }, [currentTrack])

  // Last.fm Metadata Enrichment
  useEffect(() => {
    if (!currentTrack || !currentTrack.title) return
    let isCancelled = false

    const enrichMetadata = async () => {
      try {
        const info = await fetchLastFmTrackInfo(currentTrack.artist, currentTrack.title)
        if (info && !isCancelled) {
          setTracks((prev) =>
            prev.map((t, idx) => {
              if (idx === curRef.current) {
                return {
                  ...t,
                  album: info.album || t.album,
                  img: info.cover || t.img,
                  tags: info.tags || t.tags
                }
              }
              return t
            })
          )
        }
      } catch {
        // Ignore Last.fm enrichment failure
      }
    }

    enrichMetadata()
    return () => {
      isCancelled = true
    }
  }, [currentTrack])

  // Sync storage estimate
  const refreshStorage = useCallback(async () => {
    const est = await getStorageUsageEstimate()
    if (est) setStorageInfo(est)
    setDownloads(getDownloadedTracks())
  }, [])

  useEffect(() => {
    refreshStorage()
    requestPersistentStorage()
  }, [refreshStorage])

  const handleNextTrack = useCallback(() => {
    const list = tracksRef.current
    if (!list.length) return
    const mode = repeatModeRef.current

    if (mode === 'one') {
      playbackEngine.seekTo(0)
      playbackEngine.resume()
      return
    }

    const nextIndex = shuffleRef.current
      ? Math.floor(Math.random() * list.length)
      : (curRef.current + 1) % list.length

    setCur(nextIndex)
    playbackEngine.playTrack(list[nextIndex])
    setPlaying(true)
  }, [])

  const handlePrevTrack = useCallback(() => {
    const list = tracksRef.current
    if (!list.length) return

    if (pos > 3) {
      playbackEngine.seekTo(0)
      return
    }

    const prevIndex = (curRef.current - 1 + list.length) % list.length
    setCur(prevIndex)
    playbackEngine.playTrack(list[prevIndex])
    setPlaying(true)
  }, [pos])

  // Playback Engine Event Subscriptions
  useEffect(() => {
    const unsubscribe = playbackEngine.subscribe((event, data) => {
      if (event === 'playState') {
        setPlaying(data)
      } else if (event === 'time') {
        setPos(data.current)
        if (data.duration) setTrackDuration(data.duration)
      } else if (event === 'ended') {
        handleNextTrack()
      } else if (event === 'requestPrev') {
        handlePrevTrack()
      } else if (event === 'requestNext') {
        handleNextTrack()
      }
    })
    return () => unsubscribe()
  }, [handleNextTrack, handlePrevTrack])

  // Setup YouTube IFrame Player with highest quality preference
  useEffect(() => {
    const initYT = () => {
      if (typeof window === 'undefined') return
      if (!window.YT || !window.YT.Player) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        window.onYouTubeIframeAPIReady = () => initYTPlayer()
        document.body.appendChild(tag)
      } else {
        initYTPlayer()
      }
    }

    const initYTPlayer = () => {
      const container = document.getElementById('youtube-player-container-apk')
      if (!container || window.dhunApkYTPlayerInstance) return

      try {
        new window.YT.Player('youtube-player-container-apk', {
          height: '100',
          width: '100',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            rel: 0
          },
          events: {
            onReady: (e) => {
              window.dhunApkYTPlayerInstance = e.target
              playbackEngine.setYouTubePlayer(e.target)
            },
            onStateChange: (event) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setPlaying(true)
                playbackEngine.isPlaying = true
                enforceHighestQuality(event.target)
                startAudioKeeper(tracksRef.current[curRef.current])
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setPlaying(false)
                playbackEngine.isPlaying = false
                pauseAudioKeeper()
              } else if (event.data === window.YT.PlayerState.ENDED) {
                handleNextTrack()
              }
            },
            onError: (event) => {
              console.warn('YouTube Player Error:', event.data)
              showToast('Track restricted or unavailable, playing next…')
              setTimeout(() => handleNextTrack(), 500)
            }
          }
        })
      } catch (err) {
        console.warn('YT Player init error:', err)
      }
    }

    initYT()
  }, [handleNextTrack])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        vibrate()
        playbackEngine.toggle()
      } else if (e.code === 'ArrowRight' && !e.shiftKey) {
        e.preventDefault()
        playbackEngine.seekTo(Math.min(pos + 5, currentTrack.d || 300))
      } else if (e.code === 'ArrowLeft' && !e.shiftKey) {
        e.preventDefault()
        playbackEngine.seekTo(Math.max(pos - 5, 0))
      } else if (e.code === 'ArrowRight' && e.shiftKey) {
        e.preventDefault()
        vibrate()
        handleNextTrack()
      } else if (e.code === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault()
        vibrate()
        handlePrevTrack()
      } else if (e.code === 'Escape') {
        if (playerOpen) {
          vibrate()
          setPlayerOpen(false)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pos, currentTrack, playerOpen, handleNextTrack, handlePrevTrack])

  // Play a track by index or track object
  const playTrackAt = useCallback(
    async (target) => {
      vibrate(10)
      let currentTrackList = tracksRef.current || tracks
      let targetTrack = null
      let targetIndex = -1

      if (typeof target === 'number') {
        targetIndex = target
        targetTrack = currentTrackList[target]
      } else {
        const id = typeof target === 'string' ? target : target?.id
        const existingIdx = currentTrackList.findIndex((t) => t.id === id)
        if (existingIdx !== -1) {
          targetIndex = existingIdx
          targetTrack = currentTrackList[existingIdx]
        } else {
          let candidate =
            typeof target === 'object' && target?.id
              ? target
              : results.find((r) => r.id === id)

          if (candidate) {
            targetTrack = candidate

            // If this track has a synthetic ID and needs YouTube videoId resolution
            if (targetTrack.id.startsWith('lastfm-') || targetTrack.id.startsWith('yt-search-')) {
              const queryToResolve = targetTrack.searchQuery || `${targetTrack.title} ${targetTrack.artist}`
              try {
                showToast('Resolving audio stream…')
                const key = getYoutubeApiKey()
                const base = import.meta.env.DEV ? '/api/youtube' : YOUTUBE_API_BASE
                const r = await fetch(
                  `${base}/search?part=snippet&maxResults=1&q=${encodeURIComponent(queryToResolve)}&type=video&key=${encodeURIComponent(key)}`,
                  { headers: { 'X-Goog-Api-Key': key } }
                )
                if (r.ok) {
                  const d = await r.json()
                  if (d.items?.[0]?.id?.videoId) {
                    targetTrack = {
                      ...targetTrack,
                      id: d.items[0].id.videoId
                    }
                  }
                }
              } catch {
                // Keep original
              }
            }

            const updatedTracks = [...currentTrackList, targetTrack]
            targetIndex = updatedTracks.length - 1
            setTracks(updatedTracks)
            tracksRef.current = updatedTracks
          }
        }
      }

      if (targetTrack && targetIndex >= 0) {
        setCur(targetIndex)
        curRef.current = targetIndex
        playbackEngine.playTrack(targetTrack)
        setPlaying(true)
        setPlayerOpen(true)
      }
    },
    [tracks, results, vibrate, showToast]
  )

  const quickToggle = useCallback(
    (trackId) => {
      vibrate(8)
      const index = tracks.findIndex((t) => t.id === trackId)
      if (index === -1) {
        const found = results.find((r) => r.id === trackId)
        if (found) {
          playTrackAt(found)
        }
        return
      }

      if (index === cur) {
        playbackEngine.toggle()
      } else {
        setCur(index)
        playbackEngine.playTrack(tracks[index])
        setPlaying(true)
      }
    },
    [cur, tracks, results, playTrackAt, vibrate]
  )

  // Like Toggle
  const isLiked = useCallback(
    (track) => {
      if (!track) return false
      return liked.includes(track.id)
    },
    [liked]
  )

  const toggleLike = useCallback(
    (track) => {
      if (!track) return
      vibrate()
      setLiked((prev) => {
        const next = prev.includes(track.id) ? prev.filter((id) => id !== track.id) : [...prev, track.id]
        try {
          localStorage.setItem('dhun-liked', JSON.stringify(next))
        } catch {
          // Ignore storage error
        }
        showToast(next.includes(track.id) ? 'Added to Liked Songs' : 'Removed from Liked Songs')
        return next
      })
    },
    [showToast]
  )

  // Download Offline Handler
  const handleDownload = useCallback(
    async (track) => {
      if (!track) return
      vibrate()

      if (isTrackDownloaded(track.id)) {
        showToast('Already saved for offline playback')
        return
      }

      if (!track.src) {
        showToast('Direct stream required for offline download; online streaming active')
        return
      }

      try {
        showToast('Downloading offline copy…')
        setDownloadProgress((prev) => ({ ...prev, [track.id]: 1 }))

        await downloadTrack(track, (pct) => {
          setDownloadProgress((prev) => ({ ...prev, [track.id]: pct }))
        })

        setDownloadProgress((prev) => {
          const copy = { ...prev }
          delete copy[track.id]
          return copy
        })
        refreshStorage()
        showToast('Saved for offline playback')
      } catch (err) {
        console.warn('Download error:', err)
        setDownloadProgress((prev) => {
          const copy = { ...prev }
          delete copy[track.id]
          return copy
        })
        showToast('Download failed. Check your connection.')
      }
    },
    [showToast, refreshStorage]
  )

  const handleDeleteDownload = useCallback(
    async (trackId) => {
      vibrate()
      await removeDownloadedTrack(trackId)
      refreshStorage()
      showToast('Removed from offline downloads')
    },
    [refreshStorage, showToast]
  )

  const handleClearAllDownloads = useCallback(async () => {
    vibrate()
    await removeAllDownloads()
    refreshStorage()
    showToast('All downloads cleared')
  }, [refreshStorage, showToast])

  // Waveform 44 bars calculation
  const waveBars = useMemo(() => {
    return Array.from({ length: 44 }, (_, i) => {
      return 10 + Math.abs(Math.sin(i * 1.7 + cur) * Math.cos(i * 0.53)) * 36 + ((i * 7) % 5) * 2
    })
  }, [cur])

  // Waveform Seek
  const handleWaveSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetSeconds = p * (currentTrack.d || trackDuration || 210)
    vibrate()
    playbackEngine.seekTo(targetSeconds)
  }

  // Cover Art Generator Helper
  const getCoverArtStyle = useCallback(
    (track) => {
      const t = track || currentTrack
      const g = `radial-gradient(circle at 30% 25%, hsl(${t.h} 75% 66%), hsl(${(t.h + 40) % 360} 55% 30%) 70%, #14201b)`
      return t.img
        ? { backgroundImage: `url('${t.img}'), ${g}`, backgroundPosition: 'center', backgroundSize: 'cover' }
        : { backgroundImage: g }
    },
    [currentTrack]
  )

  // Filtered lists
  const homeList = useMemo(() => {
    if (chip === 'All') return tracks.slice(0, 10)
    const chipIdx = ['New Release', 'Trending', 'Top'].indexOf(chip)
    return tracks.filter((_, i) => i % 3 === chipIdx).slice(0, 10)
  }, [chip, tracks])

  const libList = useMemo(() => {
    if (chipLib === 'Liked Songs') {
      return tracks.filter((x) => isLiked(x))
    }
    if (chipLib === 'Downloads') {
      return downloads.map((d, i) => norm(d, i))
    }
    return tracks
  }, [chipLib, tracks, isLiked, downloads])

  // Multi-tier Search logic (debounced 350ms): YouTube API -> Last.fm -> Curated Library
  const executeSearch = useCallback(
    async (query) => {
      const clean = query ? query.trim() : ''
      if (!clean) {
        setResults([])
        setBusy(false)
        return
      }

      setBusy(true)
      const qLower = clean.toLowerCase()

      try {
        // Tier 1: YouTube Data API v3 with bundled key
        const key = getYoutubeApiKey()
        const base = import.meta.env.DEV ? '/api/youtube' : YOUTUBE_API_BASE
        const url = `${base}/search?part=snippet&maxResults=25&q=${encodeURIComponent(clean)}&type=video&videoEmbeddable=true&key=${encodeURIComponent(key)}`
        const resp = await fetch(url, {
          headers: { 'X-Goog-Api-Key': key }
        })

        if (resp.ok) {
          const data = await resp.json()
          if (data.items && data.items.length) {
            const mapped = data.items
              .filter((it) => it.id && it.id.videoId)
              .map((it, idx) =>
                norm(
                  {
                    id: it.id.videoId,
                    title: decodeHtml(it.snippet.title),
                    artist: decodeHtml(it.snippet.channelTitle),
                    album: 'YouTube Music',
                    thumbnail:
                      it.snippet.thumbnails?.high?.url ||
                      it.snippet.thumbnails?.medium?.url ||
                      it.snippet.thumbnails?.default?.url,
                    d: 215
                  },
                  idx
                )
              )
            if (mapped.length > 0) {
              setResults(mapped)
              setBusy(false)
              return
            }
          }
        }
      } catch (err) {
        console.warn('YouTube search API error:', err)
      }

      // Tier 2: Last.fm catalog search fallback
      try {
        const lastFmMatches = await searchLastFmTracks(clean, 15)
        if (lastFmMatches && lastFmMatches.length > 0) {
          const mapped = lastFmMatches.map((m, idx) =>
            norm(
              {
                id: `lastfm-${idx}-${encodeURIComponent(m.title)}`,
                searchQuery: `${m.title} ${m.artist}`,
                title: m.title,
                artist: m.artist,
                album: 'Last.fm Music',
                thumbnail: m.img,
                d: 210
              },
              idx
            )
          )
          setResults(mapped)
          setBusy(false)
          return
        }
      } catch (err) {
        console.warn('Last.fm fallback error:', err)
      }

      // Tier 3: Curated Playlists & Local Library Search
      const curatedPool = []
      DEFAULT_CURATED_PLAYLISTS.forEach((pl) => {
        pl.songs.forEach((s) => {
          curatedPool.push(norm({ ...s, album: pl.name }))
        })
      })
      const fullCatalog = [...tracks, ...curatedPool]
      const seen = new Set()
      const deduped = []
      for (const t of fullCatalog) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          deduped.push(t)
        }
      }

      const tokens = qLower.split(/\s+/).filter(Boolean)
      const matches = deduped.filter((x) => {
        const hay = (x.title + ' ' + x.artist + ' ' + (x.album || '')).toLowerCase()
        return tokens.length > 0 && tokens.every((token) => hay.includes(token))
      })
      setResults(matches)
      setBusy(false)
    },
    [tracks]
  )

  const handleSearchInput = (e) => {
    const val = e.target.value
    setQ(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      executeSearch(val)
    }, 350)
  }

  // Format time mm:ss
  const formatTime = (s) => {
    const sec = Math.floor(s || 0)
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')
  }

  // Touch handlers for Now Playing Sheet pull-down dismiss
  const handleSheetTouchStart = (e) => {
    sheetTouchStartY.current = e.touches[0].clientY
    sheetTouchStartX.current = e.touches[0].clientX
    sheetTouchDeltaY.current = 0
    sheetTouchTime.current = Date.now()
  }

  const handleSheetTouchMove = (e) => {
    const diffY = e.touches[0].clientY - sheetTouchStartY.current
    const diffX = Math.abs(e.touches[0].clientX - sheetTouchStartX.current)
    if (diffY > 0 && diffY > diffX) {
      sheetTouchDeltaY.current = diffY
      setSheetDragY(diffY)
    }
  }

  const handleSheetTouchEnd = () => {
    const elapsed = Math.max(1, Date.now() - sheetTouchTime.current)
    const velocity = sheetTouchDeltaY.current / elapsed
    if (userSettings.swipeDismissEnabled && (sheetTouchDeltaY.current > 110 || velocity > 0.45)) {
      vibrate(15)
      setPlayerOpen(false)
    }
    setSheetDragY(0)
    sheetTouchDeltaY.current = 0
  }

  // Artwork horizontal swipe gesture handlers (left = next, right = prev)
  const handleArtTouchStart = (e) => {
    artTouchStartX.current = e.touches[0].clientX
    artTouchStartY.current = e.touches[0].clientY
  }

  const handleArtTouchMove = (e) => {
    if (!userSettings.artworkSwipeEnabled) return
    const diffX = e.touches[0].clientX - artTouchStartX.current
    const diffY = Math.abs(e.touches[0].clientY - artTouchStartY.current)
    if (Math.abs(diffX) > diffY) {
      setArtSwipeOffset(Math.max(-80, Math.min(80, diffX * 0.4)))
    }
  }

  const handleArtTouchEnd = (e) => {
    if (!userSettings.artworkSwipeEnabled) {
      setArtSwipeOffset(0)
      return
    }
    const diffX = e.changedTouches[0].clientX - artTouchStartX.current
    const diffY = Math.abs(e.changedTouches[0].clientY - artTouchStartY.current)
    if (Math.abs(diffX) > 65 && Math.abs(diffX) > diffY * 1.5) {
      vibrate(18)
      if (diffX < 0) {
        handleNextTrack()
      } else {
        handlePrevTrack()
      }
    }
    setArtSwipeOffset(0)
  }

  // Mini-player touch gesture handlers (swipe up = open, swipe left/right = skip)
  const handleMiniTouchStart = (e) => {
    miniTouchStartY.current = e.touches[0].clientY
    miniTouchStartX.current = e.touches[0].clientX
  }

  const handleMiniTouchEnd = (e) => {
    const diffY = e.changedTouches[0].clientY - miniTouchStartY.current
    const diffX = e.changedTouches[0].clientX - miniTouchStartX.current
    if (diffY < -40 && Math.abs(diffY) > Math.abs(diffX)) {
      vibrate(12)
      setPlayerOpen(true)
    } else if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      vibrate(15)
      if (diffX < 0) {
        handleNextTrack()
      } else {
        handlePrevTrack()
      }
    }
  }

  return (
    <div className="relative app-viewport-height w-screen overflow-hidden bg-ink text-white font-sans select-none">
      {/* Hidden YouTube Player IFrame container */}
      <div id="youtube-player-container-apk" style={{ position: 'absolute', top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

      {/* Dynamic Ambiance Moving Backdrop */}
      <div className="fixed inset-0 -z-0 overflow-hidden pointer-events-none transition-all duration-1000" aria-hidden="true">
        <div
          className="ambiance-mesh absolute inset-0 opacity-40 transition-all duration-1000"
          style={{ background: ambianceStyle.meshGradient || ambianceStyle.background }}
        />
        <div
          className="ambient absolute -left-1/4 -top-1/4 h-[75vh] w-[75vh] rounded-full blur-[110px] transition-all duration-1000"
          style={{
            background: ambianceData.primary || `hsl(${currentTrack.h} 80% 55%)`,
            opacity: userSettings.ambianceIntensity * 0.45
          }}
        />
        <div
          className="ambient absolute -bottom-1/4 -right-1/4 h-[65vh] w-[65vh] rounded-full blur-[110px] transition-all duration-1000"
          style={{
            background: ambianceData.secondary || `hsl(${(currentTrack.h + 80) % 360} 70% 50%)`,
            opacity: userSettings.ambianceIntensity * 0.35
          }}
        />
      </div>

      {/* Film Grain Subtle Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.03]"
        style={{
          backgroundImage:
            "url('data:image/svg+xml;utf8,<svg viewBox=\"0 0 200 200\" xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"noiseFilter\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"100%\" height=\"100%\" filter=\"url(%23noiseFilter)\"/></svg>')"
        }}
      />

      {/* Glass Pill Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full glass-pill px-5 py-2.5 text-sm font-medium text-white shadow-2xl transition-all duration-300 animate-bounce-short">
          <span className="h-2 w-2 rounded-full bg-mint" />
          <span>{toast}</span>
        </div>
      )}

      {/* Main App Container: 430px column centered on desktop */}
      <div className="relative z-10 mx-auto h-full max-w-[430px] overflow-hidden bg-ink/80 sm:border-x sm:border-white/5">
        {/* ===================== HOME SCREEN ===================== */}
        {tab === 'home' && (
          <section className="screen noscroll animate-fade-in">
            <header className="flex items-center justify-between">
              <button
                onClick={() => {
                  vibrate(10)
                  setProfileOpen(true)
                }}
                className="grid h-11 w-11 place-items-center rounded-full bg-lime text-lg font-extrabold text-ink transition active:scale-95 shadow-lg relative group"
                aria-label="User profile & customization"
              >
                {userName[0] || 'D'}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-mint border-2 border-ink" />
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    vibrate()
                    setTab('search')
                    setTimeout(() => searchInputRef.current?.focus(), 100)
                  }}
                  className="grid h-11 w-11 place-items-center rounded-full bg-raise text-white transition active:scale-95"
                  aria-label="Search"
                >
                  <Icon name="search" size={20} />
                </button>
                <button
                  onClick={() => {
                    vibrate()
                    setTab('mymusic')
                    setChipLib('Liked Songs')
                  }}
                  className="grid h-11 w-11 place-items-center rounded-full bg-raise text-white transition active:scale-95"
                  aria-label="Liked songs"
                >
                  <Icon name="heart" size={20} />
                </button>
              </div>
            </header>

            <h1 className="mt-6 text-[32px] font-bold leading-tight">Hi, {userName}</h1>

            {/* Filter chips */}
            <div className="noscroll -mx-5 mt-5 flex gap-3 overflow-x-auto px-5">
              {['All', 'New Release', 'Trending', 'Top'].map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    vibrate()
                    setChip(c)
                  }}
                  className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition active:scale-95 ${
                    chip === c ? 'bg-lime text-ink' : 'bg-raise text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Featured Discover Weekly Card */}
            <h2 className="mt-8 text-xl font-bold">Curated &amp; trending</h2>
            <div className="relative mt-4 h-48 overflow-hidden rounded-[28px] bg-lilac p-5 text-ink transition-all">
              <div
                className="absolute -right-6 top-0 h-full w-[48%] rounded-l-[60px]"
                style={getCoverArtStyle(tracks[0] || currentTrack)}
              />
              <h3 className="text-xl font-extrabold">{tracks[0]?.title || 'Discover weekly'}</h3>
              <p className="mt-1 max-w-[50%] text-[13px] font-medium leading-snug opacity-80">
                {tracks[0]?.artist || 'The original slow instrumental best playlists'}
              </p>
              <div className="absolute bottom-5 left-5 flex items-center gap-3">
                <button
                  onClick={() => playTrackAt(0)}
                  className="grid h-12 w-12 place-items-center rounded-full bg-ink text-lilac transition active:scale-90"
                  aria-label="Play Discover weekly"
                >
                  <Icon name="play" size={20} />
                </button>
                <button
                  onClick={() => toggleLike(tracks[0])}
                  className="grid h-9 w-9 place-items-center text-ink transition active:scale-90"
                  aria-label="Like"
                >
                  <Icon name="heart" size={20} fill={isLiked(tracks[0])} />
                </button>
                <button
                  onClick={() => handleDownload(tracks[0])}
                  className="grid h-9 w-9 place-items-center text-ink transition active:scale-90"
                  aria-label="Download"
                >
                  <Icon name={isTrackDownloaded(tracks[0]?.id) ? 'check' : 'download'} size={20} />
                </button>
              </div>
            </div>

            {/* Top Daily Playlists */}
            <div className="mt-8 flex items-baseline justify-between">
              <h2 className="text-xl font-bold">Top daily playlists</h2>
              <button
                onClick={() => {
                  vibrate()
                  setTab('mymusic')
                }}
                className="text-sm font-medium text-mute transition hover:text-white"
              >
                See all
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              {homeList.map((x) => {
                const isCurrent = currentTrack.id === x.id
                return (
                  <li key={x.id} className="flex items-center gap-4">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-4 text-left transition active:opacity-75"
                      onClick={() => playTrackAt(x)}
                    >
                      <div
                        className={`h-14 w-14 shrink-0 rounded-2xl ${isCurrent && playing ? 'playing-pulse ring-2 ring-mint' : ''}`}
                        style={getCoverArtStyle(x)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[16px] font-semibold ${isCurrent ? 'text-mint' : 'text-white'}`}>
                          {x.title}
                        </p>
                        <p className="truncate text-sm text-mute">
                          By {x.artist} • {x.songs || 1} Songs
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => quickToggle(x.id)}
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-90 ${
                        isCurrent && playing ? 'bg-mint text-ink' : 'bg-raise text-white'
                      }`}
                      aria-label={isCurrent && playing ? 'Pause' : 'Play'}
                    >
                      <Icon name={isCurrent && playing ? 'pause' : 'play'} size={15} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* ===================== MY MUSIC SCREEN ===================== */}
        {tab === 'mymusic' && (
          <section className="screen noscroll animate-fade-in">
            <header className="flex items-center justify-between">
              <button
                onClick={() => {
                  vibrate()
                  setTab('home')
                }}
                className="grid h-11 w-11 place-items-center rounded-full bg-raise text-white transition active:scale-95"
                aria-label="Back"
              >
                <Icon name="back" size={20} />
              </button>
              <h1 className="text-lg font-bold">My Music</h1>
              <button
                onClick={() => {
                  vibrate()
                  showToast('Dhun Audio • Ultra HD Engine')
                }}
                className="grid h-11 w-11 place-items-center rounded-full bg-raise text-white transition active:scale-95"
                aria-label="More"
              >
                <Icon name="dots" size={20} />
              </button>
            </header>

            {/* Chips */}
            <div className="noscroll -mx-5 mt-6 flex gap-3 overflow-x-auto px-5">
              {['All', 'Playlists', 'Liked Songs', 'Downloads'].map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    vibrate()
                    setChipLib(c)
                  }}
                  className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition active:scale-95 ${
                    chipLib === c ? 'bg-lime text-ink' : 'bg-raise text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Storage Info Header if in Downloads */}
            {chipLib === 'Downloads' && (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-raise/60 px-4 py-3 text-xs text-mute">
                <span>{downloads.length} offline tracks {storageInfo ? `(${storageInfo.usageMB} MB used)` : ''}</span>
                {downloads.length > 0 && (
                  <button
                    onClick={handleClearAllDownloads}
                    className="text-red-400 hover:text-red-300 font-semibold"
                  >
                    Clear All
                  </button>
                )}
              </div>
            )}

            {!libList.length && (
              <p className="mt-8 rounded-2xl bg-raise p-5 text-sm text-mute">
                {chipLib === 'Downloads'
                  ? 'No offline downloads yet. Songs with direct streams can be saved for offline play.'
                  : chipLib === 'Liked Songs'
                  ? 'Nothing here yet. Tap the heart on a song to add it to Liked Songs.'
                  : 'No music items found.'}
              </p>
            )}

            <ul className="mt-5 space-y-4">
              {libList.map((x) => {
                const isCurrent = currentTrack.id === x.id
                return (
                  <li key={x.id} className="flex items-center gap-4">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-4 text-left transition active:opacity-75"
                      onClick={() => playTrackAt(x)}
                    >
                      <div
                        className={`h-14 w-14 shrink-0 rounded-2xl ${isCurrent && playing ? 'playing-pulse ring-2 ring-mint' : ''}`}
                        style={getCoverArtStyle(x)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[16px] font-semibold ${isCurrent ? 'text-mint' : 'text-white'}`}>
                          {x.title}
                        </p>
                        <p className="truncate text-sm text-mute">
                          By {x.artist} • {x.songs || 1} Songs
                        </p>
                      </div>
                    </button>
                    {chipLib === 'Downloads' ? (
                      <button
                        onClick={() => handleDeleteDownload(x.id)}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raise text-mute hover:text-red-400"
                        aria-label="Remove download"
                      >
                        <Icon name="check" size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => quickToggle(x.id)}
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-90 ${
                          isCurrent && playing ? 'bg-mint text-ink' : 'bg-raise text-white'
                        }`}
                        aria-label={isCurrent && playing ? 'Pause' : 'Play'}
                      >
                        <Icon name={isCurrent && playing ? 'pause' : 'play'} size={14} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Floating Glass Play & Shuffle Pill */}
            <div className="fixed bottom-[104px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full glass p-1.5 shadow-2xl">
              <button
                onClick={() => {
                  vibrate()
                  playbackEngine.toggle()
                }}
                className="grid h-12 w-14 place-items-center rounded-full bg-white/10 text-white transition active:scale-90"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                <Icon name={playing ? 'pause' : 'play'} size={20} />
              </button>
              <button
                onClick={() => {
                  vibrate()
                  setShuffle(!shuffle)
                  handleNextTrack()
                }}
                className={`grid h-12 w-14 place-items-center rounded-full transition active:scale-90 ${
                  shuffle ? 'text-lime' : 'text-white'
                }`}
                aria-label="Shuffle"
              >
                <Icon name="shuffle" size={20} />
              </button>
            </div>
          </section>
        )}

        {/* ===================== YOUR LIBRARY SCREEN ===================== */}
        {tab === 'library' && (
          <section className="screen noscroll animate-fade-in">
            <h1 className="mt-6 text-[44px] font-bold leading-none tracking-tight">Your Library</h1>

            {/* Super Mix Hero */}
            <p className="mt-8 font-semibold text-lg">Super Mix</p>
            <button
              onClick={() => playTrackAt(5 % tracks.length)}
              className="relative mt-3 block h-44 w-full overflow-hidden rounded-[22px] text-left transition active:scale-98"
              style={{
                ...getCoverArtStyle(tracks[5 % tracks.length] || currentTrack),
                filter: 'grayscale(1) contrast(1.1)'
              }}
              aria-label="Play Super Mix"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-5">
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-mint">Curated Blend</span>
                  <h3 className="text-xl font-extrabold text-white">Super Mix #1</h3>
                </div>
              </div>
            </button>

            {/* Listen Again */}
            <p className="mt-8 font-semibold text-lg">Listen Again</p>
            <ul className="mt-3 space-y-4">
              {tracks.slice(0, 3).map((x) => (
                <li key={x.id}>
                  <button
                    onClick={() => playTrackAt(x)}
                    className="flex w-full items-center gap-4 text-left transition active:opacity-75"
                  >
                    <div className="h-14 w-14 shrink-0 rounded-xl" style={getCoverArtStyle(x)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold text-white">{x.title}</p>
                      <p className="truncate text-sm text-mute">{x.artist}</p>
                    </div>
                    <span className="text-sm text-mute">{formatTime(x.d)}</span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Pagination Dots */}
            <div className="mt-4 flex justify-center gap-1.5">
              <i className="h-1.5 w-1.5 rounded-full bg-white/30" />
              <i className="h-1.5 w-1.5 rounded-full bg-mint" />
              <i className="h-1.5 w-1.5 rounded-full bg-white/30" />
            </div>

            {/* Old Gems */}
            <p className="mt-6 font-semibold text-lg">Old Gems</p>
            <ul className="mt-3 space-y-4">
              {tracks.slice(3, 8).map((x) => (
                <li key={x.id}>
                  <button
                    onClick={() => playTrackAt(x)}
                    className="flex w-full items-center gap-4 text-left transition active:opacity-75"
                  >
                    <div className="h-14 w-14 shrink-0 rounded-xl" style={getCoverArtStyle(x)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold text-white">{x.title}</p>
                      <p className="truncate text-sm text-mute">{x.artist}</p>
                    </div>
                    <span className="text-sm text-mute">{formatTime(x.d)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ===================== SEARCH SCREEN ===================== */}
        {tab === 'search' && (
          <section className="screen noscroll animate-fade-in">
            <h1 className="mt-6 text-[32px] font-bold">Search</h1>
            <label className="mt-5 flex items-center gap-3 rounded-full bg-raise px-5 py-3.5 focus-within:ring-2 focus-within:ring-mint transition">
              <span className="text-mute">
                <Icon name="search" size={20} />
              </span>
              <input
                ref={searchInputRef}
                value={q}
                onChange={handleSearchInput}
                type="search"
                placeholder="Songs, artists, albums (Last.fm & YouTube)"
                className="w-full bg-transparent outline-none placeholder:text-mute text-white text-base"
              />
              {q && (
                <button
                  onClick={() => {
                    setQ('')
                    setResults([])
                  }}
                  className="text-mute hover:text-white"
                >
                  ✕
                </button>
              )}
            </label>

            {q && !results.length && !busy && (
              <p className="mt-6 text-sm text-mute">
                No results for that search. Try a different song or artist name.
              </p>
            )}

            {busy && (
              <div className="mt-6 flex items-center gap-3 text-sm text-mute">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-mint border-t-transparent" />
                <span>Searching audio catalogs…</span>
              </div>
            )}

            <ul className="mt-5 space-y-3">
              {results.map((x) => {
                const isCurrent = currentTrack.id === x.id
                return (
                  <li key={x.id} className="flex items-center gap-4">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-4 text-left transition active:opacity-75"
                      onClick={() => playTrackAt(x)}
                    >
                      <div
                        className={`h-14 w-14 shrink-0 rounded-2xl ${isCurrent && playing ? 'playing-pulse ring-2 ring-mint' : ''}`}
                        style={getCoverArtStyle(x)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[16px] font-semibold ${isCurrent ? 'text-mint' : 'text-white'}`}>
                          {x.title}
                        </p>
                        <p className="truncate text-sm text-mute">
                          By {x.artist} • {x.songs || 1} Songs
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => quickToggle(x.id)}
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-90 ${
                        isCurrent && playing ? 'bg-mint text-ink' : 'bg-raise text-white'
                      }`}
                      aria-label={isCurrent && playing ? 'Pause' : 'Play'}
                    >
                      <Icon name={isCurrent && playing ? 'pause' : 'play'} size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* ===================== MINI PLAYER (Above Nav) ===================== */}
        {!playerOpen && (
          <div
            onClick={() => {
              vibrate(10)
              setPlayerOpen(true)
            }}
            onTouchStart={handleMiniTouchStart}
            onTouchEnd={handleMiniTouchEnd}
            className="absolute inset-x-5 z-20 flex items-center justify-between rounded-[24px] glass px-3.5 py-2.5 shadow-2xl cursor-pointer transition active:scale-98 overflow-hidden"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
              boxShadow: ambianceStyle.shadowGlow || '0 12px 32px rgba(0,0,0,0.6)'
            }}
          >
            {/* Ambient thin track progress indicator */}
            <div className="absolute top-0 inset-x-3 h-[2px] rounded-full overflow-hidden bg-white/10">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (pos / (currentTrack.d || trackDuration || 210)) * 100)}%`,
                  background: ambianceData.primary || '#00FF66'
                }}
              />
            </div>

            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative shrink-0">
                <div
                  className={`h-11 w-11 rounded-xl transition-transform duration-300 ${playing ? 'playing-pulse ring-2 ring-mint' : ''}`}
                  style={getCoverArtStyle(currentTrack)}
                />
                {playing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl pointer-events-none">
                    <div className="flex items-end gap-[2px] h-3">
                      <span className="w-0.5 bg-mint rounded-full eq-bar-1" />
                      <span className="w-0.5 bg-mint rounded-full eq-bar-2" />
                      <span className="w-0.5 bg-mint rounded-full eq-bar-3" />
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-white leading-tight">{currentTrack.title}</p>
                <p className="truncate text-xs text-white/70">{currentTrack.artist}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  vibrate(12)
                  playbackEngine.toggle()
                }}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition active:scale-90"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                <Icon name={playing ? 'pause' : 'play'} size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  vibrate(10)
                  handleNextTrack()
                }}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition active:scale-90"
                aria-label="Next"
              >
                <Icon name="next" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ===================== FLOATING BOTTOM NAV ===================== */}
        <nav
          className="absolute inset-x-5 z-20 flex items-center justify-between rounded-[32px] glass p-3 shadow-2xl"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          aria-label="Main"
        >
          {[
            ['home', 'home', 'Home'],
            ['mymusic', 'music', 'My Music'],
            ['library', 'library', 'Library'],
            ['search', 'search', 'Search']
          ].map(([targetTab, iconName, label]) => {
            const isActive = tab === targetTab
            const activeColor = targetTab === 'library' ? 'bg-mint text-ink' : 'bg-lime text-ink'

            return (
              <button
                key={targetTab}
                onClick={() => {
                  vibrate()
                  setTab(targetTab)
                  if (targetTab === 'search') {
                    setTimeout(() => searchInputRef.current?.focus(), 150)
                  }
                }}
                className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-90 ${
                  isActive ? `${activeColor} shadow-lg font-bold` : 'bg-white/10 text-white hover:bg-white/15'
                }`}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon name={iconName} size={22} />
              </button>
            )
          })}
        </nav>

        {/* ===================== FULLSCREEN NOW PLAYING SHEET ===================== */}
        <NowPlayingView
          playerOpen={playerOpen}
          currentTrack={currentTrack}
          playing={playing}
          pos={pos}
          trackDuration={trackDuration}
          repeatMode={repeatMode}
          shuffle={shuffle}
          isLiked={isLiked}
          isTrackDownloaded={isTrackDownloaded}
          downloadProgress={downloadProgress}
          userSettings={userSettings}
          queueOpen={queueOpen}
          tracks={tracks}
          cur={cur}
          onClose={() => {
            vibrate()
            setPlayerOpen(false)
          }}
          onTogglePlay={() => {
            vibrate(15)
            playbackEngine.toggle()
          }}
          onNext={() => {
            vibrate()
            handleNextTrack()
          }}
          onPrev={() => {
            vibrate(12)
            handlePrevTrack()
          }}
          onSeek={(targetSeconds) => {
            vibrate()
            playbackEngine.seekTo(targetSeconds)
          }}
          onToggleLike={toggleLike}
          onDownload={handleDownload}
          onToggleRepeat={() => {
            vibrate(10)
            setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
          }}
          onToggleShuffle={() => {
            vibrate()
            setShuffle(!shuffle)
          }}
          onToggleQueue={() => {
            vibrate()
            setQueueOpen(!queueOpen)
          }}
          onPlayTrackAt={playTrackAt}
          vibrate={vibrate}
          getCoverArtStyle={getCoverArtStyle}
        />
        {/* ===================== PROFILE & CUSTOMIZATION STUDIO MODAL ===================== */}
        {profileOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-md animate-fade-in">
            <div
              className="relative w-full max-h-[88vh] overflow-y-auto noscroll rounded-t-[36px] glass p-6 border-t border-white/15 shadow-2xl"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-lime text-ink font-black text-xl shadow-md">
                    {userName[0] || 'D'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{userName}</h2>
                      <button
                        onClick={() => {
                          vibrate(8)
                          const n = prompt('Enter your listener name:', userName)
                          if (n && n.trim()) {
                            setUserName(n.trim())
                            try { localStorage.setItem('dhun_user_name', n.trim()) } catch { /* ignore */ }
                            showToast('Name updated')
                          }
                        }}
                        className="text-xs text-mint underline font-medium"
                      >
                        Edit
                      </button>
                    </div>
                    <p className="text-xs text-mute flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                      Dhun Studio & Ambiance Customizer
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    vibrate(8)
                    setProfileOpen(false)
                  }}
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition active:scale-90"
                  aria-label="Close settings"
                >
                  <Icon name="x" size={18} />
                </button>
              </div>

              {/* Ambiance Color System */}
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-1.5">
                    <Icon name="sparkles" size={14} className="text-mint" />
                    Ambiance Lighting Mode
                  </span>
                  <span className="text-xs font-semibold text-mint capitalize">{userSettings.ambianceMode}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ['dynamic', 'Dynamic', 'Cover colors'],
                    ['aurora', 'Aurora', 'Violet & Cyan'],
                    ['neon', 'Neon', 'Lime Energy'],
                    ['noir', 'Noir', 'Pure Ink']
                  ].map(([mode, label]) => {
                    const active = userSettings.ambianceMode === mode
                    return (
                      <button
                        key={mode}
                        onClick={() => {
                          vibrate(10)
                          updateSettings('ambianceMode', mode)
                        }}
                        className={`py-2 px-1 rounded-xl text-xs font-semibold transition active:scale-95 ${
                          active ? 'bg-mint text-ink shadow-md font-bold' : 'bg-white/10 text-white/80 hover:bg-white/15'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                {/* Intensity Slider */}
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-white/70 mb-1">
                    <span>Glow Intensity</span>
                    <span>{Math.round(userSettings.ambianceIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={userSettings.ambianceIntensity}
                    onChange={(e) => updateSettings('ambianceIntensity', parseFloat(e.target.value))}
                    className="w-full accent-mint h-1.5 bg-white/20 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Gesture Controls */}
              <div className="mt-6 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-1.5">
                  <Icon name="sliders" size={14} className="text-lime" />
                  Motion & Touch Gestures
                </span>
                <div className="space-y-2">
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 cursor-pointer">
                    <div className="pr-3">
                      <p className="text-sm font-semibold text-white">Swipe Down Dismiss</p>
                      <p className="text-xs text-mute">Swipe down on full player to minimize</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={userSettings.swipeDismissEnabled}
                      onChange={(e) => {
                        vibrate(8)
                        updateSettings('swipeDismissEnabled', e.target.checked)
                      }}
                      className="accent-mint h-5 w-5 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 cursor-pointer">
                    <div className="pr-3">
                      <p className="text-sm font-semibold text-white">Cover Art Swipe Skip</p>
                      <p className="text-xs text-mute">Swipe left for next song, right for prev</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={userSettings.artworkSwipeEnabled}
                      onChange={(e) => {
                        vibrate(8)
                        updateSettings('artworkSwipeEnabled', e.target.checked)
                      }}
                      className="accent-mint h-5 w-5 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 cursor-pointer">
                    <div className="pr-3">
                      <p className="text-sm font-semibold text-white">Haptic Vibration</p>
                      <p className="text-xs text-mute">Subtle physical click feedback on touch</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={userSettings.hapticsEnabled}
                      onChange={(e) => {
                        updateSettings('hapticsEnabled', e.target.checked)
                        if (e.target.checked) vibrate(15)
                      }}
                      className="accent-mint h-5 w-5 rounded"
                    />
                  </label>
                </div>
              </div>

              {/* Audio Fidelity Quality */}
              <div className="mt-6 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-1.5">
                  <Icon name="music" size={14} className="text-mint" />
                  Playback Engine Audio Quality
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['highres', 'Hi-Res Opus', '48 kHz'],
                    ['studio', 'Studio Master', '320 kbps'],
                    ['low', 'Data Saver', '128 kbps']
                  ].map(([val, label, sub]) => {
                    const active = userSettings.audioQuality === val
                    return (
                      <button
                        key={val}
                        onClick={() => {
                          vibrate(8)
                          updateSettings('audioQuality', val)
                          showToast(`Audio set to ${label}`)
                        }}
                        className={`p-2.5 rounded-2xl text-left transition active:scale-95 ${
                          active ? 'bg-mint text-ink font-bold shadow-md' : 'bg-white/5 text-white'
                        }`}
                      >
                        <p className="text-xs font-bold leading-tight">{label}</p>
                        <p className={`text-[10px] mt-0.5 ${active ? 'text-ink/80' : 'text-mute'}`}>{sub}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Last.fm API Integration Card */}
              <div className="mt-6 p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-mute">
                    Last.fm Backend Integration
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${lastFmConnected ? 'bg-mint/20 text-mint' : 'bg-red-500/20 text-red-400'}`}>
                    {lastFmConnected ? 'Connected (200 OK)' : 'Offline'}
                  </span>
                </div>
                <div className="text-xs text-white/80 space-y-1">
                  <p><span className="text-mute">Application:</span> Dhun</p>
                  <p><span className="text-mute">Registered User:</span> micet97304</p>
                  <p><span className="text-mute">API Key:</span> 584544ee…bde0</p>
                </div>
                <button
                  onClick={async () => {
                    vibrate(10)
                    showToast('Pinging Last.fm API…')
                    const ok = await verifyLastFmConnection()
                    setLastFmConnected(ok)
                    if (ok) {
                      showToast('Last.fm API ping verified (HTTP 200)')
                    } else {
                      showToast('Last.fm ping failed - check network')
                    }
                  }}
                  className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition active:scale-95"
                >
                  Test Last.fm API Connection
                </button>
              </div>

              {/* YouTube Music Backend Engine Card */}
              <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-mute">
                    YouTube Catalog Integration
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-mint/20 text-mint">
                    {localStorage.getItem('dhun_youtube_api_key') ? 'Custom Key' : 'Bundled API Key'}
                  </span>
                </div>
                <div className="text-xs text-white/80 space-y-1">
                  <p><span className="text-mute">Status:</span> Active (YouTube Data API v3)</p>
                  <p><span className="text-mute">Current Key:</span> {getYoutubeApiKey().slice(0, 10)}…{getYoutubeApiKey().slice(-4)}</p>
                </div>
                <button
                  onClick={() => {
                    vibrate(8)
                    const curKey = localStorage.getItem('dhun_youtube_api_key') || ''
                    const input = prompt('Enter custom YouTube Data API Key (leave empty to use bundled key):', curKey)
                    if (input !== null) {
                      if (input.trim()) {
                        localStorage.setItem('dhun_youtube_api_key', input.trim())
                        showToast('Custom YouTube API key saved')
                      } else {
                        localStorage.removeItem('dhun_youtube_api_key')
                        showToast('Reverted to bundled YouTube API key')
                      }
                    }
                  }}
                  className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition active:scale-95"
                >
                  Configure Custom YouTube Key
                </button>
              </div>

              {/* Cache Management */}
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">Offline Music Cache</p>
                  <p className="text-[11px] text-mute">Downloaded songs & metadata</p>
                </div>
                <button
                  onClick={async () => {
                    vibrate(12)
                    if (window.confirm('Clear all downloaded offline music?')) {
                      await removeAllDownloads()
                      showToast('Offline cache cleared')
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-semibold transition active:scale-95"
                >
                  Clear Cache
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
