import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { Icon } from './components/Icons'
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
import { fetchLastFmTrackInfo, fetchLastFmTopTracks } from './utils/lastFmApi'
import { DEFAULT_CURATED_PLAYLISTS } from './data/defaultPlaylists'
import { initBackgroundAudioShield, startAudioKeeper, pauseAudioKeeper } from './utils/backgroundAudio'

initBackgroundAudioShield()

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
  const img = x.thumbnail || x.thumb || x.image || (x.id && !x.id.startsWith('demo-') ? `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg` : '')
  const src = x.url || x.stream || x.src || ''
  const h = (i * 47 + 20) % 360
  return { id, title, artist, album, year, songs, d, img, src, h }
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
  const [introDismissed, setIntroDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('dhun_apk_intro_seen') === 'true'
    } catch (e) {
      return true
    }
  })

  // User Profile
  const [userName, setUserName] = useState(() => {
    try {
      return localStorage.getItem('dhun_user_name') || 'Dhun Listener'
    } catch (e) {
      return 'Dhun Listener'
    }
  })

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
    } catch (e) {
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

  // Touch Swipe Gesture for Now Playing Sheet
  const touchStartY = useRef(0)
  const touchDeltaY = useRef(0)
  const [sheetDragY, setSheetDragY] = useState(0)

  // Refs for audio engine
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks
  const curRef = useRef(cur)
  curRef.current = cur
  const shuffleRef = useRef(shuffle)
  shuffleRef.current = shuffle
  const repeatModeRef = useRef(repeatMode)
  repeatModeRef.current = repeatMode

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

  const vibrate = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(8)
      }
    } catch (e) {}
  }

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
      } catch (err) {}
    }

    enrichMetadata()
    return () => {
      isCancelled = true
    }
  }, [currentTrack?.title, currentTrack?.artist])

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
  }, [])

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
        const player = new window.YT.Player('youtube-player-container-apk', {
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
                startAudioKeeper(tracksRef.current[curRef.current])
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setPlaying(false)
                playbackEngine.isPlaying = false
                pauseAudioKeeper()
              } else if (event.data === window.YT.PlayerState.ENDED) {
                handleNextTrack()
              }
            }
          }
        })
      } catch (err) {
        console.warn('YT Player init error:', err)
      }
    }

    initYT()
  }, [])

  // Play a track by index or track object
  const playTrackAt = useCallback(
    (target) => {
      vibrate()
      let index = -1
      if (typeof target === 'number') {
        index = target
      } else if (typeof target === 'string') {
        index = tracks.findIndex((t) => t.id === target)
        if (index === -1) {
          const foundInResults = results.find((r) => r.id === target)
          if (foundInResults) {
            setTracks((prev) => [...prev, foundInResults])
            index = tracks.length
          }
        }
      } else if (target && target.id) {
        index = tracks.findIndex((t) => t.id === target.id)
        if (index === -1) {
          setTracks((prev) => [...prev, target])
          index = tracks.length
        }
      }

      if (index >= 0 && index < tracks.length) {
        setCur(index)
        const t = tracks[index]
        playbackEngine.playTrack(t)
        setPlaying(true)
        setPlayerOpen(true)
      }
    },
    [tracks, results]
  )

  const quickToggle = useCallback(
    (trackId) => {
      vibrate()
      const index = tracks.findIndex((t) => t.id === trackId)
      if (index === -1) {
        playTrackAt(trackId)
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
    [cur, tracks, playTrackAt]
  )

  const handleNextTrack = useCallback(() => {
    const list = tracksRef.current
    if (!list.length) return
    const mode = repeatModeRef.current

    if (mode === 'one') {
      playbackEngine.seekTo(0)
      playbackEngine.resume()
      return
    }

    let nextIndex = 0
    if (shuffleRef.current) {
      nextIndex = Math.floor(Math.random() * list.length)
    } else {
      nextIndex = (curRef.current + 1) % list.length
    }

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
        } catch (e) {}
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

  // Search logic (debounced 350ms)
  const executeSearch = useCallback(
    async (query) => {
      const clean = query.trim()
      if (!clean) {
        setResults([])
        setBusy(false)
        return
      }

      setBusy(true)
      try {
        // Query YouTube API
        const key = localStorage.getItem('dhun_youtube_api_key') || ''
        const base = import.meta.env.DEV ? '/api/youtube' : 'https://www.googleapis.com/youtube/v3'
        const resp = await fetch(
          `${base}/search?part=snippet&maxResults=15&q=${encodeURIComponent(clean)}&type=video`,
          {
            headers: key ? { 'X-Goog-Api-Key': key } : {}
          }
        )

        if (resp.ok) {
          const data = await resp.json()
          if (data.items && data.items.length) {
            const mapped = data.items.map((it, idx) =>
              norm(
                {
                  id: it.id.videoId,
                  title: it.snippet.title,
                  artist: it.snippet.channelTitle,
                  thumbnail: it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.medium?.url,
                  d: 215
                },
                idx
              )
            )
            setResults(mapped)
            setBusy(false)
            return
          }
        }

        // Fallback to local match
        const matches = tracks.filter((x) =>
          (x.title + ' ' + x.artist + ' ' + x.album).toLowerCase().includes(clean.toLowerCase())
        )
        setResults(matches)
      } catch (err) {
        const fallback = tracks.filter((x) =>
          (x.title + ' ' + x.artist).toLowerCase().includes(clean.toLowerCase())
        )
        setResults(fallback)
      } finally {
        setBusy(false)
      }
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
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
    touchDeltaY.current = 0
  }

  const handleTouchMove = (e) => {
    const diff = e.touches[0].clientY - touchStartY.current
    if (diff > 0) {
      touchDeltaY.current = diff
      setSheetDragY(diff)
    }
  }

  const handleTouchEnd = () => {
    if (touchDeltaY.current > 120) {
      vibrate()
      setPlayerOpen(false)
    }
    setSheetDragY(0)
    touchDeltaY.current = 0
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink text-white font-sans select-none">
      {/* Hidden YouTube Player IFrame container */}
      <div id="youtube-player-container-apk" style={{ position: 'absolute', top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

      {/* Ambient Moving Backdrop: HSL follows current track */}
      <div className="fixed inset-0 -z-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="ambient absolute -left-1/4 -top-1/4 h-[70vh] w-[70vh] rounded-full opacity-35 blur-[120px] transition-all duration-1000"
          style={{ background: `hsl(${currentTrack.h} 80% 55%)` }}
        />
        <div
          className="ambient absolute -bottom-1/4 -right-1/4 h-[60vh] w-[60vh] rounded-full opacity-20 blur-[120px] transition-all duration-1000"
          style={{ background: `hsl(${(currentTrack.h + 80) % 360} 70% 50%)` }}
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
                  vibrate()
                  const name = prompt('Enter your name:', userName)
                  if (name && name.trim()) {
                    setUserName(name.trim())
                    try {
                      localStorage.setItem('dhun_user_name', name.trim())
                    } catch (e) {}
                  }
                }}
                className="grid h-11 w-11 place-items-center rounded-full bg-lime text-lg font-extrabold text-ink transition active:scale-95"
                aria-label="User profile"
              >
                {userName[0] || 'D'}
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
              vibrate()
              setPlayerOpen(true)
            }}
            className="absolute inset-x-5 z-20 flex items-center justify-between rounded-[24px] glass px-3.5 py-2.5 shadow-2xl cursor-pointer transition active:scale-98"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className={`h-11 w-11 shrink-0 rounded-xl ${playing ? 'playing-pulse ring-2 ring-mint' : ''}`}
                style={getCoverArtStyle(currentTrack)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-white leading-tight">{currentTrack.title}</p>
                <p className="truncate text-xs text-white/70">{currentTrack.artist}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  vibrate()
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
                  vibrate()
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
        <section
          className={`absolute inset-0 z-30 overflow-hidden bg-ink transition-sheet ${
            playerOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
          }`}
          style={{
            transform: playerOpen ? `translateY(${sheetDragY}px)` : 'translateY(100%)'
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-label="Now playing"
        >
          {/* Zooming / breathing backdrop cover */}
          <div
            className={`absolute inset-0 transition-all duration-700 ${playing ? 'breathe-zoom' : 'scale-110'}`}
            style={getCoverArtStyle(currentTrack)}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/90" />

          {/* Grabber for swipe down gesture */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1.5 w-12 rounded-full bg-white/30" />

          {/* Close button at top-left */}
          <button
            onClick={() => {
              vibrate()
              setPlayerOpen(false)
            }}
            className="absolute left-5 grid h-11 w-11 place-items-center rounded-full bg-black/50 backdrop-blur-md text-white transition active:scale-90"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
            aria-label="Close player"
          >
            <Icon name="back" size={20} />
          </button>

          {/* Up Next Queue button at top-right */}
          <button
            onClick={() => {
              vibrate()
              setQueueOpen(!queueOpen)
            }}
            className={`absolute right-5 grid h-11 w-11 place-items-center rounded-full backdrop-blur-md text-white transition active:scale-90 ${
              queueOpen ? 'bg-mint text-ink' : 'bg-black/50'
            }`}
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
            aria-label="Up next queue"
          >
            <Icon name="queue" size={20} />
          </button>

          {/* Up Next Drawer */}
          {queueOpen && (
            <div
              className="absolute inset-x-4 z-40 rounded-[28px] glass p-5 max-h-[50vh] overflow-y-auto noscroll animate-fade-in"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 70px)' }}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="font-bold text-lg">Up Next</h3>
                <span className="text-xs text-mute">{tracks.length} tracks</span>
              </div>
              <ul className="mt-3 space-y-2.5">
                {tracks.map((t, idx) => (
                  <li
                    key={t.id + '-' + idx}
                    onClick={() => {
                      playTrackAt(idx)
                      setQueueOpen(false)
                    }}
                    className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition ${
                      idx === cur ? 'bg-white/15 text-mint font-semibold' : 'hover:bg-white/5 text-white/90'
                    }`}
                  >
                    <div className="h-10 w-10 shrink-0 rounded-lg" style={getCoverArtStyle(t)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="truncate text-xs text-mute">{t.artist}</p>
                    </div>
                    {idx === cur && playing && (
                      <span className="h-2 w-2 rounded-full bg-mint animate-pulse" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Player Bottom Card and Controls */}
          <div
            className="absolute inset-x-4 bottom-0 space-y-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            {/* Glass info card with Waveform */}
            <div className="glass rounded-[28px] p-5 shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <h2 className="truncate text-[26px] font-semibold leading-tight text-white">
                    {currentTrack.title}
                  </h2>
                  <p className="text-sm text-white/70 mt-0.5">{currentTrack.artist}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDownload(currentTrack)}
                    className="grid h-10 w-10 place-items-center text-white/80 hover:text-white transition active:scale-90"
                    aria-label="Download offline"
                  >
                    {downloadProgress[currentTrack.id] ? (
                      <span className="text-xs font-bold text-mint">{downloadProgress[currentTrack.id]}%</span>
                    ) : (
                      <Icon
                        name={isTrackDownloaded(currentTrack.id) ? 'check' : 'download'}
                        size={20}
                        className={isTrackDownloaded(currentTrack.id) ? 'text-mint' : ''}
                      />
                    )}
                  </button>
                  <button
                    onClick={() => toggleLike(currentTrack)}
                    className={`grid h-10 w-10 place-items-center transition active:scale-90 ${
                      isLiked(currentTrack) ? 'text-mint' : 'text-white/80'
                    }`}
                    aria-label="Like"
                  >
                    <Icon name="heart" size={22} fill={isLiked(currentTrack)} />
                  </button>
                </div>
              </div>

              {/* Clickable 44-bar Waveform Scrubber */}
              <div
                className="mt-5 flex h-14 cursor-pointer items-center gap-[3px]"
                onClick={handleWaveSeek}
                role="slider"
                aria-label="Seek track"
                aria-valuenow={Math.round(pos)}
                aria-valuemax={currentTrack.d || trackDuration || 210}
              >
                {waveBars.map((height, i) => {
                  const maxD = currentTrack.d || trackDuration || 210
                  const progressRatio = pos / (maxD || 1)
                  const barRatio = i / waveBars.length
                  const isPlayed = barRatio <= progressRatio

                  return (
                    <span
                      key={i}
                      className={`bar flex-1 rounded-full transition-all duration-150 ${
                        isPlayed ? 'bg-mint' : 'bg-white/40'
                      }`}
                      style={{
                        height: `${height}px`,
                        maxWidth: '4px'
                      }}
                    />
                  )
                })}
              </div>

              {/* Album info & Timestamp */}
              <div className="mt-3 flex justify-between text-xs text-white/75 font-medium">
                <span>{currentTrack.album} · {currentTrack.year}</span>
                <span>
                  {formatTime(pos)} / {formatTime(currentTrack.d || trackDuration || 210)}
                </span>
              </div>
            </div>

            {/* Glass Transport Bar */}
            <div className="glass flex items-center justify-between rounded-[32px] p-3 shadow-2xl">
              <button
                onClick={() => {
                  vibrate()
                  setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
                }}
                className={`grid h-12 w-12 place-items-center rounded-full text-xs font-bold transition active:scale-90 ${
                  repeatMode !== 'off' ? 'text-mint bg-white/10' : 'text-white/60'
                }`}
                aria-label="Repeat mode"
              >
                {repeatMode === 'one' ? '1' : '⟲'}
              </button>

              <button
                onClick={() => {
                  vibrate()
                  handlePrevTrack()
                }}
                className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-white transition active:scale-90"
                aria-label="Previous"
              >
                <Icon name="prev" size={20} />
              </button>

              <button
                onClick={() => {
                  vibrate()
                  playbackEngine.toggle()
                }}
                className="grid h-16 w-16 place-items-center rounded-full bg-mint text-ink font-extrabold shadow-xl transition active:scale-90"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                <Icon name={playing ? 'pause' : 'play'} size={26} />
              </button>

              <button
                onClick={() => {
                  vibrate()
                  handleNextTrack()
                }}
                className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-white transition active:scale-90"
                aria-label="Next"
              >
                <Icon name="next" size={20} />
              </button>

              <button
                onClick={() => {
                  vibrate()
                  setShuffle(!shuffle)
                }}
                className={`grid h-12 w-12 place-items-center rounded-full transition active:scale-90 ${
                  shuffle ? 'text-lime bg-white/10' : 'text-white/60'
                }`}
                aria-label="Shuffle"
              >
                <Icon name="shuffle" size={18} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
