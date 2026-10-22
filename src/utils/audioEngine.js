// Single persistent playback engine for Dhun
// Handles HTMLAudioElement (for direct audio streams and offline downloads)
// and YouTube IFrame Player (for YouTube catalog), with unified MediaSession and background audio focus.

import { startAudioKeeper, pauseAudioKeeper, updateMediaSession } from './backgroundAudio'
import { getOfflineAudioBlobUrl, isTrackDownloaded } from './downloadManager'

class PlaybackEngine {
  constructor() {
    this.audio = typeof Audio !== 'undefined' ? new Audio() : null
    this.ytPlayer = null
    this.ytReady = false
    this.currentTrack = null
    this.isPlaying = false
    this.currentTime = 0
    this.duration = 0
    this.listeners = new Set()
    this.activeSourceType = null // 'audio' | 'youtube' | null

    if (this.audio) {
      this.audio.preload = 'auto'
      this.audio.setAttribute('playsinline', 'true')
      this.audio.setAttribute('webkit-playsinline', 'true')

      this.audio.addEventListener('play', () => {
        this.isPlaying = true
        startAudioKeeper(this.currentTrack)
        this.syncMediaSession()
        this.notify('playState', true)
      })

      this.audio.addEventListener('pause', () => {
        this.isPlaying = false
        pauseAudioKeeper()
        this.syncMediaSession()
        this.notify('playState', false)
      })

      this.audio.addEventListener('timeupdate', () => {
        if (this.activeSourceType === 'audio') {
          this.currentTime = this.audio.currentTime
          if (this.audio.duration && !isNaN(this.audio.duration)) {
            this.duration = this.audio.duration
          }
          this.notify('time', { current: this.currentTime, duration: this.duration })
        }
      })

      this.audio.addEventListener('ended', () => {
        this.isPlaying = false
        this.notify('ended')
      })

      this.audio.addEventListener('error', (e) => {
        console.warn('HTMLAudio error:', e)
        this.notify('error', 'Audio playback error')
      })
    }
  }

  setYouTubePlayer(player) {
    this.ytPlayer = player
    this.ytReady = true
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify(event, data) {
    this.listeners.forEach((fn) => {
      try {
        fn(event, data)
      } catch (e) {
        console.error('Error in playback engine listener:', e)
      }
    })
  }

  async playTrack(track) {
    if (!track) return
    this.currentTrack = track
    this.currentTime = 0
    this.duration = track.d || track.duration || 0

    // Check if track is available offline first
    let audioSrc = track.src
    if (isTrackDownloaded(track.id)) {
      const blobUrl = await getOfflineAudioBlobUrl(track)
      if (blobUrl) audioSrc = blobUrl
    }

    if (audioSrc && this.audio) {
      // Direct audio source available -> Use HTMLAudioElement (Full background playback supported)
      this.activeSourceType = 'audio'
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        try { this.ytPlayer.pauseVideo() } catch (e) {}
      }

      this.audio.src = audioSrc
      try {
        await this.audio.play()
        this.isPlaying = true
      } catch (err) {
        console.warn('Audio play request failed or was interrupted:', err)
      }
    } else {
      // YouTube fallback
      this.activeSourceType = 'youtube'
      if (this.audio && !this.audio.paused) {
        this.audio.pause()
      }

      if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.loadVideoById === 'function') {
        try {
          this.ytPlayer.loadVideoById({
            videoId: track.id,
            suggestedQuality: 'highres'
          })
          this.isPlaying = true
          startAudioKeeper(track)
        } catch (err) {
          console.warn('YouTube loadVideo error:', err)
        }
      }
    }

    this.syncMediaSession()
    this.notify('trackChange', track)
  }

  pause() {
    if (this.activeSourceType === 'audio' && this.audio) {
      this.audio.pause()
    } else if (this.activeSourceType === 'youtube' && this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      try { this.ytPlayer.pauseVideo() } catch (e) {}
    }
    this.isPlaying = false
    pauseAudioKeeper()
    this.syncMediaSession()
    this.notify('playState', false)
  }

  resume() {
    if (this.activeSourceType === 'audio' && this.audio) {
      this.audio.play().catch(() => {})
    } else if (this.activeSourceType === 'youtube' && this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
      try { this.ytPlayer.playVideo() } catch (e) {}
    }
    this.isPlaying = true
    startAudioKeeper(this.currentTrack)
    this.syncMediaSession()
    this.notify('playState', true)
  }

  toggle() {
    if (this.isPlaying) {
      this.pause()
    } else {
      this.resume()
    }
  }

  seekTo(seconds) {
    this.currentTime = seconds
    if (this.activeSourceType === 'audio' && this.audio) {
      this.audio.currentTime = seconds
    } else if (this.activeSourceType === 'youtube' && this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
      try { this.ytPlayer.seekTo(seconds, true) } catch (e) {}
    }
    this.notify('time', { current: this.currentTime, duration: this.duration })
  }

  syncMediaSession() {
    if (!this.currentTrack) return
    updateMediaSession(
      {
        title: this.currentTrack.title,
        artist: this.currentTrack.artist,
        thumbnail: this.currentTrack.img || this.currentTrack.thumbnail
      },
      this.isPlaying,
      {
        onPlay: () => this.resume(),
        onPause: () => this.pause(),
        onPrev: () => this.notify('requestPrev'),
        onNext: () => this.notify('requestNext'),
        onSeek: (details) => {
          if (details.seekTime != null) {
            this.seekTo(details.seekTime)
          }
        }
      }
    )
  }
}

export const playbackEngine = new PlaybackEngine()
