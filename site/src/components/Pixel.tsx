/** The palletface mark: an 11 by 11 pixel flower. */
export function PixelBloom({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 11 11" width={size} height={size} aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M4 0h3v3h1V2h2v2H9v1h2v2H8v1h1v2H7V9H6v2H4V8H3v1H1V7h1V6H0V4h3V3H2V1h2z" />
      <path fill="#e8553e" d="M4 4h3v3H4z" />
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
