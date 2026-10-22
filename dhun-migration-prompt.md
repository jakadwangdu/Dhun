# Prompt: migrate Dhun to the new monochrome glass UI/UX, add background playback and offline downloads

Paste everything below into your AI coding assistant (Claude Code, Cursor, etc.) from the root of the Dhun repo. Attach `index.html` (the design prototype) to the same message.

---

## Role

You are a senior frontend engineer and product designer. You will replace the entire UI/UX of my existing music app **Dhun** (served at https://music.lancebuddy.in) with the design in the attached `index.html`, and add background playback and in-app downloads. Keep all existing backend, API calls, auth and data models working.

## Step 0: Audit before changing anything

1. Read the repo. List the framework (I believe Next.js with Framer Motion and the YouTube IFrame API), routing, state management, the API client and every endpoint the app calls.
2. Identify how audio is currently played (YouTube IFrame, an `<audio>` element, or something else). Report this to me before Step 3.
3. Write a short migration plan (screens, components, files to delete or rewrite) and then proceed.

## Step 1: Treat `index.html` as the design source of truth

Reproduce it faithfully. Do not redesign it, and do not keep the old UI.

**Design tokens**
- Pure black background `#000`. Raised surfaces `#1c1c1e`. Text `#F5F5F7`. Muted text `#8E8E93`. White is the only accent (active chips, play button, nav indicator, progress). No colour accents.
- Font: Inter (weights 400 to 800), headings with letter spacing about -0.028em.
- All cover art is rendered greyscale with a slight contrast boost (`grayscale(1) contrast(1.1)`).
- Easing: `cubic-bezier(.32,.72,0,1)` for every transition and animation.
- Apple-style glass: `backdrop-filter: blur(40px) saturate(190%)`, a white gradient fill (about 17% to 5% opacity), an inner top highlight, a 1px inner border, and a deep soft shadow. A lighter variant (`glass-sm`, blur 24px) is used for chips, list panels and the search field.
- A faint film-grain overlay (about 6% opacity) over the whole app.

**Screens and components to build (map each one to a route or component)**
- App shell: centred max-width 430px column on desktop, full-bleed on phones, safe-area insets respected, blurred current-cover backdrop behind everything.
- Intro splash ("Dhun / Music, in motion") shown once per session.
- Home: avatar, search and heart buttons, "Hi, {name}", filter chips (All, New Release, Trending, Top), featured "Discover weekly" card with 3D pointer tilt, "Top daily playlists" list in a glass panel, skeleton shimmer while loading.
- My Music: chips (All, Playlists, Liked Songs, Downloads), floating glass play and shuffle pill.
- Your Library: large title, black-and-white Super Mix hero, Listen Again list with durations, page dots, Old Gems list.
- Search: debounced (350 ms) search against the existing API with empty, loading and no-results states.
- Floating glass bottom nav with a sliding white indicator between four tabs.
- Mini player above the nav (cover with a pulsing ring while playing, play/pause, next). Tapping it opens the full player.
- Full-screen Now Playing sheet: full-bleed cover with a slow "breathing" zoom while playing and pointer parallax, a glass info card with title, artist, like, download and "Up next" buttons, a clickable waveform that seeks and pulses near the playhead, a separate glass transport bar, an Up next queue panel, a grabber, and swipe-down-to-dismiss (shrinks and rounds corners as you drag).
- Frosted title bar that fades in when a screen is scrolled past the large title.
- Toast component (glass pill) for feedback.

**Motion (use Framer Motion, since the project already includes it)**
- Screen transitions: fade, 14px upward slide, slight scale-in and blur-to-sharp, about 0.7 s.
- Lists: staggered rise-in (about 60 ms apart).
- Buttons: press scale 0.93, hover scale 1.04 on devices with hover.
- Shared-element feel when opening the player from the mini player.
- Everything respects `prefers-reduced-motion`.

**UX details to keep**
- Keyboard: Space play/pause, Left/Right seek 5 s, Shift+Left/Right previous/next, Escape closes the player.
- Light haptic (`navigator.vibrate(8)`) on taps where supported.
- Accessible names on every icon-only button, visible focus rings, `aria-current` on the active tab, a proper slider role on the waveform.
- Persist liked songs and the last played track.

Replace Tailwind or CSS-in-JS inconsistencies so the whole app uses one token system (CSS variables or Tailwind theme).

## Step 2: Wire the new UI to the real data

- Use the existing API client. Replace the placeholder `CFG` and `norm()` mapping in the prototype with the real endpoints and response shapes.
- Remove the stand-in picsum.photos images. Use the real thumbnails from the API, with the gradient underlay as the loading placeholder.
- Keep the demo-data fallback only for development.

## Step 3: Background playback (music keeps playing when the screen is off or the app is backgrounded)

1. **One playback engine.** Playback must run through a single persistent `HTMLAudioElement` (or Web Audio) that lives outside React's render tree, so route changes and re-renders never interrupt it.
2. **Media Session API.** Set metadata (title, artist, album, artwork at 96, 256 and 512 px), `playbackState`, `setPositionState`, and handlers for play, pause, previoustrack, nexttrack, seekto, seekforward and seekbackward, so lock-screen and notification controls work.
3. **PWA.** Add a web app manifest (`display: standalone`, black theme and background colours, 192 and 512 px maskable icons) and a service worker. Make the app installable on Android and iOS.
4. **Resilience.** Handle audio interruptions (calls, other apps) by pausing and resuming correctly. Resume after the tab regains visibility. Avoid timers that stop when the page is hidden: drive progress from the audio element's `timeupdate` and `currentTime`, not `setInterval`.
5. **Important constraint on the audio source.** Browsers pause the YouTube IFrame player when the screen locks or the tab is hidden, and YouTube's Terms of Service do not allow background or audio-only playback of its embedded player. Do **not** try to work around this by extracting or proxying YouTube audio streams. If the app currently plays through the YouTube IFrame, report that in Step 0 and implement background playback for sources I am allowed to stream directly (my own hosted audio, licensed catalogue, or openly licensed music). Keep the YouTube path working in the foreground only, and show a short, honest in-app notice that background play is unavailable for that source.
6. Note platform limits in the README (for example, iOS requires the installed PWA or an active audio session, and the first playback must start from a user gesture).

## Step 4: In-app downloads (offline playback)

Implement downloads only for tracks that have a direct, permitted audio URL from my API (the prototype assumes a `src` field per track). Do not implement downloading from YouTube or any source whose terms forbid it.

- Download button in the player card (icon changes to a check when saved), and a "Downloads" chip in My Music that lists saved songs.
- Store audio in the Cache Storage API (or IndexedDB for large files), with track metadata and cover art saved alongside so the library works offline.
- Show progress (use streamed `fetch` with `ReadableStream` to report bytes), allow cancel, and show clear errors: no stream available, no connection, storage full.
- Offline playback: when a track is downloaded, play from the local copy (blob URL or service-worker-served response) and make the Downloads tab work with no network.
- Management: delete a single download, "Remove all downloads", and show storage used (`navigator.storage.estimate()`). Request persistent storage (`navigator.storage.persist()`).
- Support HTTP range requests for seeking in cached audio via the service worker.
- Toast feedback: "Downloading…", "Saved for offline", "Already saved for offline", "Download failed. Check your connection and try again".

## Step 5: Quality bar and acceptance checklist

Do not finish until all of these are true, and report the result of each:

- [ ] No remnants of the old UI, old theme colours or unused components remain. Dead code is deleted.
- [ ] Visual match to `index.html` on a 390 px phone and on desktop (screenshot comparison for Home, My Music, Library, Search, Now Playing, Up next).
- [ ] 60 fps scrolling and animations on a mid-range phone. No layout shift. Lighthouse performance 90 or higher, accessibility 95 or higher.
- [ ] Audio continues with the screen locked on Android Chrome and on an installed iOS PWA (for permitted sources), and lock-screen controls work.
- [ ] A track downloaded while online plays with airplane mode on.
- [ ] Keyboard navigation and screen-reader labels work. Reduced-motion users get no large animations.
- [ ] Type-checks, lints and builds cleanly. Existing tests pass. Add tests for the playback store and the download manager.
- [ ] A short README section documenting the design tokens, the playback architecture, the offline storage design and known platform limits.

Work in small commits (one per step above). Ask me before deleting data or changing the database or API contract. If anything in this prompt conflicts with what you find in the repo, stop and tell me instead of guessing.
