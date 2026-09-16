// Dhun Immersive Acoustic Engine
// Pure procedural Web Audio API synthesis for spatial soundscapes (Binaural 432Hz, Vinyl Warmth, Ambient Rain)
// Requires 0 network bandwidth, operates 100% offline, zero latency

let audioCtx = null
let masterGain = null
let activeNodes = []
let currentSoundscape = 'none'
let currentVolume = 0.2
let isPlayingState = false

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

function stopCurrentNodes() {
  activeNodes.forEach(node => {
    try {
      if (node.stop) node.stop()
      if (node.disconnect) node.disconnect()
    } catch (e) {}
  })
  activeNodes = []
}

// 1. 432 Hz Binaural Theta Resonance (Generates 432Hz & 438Hz tones for 6Hz Theta binaural frequency)
function createResonanceSoundscape(ctx, destination) {
  const oscL = ctx.createOscillator()
  const oscR = ctx.createOscillator()
  const gainNode = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  oscL.type = 'sine'
  oscL.frequency.setValueAtTime(432, ctx.currentTime)

  oscR.type = 'sine'
  oscR.frequency.setValueAtTime(438, ctx.currentTime) // 6 Hz Theta binaural beat for deep calm & immersion

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(600, ctx.currentTime)

  // Subtle warm drone level
  gainNode.gain.setValueAtTime(0.08, ctx.currentTime)

  if (ctx.createChannelMerger) {
    const merger = ctx.createChannelMerger(2)
    oscL.connect(merger, 0, 0)
    oscR.connect(merger, 0, 1)
    merger.connect(filter)
    activeNodes.push(merger)
  } else {
    oscL.connect(filter)
    oscR.connect(filter)
  }

  filter.connect(gainNode)
  gainNode.connect(destination)

  oscL.start()
  oscR.start()

  activeNodes.push(oscL, oscR, filter, gainNode)
}

// 2. Analog Vinyl Warmth & Tape Crackle
function createVinylSoundscape(ctx, destination) {
  const bufferSize = ctx.sampleRate * 3
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const output = noiseBuffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1
  }

  const whiteNoise = ctx.createBufferSource()
  whiteNoise.buffer = noiseBuffer
  whiteNoise.loop = true

  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.setValueAtTime(1800, ctx.currentTime)
  bandpass.Q.setValueAtTime(1.5, ctx.currentTime)

  const crackleGain = ctx.createGain()
  crackleGain.gain.setValueAtTime(0.045, ctx.currentTime)

  const lowShelf = ctx.createBiquadFilter()
  lowShelf.type = 'lowshelf'
  lowShelf.frequency.setValueAtTime(120, ctx.currentTime)
  lowShelf.gain.setValueAtTime(4, ctx.currentTime)

  whiteNoise.connect(bandpass)
  bandpass.connect(lowShelf)
  lowShelf.connect(crackleGain)
  crackleGain.connect(destination)

  whiteNoise.start()
  activeNodes.push(whiteNoise, bandpass, lowShelf, crackleGain)
}

// 3. Ambient Gentle Rain
function createRainSoundscape(ctx, destination) {
  const bufferSize = ctx.sampleRate * 4
  const rainBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = rainBuffer.getChannelData(channel)
    let lastOut = 0.0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      lastOut = (lastOut + 0.02 * white) / 1.02
      data[i] = lastOut * 3.5
    }
  }

  const rainSource = ctx.createBufferSource()
  rainSource.buffer = rainBuffer
  rainSource.loop = true

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.setValueAtTime(1000, ctx.currentTime)

  const rainGain = ctx.createGain()
  rainGain.gain.setValueAtTime(0.1, ctx.currentTime)

  rainSource.connect(lowpass)
  lowpass.connect(rainGain)
  rainGain.connect(destination)

  rainSource.start()
  activeNodes.push(rainSource, lowpass, rainGain)
}

export const immersionEngine = {
  setSoundscape(type) {
    currentSoundscape = type
    if (!isPlayingState || type === 'none') {
      stopCurrentNodes()
      return
    }

    const ctx = getAudioContext()
    if (!ctx) return

    stopCurrentNodes()

    if (!masterGain) {
      masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(currentVolume, ctx.currentTime)
      masterGain.connect(ctx.destination)
    } else {
      masterGain.gain.setValueAtTime(currentVolume, ctx.currentTime)
    }

    if (type === 'resonance') {
      createResonanceSoundscape(ctx, masterGain)
    } else if (type === 'vinyl') {
      createVinylSoundscape(ctx, masterGain)
    } else if (type === 'rain') {
      createRainSoundscape(ctx, masterGain)
    }
  },

  setVolume(vol) {
    currentVolume = Math.max(0, Math.min(1, vol))
    if (masterGain && audioCtx) {
      try {
        masterGain.gain.setTargetAtTime(currentVolume, audioCtx.currentTime, 0.05)
      } catch (e) {
        masterGain.gain.setValueAtTime(currentVolume, audioCtx.currentTime)
      }
    }
  },

  setPlaying(isPlaying) {
    isPlayingState = isPlaying
    if (!isPlaying) {
      stopCurrentNodes()
    } else if (currentSoundscape !== 'none') {
      this.setSoundscape(currentSoundscape)
    }
  },

  destroy() {
    stopCurrentNodes()
    if (audioCtx) {
      try {
        audioCtx.close()
      } catch (e) {}
      audioCtx = null
      masterGain = null
    }
  }
}
