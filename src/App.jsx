import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronLeft, Sun, Moon, Search, SkipBack, Pause, Play, SkipForward, Music2, ArrowLeft, Mic2, ListMusic, Plus, Trash2, Check, House, Library, Play as PlayIcon, Heart, Maximize2, Minimize2, Repeat, Repeat1, ChevronUp, Clock, Sparkles, Coffee, Settings, X } from 'lucide-react'
import './App.css'
import logoVector from './logo_vector.svg'
import qrCode from '../qr.png'

const DEFAULT_YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || ''
const YOUTUBE_API_BASE = import.meta.env.DEV ? '/api/youtube' : 'https://www.googleapis.com/youtube/v3'

const getApiKey = () => {
  const stored = localStorage.getItem('dhun_youtube_api_key')
  return stored || DEFAULT_YOUTUBE_API_KEY
}

const buildApiUrl = (endpoint) => {
  if (import.meta.env.DEV) return `${YOUTUBE_API_BASE}${endpoint}`
  const separator = endpoint.includes('?') ? '&' : '?'
  return `${YOUTUBE_API_BASE}${endpoint}${separator}key=${getApiKey()}`
}

const fetchWithRetry = async (url, options) => {
  let delay = 1000
  let lastError
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, options)
      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`
        try {
          const errData = await response.json()
          errMsg = errData.error?.message || errMsg
        } catch (e) {}
        throw new Error(errMsg)
      }
      return response
    } catch (error) {
      lastError = error
      if (i < 4) {
        await new Promise(res => setTimeout(res, delay))
        delay *= 2
      }
    }
  }
  throw lastError
}

function loadVideoSafely(player, videoId) {
  if (!player) return false
  setPlayerError(null)
  try {
    player.loadVideoById({ videoId, suggestedQuality: 'default' })
    return true
  } catch (e) {
    try {
      player.cueVideoById(videoId)
      return true
    } catch (e2) {
      return false
    }
  }
}

let setPlayerError = () => {}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isYtReady, setIsYtReady] = useState(false)
  const [player, setPlayer] = useState(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [queue, setQueue] = useState([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [activeTab, setActiveTab] = useState('welcome')
  const [errorMsg, setErrorMsg] = useState(null)
  const [playerErrorState, setPlayerErrorState] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  const [trendingSongs, setTrendingSongs] = useState([])
  const [isLoadingTrending, setIsLoadingTrending] = useState(false)
  const [showTrending, setShowTrending] = useState(true)

  const [lyrics, setLyrics] = useState(null)
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false)
  const [showLyrics, setShowLyrics] = useState(false)

  const [playlists, setPlaylists] = useState(() => {
    const saved = localStorage.getItem('dhun_playlists')
    return saved ? JSON.parse(saved) : []
  })
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null)
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')

  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    const saved = localStorage.getItem('dhun_recent')
    return saved ? JSON.parse(saved) : []
  })
  const [likedSongs, setLikedSongs] = useState(() => {
    const saved = localStorage.getItem('dhun_liked')
    return saved ? JSON.parse(saved) : []
  })
  const [addToPlaylistTarget, setAddToPlaylistTarget] = useState(null)
  const [showCoffeeModal, setShowCoffeeModal] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsApiKey, setSettingsApiKey] = useState('')
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('dhun_youtube_api_key') || '')

  const [repeatMode, setRepeatMode] = useState('none')
  const [headerSearchQuery, setHeaderSearchQuery] = useState('')
  const [headerSearchResults, setHeaderSearchResults] = useState([])
  const [isHeaderSearching, setIsHeaderSearching] = useState(false)
  const [showHeaderSearch, setShowHeaderSearch] = useState(false)
  const [showRecommendedSongs, setShowRecommendedSongs] = useState(false)
  const [recommendedSongs, setRecommendedSongs] = useState([])
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(false)
  const [quickPicks, setQuickPicks] = useState([])
  const [recommendedPlaylists, setRecommendedPlaylists] = useState([])
  const [indianRecs, setIndianRecs] = useState([])
  const [isLoadingIndianRecs, setIsLoadingIndianRecs] = useState(false)
  const [indianRecCategories, setIndianRecCategories] = useState([])

  const progressInterval = useRef(null)
  const trendingFetched = useRef(false)
  const playerReadyRef = useRef(false)
  const pendingTrackRef = useRef(null)
  const prevTabRef = useRef('welcome')
  const playerRef = useRef(null)

  const repeatModeRef = useRef('none')
  const queueRef = useRef([])
  const currentIndexRef = useRef(0)
  const headerSearchTimeout = useRef(null)
  const headerSearchInputRef = useRef(null)

  const longPressTimer = useRef(null)
  const isLongPress = useRef(false)

  setPlayerError = (msg) => {
    setPlayerErrorState(msg)
    if (msg) setTimeout(() => setPlayerErrorState(null), 5000)
  }

  const handleTrackEndRef = useRef(() => {})
  const handleAutoFallbackRef = useRef(() => {})
  const darkModeRef = useRef(false)
  const currentTrackRef = useRef(null)
  const failedEmbedTrackIds = useRef(new Set())

  useEffect(() => { repeatModeRef.current = repeatMode }, [repeatMode])
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { darkModeRef.current = isDarkMode }, [isDarkMode])
  useEffect(() => { currentIndexRef.current = currentTrackIndex }, [currentTrackIndex])
  useEffect(() => { currentTrackRef.current = queue[currentTrackIndex] || null }, [queue, currentTrackIndex])

  const enterFullscreen = useCallback(() => {
    try {
      const docEl = document.documentElement
      const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen
      if (!document.fullscreenElement && requestFs) {
        requestFs.call(docEl).catch(() => {})
      }
    } catch (e) {}
  }, [])

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        enterFullscreen()
      } else {
        const exitFs = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen
        if (exitFs) {
          exitFs.call(document).catch(() => {})
        }
      }
    } catch (e) {}
  }

  // Set as default to fullscreen: auto-enter immediately and on first user gesture
  useEffect(() => {
    enterFullscreen()

    const handleFirstGesture = () => {
      enterFullscreen()
      window.removeEventListener('click', handleFirstGesture)
      window.removeEventListener('touchstart', handleFirstGesture)
      window.removeEventListener('pointerdown', handleFirstGesture)
      window.removeEventListener('keydown', handleFirstGesture)
    }

    window.addEventListener('click', handleFirstGesture, { once: true })
    window.addEventListener('touchstart', handleFirstGesture, { once: true, passive: true })
    window.addEventListener('pointerdown', handleFirstGesture, { once: true, passive: true })
    window.addEventListener('keydown', handleFirstGesture, { once: true })

    const onFsChange = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)

    return () => {
      window.removeEventListener('click', handleFirstGesture)
      window.removeEventListener('touchstart', handleFirstGesture)
      window.removeEventListener('pointerdown', handleFirstGesture)
      window.removeEventListener('keydown', handleFirstGesture)
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [enterFullscreen])

  useEffect(() => {
    localStorage.setItem('dhun_playlists', JSON.stringify(playlists))
  }, [playlists])

  useEffect(() => {
    localStorage.setItem('dhun_recent', JSON.stringify(recentlyPlayed))
  }, [recentlyPlayed])

  useEffect(() => {
    localStorage.setItem('dhun_liked', JSON.stringify(likedSongs))
  }, [likedSongs])

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true)
    }
  }, [])

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.async = true
      tag.onerror = () => {
        console.warn('YouTube API failed to load (possibly blocked by ad blocker)')
        setPlayerError('YouTube player blocked. Please disable ad blocker.')
      }
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
      window.onYouTubeIframeAPIReady = () => setIsYtReady(true)
    } else {
      setIsYtReady(true)
    }
    return () => stopProgressTimer()
  }, [])

  useEffect(() => {
    if (isYtReady && !player) {
      const ytPlayer = new window.YT.Player('youtube-player-container', {
        height: '240', width: '320',
        videoId: '',
        playerVars: {
          autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0,
          modestbranding: 1, playsinline: 1, iv_load_policy: 3,
          enablejsapi: 1, widgetid: 1, origin: (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http') ? window.location.origin : 'https://www.youtube.com')
        },
        events: {
          onReady: (event) => {
            const p = event.target
            playerRef.current = p
            setPlayer(p)
            setPlayerReady(true)
            playerReadyRef.current = true
            if (pendingTrackRef.current) {
              const t = pendingTrackRef.current
              pendingTrackRef.current = null
              loadVideoSafely(p, t.id)
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true)
              setDuration(event.target.getDuration())
              startProgressTimer(event.target)
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false)
              stopProgressTimer()
            } else if (event.data === window.YT.PlayerState.ENDED) {
              setIsPlaying(false)
              stopProgressTimer()
              handleTrackEndRef.current()
            } else if (event.data === window.YT.PlayerState.BUFFERING) {
              stopProgressTimer()
            } else if (event.data === window.YT.PlayerState.CUED) {
              event.target.playVideo()
            }
          },
          onError: (event) => {
            console.warn('YouTube Player error:', event.data)
            setIsPlaying(false)
            stopProgressTimer()
            if (event.data === 150 || event.data === 101 || event.data === 100) {
              handleAutoFallbackRef.current?.(event.data)
            } else {
              const errors = {
                2: 'Invalid video parameter',
                5: 'HTML5 player error'
              }
              setPlayerError(errors[event.data] || 'Playback error')
            }
          }
        }
      })
    }
  }, [isYtReady])

  const currentTrack = queue[currentTrackIndex] || null
  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId) || null

  const isLiked = (song) => song && likedSongs.some(s => s.id === song.id)

  useEffect(() => {
    if (currentTrack) {
      setShowLyrics(false)
      setLyrics(null)
    }
  }, [currentTrackIndex, queue])

  useEffect(() => {
    if (currentTrack) {
      fetchSimilarSongs(currentTrack)
    }
  }, [currentTrack])

  const startProgressTimer = (ytPlayer) => {
    stopProgressTimer()
    progressInterval.current = setInterval(() => {
      try { setCurrentTime(ytPlayer.getCurrentTime()) } catch(e) {}
    }, 1000)
  }

  const stopProgressTimer = () => {
    if (progressInterval.current) clearInterval(progressInterval.current)
  }

  const actuallyPlay = useCallback((track) => {
    if (!track) return
    const p = playerRef.current
    if (p && playerReadyRef.current) {
      setPlayerError(null)
      const ok = loadVideoSafely(p, track.id)
      if (!ok) setPlayerError('Could not play this video')
    } else {
      pendingTrackRef.current = track
    }
  }, [])

  const playTrack = useCallback((index, trackQueue = queue) => {
    if (!trackQueue || trackQueue.length === 0) return
    const track = trackQueue[index]
    if (!track) return
    setCurrentTrackIndex(index)
    actuallyPlay(track)
  }, [queue, actuallyPlay])

  const togglePlayPause = () => {
    const p = playerRef.current
    if (!p || queue.length === 0) return
    try {
      isPlaying ? p.pauseVideo() : p.playVideo()
    } catch (e) {
      setPlayerError('Playback control error')
    }
  }

  const handleTrackEnd = useCallback(() => {
    const mode = repeatModeRef.current
    const q = queueRef.current
    const idx = currentIndexRef.current
    if (mode === 'one') {
      const p = playerRef.current
      if (p) {
        p.seekTo(0, true)
        setTimeout(() => p.playVideo(), 150)
      }
    } else if (mode === 'all') {
      if (q.length > 0) {
        const nextIdx = (idx + 1) % q.length
        const track = q[nextIdx]
        if (track) {
          setCurrentTrackIndex(nextIdx)
          actuallyPlay(track)
        }
      }
    } else {
      if (q.length > 0 && idx < q.length - 1) {
        const nextIdx = idx + 1
        const track = q[nextIdx]
        if (track) {
          setCurrentTrackIndex(nextIdx)
          actuallyPlay(track)
        }
      }
    }
  }, [actuallyPlay])

  handleTrackEndRef.current = handleTrackEnd

  const handleNext = useCallback(() => {
    if (queue.length === 0) return
    playTrack((currentTrackIndex + 1) % queue.length, queue)
  }, [queue, currentTrackIndex, playTrack])

  const handlePrev = useCallback(() => {
    if (queue.length === 0) return
    if (repeatMode === 'one') {
      const p = playerRef.current
      if (p) {
        p.seekTo(0, true)
        p.playVideo()
      }
      return
    }
    playTrack(currentTrackIndex === 0 ? queue.length - 1 : currentTrackIndex - 1, queue)
  }, [queue, currentTrackIndex, playTrack, repeatMode])

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    try {
      playerRef.current?.seekTo(newTime, true)
    } catch (e) {}
  }

  // Android & System Native Notification / Lockscreen Media Controls
  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator && currentTrack) {
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: currentTrack.title || 'Dhun Audio',
          artist: currentTrack.artist || 'Unknown Artist',
          album: 'Dhun Music',
          artwork: currentTrack.thumbnail ? [
            { src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' },
            { src: currentTrack.thumbnail, sizes: '256x256', type: 'image/jpeg' }
          ] : []
        })
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

        navigator.mediaSession.setActionHandler('play', () => {
          try { playerRef.current?.playVideo() } catch(e) {}
        })
        navigator.mediaSession.setActionHandler('pause', () => {
          try { playerRef.current?.pauseVideo() } catch(e) {}
        })
        navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev())
        navigator.mediaSession.setActionHandler('nexttrack', () => handleNext())
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            try {
              playerRef.current?.seekTo(details.seekTime, true)
              setCurrentTime(details.seekTime)
            } catch(e) {}
          }
        })
      } catch(e) {}
    }
  }, [currentTrack, isPlaying, handlePrev, handleNext])

  const handleImgError = useCallback((e) => {
    e.target.onerror = null
    e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=60'
  }, [])

  const cleanSongTitle = useCallback((title) => {
    if (!title) return ''
    let t = title
    t = t.replace(/\(.*?\)/g, ' ')
    t = t.replace(/\[.*?\]/g, ' ')
    t = t.replace(/\{.*?\}/g, ' ')
    t = t.replace(/official\s+(music\s+)?video/gi, ' ')
    t = t.replace(/official\s+audio/gi, ' ')
    t = t.replace(/lyric(al)?\s+video/gi, ' ')
    t = t.replace(/lyrics/gi, ' ')
    t = t.replace(/full\s+song/gi, ' ')
    t = t.replace(/visualizer/gi, ' ')
    t = t.replace(/\b(4k|hd|hq|audio|remastered)\b/gi, ' ')
    const parts = t.split(/[|/]/)
    if (parts.length > 1) {
      t = parts[0]
    }
    return t.replace(/\s+/g, ' ').trim()
  }, [])

  const handleAutoFallback = useCallback(async (errorCode) => {
    const track = currentTrackRef.current
    if (!track) return

    if (failedEmbedTrackIds.current.has(track.id)) {
      setPlayerError('Embedding restricted for this track. Playing next...')
      setTimeout(() => handleNext(), 1200)
      return
    }

    failedEmbedTrackIds.current.add(track.id)
    setPlayerError('Embedding restricted by creator. Finding alternate stream...')

    try {
      const clean = cleanSongTitle(track.title)
      const query = `${clean} audio`
      const url = buildApiUrl(`/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoEmbeddable=true&maxResults=6`)
      const res = await fetchWithRetry(url)
      const data = await res.json()
      const alt = (data.items || []).find(item => item.id?.videoId && item.id.videoId !== track.id)

      if (alt && alt.id?.videoId) {
        const altVideoId = alt.id.videoId
        const altTrack = {
          ...track,
          id: altVideoId,
          title: track.title,
          thumbnail: alt.snippet?.thumbnails?.high?.url || track.thumbnail
        }

        setQueue(prev => prev.map((s, idx) => idx === currentIndexRef.current ? altTrack : s))
        setPlayerError(null)

        const p = playerRef.current
        if (p) {
          loadVideoSafely(p, altVideoId)
          setTimeout(() => {
            try { p.playVideo() } catch(e) {}
          }, 300)
        }
        return
      }
    } catch (e) {
      console.warn('Auto fallback search failed:', e)
    }

    setPlayerError('No playable alternative found. Playing next track...')
    setTimeout(() => {
      handleNext()
    }, 1200)
  }, [cleanSongTitle, handleNext])

  handleAutoFallbackRef.current = handleAutoFallback

  const handleRepeatToggle = () => {
    setRepeatMode(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none')
  }

  const navigateTo = (tab) => {
    prevTabRef.current = activeTab
    setActiveTab(tab)
  }

  const handleHeaderBack = () => {
    if (activeTab === 'explore' && !showTrending) {
      handleBackFromSearch()
      return
    }
    if (showHeaderSearch) {
      setShowHeaderSearch(false)
      setHeaderSearchQuery('')
      setHeaderSearchResults([])
      return
    }
    navigateTo(prevTabRef.current)
  }

  const toggleLike = (song) => {
    if (!song) return
    setLikedSongs(prev => {
      const exists = prev.some(s => s.id === song.id)
      if (exists) return prev.filter(s => s.id !== song.id)
      return [song, ...prev]
    })
  }

  const addToRecent = (song) => {
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(s => s.id !== song.id)
      return [song, ...filtered].slice(0, 20)
    })
  }

  const handlePointerDown = (song) => {
    isLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true
      setAddToPlaylistTarget(song)
    }, 500)
  }

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const fetchTrendingSongs = async () => {
    if (trendingFetched.current) return
    setIsLoadingTrending(true)
    trendingFetched.current = true
    try {
      const response = await fetchWithRetry(
        buildApiUrl('/videos?part=snippet,status&chart=mostPopular&videoCategoryId=10&maxResults=24')
      )
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error.message || 'YouTube API request failed')
      }
      const songs = (data.items || [])
        .filter(item => item.status ? item.status.embeddable !== false : true)
        .map(item => ({
          id: item.id,
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url
        }))
      setTrendingSongs(songs)
    } catch (err) {
      setErrorMsg("Could not load trending songs")
      setTimeout(() => setErrorMsg(null), 6000)
    } finally {
      setIsLoadingTrending(false)
    }
  }

  const fetchLyrics = async (artist, title) => {
    if (!title) return
    setIsLoadingLyrics(true)
    setLyrics(null)

    const cleanTitle = cleanSongTitle(title)
    const isGenericArtist = /vevo|records|series|company|channel|official|topic/i.test(artist || '')
    const cleanArtist = !isGenericArtist ? (artist || '').trim() : ''
    const searchQuery = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle

    try {
      // 1. Primary: lrclib.net search endpoint (unauthenticated, vast library, global + Indian)
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const match = data.find(item => item.plainLyrics || item.syncedLyrics) || data[0]
          if (match) {
            const raw = match.plainLyrics || match.syncedLyrics?.replace(/\[\d+:\d+\.\d+\]\s*/g, '')
            if (raw && raw.trim().length > 15) {
              setLyrics(raw.trim())
              setIsLoadingLyrics(false)
              return
            }
          }
        }
      }

      // 2. Secondary fallback: lrclib.net with just cleanTitle
      if (cleanArtist) {
        const res2 = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`)
        if (res2.ok) {
          const data2 = await res2.json()
          if (Array.isArray(data2) && data2.length > 0) {
            const match = data2.find(item => item.plainLyrics || item.syncedLyrics)
            if (match) {
              const raw = match.plainLyrics || match.syncedLyrics?.replace(/\[\d+:\d+\.\d+\]\s*/g, '')
              if (raw && raw.trim().length > 15) {
                setLyrics(raw.trim())
                setIsLoadingLyrics(false)
                return
              }
            }
          }
        }
      }

      // 3. Tertiary fallback: api.lyrics.ovh
      if (cleanArtist && cleanTitle) {
        const res3 = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`)
        if (res3.ok) {
          const d3 = await res3.json()
          if (d3.lyrics && d3.lyrics.length > 20) {
            const cleaned = d3.lyrics
              .replace(/\r\n/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .replace(/^.*?lyrics.*?\n/i, '')
              .replace(/^\d+\s*Contributors?\s*$/m, '')
              .trim()
            setLyrics(cleaned || d3.lyrics)
            setIsLoadingLyrics(false)
            return
          }
        }
      }

      setLyrics(null)
    } catch (e) {
      console.warn('Lyrics fetch failed:', e)
      setLyrics(null)
    } finally {
      setIsLoadingLyrics(false)
    }
  }

  const toggleLyrics = () => {
    if (!showLyrics && currentTrack) {
      setShowLyrics(true)
      fetchLyrics(currentTrack.artist, currentTrack.title)
    } else {
      setShowLyrics(!showLyrics)
    }
  }

  const searchYouTube = async (query) => {
    if (!query.trim()) return
    setIsSearching(true)
    setErrorMsg(null)
    try {
      const response = await fetchWithRetry(
        buildApiUrl(`/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoEmbeddable=true&maxResults=16`)
      )
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error.message || 'YouTube API request failed')
      }
      const results = (data.items || [])
        .filter(item => item.id?.videoId)
        .map(item => ({
          id: item.id.videoId,
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url
        }))
      setSearchResults(results)
      setShowTrending(false)
    } catch (err) {
      const msg = err.message?.includes('quota') || err.message?.includes('exceeded')
        ? 'YouTube API quota exceeded. Set a custom key in Settings (⚙️).'
        : err.message?.includes('HTTP 403')
        ? 'YouTube API key invalid. Configure a key in Settings (⚙️).'
        : `Search failed: ${err.message}`
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 6000)
    } finally {
      setIsSearching(false)
    }
  }

  const playSong = (track) => {
    if (isLongPress.current) {
      isLongPress.current = false
      return
    }
    setShowHeaderSearch(false)
    setHeaderSearchQuery('')
    setHeaderSearchResults([])
    addToRecent(track)
    setQueue([track])
    setCurrentTrackIndex(0)
    actuallyPlay(track)
  }

  const handleBackFromSearch = () => {
    setShowTrending(true)
    setSearchQuery('')
    setSearchResults([])
  }

  const createPlaylist = () => {
    if (!newPlaylistName.trim()) return
    setPlaylists([...playlists, {
      id: Date.now().toString(),
      name: newPlaylistName.trim(),
      songs: []
    }])
    setNewPlaylistName('')
    setIsCreatingPlaylist(false)
  }

  const deletePlaylist = (id) => {
    setPlaylists(playlists.filter(p => p.id !== id))
    if (selectedPlaylistId === id) setSelectedPlaylistId(null)
  }

  const addSongToPlaylist = (playlistId) => {
    const target = addToPlaylistTarget
    if (!target) return
    setPlaylists(playlists.map(p => {
      if (p.id !== playlistId) return p
      if (p.songs.some(s => s.id === target.id)) return p
      return { ...p, songs: [...p.songs, target] }
    }))
    setAddToPlaylistTarget(null)
  }

  const removeSongFromPlaylist = (playlistId, songId) => {
    setPlaylists(playlists.map(p => {
      if (p.id !== playlistId) return p
      return { ...p, songs: p.songs.filter(s => s.id !== songId) }
    }))
  }

  const playPlaylistSong = (song, playlist) => {
    if (isLongPress.current) {
      isLongPress.current = false
      return
    }
    addToRecent(song)
    setQueue(playlist.songs)
    const idx = playlist.songs.findIndex(s => s.id === song.id)
    setCurrentTrackIndex(idx)
    actuallyPlay(song)
  }

  const playPlaylist = (playlist) => {
    if (playlist.songs.length === 0) return
    addToRecent(playlist.songs[0])
    setQueue(playlist.songs)
    setCurrentTrackIndex(0)
    actuallyPlay(playlist.songs[0])
  }

  const playTrackFromHeader = (track) => {
    setShowHeaderSearch(false)
    setHeaderSearchQuery('')
    setHeaderSearchResults([])
    playSong(track)
  }

  const doHeaderSearch = (query) => {
    setHeaderSearchQuery(query)
    if (headerSearchTimeout.current) clearTimeout(headerSearchTimeout.current)
    if (!query.trim()) {
      setHeaderSearchResults([])
      return
    }
    setIsHeaderSearching(true)
    headerSearchTimeout.current = setTimeout(async () => {
      try {
        const response = await fetchWithRetry(
          buildApiUrl(`/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoEmbeddable=true&maxResults=6`)
        )
        const data = await response.json()
        if (data.error) {
          throw new Error(data.error.message || 'YouTube API request failed')
        }
        const results = (data.items || [])
          .filter(item => item.id?.videoId)
          .map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            artist: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.default?.url
          }))
        setHeaderSearchResults(results)
      } catch (err) {
        setHeaderSearchResults([])
        const msg = err.message?.includes('quota') || err.message?.includes('exceeded')
          ? 'YouTube API quota exceeded. Set a custom key in Settings.'
          : err.message?.includes('HTTP 403') || err.message?.includes('restricted')
          ? 'YouTube API key invalid. Check key in Settings.'
          : 'Search unavailable right now'
        setErrorMsg(msg)
        setTimeout(() => setErrorMsg(null), 6000)
      } finally {
        setIsHeaderSearching(false)
      }
    }, 400)
  }

  const handleHeaderSearchSubmit = async () => {
    if (!headerSearchQuery.trim()) return
    setSearchQuery(headerSearchQuery)
    setShowHeaderSearch(false)
    navigateTo('explore')
    await searchYouTube(headerSearchQuery)
  }

  const fetchSimilarSongs = async (track) => {
    if (!track) return
    setIsLoadingRecommended(true)
    try {
      const query = `${track.title} ${track.artist} music`
      const response = await fetchWithRetry(
        buildApiUrl(`/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoEmbeddable=true&maxResults=8`)
      )
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error.message || 'YouTube API request failed')
      }
      const results = (data.items || [])
        .filter(item => item.id?.videoId)
        .map(item => ({
          id: item.id.videoId,
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url
        }))
      setRecommendedSongs(results.filter(s => s.id !== track.id).slice(0, 6))
    } catch {
      setRecommendedSongs([])
    } finally {
      setIsLoadingRecommended(false)
    }
  }

  const fetchGenZRecommendations = async () => {
    setIsLoadingIndianRecs(true)
    const categories = [
      { name: 'Featured Selections', query: 'global viral top hits 2025 2026 trending', color: '#18181b' },
      { name: 'Modern Bass & Rhythm', query: 'phonk drift bass aggressive workout music', color: '#27272a' },
      { name: 'Acoustic & Lo-Fi', query: 'lofi hip hop beats chill study relax 2025', color: '#3f3f46' },
      { name: 'Global Melodies', query: 'afrobeats reggaeton latin pop dance 2025', color: '#52525b' },
      { name: 'Atmospheric Indie', query: 'hyperpop indie rock synthwave 2025', color: '#71717a' },
      { name: 'Lyrical Hip-Hop', query: 'underground rap boom bap drill hits', color: '#a1a1aa' },
    ]

    try {
      const categoryPromises = categories.map(async (cat) => {
        try {
          const response = await fetchWithRetry(
            buildApiUrl(`/search?part=snippet&q=${encodeURIComponent(cat.query)}&type=video&videoEmbeddable=true&maxResults=8`)
          )
          const data = await response.json()
          if (data.error) throw new Error(data.error.message)
          const songs = (data.items || [])
            .filter(item => item.id?.videoId)
            .map(item => ({
              id: item.id.videoId,
              title: item.snippet.title,
              artist: item.snippet.channelTitle,
              thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url
            }))
          return { ...cat, songs: songs.slice(0, 6) }
        } catch {
          return { ...cat, songs: [] }
        }
      })

      const results = await Promise.all(categoryPromises)
      const filtered = results.filter(c => c.songs.length >= 3)
      setIndianRecCategories(filtered)
      const allSongs = filtered.flatMap(c => c.songs)
      setIndianRecs(allSongs.slice(0, 12))
    } catch {
      setIndianRecCategories([])
      setIndianRecs([])
    } finally {
      setIsLoadingIndianRecs(false)
    }
  }

  useEffect(() => {
    fetchGenZRecommendations()
  }, [])

  const getRediscoverSongs = useCallback(() => {
    const recentIds = new Set(recentlyPlayed.slice(0, 10).map(s => s.id))
    return likedSongs.filter(s => !recentIds.has(s.id)).slice(0, 8)
  }, [likedSongs, recentlyPlayed])

  const buildQuickPicks = useCallback(() => {
    const recent = recentlyPlayed.slice(0, 10)
    const recentArtistSet = new Set(recent.map(s => s.artist))
    const likedArtistSet = new Set(likedSongs.map(s => s.artist))

    const seen = new Set()
    const picks = []
    const addUnique = (songs) => {
      for (const s of songs) {
        if (!seen.has(s.id) && picks.length < 8) {
          seen.add(s.id)
          picks.push(s)
        }
      }
    }

    const artistMatched = trendingSongs.filter(s =>
      recentArtistSet.has(s.artist) || likedArtistSet.has(s.artist)
    )
    addUnique(artistMatched)
    addUnique(trendingSongs)
    addUnique(likedSongs)
    addUnique(recentlyPlayed)

    return picks.sort(() => Math.random() - 0.5).slice(0, 8)
  }, [recentlyPlayed, likedSongs, trendingSongs])

  const buildRecommendedPlaylists = useCallback(() => {
    if (trendingSongs.length < 4) return
    const shuffled = [...trendingSongs].sort(() => Math.random() - 0.5)
    const genres = [
      { name: 'Curated Highlights', icon: 'fire', songs: shuffled.slice(0, 6) },
      { name: 'Essential Mix', icon: 'music', songs: shuffled.slice(4, 10) },
      { name: 'New Perspectives', icon: 'star', songs: shuffled.slice(8, 14).length > 2 ? shuffled.slice(8, 14) : shuffled.slice(0, 6) },
    ]
    setRecommendedPlaylists(genres.filter(p => p.songs.length >= 3))
  }, [trendingSongs])

  useEffect(() => {
    if (trendingSongs.length > 0) {
      setQuickPicks(buildQuickPicks())
      buildRecommendedPlaylists()
    }
  }, [trendingSongs, buildQuickPicks, buildRecommendedPlaylists])

  useEffect(() => {
    if (likedSongs.length > 0 || recentlyPlayed.length > 0) {
      if (trendingSongs.length > 0) {
        setQuickPicks(buildQuickPicks())
      }
    }
  }, [likedSongs, recentlyPlayed, buildQuickPicks, trendingSongs.length])

  const getTimeOfDay = () => {
    const h = new Date().getHours()
    if (h < 12) return 'morning'
    if (h < 17) return 'afternoon'
    return 'evening'
  }

  const rediscoverSongs = useMemo(() => {
    const recentIds = new Set(recentlyPlayed.slice(0, 10).map(s => s.id))
    return likedSongs.filter(s => !recentIds.has(s.id)).slice(0, 8)
  }, [likedSongs, recentlyPlayed])

  const handlePlayQuickPick = (song) => {
    if (isLongPress.current) {
      isLongPress.current = false
      return
    }
    addToRecent(song)
    setQueue([song])
    setCurrentTrackIndex(0)
    actuallyPlay(song)
  }

  const playPlaylistSongFromQueue = (song, queueList) => {
    if (isLongPress.current) {
      isLongPress.current = false
      return
    }
    addToRecent(song)
    setQueue(queueList)
    const idx = queueList.findIndex(s => s.id === song.id)
    setCurrentTrackIndex(idx)
    actuallyPlay(song)
  }

  const openSettings = () => {
    setSettingsApiKey(customApiKey || '')
    setShowSettingsModal(true)
  }

  const saveApiKey = () => {
    const key = settingsApiKey.trim()
    if (key) {
      localStorage.setItem('dhun_youtube_api_key', key)
      setCustomApiKey(key)
    } else {
      localStorage.removeItem('dhun_youtube_api_key')
      setCustomApiKey('')
    }
    setShowSettingsModal(false)
  }

  const formatTime = (sec) => {
    if (!sec || isNaN(sec) || sec < 0) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className={`app-root${isDarkMode ? ' dark' : ''}`}>
      <div className="app-shell">
        <div className="youtube-player-wrapper">
          <div id="youtube-player-container"></div>
        </div>

        {/* Desktop Editorial Sidebar (Laptops & Desktops >= 1024px) */}
        <aside className="desktop-sidebar">
          <div className="sidebar-brand" onClick={() => navigateTo('welcome')}>
            <img src={logoVector} alt="Dhun Logo" className="sidebar-brand-logo" />
            <div className="sidebar-brand-text">
              <h1 className="sidebar-title">Dhun</h1>
              <span className="sidebar-edition">Audio Edition / Vol. 04</span>
            </div>
          </div>

          <div className="sidebar-nav-group">
            <span className="sidebar-label">Index</span>
            <nav className="sidebar-menu">
              <button
                onClick={() => navigateTo('welcome')}
                className={`sidebar-link${activeTab === 'welcome' ? ' active' : ''}`}
              >
                <span className="sidebar-num">01</span>
                <span className="sidebar-link-text">Overview</span>
              </button>
              <button
                onClick={() => { navigateTo('explore'); fetchTrendingSongs() }}
                className={`sidebar-link${activeTab === 'explore' ? ' active' : ''}`}
              >
                <span className="sidebar-num">02</span>
                <span className="sidebar-link-text">Explore</span>
              </button>
              <button
                onClick={() => navigateTo('player')}
                className={`sidebar-link${activeTab === 'player' ? ' active' : ''}`}
              >
                <span className="sidebar-num">03</span>
                <span className="sidebar-link-text">Listening Room</span>
                {isPlaying && <span className="sidebar-live-tag">Playing</span>}
              </button>
              <button
                onClick={() => navigateTo('playlists')}
                className={`sidebar-link${activeTab === 'playlists' ? ' active' : ''}`}
              >
                <span className="sidebar-num">04</span>
                <span className="sidebar-link-text">Collections</span>
              </button>
            </nav>
          </div>

          {currentTrack && (
            <div className="sidebar-card" onClick={() => navigateTo('player')}>
              <div className="sidebar-card-badge">
                <span className="pulse-dot" />
                <span>Now Playing</span>
              </div>
              <div className="sidebar-card-body">
                <img src={currentTrack.thumbnail} alt="" className="sidebar-card-thumb" onError={handleImgError} decoding="async" />
                <div className="sidebar-card-info">
                  <p className="sidebar-card-title">{currentTrack.title}</p>
                  <p className="sidebar-card-artist">{currentTrack.artist}</p>
                </div>
              </div>
            </div>
          )}

          <div className="sidebar-footer">
            <div className="sidebar-actions">
              <button onClick={openSettings} className="sidebar-action-btn" title="Settings">
                <Settings size={15} />
                <span>Settings</span>
              </button>
              <button onClick={() => setShowCoffeeModal(true)} className="sidebar-action-btn coffee-btn" title="Support">
                <Coffee size={15} />
                <span>Support</span>
              </button>
            </div>
            <div className="sidebar-status-box">
              <span className="status-label">Stream Status</span>
              <span className="status-val">Stereo Hi-Fi</span>
            </div>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <div className="app-main-area">
          <header className={`app-header${showHeaderSearch ? ' header-search-active' : ''}`}>
            <div className="header-left">
              <button onClick={handleHeaderBack} className="icon-btn back-btn" title="Go back">
                <ChevronLeft size={20} />
              </button>
              <div className="header-brand-mark" onClick={() => navigateTo('welcome')} role="button" tabIndex={0}>
                <img src={logoVector} alt="Dhun Logo" className="header-brand-logo" />
                <span className="header-brand-title">Dhun</span>
              </div>
            </div>

            <div className={`header-search-container${showHeaderSearch ? ' expanded' : ''}`}>
              <button
                className="header-search-trigger"
                onClick={() => { setShowHeaderSearch(true); setTimeout(() => headerSearchInputRef.current?.focus(), 100) }}
              >
                <Search size={15} />
                {!showHeaderSearch && <span className="header-search-placeholder">Search tracks, artists, genres...</span>}
              </button>
              {showHeaderSearch && (
                <div className="header-search-dropdown">
                  <div className="header-search-input-wrap">
                    <button
                      type="button"
                      className="header-search-mobile-close"
                      onClick={() => {
                        setShowHeaderSearch(false)
                        setHeaderSearchQuery('')
                        setHeaderSearchResults([])
                      }}
                      title="Close search"
                      aria-label="Close search"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <Search size={16} className="header-search-icon" />
                    <input
                      ref={headerSearchInputRef}
                      type="search"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                      className="header-search-input"
                      placeholder="Search tracks, artists, genres..."
                      value={headerSearchQuery}
                      onChange={(e) => doHeaderSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleHeaderSearchSubmit() } }}
                      onBlur={() => setTimeout(() => { if (!headerSearchQuery && window.innerWidth >= 768) setShowHeaderSearch(false) }, 200)}
                    />
                    {headerSearchQuery && (
                      <button
                        type="button"
                        className="header-search-clear"
                        onClick={() => { setHeaderSearchQuery(''); setHeaderSearchResults([]); headerSearchInputRef.current?.focus() }}
                        aria-label="Clear search input"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  {isHeaderSearching && (
                    <div className="header-search-loading"><div className="spinner-sm" /><span>Searching catalogue...</span></div>
                  )}
                  {headerSearchResults.length > 0 && (
                    <div className="header-search-results">
                      {headerSearchResults.map(song => (
                        <div
                          key={song.id}
                          className="header-search-result-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => playTrackFromHeader(song)}
                        >
                          <img src={song.thumbnail} alt="" className="header-search-result-thumb" onError={handleImgError} decoding="async" />
                          <div className="header-search-result-info">
                            <p className="header-search-result-title">{song.title}</p>
                            <p className="header-search-result-artist">{song.artist}</p>
                          </div>
                        </div>
                      ))}
                      <div
                        className="header-search-see-all"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleHeaderSearchSubmit}
                      >
                        View all results for "{headerSearchQuery}" ➔
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="header-actions">
              <button onClick={openSettings} className="icon-btn" title="Settings">
                <Settings size={18} />
              </button>
              <button onClick={toggleFullscreen} className="icon-btn" title="Toggle fullscreen">
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="icon-btn theme-toggle-btn" title={isDarkMode ? 'Light Mode' : 'Dark Mode'}>
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </header>

          {/* Editorial Meta Strip */}
          <div className="editorial-meta-bar" aria-hidden="true">
            <span className="editorial-edition-label">DHUN MUSIC</span>
            <span className="meta-sep">—</span>
            <span>ISSUE N° 04</span>
            <span className="meta-sep">—</span>
            <span>PURE STREAMING</span>
            <span className="meta-sep">—</span>
            <span>GOOD {getTimeOfDay().toUpperCase()}</span>
          </div>

          <main className="app-main">
            {errorMsg && <div className="error-toast">{errorMsg}</div>}
            {playerErrorState && <div className="error-toast player-error">{playerErrorState}</div>}
            {!isYtReady && playerErrorState && (
              <div className="yt-blocked-banner">
                <Music2 size={18} />
                <span>Audio player blocked. Please consider disabling ad blockers for playback.</span>
              </div>
            )}

            {activeTab === 'welcome' && (
              <div className="welcome-view">
                <section className="home-hero">
                  <div className="home-hero-meta-row">
                    <span className="hero-meta-item">Curated Selection</span>
                    <span className="hero-meta-dot">•</span>
                    <span className="hero-meta-item">Vol. 04</span>
                    <span className="hero-meta-dot">•</span>
                    <span className="hero-meta-item">Distilled Listening</span>
                  </div>
                  <div className="home-hero-content">
                    <div className="home-hero-text">
                      <h1 className="home-hero-title">Dhun</h1>
                      <p className="home-hero-subtitle">A quiet, distilled sanctuary for music discovery and contemplation.</p>
                    </div>
                  </div>
                </section>

                {quickPicks.length > 0 && (
                  <section className="home-section">
                    <div className="home-section-header">
                      <div className="home-section-title-wrap">
                        <span className="home-section-number">01</span>
                        <h2 className="home-section-title">Quick Picks</h2>
                      </div>
                      <span className="home-section-subtitle">Recommended for you</span>
                    </div>
                    <div className="quick-picks-scroll">
                      <div className="quick-picks-track">
                        {quickPicks.map((song, idx) => (
                          <div key={song.id} className="quick-pick-card" onClick={() => handlePlayQuickPick(song)}>
                            <div className="quick-pick-thumb-wrap">
                              <img src={song.thumbnail} alt={song.title} className="quick-pick-img" />
                              <div className="quick-pick-overlay">
                                <div className="quick-pick-play-btn">
                                  <PlayIcon size={16} fill="currentColor" />
                                </div>
                              </div>
                              <div className="quick-pick-rank">{idx + 1}</div>
                            </div>
                            <div className="quick-pick-info">
                              <p className="quick-pick-title">{song.title}</p>
                              <p className="quick-pick-artist">{song.artist}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {playlists.length > 0 && (
                  <section className="home-section">
                    <div className="home-section-header">
                      <div className="home-section-title-wrap">
                        <span className="home-section-number">02</span>
                        <h2 className="home-section-title">Your Collections</h2>
                      </div>
                      <button className="home-section-link" onClick={() => navigateTo('playlists')}>
                        View all ({playlists.length}) ➔
                      </button>
                    </div>
                    <div className="home-playlists-scroll">
                      <div className="home-playlists-track">
                        {likedSongs.length > 0 && (
                          <div className="home-playlist-card liked-card" onClick={() => { setSelectedPlaylistId('liked'); navigateTo('playlists') }}>
                            <div className="home-playlist-cover home-playlist-liked">
                              <Heart size={22} fill="currentColor" />
                            </div>
                            <p className="home-playlist-name">Liked Songs</p>
                            <span className="home-playlist-count">{likedSongs.length} tracks</span>
                          </div>
                        )}
                        {playlists.map(p => (
                          <div key={p.id} className="home-playlist-card" onClick={() => { setSelectedPlaylistId(p.id); navigateTo('playlists') }}>
                            <div className="home-playlist-cover">
                              {p.songs.length > 0 ? (
                                <div className="home-playlist-collage">
                                  {p.songs.slice(0, 4).map((s, i) => (
                                    <img key={i} src={s.thumbnail} alt="" loading="lazy" />
                                  ))}
                                </div>
                              ) : (
                                <ListMusic size={22} />
                              )}
                            </div>
                            <p className="home-playlist-name">{p.name}</p>
                            <span className="home-playlist-count">{p.songs.length} tracks</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                <section className="home-section home-section-recs">
                  <div className="home-section-header">
                    <div className="home-section-title-wrap">
                      <span className="home-section-number">03</span>
                      <h2 className="home-section-title">Featured Channels</h2>
                    </div>
                    <span className="home-section-tag">Editorial</span>
                  </div>

                  {isLoadingIndianRecs ? (
                    <div className="home-loading">
                      <div className="spinner" />
                      <span>Loading curated selections...</span>
                    </div>
                  ) : indianRecCategories.length > 0 ? (
                    <>
                      <div className="rec-categories-grid">
                        {indianRecCategories.slice(0, 6).map((category, catIdx) => (
                          <div
                            key={catIdx}
                            className="rec-category-card"
                            onClick={() => {
                              if (category.songs.length === 0) return
                              addToRecent(category.songs[0])
                              setQueue(category.songs)
                              setCurrentTrackIndex(0)
                              actuallyPlay(category.songs[0])
                            }}
                          >
                            <div className="rec-category-collage">
                              <div className="rec-category-collage-inner">
                                {category.songs.slice(0, 4).map((song, sIdx) => (
                                  <div key={sIdx} className="rec-category-collage-item">
                                    <img src={song.thumbnail} alt="" loading="lazy" />
                                  </div>
                                ))}
                              </div>
                              <div className="rec-category-collage-overlay">
                                <div className="rec-category-play-btn">
                                  <PlayIcon size={18} fill="currentColor" />
                                </div>
                              </div>
                            </div>
                            <div className="rec-category-info">
                              <h3 className="rec-category-name">{category.name}</h3>
                              <p className="rec-category-meta">{category.songs.length} curated tracks</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rec-expanded-songs">
                        {indianRecCategories.slice(0, 3).map((category, catIdx) => (
                          <div key={catIdx} className="rec-song-group">
                            <div className="rec-song-group-header">
                              <span className="rec-song-group-bullet" />
                              <h4 className="rec-song-group-title">{category.name}</h4>
                            </div>
                            <div className="rec-song-list">
                              {category.songs.slice(0, 5).map((song, songIdx) => (
                                <div
                                  key={song.id}
                                  className="rec-song-item"
                                  onClick={() => {
                                    if (isLongPress.current) {
                                      isLongPress.current = false
                                      return
                                    }
                                    addToRecent(song)
                                    setQueue(category.songs)
                                    setCurrentTrackIndex(songIdx)
                                    actuallyPlay(song)
                                  }}
                                  onPointerDown={() => handlePointerDown(song)}
                                  onPointerUp={handlePointerUp}
                                  onPointerLeave={handlePointerLeave}
                                >
                                  <img src={song.thumbnail} alt="" className="rec-song-thumb" />
                                  <div className="rec-song-details">
                                    <p className="rec-song-title">{song.title}</p>
                                    <p className="rec-song-artist">{song.artist}</p>
                                  </div>
                                  <div className="rec-song-actions">
                                    <button
                                      className={`rec-song-like-btn${isLiked(song) ? ' liked' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); toggleLike(song) }}
                                      aria-label={isLiked(song) ? 'Unlike' : 'Like'}
                                    >
                                      <Heart size={15} fill={isLiked(song) ? 'currentColor' : 'none'} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="home-empty">
                      <div className="home-empty-icon">
                        <Music2 size={28} />
                      </div>
                      <p>No recommendations loaded</p>
                      <span>Search for songs to tune your personalized feed</span>
                    </div>
                  )}
                </section>

                {rediscoverSongs.length > 0 && (
                  <section className="home-section">
                    <div className="home-section-header">
                      <div className="home-section-title-wrap">
                        <span className="home-section-number">04</span>
                        <h2 className="home-section-title">Rediscover</h2>
                      </div>
                      <span className="home-section-subtitle">From your library</span>
                    </div>
                    <div className="quick-picks-scroll">
                      <div className="quick-picks-track">
                        {rediscoverSongs.map((song) => (
                          <div key={song.id} className="quick-pick-card" onClick={() => handlePlayQuickPick(song)}>
                            <div className="quick-pick-thumb-wrap">
                              <img src={song.thumbnail} alt={song.title} className="quick-pick-img" />
                              <div className="quick-pick-overlay">
                                <div className="quick-pick-play-btn">
                                  <PlayIcon size={16} fill="currentColor" />
                                </div>
                              </div>
                            </div>
                            <div className="quick-pick-info">
                              <p className="quick-pick-title">{song.title}</p>
                              <p className="quick-pick-artist">{song.artist}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {activeTab === 'player' && (
              <div className="player-view">
                <div className="track-info">
                  {currentTrack ? (
                    <div className="track-header-box">
                      <span className="track-edition-tag">{isPlaying ? 'Now Playing' : 'Paused'} • Stereo 320k</span>
                      <h1 className="track-title">{currentTrack.title}</h1>
                      <p className="track-artist">{currentTrack.artist}</p>
                    </div>
                  ) : (
                    <div className="no-track-state">
                      <div className="no-track-icon-frame">
                        <Music2 size={36} />
                      </div>
                      <h2>Listening Room Idle</h2>
                      <p>Select any piece from the catalog to begin listening.</p>
                      <button onClick={() => { navigateTo('explore'); fetchTrendingSongs() }} className="editorial-btn-primary">
                        Browse Catalog ➔
                      </button>
                    </div>
                  )}
                </div>

                {currentTrack && (
                  <div className="player-grid-layout">
                    <div className="player-deck-main">
                      <div className="album-art-container">
                        <img
                          src={currentTrack.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop'}
                          alt="Album Cover"
                          className="album-img"
                        />
                      </div>

                      <div className="seek-section">
                        <div className="seek-meta-row">
                          <span className="seek-timestamp">{formatTime(currentTime)}</span>
                          <span className="seek-tag">{formatTime(duration)}</span>
                        </div>
                        <input
                          type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek}
                          className="seek-bar"
                          style={{
                            background: `linear-gradient(to right, var(--text-main) ${(currentTime / (duration || 1)) * 100}%, var(--border-color) ${(currentTime / (duration || 1)) * 100}%)`
                          }}
                        />
                      </div>

                      <div className="controls-row">
                        <button onClick={handlePrev} disabled={queue.length <= 1 && repeatMode !== 'one'} className="ctrl-btn" title="Previous">
                          <SkipBack size={20} fill="currentColor" />
                        </button>
                        <button onClick={togglePlayPause} className="ctrl-btn ctrl-btn-play" title={isPlaying ? 'Pause' : 'Play'}>
                          {isPlaying
                            ? <Pause size={24} fill="currentColor" />
                            : <Play size={24} fill="currentColor" />}
                        </button>
                        <button onClick={handleNext} disabled={queue.length <= 1 && repeatMode !== 'one'} className="ctrl-btn" title="Next">
                          <SkipForward size={20} fill="currentColor" />
                        </button>
                      </div>

                      <div className="player-actions-row">
                        <button
                          onClick={handleRepeatToggle}
                          className={`player-action-btn${repeatMode !== 'none' ? ' active-action-btn' : ''}`}
                          title={repeatMode === 'none' ? 'No repeat' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
                        >
                          {repeatMode === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}
                          <span>{repeatMode === 'none' ? 'Repeat' : repeatMode === 'all' ? 'All' : 'One'}</span>
                        </button>
                        <button
                          onClick={() => toggleLike(currentTrack)}
                          className={`player-action-btn${isLiked(currentTrack) ? ' liked-btn' : ''}`}
                        >
                          <Heart size={15} fill={isLiked(currentTrack) ? 'currentColor' : 'none'} />
                          <span>{isLiked(currentTrack) ? 'Liked' : 'Like'}</span>
                        </button>
                        <button onClick={toggleLyrics} className={`player-action-btn${showLyrics ? ' active-action-btn' : ''}`}>
                          <Mic2 size={15} />
                          <span>{showLyrics ? 'Close Lyrics' : 'Lyrics'}</span>
                        </button>
                        <button onClick={() => setAddToPlaylistTarget(currentTrack)} className="player-action-btn">
                          <Plus size={15} />
                          <span>Add to List</span>
                        </button>
                      </div>
                    </div>

                    <div className="player-deck-side">
                      {showLyrics && (
                        <div className="lyrics-content-wrapper">
                          <div className="lyrics-header">
                            <span className="lyrics-badge">Lyrics Transcript</span>
                            <button onClick={() => setShowLyrics(false)} className="lyrics-close-btn" title="Close lyrics">
                              <X size={15} />
                            </button>
                          </div>
                          {isLoadingLyrics ? (
                            <div className="lyrics-loading"><div className="spinner" /><p>Fetching transcript...</p></div>
                          ) : lyrics ? (
                            <pre className="lyrics-content">{lyrics}</pre>
                          ) : (
                            <div className="lyrics-empty">
                              <Mic2 size={24} />
                              <p>No lyrics transcript found automatically</p>
                              <button
                                className="editorial-btn-primary"
                                style={{ marginTop: '8px', padding: '8px 16px', fontSize: '12px' }}
                                onClick={() => fetchLyrics(currentTrack.artist, currentTrack.title)}
                              >
                                Retry Fetching Lyrics
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="recommended-section">
                        <button
                          className="recommended-toggle"
                          onClick={() => setShowRecommendedSongs(!showRecommendedSongs)}
                        >
                          <span>Related Selections</span>
                          <ChevronUp size={16} className={`recommended-arrow${showRecommendedSongs ? ' rotated' : ''}`} />
                        </button>
                        {showRecommendedSongs && (
                          <div className="recommended-list">
                            {isLoadingRecommended ? (
                              <div className="recommended-loading"><div className="spinner" /></div>
                            ) : recommendedSongs.length > 0 ? (
                              recommendedSongs.map(song => (
                                <div
                                  key={song.id}
                                  className="recommended-item"
                                  onClick={() => {
                                    addToRecent(song)
                                    setQueue([song])
                                    setCurrentTrackIndex(0)
                                    actuallyPlay(song)
                                  }}
                                >
                                  <img src={song.thumbnail} alt="" className="recommended-thumb" />
                                  <div className="recommended-info">
                                    <p className="recommended-title">{song.title}</p>
                                    <p className="recommended-artist">{song.artist}</p>
                                  </div>
                                  <button
                                    className={`like-btn-sm${isLiked(song) ? ' liked' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); toggleLike(song) }}
                                  >
                                    <Heart size={13} fill={isLiked(song) ? 'currentColor' : 'none'} />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <p className="recommended-empty">No similar tracks found</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div className="playlists-view">
                {selectedPlaylistId === 'liked' ? (
                  <>
                    <div className="playlist-header-row">
                      <button onClick={() => setSelectedPlaylistId(null)} className="playlist-back-btn">
                        <ArrowLeft size={18} />
                      </button>
                      <div className="playlist-header-info">
                        <h2 className="playlist-name">Liked Songs</h2>
                        <p className="playlist-count">{likedSongs.length} tracks</p>
                      </div>
                      {likedSongs.length > 0 && (
                        <button onClick={() => { setQueue(likedSongs); setCurrentTrackIndex(0); actuallyPlay(likedSongs[0]) }} className="playlist-play-all-btn">
                          <PlayIcon size={16} fill="currentColor" />
                          <span>Play All</span>
                        </button>
                      )}
                    </div>

                    {likedSongs.length === 0 ? (
                      <p className="playlist-empty">No liked tracks yet. Heart any song to add it here.</p>
                    ) : (
                      <div className="playlist-songs">
                        {likedSongs.map(song => (
                          <div key={song.id}
                            className="playlist-song-item"
                            onClick={() => playPlaylistSongFromQueue(song, likedSongs)}
                            onPointerDown={() => handlePointerDown(song)}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerLeave}
                          >
                            <img src={song.thumbnail} alt="" className="playlist-song-thumb" />
                            <div className="playlist-song-info">
                              <p className="playlist-song-title">{song.title}</p>
                              <p className="playlist-song-artist">{song.artist}</p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); toggleLike(song) }} className="playlist-song-remove">
                              <Heart size={15} fill="currentColor" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : selectedPlaylist ? (
                  <>
                    <div className="playlist-header-row">
                      <button onClick={() => setSelectedPlaylistId(null)} className="playlist-back-btn">
                        <ArrowLeft size={18} />
                      </button>
                      <div className="playlist-header-info">
                        <h2 className="playlist-name">{selectedPlaylist.name}</h2>
                        <p className="playlist-count">{selectedPlaylist.songs.length} tracks</p>
                      </div>
                      {selectedPlaylist.songs.length > 0 && (
                        <button onClick={() => playPlaylist(selectedPlaylist)} className="playlist-play-all-btn">
                          <PlayIcon size={16} fill="currentColor" />
                          <span>Play All</span>
                        </button>
                      )}
                    </div>

                    {selectedPlaylist.songs.length === 0 ? (
                      <p className="playlist-empty">No tracks in this playlist. Discover and add tracks from Explore.</p>
                    ) : (
                      <div className="playlist-songs">
                        {selectedPlaylist.songs.map(song => (
                          <div
                            key={song.id}
                            className="playlist-song-item"
                            onClick={() => playPlaylistSong(song, selectedPlaylist)}
                            onPointerDown={() => handlePointerDown(song)}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerLeave}
                          >
                            <img src={song.thumbnail} alt="" className="playlist-song-thumb" />
                            <div className="playlist-song-info">
                              <p className="playlist-song-title">{song.title}</p>
                              <p className="playlist-song-artist">{song.artist}</p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); removeSongFromPlaylist(selectedPlaylist.id, song.id) }} className="playlist-song-remove">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="playlists-header">
                      <div>
                        <h2 className="playlists-title">Collections</h2>
                        <span className="playlists-subtitle">Personal Audio Libraries</span>
                      </div>
                      <button onClick={() => setIsCreatingPlaylist(true)} className="create-playlist-btn">
                        <Plus size={16} />
                        New Playlist
                      </button>
                    </div>

                    {isCreatingPlaylist && (
                      <form className="create-playlist-form" onSubmit={(e) => { e.preventDefault(); createPlaylist() }}>
                        <input
                          type="text"
                          className="create-playlist-input"
                          placeholder="Enter playlist title..."
                          value={newPlaylistName}
                          onChange={(e) => setNewPlaylistName(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="create-playlist-confirm"><Check size={16} /></button>
                        <button type="button" onClick={() => setIsCreatingPlaylist(false)} className="create-playlist-cancel"><ChevronLeft size={16} /></button>
                      </form>
                    )}

                    {likedSongs.length > 0 && (
                      <div className="playlist-card liked-songs-card" onClick={() => setSelectedPlaylistId('liked')}>
                        <div className="playlist-card-cover liked-cover">
                          <Heart size={20} fill="currentColor" />
                        </div>
                        <div className="playlist-card-info">
                          <h3 className="playlist-card-name">Liked Songs</h3>
                          <p className="playlist-card-count">{likedSongs.length} tracks</p>
                        </div>
                      </div>
                    )}

                    <div className="playlists-divider" />

                    {playlists.length === 0 ? (
                      <div className="playlists-empty">
                        <ListMusic size={36} />
                        <p>No playlists created yet</p>
                        <span>Create your first collection to curate your sound library</span>
                      </div>
                    ) : (
                      <div className="playlists-list">
                        {playlists.map(p => (
                          <div key={p.id} className="playlist-card" onClick={() => setSelectedPlaylistId(p.id)}>
                            <div className="playlist-card-cover">
                              <Library size={20} />
                            </div>
                            <div className="playlist-card-info">
                              <h3 className="playlist-card-name">{p.name}</h3>
                              <p className="playlist-card-count">{p.songs.length} tracks</p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); deletePlaylist(p.id) }} className="playlist-card-delete" title="Delete playlist">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {recentlyPlayed.length > 0 && (
                      <div className="recent-section">
                        <div className="recent-section-header">
                          <Clock size={16} />
                          <h3 className="recent-title">Recently Played</h3>
                        </div>
                        <div className="recent-list">
                          {recentlyPlayed.map(song => (
                            <div key={song.id} className="recent-item" onClick={() => {
                              addToRecent(song)
                              setQueue([song])
                              setCurrentTrackIndex(0)
                              actuallyPlay(song)
                            }}>
                              <img src={song.thumbnail} alt="" className="recent-thumb" />
                              <div className="recent-info">
                                <p className="recent-song-title">{song.title}</p>
                                <p className="recent-song-artist">{song.artist}</p>
                              </div>
                              <button
                                className={`like-btn-sm${isLiked(song) ? ' liked' : ''}`}
                                onClick={(e) => { e.stopPropagation(); toggleLike(song) }}
                              >
                                <Heart size={13} fill={isLiked(song) ? 'currentColor' : 'none'} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'explore' && (
              <div className="explore-view">
                {showTrending ? (
                  <>
                    <div className="explore-header-row">
                      <h2 className="explore-title">Trending Catalog</h2>
                      <span className="explore-badge">Worldwide</span>
                    </div>
                    {isLoadingTrending ? (
                      <div className="explore-loading"><div className="spinner" /><span>Loading catalog...</span></div>
                    ) : trendingSongs.length > 0 ? (
                      <div className="explore-grid">
                        {trendingSongs.map(song => (
                          <div key={song.id}
                            className="explore-card"
                            onClick={() => playSong(song)}
                            onPointerDown={() => handlePointerDown(song)}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerLeave}
                          >
                            <div className="explore-card-img">
                              <img src={song.thumbnail} alt={song.title} />
                            </div>
                            <div className="explore-card-info">
                              <div className="explore-card-title-row">
                                <p className="explore-card-title">{song.title}</p>
                                <button
                                  className={`explore-like-btn${isLiked(song) ? ' liked' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); toggleLike(song) }}
                                >
                                  <Heart size={13} fill={isLiked(song) ? 'currentColor' : 'none'} />
                                </button>
                              </div>
                              <p className="explore-card-artist">{song.artist}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="explore-empty">Could not load trending songs. Verify your YouTube API key.</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="explore-back-row">
                      <button onClick={handleBackFromSearch} className="explore-back-btn">
                        <ArrowLeft size={16} />
                        <span>Back to Catalog</span>
                      </button>
                      <span className="explore-query-label">Results for "{searchQuery}"</span>
                    </div>
                    {isSearching ? (
                      <div className="explore-loading"><div className="spinner" /><span>Searching...</span></div>
                    ) : searchResults.length > 0 ? (
                      <div className="explore-grid">
                        {searchResults.map(result => (
                          <div key={result.id}
                            className="explore-card"
                            onClick={() => playSong(result)}
                            onPointerDown={() => handlePointerDown(result)}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerLeave}
                          >
                            <div className="explore-card-img">
                              <img src={result.thumbnail} alt={result.title} />
                            </div>
                            <div className="explore-card-info">
                              <div className="explore-card-title-row">
                                <p className="explore-card-title">{result.title}</p>
                                <button
                                  className={`explore-like-btn${isLiked(result) ? ' liked' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); toggleLike(result) }}
                                >
                                  <Heart size={13} fill={isLiked(result) ? 'currentColor' : 'none'} />
                                </button>
                              </div>
                              <p className="explore-card-artist">{result.artist}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="explore-empty">No results found for "{searchQuery}"</p>
                    )}
                  </>
                )}
              </div>
            )}

            {addToPlaylistTarget && (
              <div className="modal-overlay" onClick={() => setAddToPlaylistTarget(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Add to Collection</h3>
                    <button onClick={() => setAddToPlaylistTarget(null)} className="modal-x-btn"><X size={16} /></button>
                  </div>
                  {playlists.length === 0 ? (
                    <p className="modal-empty">No playlists created yet. Create one first.</p>
                  ) : (
                    <div className="modal-playlist-list">
                      {playlists.map(p => (
                        <button key={p.id} className="modal-playlist-item" onClick={() => addSongToPlaylist(p.id)}>
                          <Library size={18} />
                          <span>{p.name}</span>
                          <span className="modal-song-count">{p.songs.length} tracks</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setAddToPlaylistTarget(null)} className="modal-close-btn">Cancel</button>
                </div>
              </div>
            )}
          </main>

          {/* Minimalist Editorial Audio Dock for Desktop & Tablet */}
          {currentTrack && activeTab !== 'player' && (
            <div className="persistent-audio-dock">
              <div className="dock-track-info" onClick={() => navigateTo('player')}>
                <img src={currentTrack.thumbnail} alt="" className="dock-thumb" onError={handleImgError} decoding="async" />
                <div className="dock-text">
                  <p className="dock-title">{currentTrack.title}</p>
                  <p className="dock-artist">{currentTrack.artist}</p>
                </div>
              </div>

              <div className="dock-center-controls">
                <div className="dock-ctrl-btns">
                  <button onClick={handlePrev} className="dock-btn-sm" title="Previous">
                    <SkipBack size={16} fill="currentColor" />
                  </button>
                  <button onClick={togglePlayPause} className="dock-btn-play" title={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  </button>
                  <button onClick={handleNext} className="dock-btn-sm" title="Next">
                    <SkipForward size={16} fill="currentColor" />
                  </button>
                </div>
                <div className="dock-seek-wrap">
                  <span className="dock-time">{formatTime(currentTime)}</span>
                  <input
                    type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek}
                    className="dock-seek-bar"
                    style={{
                      background: `linear-gradient(to right, var(--text-main) ${(currentTime / (duration || 1)) * 100}%, var(--border-color) ${(currentTime / (duration || 1)) * 100}%)`
                    }}
                  />
                  <span className="dock-time">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="dock-right-actions">
                <button
                  onClick={() => toggleLike(currentTrack)}
                  className={`dock-action-btn${isLiked(currentTrack) ? ' liked' : ''}`}
                  title={isLiked(currentTrack) ? 'Unlike' : 'Like'}
                >
                  <Heart size={16} fill={isLiked(currentTrack) ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={handleRepeatToggle}
                  className={`dock-action-btn${repeatMode !== 'none' ? ' active' : ''}`}
                  title="Repeat mode"
                >
                  {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                </button>
                <button onClick={() => navigateTo('player')} className="dock-action-btn dock-expand-btn" title="Open Full Player">
                  <Maximize2 size={14} />
                  <span>Room</span>
                </button>
              </div>
            </div>
          )}

          {/* Minimalist Mobile Mini-Player for Android */}
          {currentTrack && activeTab !== 'player' && (
            <div className="mobile-mini-player" onClick={() => navigateTo('player')}>
              <img src={currentTrack.thumbnail} alt="" className="mini-thumb" onError={handleImgError} decoding="async" />
              <div className="mini-info">
                <p className="mini-title">{currentTrack.title}</p>
                <p className="mini-artist">{currentTrack.artist}</p>
              </div>
              <div className="mini-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => toggleLike(currentTrack)}
                  className={`mini-like-btn${isLiked(currentTrack) ? ' liked' : ''}`}
                >
                  <Heart size={15} fill={isLiked(currentTrack) ? 'currentColor' : 'none'} />
                </button>
                <button onClick={togglePlayPause} className="mini-play-btn">
                  {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
              </div>
            </div>
          )}

          {/* Floating Pill Bottom Navigation Dock (Android & Mobile) */}
          <nav className="bottom-nav" aria-label="Navigation Dock">
            <div className="bottom-nav-inner">
              <button
                onClick={() => navigateTo('welcome')}
                className={`nav-btn${activeTab === 'welcome' ? ' active' : ''}`}
                aria-label="Home"
              >
                <House size={18} />
                {activeTab === 'welcome' && <span className="nav-label">Home</span>}
              </button>
              <button
                onClick={() => { navigateTo('explore'); fetchTrendingSongs() }}
                className={`nav-btn${activeTab === 'explore' ? ' active' : ''}`}
                aria-label="Explore"
              >
                <Search size={18} />
                {activeTab === 'explore' && <span className="nav-label">Explore</span>}
              </button>
              <button
                onClick={() => navigateTo('player')}
                className={`nav-btn${activeTab === 'player' ? ' active' : ''}`}
                aria-label="Listening Room"
              >
                <Music2 size={18} />
                {isPlaying && activeTab !== 'player' && <span className="nav-dot-active" />}
                {activeTab === 'player' && <span className="nav-label">Room</span>}
              </button>
              <button
                onClick={() => navigateTo('playlists')}
                className={`nav-btn${activeTab === 'playlists' ? ' active' : ''}`}
                aria-label="Library"
              >
                <ListMusic size={18} />
                {activeTab === 'playlists' && <span className="nav-label">Library</span>}
              </button>
              <button
                onClick={() => setShowCoffeeModal(true)}
                className={`nav-btn nav-btn-coffee${showCoffeeModal ? ' active' : ''}`}
                title="Support Dhun"
                aria-label="Support"
              >
                <Coffee size={18} />
                {showCoffeeModal && <span className="nav-label">Support</span>}
              </button>
            </div>
          </nav>
        </div> {/* close .app-main-area */}

        {/* Coffee Modal */}
        {showCoffeeModal && (
          <div className="coffee-modal-overlay" onClick={() => setShowCoffeeModal(false)}>
            <div className="coffee-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="coffee-modal-title">Support Dhun</h3>
                <button className="coffee-modal-close" onClick={() => setShowCoffeeModal(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="coffee-modal-content">
                <p className="coffee-modal-subtitle">Direct patronage for independent audio software</p>
                <div className="coffee-qr-wrap">
                  <img src={qrCode} alt="Scan to pay" className="coffee-qr-img" />
                </div>
                <p className="coffee-modal-hint">Scan via any UPI / Payment application</p>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="coffee-modal-overlay" onClick={() => setShowSettingsModal(false)}>
            <div className="coffee-modal settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="coffee-modal-title">Settings</h3>
                <button className="coffee-modal-close" onClick={() => setShowSettingsModal(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="coffee-modal-content">
                <p className="coffee-modal-subtitle">YouTube Data API Configuration</p>
                <div className="settings-api-section">
                  <label className="settings-label">Personal API Key</label>
                  <input
                    type="password"
                    className="settings-api-input"
                    placeholder="AIzaSy..."
                    value={settingsApiKey}
                    onChange={(e) => setSettingsApiKey(e.target.value)}
                  />
                  <p className="settings-hint">
                    Obtain a key from{' '}
                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
                      Google Cloud Console
                    </a>
                    . Enable "YouTube Data API v3".
                  </p>
                  {customApiKey && (
                    <div className="settings-status-badge">
                      <span className="status-dot-green" />
                      <span>Custom API key configured</span>
                    </div>
                  )}
                </div>
                <div className="settings-actions">
                  <button className="settings-btn settings-btn-save" onClick={saveApiKey}>
                    Save Changes
                  </button>
                  {customApiKey && (
                    <button
                      className="settings-btn settings-btn-clear"
                      onClick={() => { setSettingsApiKey(''); localStorage.removeItem('dhun_youtube_api_key'); setCustomApiKey(''); setShowSettingsModal(false) }}
                    >
                      Use Default
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
