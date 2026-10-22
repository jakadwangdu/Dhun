// Dhun Dynamic Ambiance & Visual Harmonic Engine
// Extracts dominant color palettes from artwork/thumbnails and generates fluid ambient lighting meshes.

const colorCache = new Map()

/**
 * Deterministic harmonic color generator based on track string
 */
export function hashStringToHue(str = '') {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
}

function hslToRgb(h, s, l) {
  h /= 360
  s /= 100
  l /= 100
  let r, g, b

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * Creates fallback harmonic ambiance when an image fails or has strict CORS restrictions
 */
export function createFallbackAmbiance(seed = 'dhun') {
  const h1 = hashStringToHue(seed)
  const h2 = (h1 + 45) % 360
  const [r1, g1, b1] = hslToRgb(h1, 75, 45)
  const [r2, g2, b2] = hslToRgb(h2, 80, 50)

  return {
    primaryHex: rgbToHex(r1, g1, b1),
    secondaryHex: rgbToHex(r2, g2, b2),
    primaryRgb: `${r1}, ${g1}, ${b1}`,
    secondaryRgb: `${r2}, ${g2}, ${b2}`,
    accentHex: rgbToHex(r1, g1, b1),
    isFallback: true
  }
}

/**
 * Extracts dominant vibrant color from an image URL using an offscreen canvas
 */
export async function extractAmbianceColor(imageUrl, seed = 'dhun') {
  if (!imageUrl) return createFallbackAmbiance(seed)

  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return createFallbackAmbiance(seed)
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      const fallback = createFallbackAmbiance(seed)
      colorCache.set(imageUrl, fallback)
      resolve(fallback)
    }, 1800)

    img.onload = () => {
      if (timedOut) return
      clearTimeout(timeout)

      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        canvas.width = 24
        canvas.height = 24

        ctx.drawImage(img, 0, 0, 24, 24)
        const { data } = ctx.getImageData(0, 0, 24, 24)

        let bestScore = -1
        let bestRgb = null
        let totalR = 0, totalG = 0, totalB = 0, count = 0

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]

          if (a < 128) continue

          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const delta = max - min

          // Skip near-black or blown-out white pixels
          if (max < 25 || min > 240) continue

          totalR += r
          totalG += g
          totalB += b
          count++

          // Vibrant score favors rich colors with high chroma
          const saturation = max === 0 ? 0 : delta / max
          const brightness = max / 255
          const score = saturation * 1.5 + brightness * 0.5

          if (score > bestScore) {
            bestScore = score
            bestRgb = [r, g, b]
          }
        }

        let selected = bestRgb
        if (!selected && count > 0) {
          selected = [
            Math.round(totalR / count),
            Math.round(totalG / count),
            Math.round(totalB / count)
          ]
        }

        if (!selected) {
          const fallback = createFallbackAmbiance(seed)
          colorCache.set(imageUrl, fallback)
          resolve(fallback)
          return
        }

        const [r1, g1, b1] = selected
        // Harmonic secondary color with slight hue shift
        const [r2, g2, b2] = [
          Math.min(255, Math.round(r1 * 0.8 + g1 * 0.2)),
          Math.min(255, Math.round(g1 * 0.7 + b1 * 0.3)),
          Math.min(255, Math.round(b1 * 0.8 + r1 * 0.3))
        ]

        const result = {
          primaryHex: rgbToHex(r1, g1, b1),
          secondaryHex: rgbToHex(r2, g2, b2),
          primaryRgb: `${r1}, ${g1}, ${b1}`,
          secondaryRgb: `${r2}, ${g2}, ${b2}`,
          accentHex: rgbToHex(r1, g1, b1),
          isFallback: false
        }

        colorCache.set(imageUrl, result)
        resolve(result)
      } catch {
        const fallback = createFallbackAmbiance(seed)
        colorCache.set(imageUrl, fallback)
        resolve(fallback)
      }
    }

    img.onerror = () => {
      clearTimeout(timeout)
      const fallback = createFallbackAmbiance(seed)
      colorCache.set(imageUrl, fallback)
      resolve(fallback)
    }

    img.src = imageUrl
  })
}

/**
 * Generates dynamic CSS styles based on ambiance settings
 */
export function getAmbianceStyle(ambiance, mode = 'dynamic', intensity = 0.6) {
  const primaryRgb = ambiance?.primaryRgb || '20, 184, 166'
  const secondaryRgb = ambiance?.secondaryRgb || '99, 102, 241'

  if (mode === 'noir') {
    return {
      background: 'radial-gradient(circle at 50% 20%, rgba(255,255,255,0.06) 0%, rgba(5,5,5,0.98) 75%)',
      glow: 'rgba(255, 255, 255, 0.1)',
      accent: '#e4e4e7',
      rgb: '255, 255, 255'
    }
  }

  if (mode === 'neon') {
    return {
      background: `radial-gradient(circle at 20% 25%, rgba(244,63,94,${0.35 * intensity}) 0%, transparent 60%),
                   radial-gradient(circle at 80% 30%, rgba(6,182,212,${0.35 * intensity}) 0%, transparent 60%),
                   radial-gradient(circle at 50% 70%, rgba(168,85,247,${0.25 * intensity}) 0%, rgba(9,9,11,0.96) 80%)`,
      glow: `rgba(244, 63, 94, ${0.45 * intensity})`,
      accent: '#f43f5e',
      rgb: '244, 63, 94'
    }
  }

  if (mode === 'aurora') {
    return {
      background: `radial-gradient(circle at 30% 20%, rgba(52,211,153,${0.35 * intensity}) 0%, transparent 55%),
                   radial-gradient(circle at 75% 35%, rgba(99,102,241,${0.35 * intensity}) 0%, transparent 60%),
                   radial-gradient(circle at 50% 80%, rgba(236,72,153,${0.25 * intensity}) 0%, rgba(9,9,11,0.95) 80%)`,
      glow: `rgba(52, 211, 153, ${0.45 * intensity})`,
      accent: '#34d399',
      rgb: '52, 211, 153'
    }
  }

  // Default: Dynamic Canvas Sync (extracts real album colors)
  return {
    background: `radial-gradient(circle at 50% 20%, rgba(${primaryRgb}, ${0.45 * intensity}) 0%, transparent 65%),
                 radial-gradient(circle at 85% 45%, rgba(${secondaryRgb}, ${0.35 * intensity}) 0%, transparent 60%),
                 radial-gradient(circle at 50% 85%, rgba(${primaryRgb}, ${0.2 * intensity}) 0%, rgba(9,9,11,0.97) 85%)`,
    glow: `rgba(${primaryRgb}, ${0.5 * intensity})`,
    accent: ambiance?.accentHex || `rgb(${primaryRgb})`,
    rgb: primaryRgb
  }
}
