import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Icon } from './Icons'
import './NowPlayingView.css'

/**
 * Format seconds into mm:ss
 */
function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  const m = Math.floor(s / 60)
  const remainingS = s % 60
  return `${m}:${String(remainingS).padStart(2, '0')}`
}

function getInitialDominantColor(track) {
  const fallbackHue = track?.h ?? 150
  return {
    accent: `hsl(${fallbackHue}, 80%, 55%)`,
    accentGlow: `hsla(${fallbackHue}, 80%, 55%, 0.45)`,
    darkTint: 'rgba(14, 18, 22, 0.96)'
  }
}

export function NowPlayingView({
  playerOpen,
  currentTrack,
  playing,
  pos,
  trackDuration,
  repeatMode,
  shuffle,
  isLiked,
  isTrackDownloaded,
  downloadProgress = {},
  userSettings = {},
  queueOpen,
  tracks = [],
  cur = 0,
  onClose,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onToggleLike,
  onDownload,
  onToggleRepeat,
  onToggleShuffle,
  onToggleQueue,
  onPlayTrackAt,
  vibrate = () => {},
  getCoverArtStyle
}) {
  // Dominant colour state sampled via 12x12 canvas
  const [dominantColor, setDominantColor] = useState(() => getInitialDominantColor(currentTrack))

  // Pointer tilt parallax offset
  const [parallax, setParallax] = useState({ x: 0, y: 0 })

  // Touch swipe-to-dismiss states
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
  const touchStartTime = useRef(0)

  // Interactive progress slider dragging state
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekPos, setSeekPos] = useState(0)
  const sliderRef = useRef(null)

  const coverUrl = currentTrack?.img || currentTrack?.thumbnail || ''
  const effectiveDuration = currentTrack?.d || trackDuration || 210

  // 12x12 Canvas Dominant Colour Sampler
  useEffect(() => {
    let isMounted = true

    if (!coverUrl) {
      const fallbackHue = currentTrack?.h ?? 150
      const timer = setTimeout(() => {
        if (isMounted) {
          setDominantColor({
            accent: `hsl(${fallbackHue}, 80%, 55%)`,
            accentGlow: `hsla(${fallbackHue}, 80%, 55%, 0.45)`,
            darkTint: 'rgba(14, 18, 22, 0.96)'
          })
        }
      }, 0)
      return () => clearTimeout(timer)
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = coverUrl

    img.onload = () => {
      if (!isMounted) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 12
        canvas.height = 12
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, 12, 12)
        const imgData = ctx.getImageData(0, 0, 12, 12).data

        let bestScore = -1
        let bestR = 34, bestG = 197, bestB = 94
        let rSum = 0, gSum = 0, bSum = 0, count = 0

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i]
          const g = imgData[i + 1]
          const b = imgData[i + 2]
          const a = imgData[i + 3]
          if (a < 128) continue

          rSum += r
          gSum += g
          bSum += b
          count++

          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const delta = max - min
          const sat = max === 0 ? 0 : delta / max
          const lum = (max + min) / 510

          // Favor vibrant tones with balanced luminance for optimal UI contrast
          if (lum > 0.16 && lum < 0.85) {
            const score = sat * 2.2 + (0.5 - Math.abs(lum - 0.5))
            if (score > bestScore) {
              bestScore = score
              bestR = r
              bestG = g
              bestB = b
            }
          }
        }

        const finalR = bestScore > 0 ? bestR : (count ? Math.round(rSum / count) : 34)
        const finalG = bestScore > 0 ? bestG : (count ? Math.round(gSum / count) : 197)
        const finalB = bestScore > 0 ? bestB : (count ? Math.round(bSum / count) : 94)

        setDominantColor({
          accent: `rgb(${finalR}, ${finalG}, ${finalB})`,
          accentGlow: `rgba(${finalR}, ${finalG}, ${finalB}, 0.45)`,
          darkTint: `rgba(${Math.round(finalR * 0.14)}, ${Math.round(finalG * 0.14)}, ${Math.round(finalB * 0.14)}, 0.96)`
        })
      } catch {
        // Fallback for CORS restricted images
        const fallbackHue = currentTrack?.h ?? 150
        setDominantColor({
          accent: `hsl(${fallbackHue}, 78%, 55%)`,
          accentGlow: `hsla(${fallbackHue}, 78%, 55%, 0.4)`,
          darkTint: 'rgba(16, 20, 24, 0.96)'
        })
      }
    }

    img.onerror = () => {
      if (!isMounted) return
      const fallbackHue = currentTrack?.h ?? 150
      setDominantColor({
        accent: `hsl(${fallbackHue}, 78%, 55%)`,
        accentGlow: `hsla(${fallbackHue}, 78%, 55%, 0.4)`,
        darkTint: 'rgba(16, 20, 24, 0.96)'
      })
    }

    return () => {
      isMounted = false
    }
  }, [coverUrl, currentTrack])

  // Tilt Parallax on Pointer Move
  const handlePointerMove = useCallback((e) => {
    if (typeof window === 'undefined') return
    const normX = (e.clientX / window.innerWidth - 0.5) * 2
    const normY = (e.clientY / window.innerHeight - 0.5) * 2
    setParallax({
      x: Math.round(normX * 8),
      y: Math.round(normY * 8)
    })
  }, [])

  // Sheet swipe down gesture handlers
  const handleSheetTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
    touchStartX.current = e.touches[0].clientX
    touchStartTime.current = Date.now()
    setIsDragging(true)
  }

  const handleSheetTouchMove = (e) => {
    const diffY = e.touches[0].clientY - touchStartY.current
    const diffX = Math.abs(e.touches[0].clientX - touchStartX.current)
    if (diffY > 0 && diffY > diffX) {
      setDragY(diffY)
    }
  }

  const handleSheetTouchEnd = () => {
    setIsDragging(false)
    const elapsed = Math.max(1, Date.now() - touchStartTime.current)
    const velocity = dragY / elapsed

    if (dragY > 110 || velocity > 0.45) {
      vibrate(15)
      setDragY(0)
      if (onClose) onClose()
    } else {
      setDragY(0)
    }
  }

  // Seeking interactions (both click and continuous scrub)
  const calculateSeekPosition = useCallback(
    (clientX) => {
      if (!sliderRef.current) return 0
      const rect = sliderRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return ratio * effectiveDuration
    },
    [effectiveDuration]
  )

  const handleSeekPointerDown = (e) => {
    e.preventDefault()
    setIsSeeking(true)
    const newPos = calculateSeekPosition(e.clientX)
    setSeekPos(newPos)
    vibrate(6)

    const handlePointerMoveSeek = (moveEvent) => {
      const p = calculateSeekPosition(moveEvent.clientX)
      setSeekPos(p)
    }

    const handlePointerUpSeek = (upEvent) => {
      const finalPos = calculateSeekPosition(upEvent.clientX)
      setIsSeeking(false)
      vibrate(8)
      if (onSeek) onSeek(finalPos)
      window.removeEventListener('pointermove', handlePointerMoveSeek)
      window.removeEventListener('pointerup', handlePointerUpSeek)
    }

    window.addEventListener('pointermove', handlePointerMoveSeek)
    window.addEventListener('pointerup', handlePointerUpSeek)
  }

  // Keyboard navigation for progress slider
  const handleSliderKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const newPos = Math.max(0, pos - 5)
      if (onSeek) onSeek(newPos)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const newPos = Math.min(effectiveDuration, pos + 5)
      if (onSeek) onSeek(newPos)
    }
  }

  // Current display progress
  const currentPos = isSeeking ? seekPos : pos
  const progressRatio = Math.max(0, Math.min(1, currentPos / (effectiveDuration || 1)))
  const remainingSec = Math.max(0, effectiveDuration - currentPos)

  // Track liked and downloaded state
  const liked = typeof isLiked === 'function' ? isLiked(currentTrack) : !!isLiked
  const downloaded = typeof isTrackDownloaded === 'function' ? isTrackDownloaded(currentTrack?.id) : !!isTrackDownloaded
  const downloadPct = downloadProgress[currentTrack?.id]

  // Track info pill label (from existing userSettings and track data)
  const audioQualityBadge = useMemo(() => {
    if (userSettings?.audioQuality === 'highres') {
      return 'HI-RES OPUS'
    }
    return 'STUDIO 320K'
  }, [userSettings?.audioQuality])

  // Sheet transform calculations during drag-to-dismiss
  const sheetScale = dragY > 0 ? Math.max(0.88, 1 - (dragY / 1000) * 0.35) : 1
  const sheetRadius = dragY > 0 ? Math.min(48, dragY * 0.35) : 0

  return (
    <section
      aria-label="Now playing"
      className={`dhun-now-playing fixed inset-0 z-40 overflow-hidden bg-black text-white select-none transition-transform ${
        playerOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      style={{
        '--np-accent': dominantColor.accent,
        '--np-accent-glow': dominantColor.accentGlow,
        transform: playerOpen ? `translateY(${dragY}px) scale(${sheetScale})` : 'translateY(100%)',
        borderRadius: `${sheetRadius}px`,
        transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
        transitionDuration: isDragging ? '0s' : '0.35s'
      }}
      onPointerMove={handlePointerMove}
    >
      {/* ===================== AMBIANCE & BACKGROUND ===================== */}
      {/* 1. Heavily blurred, saturated copy behind everything (40% opacity) */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40 scale-125 transition-all duration-1000"
          style={{
            backgroundImage: coverUrl ? `url('${coverUrl}')` : undefined,
            filter: 'blur(75px) saturate(220%)'
          }}
        />
        {/* Dark gradient tinted with dominant color ending in black */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.45) 50%, ${dominantColor.darkTint} 78%, #000000 100%)`
          }}
        />
      </div>

      {/* 2. Full-bleed cover art filling roughly the top 74% of the screen with mask fade */}
      <div
        className="absolute top-0 inset-x-0 h-[74%] pointer-events-none overflow-hidden"
        style={{
          WebkitMaskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0) 100%)',
          maskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0) 100%)'
        }}
        aria-hidden="true"
      >
        <div
          className={`w-full h-full bg-cover bg-center transition-transform duration-700 ${
            playing ? 'np-cover-breathing' : 'scale-100'
          }`}
          style={{
            backgroundImage: coverUrl ? `url('${coverUrl}')` : undefined,
            transform: `translate3d(${parallax.x}px, ${parallax.y}px, 0)`,
            ...(!coverUrl && typeof getCoverArtStyle === 'function' ? getCoverArtStyle(currentTrack) : {})
          }}
        />
      </div>

      {/* Swipe Down Area / Grabber Bar */}
      <div
        className="absolute top-0 inset-x-0 h-20 z-20 cursor-grab active:cursor-grabbing flex flex-col items-center justify-start pt-2"
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
        aria-hidden="true"
      >
        <div className="h-1.5 w-12 rounded-full bg-white/40" />
      </div>

      {/* ===================== FOREGROUND CONTENT ===================== */}
      <div
        className="relative z-10 flex h-full flex-col justify-between px-6 mx-auto max-w-[480px] w-full"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)'
        }}
      >
        {/* ===================== TOP HEADER ===================== */}
        <header className="flex items-center justify-between pt-2">
          {/* Back / Close button (left) */}
          <button
            onClick={() => {
              vibrate(10)
              if (onClose) onClose()
            }}
            className="np-glass-btn h-11 w-11 rounded-full text-white/90"
            aria-label="Back to player view"
          >
            <Icon name="back" size={20} />
          </button>

          {/* Centred Title & Context */}
          <div className="min-w-0 flex-1 px-3 text-center">
            <span className="block text-[11px] font-bold tracking-[0.25em] text-white/90 uppercase">
              NOW PLAYING
            </span>
            <span className="block text-[12px] text-white/60 truncate font-medium mt-0.5">
              {currentTrack?.album ? `Playing from ${currentTrack.album}` : 'Playing from Library'}
            </span>
          </div>

          {/* Queue toggle button (right) */}
          <button
            onClick={() => {
              vibrate(10)
              if (onToggleQueue) onToggleQueue()
            }}
            className={`np-glass-btn h-11 w-11 rounded-full ${
              queueOpen ? 'text-black font-bold' : 'text-white/90'
            }`}
            style={{
              background: queueOpen ? dominantColor.accent : undefined
            }}
            aria-label="Up next queue"
            aria-expanded={queueOpen}
          >
            <Icon name="queue" size={20} />
          </button>
        </header>

        {/* Up Next Queue Drawer (Renders below header when toggled) */}
        {queueOpen && (
          <div
            className="rounded-[28px] p-5 max-h-[44vh] overflow-y-auto noscroll animate-fade-in my-2"
            style={{
              background: 'rgba(20, 24, 28, 0.88)',
              backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              border: '1px solid rgba(255, 255, 255, 0.12)'
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-bold text-base text-white">Up Next</h3>
              <span className="text-xs text-white/50">{tracks.length} tracks</span>
            </div>
            <ul className="mt-3 space-y-2">
              {tracks.map((t, idx) => (
                <li
                  key={t.id + '-' + idx}
                  onClick={() => {
                    if (onPlayTrackAt) onPlayTrackAt(idx)
                    if (onToggleQueue) onToggleQueue()
                  }}
                  className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition ${
                    idx === cur ? 'bg-white/15 font-semibold' : 'hover:bg-white/5 text-white/80'
                  }`}
                  style={{
                    color: idx === cur ? dominantColor.accent : undefined
                  }}
                >
                  <div
                    className="h-10 w-10 shrink-0 rounded-lg bg-cover bg-center bg-white/10"
                    style={{
                      backgroundImage: t.img || t.thumbnail ? `url('${t.img || t.thumbnail}')` : undefined
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{t.title}</p>
                    <p className="truncate text-xs text-white/60">{t.artist}</p>
                  </div>
                  {idx === cur && playing && (
                    <span
                      className="h-2 w-2 rounded-full animate-pulse"
                      style={{ background: dominantColor.accent }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Flexible spacer pushing the controls to bottom */}
        <div
          className="flex-1 cursor-grab"
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          aria-hidden="true"
        />

        {/* ===================== CONTROLS SECTION ===================== */}
        <div className="space-y-6 pb-2">
          {/* Title Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 pr-1">
              <h1 className="truncate text-[32px] sm:text-[34px] font-bold tracking-tight text-white leading-tight">
                {currentTrack?.title || 'Unknown Track'}
              </h1>
              <p className="truncate text-[19px] sm:text-[21px] text-white/65 font-medium mt-0.5">
                {currentTrack?.artist || 'Unknown Artist'}
              </p>
            </div>

            {/* Right Action Buttons (58px round) */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Like Button */}
              <button
                onClick={() => {
                  vibrate(10)
                  if (onToggleLike) onToggleLike(currentTrack)
                }}
                className={`np-glass-btn h-[58px] w-[58px] rounded-full ${
                  liked ? 'text-red-500' : 'text-white/80'
                }`}
                aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
              >
                <Icon name="heart" size={24} fill={liked} />
              </button>

              {/* Download Button */}
              <button
                onClick={() => {
                  vibrate(10)
                  if (onDownload) onDownload(currentTrack)
                }}
                className="np-glass-btn h-[58px] w-[58px] rounded-full text-white/80"
                aria-label={downloaded ? 'Downloaded offline' : 'Download track offline'}
              >
                {downloadPct ? (
                  <span
                    className="text-xs font-bold"
                    style={{ color: dominantColor.accent }}
                  >
                    {downloadPct}%
                  </span>
                ) : (
                  <Icon
                    name={downloaded ? 'check' : 'download'}
                    size={22}
                    className={downloaded ? 'text-white' : ''}
                  />
                )}
              </button>
            </div>
          </div>

          {/* ===================== PROGRESS SLIDER ===================== */}
          <div className="space-y-2">
            <div
              ref={sliderRef}
              className="np-progress-slider"
              onPointerDown={handleSeekPointerDown}
              onKeyDown={handleSliderKeyDown}
              role="slider"
              tabIndex={0}
              aria-label="Seek track"
              aria-valuenow={Math.round(currentPos)}
              aria-valuemin={0}
              aria-valuemax={Math.round(effectiveDuration)}
              aria-valuetext={`${formatTime(currentPos)} of ${formatTime(effectiveDuration)}`}
            >
              <div className="np-slider-track">
                {/* Accent Fill Track */}
                <div
                  className="np-slider-fill"
                  style={{
                    width: `${progressRatio * 100}%`,
                    background: dominantColor.accent
                  }}
                />
                {/* 22px Accent Thumb with Halo */}
                <div
                  className="np-slider-thumb"
                  style={{
                    left: `${progressRatio * 100}%`,
                    boxShadow: `0 0 16px ${dominantColor.accent}, 0 2px 8px rgba(0,0,0,0.4)`
                  }}
                />
              </div>
            </div>

            {/* Elapsed Time & Negative Remaining Time */}
            <div className="flex justify-between text-xs font-semibold tracking-wider text-white/60">
              <span>{formatTime(currentPos)}</span>
              <span>-{formatTime(remainingSec)}</span>
            </div>
          </div>

          {/* ===================== TRANSPORT ROW ===================== */}
          <div className="flex items-center justify-between gap-4">
            {/* 72px Previous Button */}
            <button
              onClick={() => {
                vibrate(12)
                if (onPrev) onPrev()
              }}
              className="np-glass-btn h-[72px] w-[72px] rounded-full text-white"
              aria-label="Previous track"
            >
              <Icon name="prev" size={26} />
            </button>

            {/* Wide Play/Pause Center Pill */}
            <button
              onClick={() => {
                vibrate(15)
                if (onTogglePlay) onTogglePlay()
              }}
              className="np-play-pill flex-1"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <Icon name={playing ? 'pause' : 'play'} size={24} fill />
              <span className="font-bold text-lg">{playing ? 'Pause' : 'Play'}</span>
            </button>

            {/* 72px Next Button */}
            <button
              onClick={() => {
                vibrate(12)
                if (onNext) onNext()
              }}
              className="np-glass-btn h-[72px] w-[72px] rounded-full text-white"
              aria-label="Next track"
            >
              <Icon name="next" size={26} />
            </button>
          </div>

          {/* ===================== BOTTOM ROW OF THREE 56px PILLS ===================== */}
          <div className="flex items-center gap-3">
            {/* 1. Shuffle Pill */}
            <button
              onClick={() => {
                vibrate(10)
                if (onToggleShuffle) onToggleShuffle()
              }}
              className={`np-glass-pill flex-1 ${
                shuffle ? 'text-black font-bold' : 'text-white/80'
              }`}
              style={{
                background: shuffle ? dominantColor.accent : undefined
              }}
              aria-label={shuffle ? 'Shuffle on' : 'Shuffle off'}
            >
              <Icon name="shuffle" size={20} />
            </button>

            {/* 2. Track Info Pill (Audio Quality) */}
            <div
              className="np-glass-pill flex-1 px-3 text-center text-[11px] font-bold tracking-wider text-white/80 uppercase pointer-events-none"
              aria-label={`Audio quality: ${audioQualityBadge}`}
            >
              <span>{audioQualityBadge}</span>
            </div>

            {/* 3. Repeat Pill */}
            <button
              onClick={() => {
                vibrate(10)
                if (onToggleRepeat) onToggleRepeat()
              }}
              className={`np-glass-pill flex-1 font-bold text-sm ${
                repeatMode !== 'off' ? 'text-black' : 'text-white/80'
              }`}
              style={{
                background: repeatMode !== 'off' ? dominantColor.accent : undefined
              }}
              aria-label={`Repeat mode: ${repeatMode}`}
            >
              <span className="text-base">{repeatMode === 'one' ? '1' : '⟲'}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
