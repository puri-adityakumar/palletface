/** The palletface mark: an 11 by 11 pixel flower using the favicon's blue and red. */
export function PixelBloom({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 11 11" width={size} height={size} aria-hidden="true" shapeRendering="crispEdges">
      <path fill="#2b4fa5" d="M4 0h3v3h1V2h2v2H9v1h2v2H8v1h1v2H7V9H6v2H4V8H3v1H1V7h1V6H0V4h3V3H2V1h2z" />
      <path fill="#e8553e" d="M4 4h3v3H4z" />
    </svg>
  )
}

/** The GitHub mark (Octicons `mark-github`). */
export function GitHubMark({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
      />
    </svg>
  )
}

/** A filled star (Octicons `star-fill`), to sit next to the GitHub mark. */
export function StarMark({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"
      />
    </svg>
  )
}

/** Small pixel arrow used after outbound links. */
export function Out() {
  return (
    <svg className="out" viewBox="0 0 7 7" width="9" height="9" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M2 0h5v5H6V2H5v1H4v1H3v1H2v1H1v1H0V6h1V5h1V4h1V3h1V2h1V1H2z" />
    </svg>
  )
}

type IconProps = {
  /** One string per row; each character is a palette key, `.` is empty. */
  rows: readonly string[]
  colors: Record<string, string>
  /** CSS pixels per bitmap pixel, so icons of different widths share one pixel size. */
  scale?: number
  className?: string
}

/** A tiny bitmap drawn as SVG rects, one run of same-colored pixels per rect. */
export function PixelIcon({ rows, colors, scale = 4, className }: IconProps) {
  const w = Math.max(...rows.map((r) => r.length))
  const rects: { x: number; y: number; w: number; c: string }[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const key = row[x]!
      let end = x + 1
      while (end < row.length && row[end] === key) end++
      const c = colors[key]
      if (c) rects.push({ x, y, w: end - x, c })
      x = end
    }
  })
  return (
    <svg className={className} viewBox={`0 0 ${w} ${rows.length}`} width={w * scale} height={rows.length * scale} aria-hidden="true" shapeRendering="crispEdges">
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  )
}
