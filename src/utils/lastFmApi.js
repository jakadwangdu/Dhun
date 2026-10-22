// Last.fm API Client for Dhun High-Fidelity Metadata & Discovery
// Supports track search, top charts, high-res album covers, and metadata enrichment.

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/'
const DEFAULT_LASTFM_KEY = import.meta.env.VITE_LASTFM_API_KEY || '584544eefd54f619ba123ed47daabde0' // Official Dhun API key
const DEFAULT_LASTFM_SECRET = import.meta.env.VITE_LASTFM_SHARED_SECRET || 'edd7492772e9a984b9b3ffb882098640'
const DEFAULT_LASTFM_USER = import.meta.env.VITE_LASTFM_USER || 'micet97304'

export const getLastFmKey = () => {
  try {
    return localStorage.getItem('dhun_lastfm_api_key') || DEFAULT_LASTFM_KEY
  } catch {
    return DEFAULT_LASTFM_KEY
  }
}

export const getLastFmAccountInfo = () => {
  const customKey = localStorage.getItem('dhun_lastfm_api_key')
  return {
    appName: 'Dhun',
    apiKey: customKey || DEFAULT_LASTFM_KEY,
    sharedSecret: DEFAULT_LASTFM_SECRET,
    registeredUser: DEFAULT_LASTFM_USER,
    isCustomKey: Boolean(customKey),
    status: 'Active'
  }
}

export async function verifyLastFmConnection() {
  const key = getLastFmKey()
  try {
    const res = await fetch(`${LASTFM_API_BASE}?method=chart.gettoptracks&api_key=${key}&format=json&limit=1`, {
      headers: { 'User-Agent': 'DhunMusic/2.0 (music.lancebuddy.in)' }
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch top tracks from Last.fm global charts with high-resolution artwork
 */
export async function fetchLastFmTopTracks(limit = 20) {
  const key = getLastFmKey()
  const url = `${LASTFM_API_BASE}?method=chart.gettoptracks&api_key=${key}&format=json&limit=${limit}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DhunMusic/2.0 (music.lancebuddy.in)'
      }
    })
    if (!res.ok) throw new Error(`Last.fm chart fetch failed (${res.status})`)
    const data = await res.json()
    const tracks = data?.tracks?.track || []

    return tracks.map((t, idx) => {
      // Find largest available image (mega > extralarge > large > medium)
      const images = t.image || []
      const highResImg =
        images.find((img) => img.size === 'mega')?.['#text'] ||
        images.find((img) => img.size === 'extralarge')?.['#text'] ||
        images.find((img) => img.size === 'large')?.['#text'] ||
        ''

      return {
        id: `lastfm-${idx}-${encodeURIComponent(t.name)}`,
        title: t.name,
        artist: t.artist?.name || 'Unknown Artist',
        album: 'Top Hit',
        d: t.duration ? parseInt(t.duration, 10) : 210,
        img: highResImg,
        listeners: t.listeners,
        playcount: t.playcount,
        url: t.url,
        h: (idx * 43 + 15) % 360
      }
    })
  } catch (err) {
    console.warn('Last.fm top tracks unavailable:', err.message)
    return []
  }
}

/**
 * Fetch detailed track info (album name, high-res art, tags, wiki summary) from Last.fm
 */
export async function fetchLastFmTrackInfo(artist, trackTitle) {
  if (!artist || !trackTitle) return null
  const key = getLastFmKey()
  const cleanTitle = trackTitle.replace(/\(.*?\)|\[.*?\]|ft\..*|feat\..*/gi, '').trim()
  const cleanArtist = artist.replace(/\(.*?\)|\[.*?\]/gi, '').trim()

  const url = `${LASTFM_API_BASE}?method=track.getInfo&api_key=${key}&artist=${encodeURIComponent(
    cleanArtist
  )}&track=${encodeURIComponent(cleanTitle)}&format=json`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DhunMusic/2.0 (music.lancebuddy.in)'
      }
    })
    if (!res.ok) return null
    const data = await res.json()
    const track = data?.track
    if (!track) return null

    const images = track.album?.image || []
    const highResCover =
      images.find((img) => img.size === 'mega')?.['#text'] ||
      images.find((img) => img.size === 'extralarge')?.['#text'] ||
      images.find((img) => img.size === 'large')?.['#text'] ||
      ''

    return {
      album: track.album?.title || '',
      cover: highResCover,
      tags: track.toptags?.tag?.map((tag) => tag.name) || [],
      wiki: track.wiki?.summary || '',
      duration: track.duration ? Math.round(parseInt(track.duration, 10) / 1000) : 0
    }
  } catch {
    return null
  }
}

/**
 * Searches Last.fm for high-res metadata
 */
export async function searchLastFmTracks(query, limit = 10) {
  if (!query) return []
  const key = getLastFmKey()
  const url = `${LASTFM_API_BASE}?method=track.search&track=${encodeURIComponent(
    query
  )}&api_key=${key}&format=json&limit=${limit}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DhunMusic/2.0 (music.lancebuddy.in)'
      }
    })
    if (!res.ok) return []
    const data = await res.json()
    const matches = data?.results?.trackmatches?.track || []

    return matches.map((m) => {
      const images = m.image || []
      const img =
        images.find((i) => i.size === 'extralarge')?.['#text'] ||
        images.find((i) => i.size === 'large')?.['#text'] ||
        ''
      return {
        title: m.name,
        artist: m.artist,
        img,
        listeners: m.listeners
      }
    })
  } catch {
    return []
  }
}
