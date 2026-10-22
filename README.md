# Dhun — Music, in Motion

Dhun is a high-fidelity music streaming application built with React 19, Vite, Tailwind CSS, and Capacitor Android.

---

## 1. Design Tokens & Visual Architecture

- **Background Palette**: Ink `#101211` / `#000000`, Raised Surfaces `#232725` / `#1c1c1e`.
- **Text Hierarchy**: Primary Text `#F4F6F5`, Muted Text `#8D9490`.
- **Accent Tokens**:
  - Lime `#D4F25A` (Active filter pills, user avatar).
  - Mint `#7CF2C8` (Waveform progress, active play transport button, library indicator).
  - Lilac `#C9A5F0` (Discover Weekly card background).
- **Glassmorphic Material**: `backdrop-filter: blur(28px) saturate(1.3)`, subtle white border `rgba(255, 255, 255, 0.08)`.
- **Ambient Aura**: Background colored glow nodes dynamically tracked to current track hue (`hsl(t.h, 80%, 55%)`) with smooth 18s drift.

---

## 2. Playback Architecture

Playback is unified through `PlaybackEngine` (`src/utils/audioEngine.js`):
1. **Persistent `HTMLAudioElement`**:
   - Used for direct audio streams (`src` property) and offline cached downloads.
   - Operates outside React's render tree, preserving playback across tab switching and component remounts.
   - Coordinates with the Media Session API (`navigator.mediaSession`) for lock-screen controls, seek bars, and background notification controls.
2. **YouTube Player Engine**:
   - Embedded iframe player (`window.YT.Player`) for streaming the global YouTube catalogue.
   - Syncs with progress listeners, quality enforcement, and track completion callbacks.
3. **Native Android Foreground Service & Wakelock**:
   - Supported natively via `@capacitor/core` plugin (`BackgroundAudioPlugin.java` & `BackgroundAudioService.java`).
   - Keeps audio playback alive even when the phone screen is turned off or in sleep mode.

---

## 3. In-App Downloads (Offline Playback)

1. **Storage Mechanism**:
   - Audio files are stored in the Cache Storage API under `dhun-offline-audio-v1`.
   - Metadata is indexed in persistent client storage with cover art, duration, title, and file size.
2. **HTTP Range Requests**:
   - The registered service worker (`public/sw.js`) intercepts range headers (`bytes=start-end`) on cached audio responses, enabling smooth scrubbing and seeking during airplane mode / offline playback.
3. **Quota & Management**:
   - Storage usage is calculated via `navigator.storage.estimate()` and displays in MB.
   - Tracks can be removed individually or purged in bulk via "Clear All".

---

## 4. Known Platform Limitations

- **YouTube Web Restrictions**: Mobile web browsers (Chrome/Safari) pause YouTube embedded iframes when the screen is locked or the tab is hidden due to browser and YouTube Terms of Service constraints. The Android APK bypasses this using the Native Android Foreground Service and Partial Wakelock.
- **iOS Safari PWA**: The first playback initiation must originate from a user gesture (tap/click). Once started, audio continues with the screen locked for direct audio streams.
- **Offline Download Scope**: Per terms of service, offline caching is enabled for tracks with direct stream permissions (`src` audio URLs), while YouTube video streams are streamed online.
