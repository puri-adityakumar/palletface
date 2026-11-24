/** The palletface mark: a 5 by 5 patch of field cells with one blue cell. */
export function FieldMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 5 5" width={size} height={size} aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M2 0h3v2H4v1H3v2H0V3h1V2h1z" />
      <path fill="#2633d9" d="M1 3h1v1H1z" />
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
