import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, Sun, Moon, Search, SkipBack, Pause, Play, SkipForward, Music2, ArrowLeft, Mic2, ListMusic, Plus, Trash2, Check, House, Library, Play as PlayIcon, Heart, Maximize2, Minimize2, Repeat, Repeat1, ChevronUp, Clock, Sparkles, Coffee } from 'lucide-react'
import './App.css'
import newLogo from './newlogo.png'
import qrCode from '../qr.png'

const YOUTUBE_API_BASE = '/api/youtube'

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

const TABS = ['welcome', 'explore', 'player', 'playlists']

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
  const [ambientColors, setAmbientColors] = useState([])
  const [isFullscreen, setIsFullscreen] = useState(false)

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
  const darkModeRef = useRef(false)

  useEffect(() => { repeatModeRef.current = repeatMode }, [repeatMode])
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { darkModeRef.current = isDarkMode }, [isDarkMode])
  useEffect(() => { currentIndexRef.current = currentTrackIndex }, [currentTrackIndex])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
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
          modestbranding: 1, playsinline: 1, iv_load_policy: 3
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
            const errors = {
              2: 'Invalid video parameter',
              5: 'HTML5 player error',
              100: 'Video not found or removed',
              101: 'Video embedding not allowed by creator',
              150: 'Video embedding not allowed by creator'
            }
            setPlayerError(errors[event.data] || 'Playback error')
            setIsPlaying(false)
            stopProgressTimer()
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
        `${YOUTUBE_API_BASE}/videos?part=snippet&chart=mostPopular&videoCategoryId=10&maxResults=20`
      )
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error.message || 'YouTube API request failed')
      }
      const songs = (data.items || []).map(item => ({
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
    if (!artist || !title) return
    setIsLoadingLyrics(true)
    setLyrics(null)
    try {
      const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim()
      const response = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(cleanTitle)}`
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data.lyrics && data.lyrics.length > 20) {
        const cleaned = data.lyrics
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/^.*?lyrics.*?\n/i, '')
          .replace(/^\d+\s*Contributors?\s*$/m, '')
          .trim()
        setLyrics(cleaned || data.lyrics)
      } else {
        setLyrics(null)
      }
    } catch {
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
        `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10`
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
      setErrorMsg(`Search failed: ${err.message}`)
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
    navigateTo('player')
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
    addToRecent(song)
    setQueue(playlist.songs)
    const idx = playlist.songs.findIndex(s => s.id === song.id)
    setCurrentTrackIndex(idx)
    navigateTo('player')
    actuallyPlay(song)
  }

  const playPlaylist = (playlist) => {
    if (playlist.songs.length === 0) return
    addToRecent(playlist.songs[0])
    setQueue(playlist.songs)
    setCurrentTrackIndex(0)
    navigateTo('player')
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
          `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5`
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
      } catch {
        setHeaderSearchResults([])
        setErrorMsg('Search unavailable right now')
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
        `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=7`
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
      setRecommendedSongs(results.filter(s => s.id !== track.id).slice(0, 5))
    } catch {
      setRecommendedSongs([])
    } finally {
      setIsLoadingRecommended(false)
    }
  }

  const fetchGenZRecommendations = async () => {
    setIsLoadingIndianRecs(true)
    const categories = [
      { name: '📱 TikTok Viral', query: 'tiktok viral songs 2025 2026 trending', color: '#ff0050' },
      { name: '🔥 Phonk Drill', query: 'phonk drill music 2025 aggressive', color: '#8b5cf6' },
      { name: '🌊 Afrobeats Wave', query: 'afrobeats hits 2025 2026 trending', color: '#f59e0b' },
      { name: '💀 Hyperpop Rage', query: 'hyperpop digicore 2025 experimental', color: '#06b6d4' },
      { name: '🎧 UK Drill', query: 'uk drill 2025 hits trending', color: '#ef4444' },
      { name: '🌴 Reggaeton Latino', query: 'reggaeton latin hits 2025 urbano', color: '#10b981' },
      { name: '🎵 Lo-Fi Chill', query: 'lofi hip hop chill beats 2025 study', color: '#6366f1' },
      { name: '🎤 Rap Underground', query: 'underground rap hip hop 2025 new', color: '#ec4899' },
    ]

    try {
      const categoryPromises = categories.map(async (cat) => {
        try {
          const response = await fetchWithRetry(
            `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(cat.query)}&type=video&maxResults=10`
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
    const recentIds = new Set()
    const picks = []
    const recent = recentlyPlayed.slice(0, 10)
    const recentArtistSet = new Set(recent.map(s => s.artist))
    const likedArtistSet = new Set(likedSongs.map(s => s.artist))

    const seen = new Set()
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
      { name: '🔥 Trending Now', icon: 'fire', songs: shuffled.slice(0, 6) },
      { name: '🎵 Top Picks', icon: 'music', songs: shuffled.slice(4, 10) },
      { name: '🌟 Discover', icon: 'star', songs: shuffled.slice(8, 14).length > 2 ? shuffled.slice(8, 14) : shuffled.slice(0, 6) },
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

  const makeAmbientColor = (r, g, b, isDark) => {
    const gray = r * 0.299 + g * 0.587 + b * 0.114
    const saturation = 0.3
    const dr = Math.round(r + (gray - r) * saturation)
    const dg = Math.round(g + (gray - g) * saturation)
    const db = Math.round(b + (gray - b) * saturation)
    if (isDark) {
      const lr = Math.round(dr * 0.5)
      const lg = Math.round(dg * 0.5)
      const lb = Math.round(db * 0.5)
      return `rgb(${lr},${lg},${lb})`
    }
    const lr = Math.round(dr + (255 - dr) * 0.3)
    const lg = Math.round(dg + (255 - dg) * 0.3)
    const lb = Math.round(db + (255 - db) * 0.3)
    return `rgb(${lr},${lg},${lb})`
  }

  const extractAmbientColors = useCallback(async (imageUrl) => {
    if (!imageUrl) return
    try {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, 8, 8)
      const { data } = ctx.getImageData(0, 0, 8, 8)
      const colorMap = {}
      for (let i = 0; i < data.length; i += 4) {
        const r = Math.round(data[i] / 32) * 32
        const g = Math.round(data[i + 1] / 32) * 32
        const b = Math.round(data[i + 2] / 32) * 32
        const a = data[i + 3]
        if (a < 128) continue
        const key = `${r},${g},${b}`
        colorMap[key] = (colorMap[key] || 0) + 1
      }
      const sorted = Object.entries(colorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([key]) => {
          const [r, g, b] = key.split(',').map(Number)
          return makeAmbientColor(r, g, b, darkModeRef.current)
        })
      setAmbientColors(sorted)
    } catch {
      setAmbientColors([])
    }
  }, [])

  useEffect(() => {
    if (currentTrack?.thumbnail) {
      extractAmbientColors(currentTrack.thumbnail)
    } else {
      setAmbientColors([])
    }
  }, [currentTrack, extractAmbientColors])

  const getTimeOfDay = () => {
    const h = new Date().getHours()
    if (h < 12) return 'morning'
    if (h < 17) return 'afternoon'
    return 'evening'
  }

  const rediscoverSongs = getRediscoverSongs()

  const handlePlayQuickPick = (song) => {
    addToRecent(song)
    setQueue([song])
    setCurrentTrackIndex(0)
    navigateTo('player')
    actuallyPlay(song)
  }

  const playPlaylistSongFromQueue = (song, queueList) => {
    addToRecent(song)
    setQueue(queueList)
    const idx = queueList.findIndex(s => s.id === song.id)
    setCurrentTrackIndex(idx)
    navigateTo('player')
    actuallyPlay(song)
  }

  return (
    <div
      className={`app-root${isDarkMode ? ' dark' : ''}${ambientColors.length ? ' has-ambient' : ''}`}
      style={ambientColors.length ? {
        background: `
          radial-gradient(ellipse 150% 50% at 50% -20%, ${ambientColors[0]} 0%, ${ambientColors[1] || ambientColors[0]} 35%, transparent 70%),
          radial-gradient(ellipse 120% 45% at 20% 100%, ${ambientColors[2] || ambientColors[0]} 0%, transparent 65%),
          radial-gradient(ellipse 120% 45% at 80% 100%, ${ambientColors[3] || ambientColors[1] || ambientColors[0]} 0%, transparent 65%),
          linear-gradient(to bottom, ${ambientColors[0]}00 0%, ${ambientColors[0]}08 100%)
        `
      } : {}}
    >
      <div className="bg-decoration" aria-hidden="true">
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
        <div className="bg-blob bg-blob-3" />
        <div className="bg-blob bg-blob-4" />
        <div className="bg-blob bg-blob-5" />
      </div>

      <div className="app-shell">
        <div className="youtube-player-wrapper"><div id="youtube-player-container"></div></div>

        <header className={`app-header${showHeaderSearch ? ' header-search-active' : ''}`}>
          <button onClick={handleHeaderBack} className="icon-btn back-btn">
            <ChevronLeft size={28} />
          </button>

          <div className={`header-search-container${showHeaderSearch ? ' expanded' : ''}`}>
            <button
              className="header-search-trigger"
              onClick={() => { setShowHeaderSearch(true); setTimeout(() => headerSearchInputRef.current?.focus(), 100) }}
            >
              <Search size={18} />
              {!showHeaderSearch && <span className="header-search-placeholder">Search</span>}
            </button>
            {showHeaderSearch && (
              <div className="header-search-dropdown">
                <div className="header-search-input-wrap">
                  <Search size={16} className="header-search-icon" />
                  <input
                    ref={headerSearchInputRef}
                    type="text"
                    className="header-search-input"
                    placeholder="Search songs, artists..."
                    value={headerSearchQuery}
                    onChange={(e) => doHeaderSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleHeaderSearchSubmit() } }}
                    onBlur={() => setTimeout(() => { if (!headerSearchQuery) setShowHeaderSearch(false) }, 200)}
                  />
                  {headerSearchQuery && (
                    <button className="header-search-clear" onClick={() => { setHeaderSearchQuery(''); setHeaderSearchResults([]); headerSearchInputRef.current?.focus() }}>
                      <ChevronLeft size={16} />
                    </button>
                  )}
                </div>
                {isHeaderSearching && (
                  <div className="header-search-loading"><div className="spinner-sm" /></div>
                )}
                {headerSearchResults.length > 0 && (
                  <div className="header-search-results">
                    {headerSearchResults.map(song => (
                      <div key={song.id} className="header-search-result-item" onClick={() => playTrackFromHeader(song)}>
                        <img src={song.thumbnail} alt="" className="header-search-result-thumb" />
                        <div className="header-search-result-info">
                          <p className="header-search-result-title">{song.title}</p>
                          <p className="header-search-result-artist">{song.artist}</p>
                        </div>
                      </div>
                    ))}
                    <div className="header-search-see-all" onClick={handleHeaderSearchSubmit}>
                      See all results for "{headerSearchQuery}"
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="header-actions">
            <button onClick={toggleFullscreen} className="icon-btn" title="Toggle fullscreen">
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="icon-btn">
              {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
            </button>
          </div>
        </header>

        <main className="app-main">
          {errorMsg && <div className="error-toast">{errorMsg}</div>}
          {playerErrorState && <div className="error-toast player-error">{playerErrorState}</div>}

          {activeTab === 'welcome' && (
             <div className="welcome-view">
               <section className="home-hero">
                 <div className="home-hero-bg" aria-hidden="true">
                   <div className="home-hero-blob home-hero-blob-1" />
                   <div className="home-hero-blob home-hero-blob-2" />
                 </div>
                 <div className="home-hero-content">
                   <div className="home-hero-logo-wrap">
                     <img src={newLogo} alt="Dhun" className="home-hero-logo" />
                   </div>
                   <div className="home-hero-text">
                     <p className="home-hero-greeting">Good {getTimeOfDay()}</p>
                     <h1 className="home-hero-title">Dhun</h1>
                     <p className="home-hero-subtitle">Your music, distilled</p>
                   </div>
                 </div>
               </section>

                {playlists.length > 0 && (
                  <section className="home-section">
                    <div className="home-section-header">
                      <div className="home-section-title-wrap">
                        <ListMusic size={18} className="home-section-icon" />
                        <h2 className="home-section-title">Your Playlists</h2>
                      </div>
                      <button className="home-section-link" onClick={() => navigateTo('playlists')}>
                        See all
                      </button>
                    </div>
                    <div className="home-playlists-scroll">
                      <div className="home-playlists-track">
                        {likedSongs.length > 0 && (
                          <div className="home-playlist-card" onClick={() => { setSelectedPlaylistId('liked'); navigateTo('playlists') }}>
                            <div className="home-playlist-cover home-playlist-liked">
                              <Heart size={20} fill="currentColor" />
                            </div>
                            <p className="home-playlist-name">Liked Songs</p>
                            <span className="home-playlist-count">{likedSongs.length}</span>
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
                                <ListMusic size={20} />
                              )}
                            </div>
                            <p className="home-playlist-name">{p.name}</p>
                            <span className="home-playlist-count">{p.songs.length}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {quickPicks.length > 0 && (
                  <section className="home-section">
                    <div className="home-section-header">
                      <div className="home-section-title-wrap">
                        <Sparkles size={18} className="home-section-icon" />
                        <h2 className="home-section-title">Quick Picks</h2>
                      </div>
                      <span className="home-section-subtitle">Based on your taste</span>
                    </div>
                    <div className="quick-picks-scroll">
                      <div className="quick-picks-track">
                        {quickPicks.map((song, idx) => (
                          <div key={song.id} className="quick-pick-card" onClick={() => handlePlayQuickPick(song)}>
                            <div className="quick-pick-thumb-wrap">
                              <img src={song.thumbnail} alt={song.title} className="quick-pick-img" />
                              <div className="quick-pick-overlay">
                                <div className="quick-pick-play-btn">
                                  <PlayIcon size={18} fill="currentColor" />
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

                <section className="home-section home-section-recs">
                  <div className="home-section-header">
                    <div className="home-section-title-wrap">
                      <h2 className="home-section-title">Trending Now</h2>
                    </div>
                    <span className="home-section-tag">Gen-Z Picks</span>
                  </div>

                  {isLoadingIndianRecs ? (
                    <div className="home-loading">
                      <div className="spinner" />
                      <span>Finding your perfect mix...</span>
                    </div>
                  ) : indianRecCategories.length > 0 ? (
                    <>
                      <div className="rec-categories-grid">
                        {indianRecCategories.slice(0, 6).map((category, catIdx) => (
                          <div
                            key={catIdx}
                            className="rec-category-card"
                            style={{ '--cat-color': category.color || '#8b5cf6' }}
                            onClick={() => {
                              if (category.songs.length === 0) return
                              addToRecent(category.songs[0])
                              setQueue(category.songs)
                              setCurrentTrackIndex(0)
                              navigateTo('player')
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
                                  <PlayIcon size={20} fill="currentColor" />
                                </div>
                              </div>
                            </div>
                            <div className="rec-category-info">
                              <h3 className="rec-category-name">{category.name}</h3>
                              <p className="rec-category-meta">{category.songs.length} songs</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rec-expanded-songs">
                        {indianRecCategories.slice(0, 3).map((category, catIdx) => (
                          <div key={catIdx} className="rec-song-group">
                            <div className="rec-song-group-header">
                              <div className="rec-song-group-color" style={{ background: category.color || '#8b5cf6' }} />
                              <h4 className="rec-song-group-title">{category.name}</h4>
                            </div>
                            <div className="rec-song-list">
                              {category.songs.slice(0, 5).map((song, songIdx) => (
                                <div
                                  key={song.id}
                                  className="rec-song-item"
                                  onClick={() => {
                                    addToRecent(song)
                                    setQueue(category.songs)
                                    setCurrentTrackIndex(songIdx)
                                    navigateTo('player')
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
                                      <Heart size={16} fill={isLiked(song) ? 'currentColor' : 'none'} />
                                    </button>
                                    <div className="rec-song-play-wrap">
                                      <PlayIcon size={14} fill="currentColor" />
                                    </div>
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
                        <Music2 size={32} />
                      </div>
                      <p>No recommendations yet</p>
                      <span>Search for songs to get personalized picks</span>
                    </div>
                  )}
                </section>

               {rediscoverSongs.length > 0 && (
                 <section className="home-section">
                   <div className="home-section-header">
                     <div className="home-section-title-wrap">
                       <Clock size={18} className="home-section-icon" />
                       <h2 className="home-section-title">Rediscover</h2>
                     </div>
                     <span className="home-section-subtitle">Songs you loved before</span>
                   </div>
                   <div className="quick-picks-scroll">
                     <div className="quick-picks-track">
                       {rediscoverSongs.map((song) => (
                         <div key={song.id} className="quick-pick-card" onClick={() => handlePlayQuickPick(song)}>
                           <div className="quick-pick-thumb-wrap">
                             <img src={song.thumbnail} alt={song.title} className="quick-pick-img" />
                             <div className="quick-pick-overlay">
                               <div className="quick-pick-play-btn">
                                 <PlayIcon size={18} fill="currentColor" />
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
                  <>
                    <h1 className="track-title">{currentTrack.title}</h1>
                    <p className="track-artist">{currentTrack.artist}</p>
                  </>
                ) : (
                  <div className="no-track-state">
                    <Music2 size={48} />
                    <h2>No song playing</h2>
                    <p>Search or explore to find music</p>
                  </div>
                )}
              </div>

              {currentTrack && (
                <>
                  <div className="album-art">
                    <img
                      src={currentTrack.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop'}
                      alt="Album Cover"
                      className={`album-img${isPlaying ? ' playing' : ''}`}
                    />
                  </div>

                  <div className="seek-section">
                    <input
                      type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek}
                      className="seek-bar"
                      style={{
                        background: `linear-gradient(to right, ${isDarkMode ? '#fff' : '#000'} ${(currentTime / (duration || 1)) * 100}%, ${isDarkMode ? '#333' : '#ccc'} ${(currentTime / (duration || 1)) * 100}%)`
                      }}
                    />
                  </div>

                  <div className="controls-row">
                    <button onClick={handlePrev} disabled={queue.length <= 1 && repeatMode !== 'one'} className="ctrl-btn">
                      <SkipBack size={28} fill="currentColor" />
                    </button>
                    <button onClick={togglePlayPause} className="ctrl-btn ctrl-btn-play">
                      {isPlaying
                        ? <Pause size={32} fill="currentColor" />
                        : <Play size={32} fill="currentColor" />}
                    </button>
                    <button onClick={handleNext} disabled={queue.length <= 1 && repeatMode !== 'one'} className="ctrl-btn">
                      <SkipForward size={28} fill="currentColor" />
                    </button>
                  </div>

                  <div className="player-actions-row">
                    <button
                      onClick={handleRepeatToggle}
                      className={`player-action-btn${repeatMode !== 'none' ? ' active-action-btn' : ''}`}
                      title={repeatMode === 'none' ? 'No repeat' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
                    >
                      {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                      {repeatMode === 'none' ? 'Repeat' : repeatMode === 'all' ? 'Repeat All' : 'Repeat One'}
                    </button>
                    <button
                      onClick={() => toggleLike(currentTrack)}
                      className={`player-action-btn${isLiked(currentTrack) ? ' liked-btn' : ''}`}
                    >
                      <Heart size={18} fill={isLiked(currentTrack) ? 'currentColor' : 'none'} />
                      {isLiked(currentTrack) ? 'Liked' : 'Like'}
                    </button>
                    <button onClick={toggleLyrics} className="player-action-btn">
                      <Mic2 size={18} />
                      {showLyrics ? 'Hide Lyrics' : 'Lyrics'}
                    </button>
                    <button onClick={() => setAddToPlaylistTarget(currentTrack)} className="player-action-btn">
                      <Plus size={18} />
                      Add
                    </button>
                  </div>

                  {showLyrics && (
                    <div className="lyrics-content-wrapper">
                      {isLoadingLyrics ? (
                        <div className="lyrics-loading"><div className="spinner" /></div>
                      ) : lyrics ? (
                        <pre className="lyrics-content">{lyrics}</pre>
                      ) : (
                        <div className="lyrics-empty">
                          <Mic2 size={28} />
                          <p>No lyrics available</p>
                          <span>Try searching for a different version</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="recommended-section">
                    <button
                      className="recommended-toggle"
                      onClick={() => setShowRecommendedSongs(!showRecommendedSongs)}
                    >
                      <span>You Might Also Like</span>
                      <ChevronUp size={18} className={`recommended-arrow${showRecommendedSongs ? ' rotated' : ''}`} />
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
                                <Heart size={14} fill={isLiked(song) ? 'currentColor' : 'none'} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="recommended-empty">No similar songs found</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'playlists' && (
            <div className="playlists-view">
              {selectedPlaylistId === 'liked' ? (
                <>
                  <div className="playlist-header-row">
                    <button onClick={() => setSelectedPlaylistId(null)} className="playlist-back-btn">
                      <ArrowLeft size={20} />
                    </button>
                    <div className="playlist-header-info">
                      <h2 className="playlist-name">Liked Songs</h2>
                      <p className="playlist-count">{likedSongs.length} songs</p>
                    </div>
                    {likedSongs.length > 0 && (
                      <button onClick={() => { setQueue(likedSongs); setCurrentTrackIndex(0); navigateTo('player'); actuallyPlay(likedSongs[0]) }} className="playlist-play-all-btn">
                        <PlayIcon size={20} />
                      </button>
                    )}
                  </div>

                  {likedSongs.length === 0 ? (
                    <p className="playlist-empty">No liked songs yet. Tap the heart to like!</p>
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
                            <Heart size={16} fill="currentColor" />
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
                      <ArrowLeft size={20} />
                    </button>
                    <div className="playlist-header-info">
                      <h2 className="playlist-name">{selectedPlaylist.name}</h2>
                      <p className="playlist-count">{selectedPlaylist.songs.length} songs</p>
                    </div>
                    {selectedPlaylist.songs.length > 0 && (
                      <button onClick={() => playPlaylist(selectedPlaylist)} className="playlist-play-all-btn">
                        <PlayIcon size={20} />
                      </button>
                    )}
                  </div>

                  {selectedPlaylist.songs.length === 0 ? (
                    <p className="playlist-empty">No songs in this playlist. Search and add from Explore!</p>
                  ) : (
                    <div className="playlist-songs">
                      {selectedPlaylist.songs.map(song => (
                        <div key={song.id}
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
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="playlists-header">
                    <h2 className="playlists-title">My Playlists</h2>
                    <button onClick={() => setIsCreatingPlaylist(true)} className="create-playlist-btn">
                      <Plus size={20} />
                      Create
                    </button>
                  </div>

                  {isCreatingPlaylist && (
                    <form className="create-playlist-form" onSubmit={(e) => { e.preventDefault(); createPlaylist() }}>
                      <input
                        type="text"
                        className="create-playlist-input"
                        placeholder="Playlist name..."
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="create-playlist-confirm"><Check size={18} /></button>
                      <button type="button" onClick={() => setIsCreatingPlaylist(false)} className="create-playlist-cancel"><ChevronLeft size={18} /></button>
                    </form>
                  )}

                  {likedSongs.length > 0 && (
                    <div className="playlist-card liked-songs-card" onClick={() => setSelectedPlaylistId('liked')}>
                      <div className="playlist-card-cover liked-cover">
                        <Heart size={24} fill="currentColor" />
                      </div>
                      <div className="playlist-card-info">
                        <h3 className="playlist-card-name">Liked Songs</h3>
                        <p className="playlist-card-count">{likedSongs.length} songs</p>
                      </div>
                    </div>
                  )}

                  <div className="playlists-divider" />

                  {playlists.length === 0 ? (
                    <div className="playlists-empty">
                      <ListMusic size={48} />
                      <p>No playlists yet</p>
                      <span>Create one to start adding your favorite songs</span>
                    </div>
                  ) : (
                    <div className="playlists-list">
                      {playlists.map(p => (
                        <div key={p.id} className="playlist-card" onClick={() => setSelectedPlaylistId(p.id)}>
                          <div className="playlist-card-cover">
                            <Library size={24} />
                          </div>
                          <div className="playlist-card-info">
                            <h3 className="playlist-card-name">{p.name}</h3>
                            <p className="playlist-card-count">{p.songs.length} songs</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); deletePlaylist(p.id) }} className="playlist-card-delete">
                            <Trash2 size={16} />
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
                            navigateTo('player')
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
                              <Heart size={14} fill={isLiked(song) ? 'currentColor' : 'none'} />
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
                    <h2 className="explore-title">Trending Worldwide</h2>
                  </div>
                  {isLoadingTrending ? (
                    <div className="explore-loading"><div className="spinner" /></div>
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
                                <Heart size={14} fill={isLiked(song) ? 'currentColor' : 'none'} />
                              </button>
                            </div>
                            <p className="explore-card-artist">{song.artist}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="explore-empty">Could not load trending songs. Check your YouTube API key.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="explore-back-row">
                    <button onClick={handleBackFromSearch} className="explore-back-btn">
                      <ArrowLeft size={18} />
                      <span>Trending</span>
                    </button>
                    <span className="explore-query-label">"{searchQuery}"</span>
                  </div>
                  {isSearching ? (
                    <div className="explore-loading"><div className="spinner" /></div>
                  ) : searchResults.length > 0 ? (
                    <>

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
                                <Heart size={14} fill={isLiked(result) ? 'currentColor' : 'none'} />
                              </button>
                            </div>
                            <p className="explore-card-artist">{result.artist}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    </>
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
                <h3>Add to Playlist</h3>
                {playlists.length === 0 ? (
                  <p className="modal-empty">No playlists yet. Create one first!</p>
                ) : (
                  <div className="modal-playlist-list">
                    {playlists.map(p => (
                      <button key={p.id} className="modal-playlist-item" onClick={() => addSongToPlaylist(p.id)}>
                        <Library size={20} />
                        <span>{p.name}</span>
                        <span className="modal-song-count">{p.songs.length} songs</span>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setAddToPlaylistTarget(null)} className="modal-close-btn">Cancel</button>
              </div>
            </div>
          )}
        </main>

        <nav className="bottom-nav">
          <div className="bottom-nav-inner">
            <button onClick={() => navigateTo('welcome')} className={`nav-btn${activeTab === 'welcome' ? ' active' : ''}`}>
              <House size={24} />
            </button>
            <button onClick={() => { navigateTo('explore'); fetchTrendingSongs() }} className={`nav-btn${activeTab === 'explore' ? ' active' : ''}`}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-svg-icon"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </button>
            <button onClick={() => navigateTo('player')} className={`nav-btn${activeTab === 'player' ? ' active' : ''}`}>
              <Music2 size={24} />
            </button>
            <button onClick={() => navigateTo('playlists')} className={`nav-btn${activeTab === 'playlists' ? ' active' : ''}`}>
              <ListMusic size={24} />
            </button>
            <button onClick={() => setShowCoffeeModal(true)} className="nav-btn nav-btn-coffee" title="Buy me a coffee">
              <Coffee size={24} />
            </button>
          </div>
        </nav>

        {showCoffeeModal && (
          <div className="coffee-modal-overlay" onClick={() => setShowCoffeeModal(false)}>
            <div className="coffee-modal" onClick={(e) => e.stopPropagation()}>
              <button className="coffee-modal-close" onClick={() => setShowCoffeeModal(false)}>
                <ChevronLeft size={20} />
              </button>
              <div className="coffee-modal-content">
                <div className="coffee-modal-icon">
                  <Coffee size={32} />
                </div>
                <h3 className="coffee-modal-title">Buy me a coffee</h3>
                <p className="coffee-modal-subtitle">Support the developer</p>
                <div className="coffee-qr-wrap">
                  <img src={qrCode} alt="Scan to pay" className="coffee-qr-img" />
                </div>
                <p className="coffee-modal-hint">Scan this QR code to send payment</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
