const PATHS = {
  play: <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" />,
  pause: (
    <>
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
    </>
  ),
  next: (
    <>
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
      <line x1="19" x2="19" y1="5" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  prev: (
    <>
      <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
      <line x1="5" x2="5" y1="19" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  back: <path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  search: (
    <>
      <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m21 21-4.3-4.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  heart: (
    <path
      d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  home: (
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 22V12h6v10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  library: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11 16V8l5-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9.5" cy="16" r="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  shuffle: (
    <>
      <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m18 2 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m18 14 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m7 11 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 21h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  check: (
    <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  queue: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="6" x2="3.01" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="12" x2="3.01" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="18" x2="3.01" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 3v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 17v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" x2="4" y1="21" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4" x2="4" y1="10" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" x2="12" y1="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" x2="12" y1="8" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" x2="20" y1="21" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" x2="20" y1="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="1" x2="7" y1="14" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" x2="15" y1="8" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="17" x2="23" y1="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  x: (
    <>
      <line x1="18" x2="6" y1="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" x2="18" y1="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  chevronDown: (
    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  zap: (
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  )
}

export function Icon({ name, size = 20, fill = false, className = '' }) {
  const content = PATHS[name]
  if (!content) return null

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      className={className}
      aria-hidden="true"
    >
      {content}
    </svg>
  )
}
