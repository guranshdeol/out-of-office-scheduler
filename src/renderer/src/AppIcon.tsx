/** The app icon (Lucide calendar-clock on the blue gradient tile, as in build/icon.png), drawn as SVG. */
export function AppIcon({ size = 22 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo">
      <defs>
        <linearGradient id="ooo-icon-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b8dff" />
          <stop offset="1" stopColor="#2a56d6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.2" fill="url(#ooo-icon-bg)" />
      <g
        transform="translate(6.1 6.1) scale(0.825)"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h5" />
        <path d="M17.5 17.5 16 16.3V14" />
        <circle cx="16" cy="16" r="6" />
      </g>
    </svg>
  )
}
