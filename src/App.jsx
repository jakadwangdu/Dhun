import React from 'react'
import { Capacitor } from '@capacitor/core'
import WebApp from './WebApp'
import ApkApp from './ApkApp'

export default function App() {
  // When running inside Capacitor Android APK -> Render ApkApp (Monochrome Glass, Last.fm, Offline Downloads, Sleep Mode BG Audio)
  // When running in Web Browser -> Render WebApp (Original Dhun Website with Download APK option, Playlists, Immersion, Visualizer)
  const isApk =
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' &&
      (window.location.protocol === 'capacitor:' || window.location.search.includes('view=apk')))

  return isApk ? <ApkApp /> : <WebApp />
}
