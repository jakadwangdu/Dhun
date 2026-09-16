import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronLeft, Sun, Moon, Search, SkipBack, Pause, Play, SkipForward, Music2, ArrowLeft, Mic2, ListMusic, Plus, Trash2, Check, House, Library, Play as PlayIcon, Heart, Maximize2, Minimize2, Repeat, Repeat1, ChevronUp, Clock, Sparkles, Coffee, Settings, X, Menu, Sliders, Volume2, Headphones, Disc } from 'lucide-react'
import './App.css'
import logoVector from './logo_vector.svg'
import qrCode from '../qr.png'
import { immersionEngine } from './utils/immersionEngine'

const DEFAULT_YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || ''
const YOUTUBE_API_BASE = import.meta.env.DEV ? '/api/youtube' : 'https://www.googleapis.com/youtube/v3'

const getApiKey = () => {
  const stored = localStorage.getItem('dhun_youtube_api_key')
  return stored || DEFAULT_YOUTUBE_API_KEY
}

const buildApiUrl = (endpoint) => {
  const key = getApiKey()
  const separator = endpoint.includes('?') ? '&' : '?'
  if (import.meta.env.DEV) {
    return key ? `${YOUTUBE_API_BASE}${endpoint}${separator}key=${encodeURIComponent(key)}` : `${YOUTUBE_API_BASE}${endpoint}`
  }
  return `${YOUTUBE_API_BASE}${endpoint}${separator}key=${encodeURIComponent(key)}`
}

const fetchWithRetry = async (url, options) => {
  let delay = 1000
  let lastError
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(url, options)
      if (response.status === 429 || response.status === 403) {
        try { sessionStorage.setItem('dhun_api_rate_limited', 'true') } catch (e) {}
        throw new Error(`Rate limit or quota reached (HTTP ${response.status})`)
      }
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
      if (error.message?.includes('429') || error.message?.includes('403') || error.message?.includes('Rate limit')) {
        break
      }
      if (i < 2) {
        await new Promise(res => setTimeout(res, delay))
        delay *= 2
      }
    }
  }
  throw lastError
}

let currentQualityPreference = 'highres'

function enforceHighestQuality(player, quality = currentQualityPreference) {
  if (!player) return
  try {
    const available = typeof player.getAvailableQualityLevels === 'function' ? player.getAvailableQualityLevels() : []
    let targetQuality = quality
    if (quality === 'highres' && available && available.length > 0) {
      const hierarchy = ['highres', 'hd1440', 'hd1080', 'hd720', 'large', 'medium']
      for (const q of hierarchy) {
        if (available.includes(q)) {
          targetQuality = q
          break
        }
      }
    }
    if (typeof player.setPlaybackQuality === 'function') {
      player.setPlaybackQuality(targetQuality)
    }
  } catch (e) {}
}

function loadVideoSafely(player, videoId, quality = currentQualityPreference) {
  if (!player) return false
  setPlayerError(null)
  try {
    player.loadVideoById({ videoId, suggestedQuality: quality })
    setTimeout(() => enforceHighestQuality(player, quality), 250)
    return true
  } catch (e) {
    try {
      player.cueVideoById(videoId)
      setTimeout(() => enforceHighestQuality(player, quality), 250)
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
  const [showQuickMenu, setShowQuickMenu] = useState(false)
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
  const [showMoreQuickPicks, setShowMoreQuickPicks] = useState(false)
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [selectedHomeGenre, setSelectedHomeGenre] = useState('All')

  const toggleCategoryExpand = (catIdx) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catIdx]: !prev[catIdx]
    }))
  }

  // Audio Quality & Immersion states
  const [audioQuality, setAudioQuality] = useState(() => localStorage.getItem('dhun_audio_quality') || 'highres')
  const [immersionPreset, setImmersionPreset] = useState(() => localStorage.getItem('dhun_immersion_preset') || 'studio')
  const [soundscapeType, setSoundscapeType] = useState(() => localStorage.getItem('dhun_soundscape') || 'none')
  const [soundscapeVolume, setSoundscapeVolume] = useState(() => parseFloat(localStorage.getItem('dhun_soundscape_vol') || '0.2'))
  const [ambientGlowEnabled, setAmbientGlowEnabled] = useState(() => localStorage.getItem('dhun_ambient_glow') !== 'false')
  const [showImmersionModal, setShowImmersionModal] = useState(false)
  const [activePlaybackQuality, setActivePlaybackQuality] = useState('highres')

  useEffect(() => {
    currentQualityPreference = audioQuality
    localStorage.setItem('dhun_audio_quality', audioQuality)
    if (playerRef.current) {
      enforceHighestQuality(playerRef.current, audioQuality)
    }
  }, [audioQuality])

  useEffect(() => {
    localStorage.setItem('dhun_soundscape', soundscapeType)
    immersionEngine.setSoundscape(soundscapeType)
  }, [soundscapeType])

  useEffect(() => {
    localStorage.setItem('dhun_soundscape_vol', soundscapeVolume.toString())
    immersionEngine.setVolume(soundscapeVolume)
  }, [soundscapeVolume])

  useEffect(() => {
    immersionEngine.setPlaying(isPlaying)
  }, [isPlaying])

  useEffect(() => {
    localStorage.setItem('dhun_immersion_preset', immersionPreset)
  }, [immersionPreset])

  useEffect(() => {
    localStorage.setItem('dhun_ambient_glow', ambientGlowEnabled ? 'true' : 'false')
  }, [ambientGlowEnabled])

  const progressInterval = useRef(null)
  const trendingFetched = useRef(false)
  const playerReadyRef = useRef(false)
  const pendingTrackRef = useRef(null)
  const prevTabRef = useRef('welcome')
  const playerRef = useRef(null)
  const playerInitializingRef = useRef(false)
  const recommendationsFetchingRef = useRef(false)
  const similarCacheRef = useRef(new Map())

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
      if (!document.fullscreenElement && !document.webkitFullscreenElement && requestFs) {
        requestFs.call(docEl).catch(() => {})
      }
    } catch (e) {}
  }, [])

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        enterFullscreen()
      } else {
        const exitFs = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen
        if (exitFs) {
          exitFs.call(document).catch(() => {})
        }
      }
    } catch (e) {}
  }

  // Fullscreen state listener (user gesture initiated only, preventing browser security errors)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

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
    if (!isYtReady || playerRef.current || playerInitializingRef.current) return
    playerInitializingRef.current = true

    const currentOrigin = typeof window !== 'undefined' && window.location?.origin && window.location.origin.startsWith('http')
      ? window.location.origin
      : undefined

    try {
      new window.YT.Player('youtube-player-container', {
        height: '240', width: '320',
        videoId: '',
        playerVars: {
          autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0,
          modestbranding: 1, playsinline: 1, iv_load_policy: 3,
          enablejsapi: 1,
          ...(currentOrigin ? { origin: currentOrigin } : {})
        },
        events: {
          onReady: (event) => {
            const p = event.target
            playerRef.current = p
            setPlayer(p)
            setPlayerReady(true)
            playerReadyRef.current = true
            playerInitializingRef.current = false
            if (pendingTrackRef.current) {
              const t = pendingTrackRef.current
              pendingTrackRef.current = null
              loadVideoSafely(p, t.id, audioQuality)
            } else {
              enforceHighestQuality(p, audioQuality)
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true)
              enforceHighestQuality(event.target, audioQuality)
              try {
                const q = event.target.getPlaybackQuality?.()
                if (q && q !== 'unknown') setActivePlaybackQuality(q)
              } catch (e) {}
              const dur = event.target.getDuration()
              if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
                setDuration(dur)
              }
              startProgressTimer(event.target)
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false)
              stopProgressTimer()
            } else if (event.data === window.YT.PlayerState.ENDED) {
              setIsPlaying(false)
              stopProgressTimer()
              handleTrackEndRef.current()
            } else if (event.data === window.YT.PlayerState.BUFFERING) {
              // Video is buffering, continue updating or keep current state
              enforceHighestQuality(event.target, audioQuality)
            } else if (event.data === window.YT.PlayerState.CUED) {
              enforceHighestQuality(event.target, audioQuality)
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
    } catch (e) {
      playerInitializingRef.current = false
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
    const updateProgress = () => {
      if (!ytPlayer) return
      try {
        const cur = ytPlayer.getCurrentTime()
        if (typeof cur === 'number' && !isNaN(cur)) {
          setCurrentTime(cur)
        }
        const dur = ytPlayer.getDuration()
        if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
          setDuration(dur)
        }
      } catch (e) {}
    }
    updateProgress()
    progressInterval.current = setInterval(updateProgress, 500)
  }

  const stopProgressTimer = () => {
    if (progressInterval.current) clearInterval(progressInterval.current)
  }

  const actuallyPlay = useCallback((track) => {
    if (!track) return
    setCurrentTime(0)
    setDuration(0)
    const p = playerRef.current
    if (p && playerReadyRef.current) {
      setPlayerError(null)
      const ok = loadVideoSafely(p, track.id, audioQuality)
      if (!ok) setPlayerError('Could not play this video')
    } else {
      pendingTrackRef.current = track
    }
  }, [audioQuality])

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

    if (!getApiKey() || sessionStorage.getItem('dhun_api_rate_limited') === 'true') {
      setPlayerError('Embedding restricted for this track. Playing next...')
      setTimeout(() => handleNext(), 1200)
      return
    }

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
          loadVideoSafely(p, altVideoId, audioQuality)
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

    const apiKey = getApiKey()
    const isRateLimited = sessionStorage.getItem('dhun_api_rate_limited') === 'true'
    if (!apiKey || isRateLimited) {
      const fallbackTracks = FALLBACK_CATEGORIES.flatMap(c => c.songs)
      setTrendingSongs(fallbackTracks)
      setIsLoadingTrending(false)
      return
    }

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
      setTrendingSongs(songs.length > 0 ? songs : FALLBACK_CATEGORIES.flatMap(c => c.songs))
    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('Rate limit') || err.message?.includes('403')) {
        try { sessionStorage.setItem('dhun_api_rate_limited', 'true') } catch (e) {}
      }
      setTrendingSongs(FALLBACK_CATEGORIES.flatMap(c => c.songs))
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
    const apiKey = getApiKey()
    const isRateLimited = sessionStorage.getItem('dhun_api_rate_limited') === 'true'

    if (!apiKey || isRateLimited) {
      const q = query.toLowerCase().trim()
      const pool = [
        ...likedSongs,
        ...recentlyPlayed,
        ...FALLBACK_CATEGORIES.flatMap(c => c.songs)
      ]
      const results = pool.filter(s =>
        s.title.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)
      )
      const seen = new Set()
      const deduped = []
      for (const item of results) {
        if (!seen.has(item.id)) {
          seen.add(item.id)
          deduped.push(item)
        }
      }
      setSearchResults(deduped)
      setShowTrending(false)
      setIsSearching(false)
      if (deduped.length === 0) {
        setErrorMsg(isRateLimited
          ? 'YouTube API quota reached. Showing library matches.'
          : 'For full catalog search across all of YouTube, add your free API key in Settings (⚙️).')
        setTimeout(() => setErrorMsg(null), 6000)
      }
      return
    }

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
      if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('exceeded')) {
        try { sessionStorage.setItem('dhun_api_rate_limited', 'true') } catch (e) {}
      }
      const msg = err.message?.includes('quota') || err.message?.includes('exceeded') || err.message?.includes('429')
        ? 'YouTube API quota reached. Set a custom key in Settings (⚙️).'
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

    const apiKey = getApiKey()
    const isRateLimited = sessionStorage.getItem('dhun_api_rate_limited') === 'true'

    if (!apiKey || isRateLimited) {
      const q = query.toLowerCase().trim()
      const pool = [
        ...likedSongs,
        ...recentlyPlayed,
        ...FALLBACK_CATEGORIES.flatMap(c => c.songs)
      ]
      const results = pool.filter(s =>
        s.title.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)
      )
      const seen = new Set()
      const deduped = []
      for (const item of results) {
        if (!seen.has(item.id)) {
          seen.add(item.id)
          deduped.push(item)
        }
      }
      setHeaderSearchResults(deduped.slice(0, 6))
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
        if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('exceeded')) {
          try { sessionStorage.setItem('dhun_api_rate_limited', 'true') } catch (e) {}
        }
        const msg = err.message?.includes('quota') || err.message?.includes('exceeded') || err.message?.includes('429')
          ? 'YouTube API quota reached. Set a custom key in Settings.'
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
    if (similarCacheRef.current.has(track.id)) {
      setRecommendedSongs(similarCacheRef.current.get(track.id))
      return
    }
    setIsLoadingRecommended(true)
    const apiKey = getApiKey()
    const isRateLimited = sessionStorage.getItem('dhun_api_rate_limited') === 'true'

    if (!apiKey || isRateLimited) {
      const allFallback = FALLBACK_CATEGORIES.flatMap(c => c.songs)
      const filtered = allFallback.filter(s => s.id !== track.id).slice(0, 6)
      similarCacheRef.current.set(track.id, filtered)
      setRecommendedSongs(filtered)
      setIsLoadingRecommended(false)
      return
    }

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
      const filtered = results.filter(s => s.id !== track.id).slice(0, 6)
      const finalRecs = filtered.length > 0 ? filtered : FALLBACK_CATEGORIES.flatMap(c => c.songs).filter(s => s.id !== track.id).slice(0, 6)
      similarCacheRef.current.set(track.id, finalRecs)
      setRecommendedSongs(finalRecs)
    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('exceeded')) {
        try { sessionStorage.setItem('dhun_api_rate_limited', 'true') } catch (e) {}
      }
      const fallbackRecs = FALLBACK_CATEGORIES.flatMap(c => c.songs).filter(s => s.id !== track.id).slice(0, 6)
      similarCacheRef.current.set(track.id, fallbackRecs)
      setRecommendedSongs(fallbackRecs)
    } finally {
      setIsLoadingRecommended(false)
    }
  }

  const FALLBACK_CATEGORIES = [
    {
      name: 'Featured Selections',
      query: 'global viral top hits 2025 2026 trending',
      color: '#18181b',
      songs: [
        { id: '4NRXx6U8ABQ', title: 'The Weeknd - Blinding Lights', artist: 'The Weeknd', thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg' },
        { id: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg' },
        { id: 'OPf0YbXqDm0', title: 'Mark Ronson - Uptown Funk ft. Bruno Mars', artist: 'Mark Ronson', thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg' },
        { id: 'hT_nvWreIhg', title: 'OneRepublic - Counting Stars', artist: 'OneRepublic', thumbnail: 'https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg' },
        { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', artist: 'Luis Fonsi', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg' },
        { id: 'fJ9rUzIMcZQ', title: 'Queen - Bohemian Rhapsody', artist: 'Queen Official', thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg' },
        { id: '09R8_2nJtjg', title: 'Maroon 5 - Sugar', artist: 'Maroon 5', thumbnail: 'https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg' },
        { id: 'astISOttCQ0', title: 'The Chainsmokers & Coldplay - Something Just Like This', artist: 'The Chainsmokers', thumbnail: 'https://i.ytimg.com/vi/astISOttCQ0/hqdefault.jpg' },
      ]
    },
    {
      name: 'Modern Bass & Electronic',
      query: 'electronic dance bass workout hits',
      color: '#27272a',
      songs: [
        { id: 'LsoLEjrDogU', title: 'Martin Garrix - Animals', artist: 'Martin Garrix', thumbnail: 'https://i.ytimg.com/vi/LsoLEjrDogU/hqdefault.jpg' },
        { id: 'ALZHF5UqnU4', title: 'Marshmello - Alone', artist: 'Marshmello', thumbnail: 'https://i.ytimg.com/vi/ALZHF5UqnU4/hqdefault.jpg' },
        { id: '60ItHLz5WEA', title: 'Alan Walker - Faded', artist: 'Alan Walker', thumbnail: 'https://i.ytimg.com/vi/60ItHLz5WEA/hqdefault.jpg' },
        { id: 'papuvlVeZg8', title: 'Clean Bandit - Rather Be ft. Jess Glynne', artist: 'Clean Bandit', thumbnail: 'https://i.ytimg.com/vi/papuvlVeZg8/hqdefault.jpg' },
        { id: 'IcrbM1l_BoI', title: 'Avicii - Wake Me Up', artist: 'Avicii', thumbnail: 'https://i.ytimg.com/vi/IcrbM1l_BoI/hqdefault.jpg' },
        { id: '_ovdm2yX4MA', title: 'Avicii - The Nights', artist: 'Avicii', thumbnail: 'https://i.ytimg.com/vi/_ovdm2yX4MA/hqdefault.jpg' },
        { id: 'kOkQ4T5WO9E', title: 'Calvin Harris - Summer', artist: 'Calvin Harris', thumbnail: 'https://i.ytimg.com/vi/kOkQ4T5WO9E/hqdefault.jpg' },
        { id: 'fLexgOxsZu0', title: "Bruno Mars - That's What I Like", artist: 'Bruno Mars', thumbnail: 'https://i.ytimg.com/vi/fLexgOxsZu0/hqdefault.jpg' },
      ]
    },
    {
      name: 'Acoustic & Warm Melodies',
      query: 'acoustic chill mellow melodic songs',
      color: '#3f3f46',
      songs: [
        { id: '2Vv-BfVoq4g', title: 'Ed Sheeran - Perfect', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg' },
        { id: 'YQHsXMglC9A', title: 'Adele - Hello', artist: 'Adele', thumbnail: 'https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg' },
        { id: 'RgKAFK5djSk', title: 'Wiz Khalifa - See You Again ft. Charlie Puth', artist: 'Wiz Khalifa', thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg' },
        { id: 'RBumgq5yVrA', title: 'Passenger - Let Her Go', artist: 'Passenger', thumbnail: 'https://i.ytimg.com/vi/RBumgq5yVrA/hqdefault.jpg' },
        { id: 'rtOvBOTyX00', title: 'Christina Perri - A Thousand Years', artist: 'Christina Perri', thumbnail: 'https://i.ytimg.com/vi/rtOvBOTyX00/hqdefault.jpg' },
        { id: 'lp-EO5I60KA', title: 'Ed Sheeran - Thinking Out Loud', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/lp-EO5I60KA/hqdefault.jpg' },
        { id: 'hLQl3WQQoQ0', title: 'Adele - Someone Like You', artist: 'Adele', thumbnail: 'https://i.ytimg.com/vi/hLQl3WQQoQ0/hqdefault.jpg' },
        { id: 'SlPhMPnQ58k', title: 'Maroon 5 - Memories', artist: 'Maroon 5', thumbnail: 'https://i.ytimg.com/vi/SlPhMPnQ58k/hqdefault.jpg' },
      ]
    },
    {
      name: 'Global Pop Icons',
      query: 'global pop latin dance chart hits',
      color: '#52525b',
      songs: [
        { id: 'k2qgadSvNyU', title: 'Dua Lipa - New Rules', artist: 'Dua Lipa', thumbnail: 'https://i.ytimg.com/vi/k2qgadSvNyU/hqdefault.jpg' },
        { id: 'CevxZvSJLk8', title: 'Katy Perry - Roar', artist: 'Katy Perry', thumbnail: 'https://i.ytimg.com/vi/CevxZvSJLk8/hqdefault.jpg' },
        { id: 'nYh-n7EOtMA', title: 'Sia - Chandelier', artist: 'Sia', thumbnail: 'https://i.ytimg.com/vi/nYh-n7EOtMA/hqdefault.jpg' },
        { id: 'nfWlot6h_JM', title: 'Taylor Swift - Shake It Off', artist: 'Taylor Swift', thumbnail: 'https://i.ytimg.com/vi/nfWlot6h_JM/hqdefault.jpg' },
        { id: 'e-ORhEE9VVg', title: 'Taylor Swift - Blank Space', artist: 'Taylor Swift', thumbnail: 'https://i.ytimg.com/vi/e-ORhEE9VVg/hqdefault.jpg' },
        { id: 'q0hyYWKXF0Q', title: 'Tones and I - Dance Monkey', artist: 'Tones and I', thumbnail: 'https://i.ytimg.com/vi/q0hyYWKXF0Q/hqdefault.jpg' },
        { id: 'V1Pl8CzNzCw', title: 'Billie Eilish - bad guy', artist: 'Billie Eilish', thumbnail: 'https://i.ytimg.com/vi/V1Pl8CzNzCw/hqdefault.jpg' },
        { id: 'viimfQi_pUw', title: 'Billie Eilish & Khalid - lovely', artist: 'Billie Eilish', thumbnail: 'https://i.ytimg.com/vi/viimfQi_pUw/hqdefault.jpg' },
      ]
    },
    {
      name: 'Atmospheric Rock & Anthems',
      query: 'indie rock alternative anthem hits',
      color: '#71717a',
      songs: [
        { id: '7wtfhZwyrcc', title: 'Imagine Dragons - Believer', artist: 'Imagine Dragons', thumbnail: 'https://i.ytimg.com/vi/7wtfhZwyrcc/hqdefault.jpg' },
        { id: '1w7OgIMMRc4', title: "Guns N' Roses - Sweet Child O' Mine", artist: "Guns N' Roses", thumbnail: 'https://i.ytimg.com/vi/1w7OgIMMRc4/hqdefault.jpg' },
        { id: 'gNi_6U5Pm_o', title: 'Coldplay - Viva La Vida', artist: 'Coldplay', thumbnail: 'https://i.ytimg.com/vi/gNi_6U5Pm_o/hqdefault.jpg' },
        { id: '1G4isv_Fylg', title: 'Coldplay - Paradise', artist: 'Coldplay', thumbnail: 'https://i.ytimg.com/vi/1G4isv_Fylg/hqdefault.jpg' },
        { id: 'YykjpeuMNEk', title: 'Coldplay - Hymn For The Weekend', artist: 'Coldplay', thumbnail: 'https://i.ytimg.com/vi/YykjpeuMNEk/hqdefault.jpg' },
        { id: 'fJ9rUzIMcZQ', title: 'Queen - Bohemian Rhapsody', artist: 'Queen Official', thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg' },
        { id: 'hT_nvWreIhg', title: 'OneRepublic - Counting Stars', artist: 'OneRepublic', thumbnail: 'https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg' },
        { id: 'astISOttCQ0', title: 'The Chainsmokers & Coldplay - Something Just Like This', artist: 'The Chainsmokers', thumbnail: 'https://i.ytimg.com/vi/astISOttCQ0/hqdefault.jpg' },
      ]
    },
    {
      name: 'Hip-Hop & Urban Anthems',
      query: 'top hip hop rap timeless anthems',
      color: '#a1a1aa',
      songs: [
        { id: 'tvTRZJ-4EyI', title: 'Kendrick Lamar - HUMBLE.', artist: 'Kendrick Lamar', thumbnail: 'https://i.ytimg.com/vi/tvTRZJ-4EyI/hqdefault.jpg' },
        { id: 'uelHwf8o7_U', title: 'Eminem - Love The Way You Lie ft. Rihanna', artist: 'Eminem', thumbnail: 'https://i.ytimg.com/vi/uelHwf8o7_U/hqdefault.jpg' },
        { id: '2zToEPpFEN8', title: 'The Weeknd - Starboy ft. Daft Punk', artist: 'The Weeknd', thumbnail: 'https://i.ytimg.com/vi/2zToEPpFEN8/hqdefault.jpg' },
        { id: 'Dkk9gvTmCXY', title: 'Post Malone - Circles', artist: 'Post Malone', thumbnail: 'https://i.ytimg.com/vi/Dkk9gvTmCXY/hqdefault.jpg' },
        { id: 'YVkUvmDQ3HY', title: 'Eminem - Without Me', artist: 'Eminem', thumbnail: 'https://i.ytimg.com/vi/YVkUvmDQ3HY/hqdefault.jpg' },
        { id: 'RgKAFK5djSk', title: 'Wiz Khalifa - See You Again', artist: 'Wiz Khalifa', thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg' },
        { id: '4NRXx6U8ABQ', title: 'The Weeknd - Blinding Lights', artist: 'The Weeknd', thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg' },
        { id: 'OPf0YbXqDm0', title: 'Mark Ronson - Uptown Funk', artist: 'Mark Ronson', thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg' },
      ]
    },
    {
      name: 'Soulful & South Asian Hits',
      query: 'popular hindi bollywood melodies hits',
      color: '#e4e4e7',
      songs: [
        { id: 'JFcgOboQZ08', title: 'Arijit Singh - Tum Hi Ho', artist: 'Arijit Singh', thumbnail: 'https://i.ytimg.com/vi/JFcgOboQZ08/hqdefault.jpg' },
        { id: 'BddP6PYo2gs', title: 'Arijit Singh - Kesariya', artist: 'Arijit Singh', thumbnail: 'https://i.ytimg.com/vi/BddP6PYo2gs/hqdefault.jpg' },
        { id: 'ilNt2bikxDI', title: 'Jubin Nautiyal - Raataan Lambiyan', artist: 'Jubin Nautiyal', thumbnail: 'https://i.ytimg.com/vi/ilNt2bikxDI/hqdefault.jpg' },
        { id: 'VuG7ge_8I2Y', title: 'Ali Sethi & Shae Gill - Pasoori', artist: 'Coke Studio', thumbnail: 'https://i.ytimg.com/vi/VuG7ge_8I2Y/hqdefault.jpg' },
        { id: 'k4yXQkG2s1E', title: 'Arijit Singh - Shayad', artist: 'Arijit Singh', thumbnail: 'https://i.ytimg.com/vi/k4yXQkG2s1E/hqdefault.jpg' },
        { id: '2Vv-BfVoq4g', title: 'Ed Sheeran - Perfect', artist: 'Ed Sheeran', thumbnail: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg' },
        { id: 'hLQl3WQQoQ0', title: 'Adele - Someone Like You', artist: 'Adele', thumbnail: 'https://i.ytimg.com/vi/hLQl3WQQoQ0/hqdefault.jpg' },
        { id: 'RBumgq5yVrA', title: 'Passenger - Let Her Go', artist: 'Passenger', thumbnail: 'https://i.ytimg.com/vi/RBumgq5yVrA/hqdefault.jpg' },
      ]
    }
  ]

  const HOME_GENRES = [
    { id: 'All', label: 'All Hits' },
    { id: 'Featured Selections', label: 'Trending Hits' },
    { id: 'Modern Bass & Electronic', label: 'Electronic & Bass' },
    { id: 'Acoustic & Warm Melodies', label: 'Acoustic & Chill' },
    { id: 'Global Pop Icons', label: 'Pop Icons' },
    { id: 'Atmospheric Rock & Anthems', label: 'Rock Anthems' },
    { id: 'Hip-Hop & Urban Anthems', label: 'Hip-Hop & Rap' },
    { id: 'Soulful & South Asian Hits', label: 'Soulful Bollywood' },
  ]

  const fetchGenZRecommendations = async () => {
    if (recommendationsFetchingRef.current) return
    recommendationsFetchingRef.current = true
    setIsLoadingIndianRecs(true)
    const CACHE_KEY = 'dhun_genz_recommendations_v4'
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed?.categories?.length > 0) {
          setIndianRecCategories(parsed.categories)
          setIndianRecs(parsed.songs || [])
          setIsLoadingIndianRecs(false)
          recommendationsFetchingRef.current = false
          return
        }
      }
    } catch (e) {}

    const apiKey = getApiKey()
    const isRateLimited = sessionStorage.getItem('dhun_api_rate_limited') === 'true'

    if (!apiKey || isRateLimited) {
      setIndianRecCategories(FALLBACK_CATEGORIES)
      const allSongs = FALLBACK_CATEGORIES.flatMap(c => c.songs)
      setIndianRecs(allSongs.slice(0, 12))
      setIsLoadingIndianRecs(false)
      recommendationsFetchingRef.current = false
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ categories: FALLBACK_CATEGORIES, songs: allSongs.slice(0, 12) }))
      } catch (e) {}
      return
    }

    try {
      const categoriesToFetch = FALLBACK_CATEGORIES.slice(0, 3)
      const categoryPromises = categoriesToFetch.map(async (cat) => {
        try {
          const response = await fetchWithRetry(
            buildApiUrl(`/search?part=snippet&q=${encodeURIComponent(cat.query)}&type=video&videoEmbeddable=true&maxResults=6`)
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
          return { ...cat, songs: songs.length >= 2 ? songs.slice(0, 6) : cat.songs }
        } catch (err) {
          if (err.message?.includes('429') || err.message?.includes('Rate limit') || err.message?.includes('403')) {
            try { sessionStorage.setItem('dhun_api_rate_limited', 'true') } catch (e) {}
          }
          return cat
        }
      })

      const liveResults = await Promise.all(categoryPromises)
      const finalCategories = liveResults.concat(FALLBACK_CATEGORIES.slice(3))
      setIndianRecCategories(finalCategories)
      const allSongs = finalCategories.flatMap(c => c.songs)
      setIndianRecs(allSongs.slice(0, 12))
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ categories: finalCategories, songs: allSongs.slice(0, 12) }))
      } catch (e) {}
    } catch {
      setIndianRecCategories(FALLBACK_CATEGORIES)
      setIndianRecs(FALLBACK_CATEGORIES.flatMap(c => c.songs).slice(0, 12))
    } finally {
      setIsLoadingIndianRecs(false)
      recommendationsFetchingRef.current = false
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
      for (const s of songs || []) {
        if (!seen.has(s.id) && picks.length < 24) {
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
    addUnique(FALLBACK_CATEGORIES.flatMap(c => c.songs))

    return picks.slice(0, 24)
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
    sessionStorage.removeItem('dhun_api_rate_limited')
    sessionStorage.removeItem('dhun_genz_recommendations_v3')
    setShowSettingsModal(false)
    if (key) {
      trendingFetched.current = false
      recommendationsFetchingRef.current = false
      fetchGenZRecommendations()
      fetchTrendingSongs()
    }
  }

  const formatTime = (sec) => {
    if (!sec || isNaN(sec) || sec < 0) return '0:00'
    const totalSeconds = Math.floor(sec)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) {
      return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
    }
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
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
              <button onClick={openSettings} className="icon-btn header-settings-btn" title="Settings" aria-label="Settings">
                <Settings size={18} />
              </button>
              <button onClick={toggleFullscreen} className="icon-btn header-desktop-only" title="Toggle fullscreen" aria-label="Toggle fullscreen">
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="icon-btn header-desktop-only theme-toggle-btn" title={isDarkMode ? 'Light Mode' : 'Dark Mode'} aria-label="Toggle theme">
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button onClick={() => setShowQuickMenu(true)} className="icon-btn header-mobile-menu-btn" title="Menu" aria-label="Open navigation menu">
                <Menu size={20} />
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

                {/* Quick Genre Vibe Pills */}
                <div className="home-genre-bar-container">
                  <div className="home-genre-bar">
                    {HOME_GENRES.map(g => (
                      <button
                        key={g.id}
                        className={`home-genre-pill ${selectedHomeGenre === g.id ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedHomeGenre(g.id)
                          if (g.id !== 'All') {
                            setShowAllCategories(true)
                          }
                        }}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

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
                        {(showMoreQuickPicks ? quickPicks.slice(0, 16) : quickPicks.slice(0, 8)).map((song, idx) => (
                          <div key={song.id} className="quick-pick-card" onClick={() => handlePlayQuickPick(song)}>
                            <div className="quick-pick-thumb-wrap">
                              <img src={song.thumbnail} alt={song.title} className="quick-pick-img" onError={handleImgError} decoding="async" />
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
                    {quickPicks.length > 8 && (
                      <div className="home-more-action-row">
                        <button
                          className="home-show-more-pill"
                          onClick={() => setShowMoreQuickPicks(prev => !prev)}
                        >
                          {showMoreQuickPicks ? 'Show Less' : `Show More Quick Picks (+${Math.min(8, quickPicks.length - 8)})`}
                        </button>
                      </div>
                    )}
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
                                    <img key={i} src={s.thumbnail} alt="" onError={handleImgError} loading="lazy" decoding="async" />
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
                      <h2 className="home-section-title">
                        {selectedHomeGenre === 'All' ? 'Featured Channels' : selectedHomeGenre}
                      </h2>
                    </div>
                    {selectedHomeGenre !== 'All' ? (
                      <button className="home-section-link" onClick={() => setSelectedHomeGenre('All')}>
                        Show All Channels ➔
                      </button>
                    ) : (
                      <span className="home-section-tag">Editorial</span>
                    )}
                  </div>

                  {isLoadingIndianRecs ? (
                    <div className="home-loading">
                      <div className="spinner" />
                      <span>Loading curated selections...</span>
                    </div>
                  ) : indianRecCategories.length > 0 ? (
                    (() => {
                      const displayedCards = selectedHomeGenre === 'All'
                        ? (showAllCategories ? indianRecCategories : indianRecCategories.slice(0, 4))
                        : indianRecCategories.filter(c => c.name === selectedHomeGenre || c.name.toLowerCase().includes(selectedHomeGenre.toLowerCase()))

                      const displayedSongGroups = selectedHomeGenre === 'All'
                        ? (showAllCategories ? indianRecCategories : indianRecCategories.slice(0, 3))
                        : indianRecCategories.filter(c => c.name === selectedHomeGenre || c.name.toLowerCase().includes(selectedHomeGenre.toLowerCase()))

                      return (
                        <>
                          <div className="rec-categories-grid">
                            {displayedCards.map((category, catIdx) => (
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
                                        <img src={song.thumbnail} alt="" onError={handleImgError} loading="lazy" decoding="async" />
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
                            {displayedSongGroups.map((category, catIdx) => {
                              const isCategoryExpanded = !!expandedCategories[category.name || catIdx]
                              const songsToShow = isCategoryExpanded ? category.songs : category.songs.slice(0, 6)

                              return (
                                <div key={catIdx} className="rec-song-group">
                                  <div className="rec-song-group-header">
                                    <div className="rec-song-group-header-left">
                                      <span className="rec-song-group-bullet" />
                                      <h4 className="rec-song-group-title">{category.name}</h4>
                                    </div>
                                    <span className="rec-song-group-badge">{category.songs.length} tracks</span>
                                  </div>
                                  <div className="rec-song-list">
                                    {songsToShow.map((song, songIdx) => (
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
                                        <div className="rec-song-thumb-wrap">
                                          <img src={song.thumbnail} alt="" className="rec-song-thumb" onError={handleImgError} decoding="async" />
                                          <div className="rec-song-overlay">
                                            <div className="rec-song-play-btn">
                                              <PlayIcon size={14} fill="currentColor" />
                                            </div>
                                          </div>
                                        </div>
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
                                  {category.songs.length > 6 && (
                                    <div className="category-expand-row">
                                      <button
                                        className="category-expand-btn"
                                        onClick={() => toggleCategoryExpand(category.name || catIdx)}
                                      >
                                        {isCategoryExpanded ? 'Show Less' : `+${category.songs.length - 6} More Tracks`}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {selectedHomeGenre === 'All' && indianRecCategories.length > 3 && (
                            <div className="home-more-action-row channels-more-row">
                              <button
                                className="home-show-more-pill"
                                onClick={() => setShowAllCategories(prev => !prev)}
                              >
                                {showAllCategories ? 'Show Fewer Channels' : `Explore All Channels (${indianRecCategories.length} Categories)`}
                              </button>
                            </div>
                          )}
                        </>
                      )
                    })()
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
                              <img src={song.thumbnail} alt={song.title} className="quick-pick-img" onError={handleImgError} decoding="async" />
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
                      <div className="track-header-meta">
                        <button
                          className="hifi-status-badge"
                          onClick={() => setShowImmersionModal(true)}
                          title="Click to customize Audio Quality & Immersion"
                        >
                          <div className={`hifi-wave-bars ${isPlaying ? 'playing' : ''}`}>
                            <span className="wave-bar bar-1"></span>
                            <span className="wave-bar bar-2"></span>
                            <span className="wave-bar bar-3"></span>
                            <span className="wave-bar bar-4"></span>
                            <span className="wave-bar bar-5"></span>
                          </div>
                          <span className="hifi-badge-text">
                            {audioQuality === 'highres' ? 'HI-RES MASTER • 1080P' : audioQuality === 'hd720' ? 'STUDIO HD • 720P' : 'BALANCED AUDIO'}
                          </span>
                          <span className="hifi-preset-pill">
                            {immersionPreset === 'studio' ? 'Studio Pure' : immersionPreset === 'bass' ? 'Bass Boost' : immersionPreset === 'acoustic' ? 'Acoustic Warmth' : '3D Spatial'}
                          </span>
                          <Sparkles size={13} className="hifi-badge-sparkle" />
                        </button>
                        <span className="track-edition-tag">{isPlaying ? 'Now Playing' : 'Paused'}</span>
                      </div>
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
                      <div className="album-art-wrapper">
                        {ambientGlowEnabled && (
                          <div
                            className={`album-ambient-aura ${isPlaying ? 'pulsing' : ''}`}
                            style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
                          />
                        )}
                        <div className="album-art-container">
                          <img
                            src={currentTrack.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop'}
                            alt="Album Cover"
                            className="album-img"
                            onError={handleImgError}
                            decoding="async"
                          />
                        </div>
                      </div>

                      <div className="seek-section">
                        <div className="seek-meta-row">
                          <span className="seek-timestamp">{formatTime(currentTime)}</span>
                          <span className="seek-tag">{formatTime(duration)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={duration > 0 ? duration : 100}
                          value={Math.min(currentTime, duration > 0 ? duration : 100)}
                          onChange={handleSeek}
                          className="seek-bar"
                          style={{
                            background: `linear-gradient(to right, var(--text-main) ${duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%, var(--border-color) ${duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%)`
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
                        <button
                          onClick={() => setShowImmersionModal(true)}
                          className={`player-action-btn${soundscapeType !== 'none' || immersionPreset !== 'studio' ? ' active-action-btn' : ''}`}
                          title="Hi-Fi Quality & Spatial Immersion"
                        >
                          <Sparkles size={15} />
                          <span>Immersion</span>
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
                                    setQueue([song, ...recommendedSongs.filter(s => s.id !== song.id)])
                                    setCurrentTrackIndex(0)
                                    actuallyPlay(song)
                                  }}
                                >
                                  <img src={song.thumbnail} alt="" className="recommended-thumb" onError={handleImgError} decoding="async" />
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
                            <img src={song.thumbnail} alt="" className="playlist-song-thumb" onError={handleImgError} decoding="async" />
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
                            <img src={song.thumbnail} alt="" className="playlist-song-thumb" onError={handleImgError} decoding="async" />
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
                              <img src={song.thumbnail} alt="" className="recent-thumb" onError={handleImgError} decoding="async" />
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
                              <img src={song.thumbnail} alt={song.title} onError={handleImgError} decoding="async" />
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
                              <img src={result.thumbnail} alt={result.title} onError={handleImgError} decoding="async" />
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
                    type="range"
                    min="0"
                    max={duration > 0 ? duration : 100}
                    value={Math.min(currentTime, duration > 0 ? duration : 100)}
                    onChange={handleSeek}
                    className="dock-seek-bar"
                    style={{
                      background: `linear-gradient(to right, var(--text-main) ${duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%, var(--border-color) ${duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%)`
                    }}
                  />
                  <span className="dock-time">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="dock-right-actions">
                <button
                  onClick={() => setShowImmersionModal(true)}
                  className={`dock-action-btn dock-hifi-btn${soundscapeType !== 'none' || immersionPreset !== 'studio' ? ' active' : ''}`}
                  title="Hi-Fi Quality & Spatial Immersion"
                >
                  <Sparkles size={15} />
                  <span className="dock-hifi-label">Hi-Fi</span>
                </button>
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

        {/* Hi-Fi & Spatial Immersion Modal */}
        {showImmersionModal && (
          <div className="coffee-modal-overlay" onClick={() => setShowImmersionModal(false)}>
            <div className="coffee-modal immersion-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="immersion-modal-title-row">
                  <Sparkles size={18} className="immersion-title-icon" />
                  <h3 className="coffee-modal-title">Hi-Fi & Sound Immersion</h3>
                </div>
                <button className="coffee-modal-close" onClick={() => setShowImmersionModal(false)} aria-label="Close modal">
                  <X size={16} />
                </button>
              </div>

              <div className="coffee-modal-content immersion-modal-content">
                {/* 1. Stream Audio Quality */}
                <div className="immersion-section">
                  <div className="immersion-section-header">
                    <span className="immersion-section-title">Stream Fidelity Tier</span>
                    <span className="immersion-badge-gold">
                      {audioQuality === 'highres' ? '1080p Master' : audioQuality === 'hd720' ? '720p HD' : 'Adaptive'}
                    </span>
                  </div>
                  <div className="immersion-grid-3">
                    <button
                      className={`immersion-card ${audioQuality === 'highres' ? 'active' : ''}`}
                      onClick={() => setAudioQuality('highres')}
                    >
                      <div className="immersion-card-header">
                        <span className="immersion-card-title">Ultra HD Master</span>
                        {audioQuality === 'highres' && <Check size={14} />}
                      </div>
                      <p className="immersion-card-desc">Max 256kbps audio stream & studio depth (1080p)</p>
                    </button>

                    <button
                      className={`immersion-card ${audioQuality === 'hd720' ? 'active' : ''}`}
                      onClick={() => setAudioQuality('hd720')}
                    >
                      <div className="immersion-card-header">
                        <span className="immersion-card-title">Studio HD</span>
                        {audioQuality === 'hd720' && <Check size={14} />}
                      </div>
                      <p className="immersion-card-desc">Crisp 192kbps dynamic audio fidelity (720p)</p>
                    </button>

                    <button
                      className={`immersion-card ${audioQuality === 'default' ? 'active' : ''}`}
                      onClick={() => setAudioQuality('default')}
                    >
                      <div className="immersion-card-header">
                        <span className="immersion-card-title">Balanced</span>
                        {audioQuality === 'default' && <Check size={14} />}
                      </div>
                      <p className="immersion-card-desc">Optimized adaptive streaming for mobile data</p>
                    </button>
                  </div>
                </div>

                {/* 2. Acoustic Profiles */}
                <div className="immersion-section">
                  <div className="immersion-section-header">
                    <span className="immersion-section-title">Acoustic Immersion Profile</span>
                  </div>
                  <div className="immersion-grid-2">
                    <button
                      className={`immersion-card ${immersionPreset === 'studio' ? 'active' : ''}`}
                      onClick={() => setImmersionPreset('studio')}
                    >
                      <div className="immersion-card-header">
                        <span className="immersion-card-title">Studio Pure</span>
                        {immersionPreset === 'studio' && <Check size={14} />}
                      </div>
                      <p className="immersion-card-desc">Original transparent mix with linear studio response</p>
                    </button>

                    <button
                      className={`immersion-card ${immersionPreset === 'bass' ? 'active' : ''}`}
                      onClick={() => setImmersionPreset('bass')}
                    >
                      <div className="immersion-card-header">
                        <span className="immersion-card-title">Deep Bass Vibe</span>
                        {immersionPreset === 'bass' && <Check size={14} />}
                      </div>
                      <p className="immersion-card-desc">Sub-bass harmonic presence with punchy warmth</p>
                    </button>

                    <button
                      className={`immersion-card ${immersionPreset === 'acoustic' ? 'active' : ''}`}
                      onClick={() => setImmersionPreset('acoustic')}
                    >
                      <div className="immersion-card-header">
                        <span className="immersion-card-title">Acoustic Warmth</span>
                        {immersionPreset === 'acoustic' && <Check size={14} />}
                      </div>
                      <p className="immersion-card-desc">Lush vocal clarity and intimate analog resonance</p>
                    </button>

                    <button
                      className={`immersion-card ${immersionPreset === 'spatial' ? 'active' : ''}`}
                      onClick={() => setImmersionPreset('spatial')}
                    >
                      <div className="immersion-card-header">
                        <span className="immersion-card-title">3D Spatial Hall</span>
                        {immersionPreset === 'spatial' && <Check size={14} />}
                      </div>
                      <p className="immersion-card-desc">Expanded acoustic soundstage for headphones</p>
                    </button>
                  </div>
                </div>

                {/* 3. Spatial Ambient Soundscapes (Web Audio API) */}
                <div className="immersion-section">
                  <div className="immersion-section-header">
                    <div className="immersion-section-title-wrap">
                      <Volume2 size={15} />
                      <span className="immersion-section-title">Spatial Soundscape Layer</span>
                    </div>
                    {soundscapeType !== 'none' && (
                      <span className="immersion-active-tag">Active Layer</span>
                    )}
                  </div>
                  <div className="immersion-pills-row">
                    {[
                      { id: 'none', label: 'Off' },
                      { id: 'resonance', label: '432 Hz Theta' },
                      { id: 'vinyl', label: 'Vinyl Warmth' },
                      { id: 'rain', label: 'Gentle Rain' }
                    ].map(s => (
                      <button
                        key={s.id}
                        className={`immersion-pill-btn ${soundscapeType === s.id ? 'active' : ''}`}
                        onClick={() => setSoundscapeType(s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {soundscapeType !== 'none' && (
                    <div className="soundscape-volume-wrap">
                      <div className="soundscape-volume-labels">
                        <span className="soundscape-vol-text">Ambience Level</span>
                        <span className="soundscape-vol-num">{Math.round(soundscapeVolume * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={soundscapeVolume}
                        onChange={(e) => setSoundscapeVolume(parseFloat(e.target.value))}
                        className="immersion-slider"
                      />
                    </div>
                  )}
                </div>

                {/* 4. Visual Ambient Aura Glow */}
                <div className="immersion-toggle-row" onClick={() => setAmbientGlowEnabled(!ambientGlowEnabled)}>
                  <div className="immersion-toggle-info">
                    <span className="immersion-toggle-title">Reactive Album Aura</span>
                    <span className="immersion-toggle-subtitle">Pulsating ambient lighting around album artwork</span>
                  </div>
                  <div className={`immersion-switch ${ambientGlowEnabled ? 'on' : ''}`}>
                    <div className="immersion-switch-knob" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Quick Menu Drawer */}
        {showQuickMenu && (
          <div className="quick-menu-overlay" onClick={() => setShowQuickMenu(false)}>
            <div className="quick-menu-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="quick-menu-header">
                <div className="quick-menu-brand">
                  <img src={logoVector} alt="" className="quick-menu-logo" />
                  <div>
                    <h3 className="quick-menu-title">Dhun Music</h3>
                    <span className="quick-menu-subtitle">Audio Edition • Vol. 04</span>
                  </div>
                </div>
                <button
                  className="quick-menu-close"
                  onClick={() => setShowQuickMenu(false)}
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="quick-menu-body">
                <div className="quick-menu-section">
                  <span className="quick-menu-section-label">Index Navigation</span>
                  <div className="quick-menu-nav">
                    <button
                      className={`quick-menu-link${activeTab === 'welcome' ? ' active' : ''}`}
                      onClick={() => { navigateTo('welcome'); setShowQuickMenu(false) }}
                    >
                      <span className="quick-menu-num">01</span>
                      <span className="quick-menu-link-text">Overview & Home</span>
                    </button>
                    <button
                      className={`quick-menu-link${activeTab === 'explore' ? ' active' : ''}`}
                      onClick={() => { navigateTo('explore'); fetchTrendingSongs(); setShowQuickMenu(false) }}
                    >
                      <span className="quick-menu-num">02</span>
                      <span className="quick-menu-link-text">Explore & Trending</span>
                    </button>
                    <button
                      className={`quick-menu-link${activeTab === 'player' ? ' active' : ''}`}
                      onClick={() => { navigateTo('player'); setShowQuickMenu(false) }}
                    >
                      <span className="quick-menu-num">03</span>
                      <span className="quick-menu-link-text">Listening Room</span>
                      {isPlaying && <span className="quick-menu-badge">Playing</span>}
                    </button>
                    <button
                      className={`quick-menu-link${activeTab === 'playlists' ? ' active' : ''}`}
                      onClick={() => { navigateTo('playlists'); setShowQuickMenu(false) }}
                    >
                      <span className="quick-menu-num">04</span>
                      <span className="quick-menu-link-text">Collections & Library</span>
                    </button>
                  </div>
                </div>

                <div className="quick-menu-section">
                  <span className="quick-menu-section-label">Preferences & Controls</span>
                  <div className="quick-menu-actions">
                    <button
                      className="quick-menu-action-item"
                      onClick={() => { setShowQuickMenu(false); setShowImmersionModal(true) }}
                    >
                      <div className="quick-menu-action-left">
                        <Sparkles size={18} />
                        <span>Hi-Fi & Immersion</span>
                      </div>
                      <span className="quick-menu-pill">
                        {audioQuality === 'highres' ? '1080p Master' : '720p HD'}
                      </span>
                    </button>
                    <button
                      className="quick-menu-action-item"
                      onClick={() => { setShowQuickMenu(false); openSettings() }}
                    >
                      <div className="quick-menu-action-left">
                        <Settings size={18} />
                        <span>API Settings</span>
                      </div>
                      <span className="quick-menu-pill">
                        {customApiKey ? 'Custom Key' : 'Default'}
                      </span>
                    </button>

                    <button
                      className="quick-menu-action-item"
                      onClick={() => setIsDarkMode(!isDarkMode)}
                    >
                      <div className="quick-menu-action-left">
                        {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                        <span>Interface Theme</span>
                      </div>
                      <span className="quick-menu-pill">
                        {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                      </span>
                    </button>

                    <button
                      className="quick-menu-action-item"
                      onClick={() => { toggleFullscreen(); setShowQuickMenu(false) }}
                    >
                      <div className="quick-menu-action-left">
                        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        <span>Fullscreen Mode</span>
                      </div>
                      <span className="quick-menu-pill">
                        {isFullscreen ? 'Active' : 'Standard'}
                      </span>
                    </button>

                    <button
                      className="quick-menu-action-item"
                      onClick={() => { setShowQuickMenu(false); setShowCoffeeModal(true) }}
                    >
                      <div className="quick-menu-action-left">
                        <Coffee size={18} />
                        <span>Support Project</span>
                      </div>
                      <span className="quick-menu-pill highlight">Buy Coffee</span>
                    </button>
                  </div>
                </div>

                <div className="quick-menu-footer-card">
                  <div className="quick-menu-stream-status">
                    <span className="pulse-dot" />
                    <span>Stereo Hi-Fi • Zero-Ad Architecture</span>
                  </div>
                  <span className="quick-menu-version">Dhun v4.2 Editorial Release</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
