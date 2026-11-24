/**
 * A cell field grown from a seed. Ink cells come from seeded value noise, paper
 * cells next to ink show how many ink neighbours they have, the pointer leaves
 * a blue glow, and a click digs a hole. A new seed sweeps the old field into
 * the new one in dithered order.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { fnv1a } from 'palletface'
import { bayer } from '../lib/dither'
import { useReducedMotion } from '../lib/hooks'

export type Dig = { x: number; y: number }
export type FieldShape = 'hero' | 'footer' | 'sponsor'

type Rect = { x0: number; y0: number; x1: number; y1: number }
type Refs = readonly RefObject<HTMLElement | null>[]

type Props = {
  seed: string
  shape: FieldShape
  /** Cell size in CSS pixels on wide screens; narrow screens use about 70% of it. */
  cell?: number
  /** Areas kept as paper, with a ragged margin. */
  clear?: Refs
  /** Areas kept as ink, with a ragged margin. */
  solid?: Refs
  onDig?: (dig: Dig) => void
  onStats?: (ink: number) => void
  className?: string
}

const PAPER = '#e7e7e3'
const INK = '#1d1d1b'
const GLOW = '#2633d9'
const GLOW_SOFT = '#a9b0ff'
const DIGIT = '#8c8c88'

const hash = (x: number, y: number, s: number) => {
  let h = (s ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

const noise = (x: number, y: number, s: number) => {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(x0, y0, s)
  const b = hash(x0 + 1, y0, s)
  const c = hash(x0, y0 + 1, s)
  const d = hash(x0 + 1, y0 + 1, s)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

const distToRect = (x: number, y: number, r: Rect) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1))

/** Signed ink value for one cell before the clear and solid areas apply. Positive is ink. */
function shapeValue(shape: FieldShape, u: number, v: number, n: number, narrow: boolean) {
  // the hero erodes to paper along its bottom edge so the next section starts on paper
  const fade = Math.max(0, v - 0.8) * 14
  if (shape === 'hero') return (narrow ? (v - 0.56) * 3 + (u - 0.5) * 0.5 + (n - 0.5) * 1.4 : (u - 0.53) * 3.3 + (v - 0.5) * 0.8 + (n - 0.5) * 1.6) - fade
  if (shape === 'footer') return (v - 0.42) * 2.6 + (u - 0.5) * 0.5 + (n - 0.5) * 1.4
  return (n - 0.5) * 2.4 + (v - 0.5) * 0.5
}

function generate(seed: string, cols: number, rows: number, shape: FieldShape, narrow: boolean, clear: Rect[], solid: Rect[]) {
  const s = fnv1a(seed)
  const out = new Uint8Array(cols * rows)
  const quiet = new Uint8Array(cols * rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n = noise(x / 7, y / 7, s) * 0.65 + noise(x / 3, y / 3, s ^ 0x9e3779b9) * 0.35
      const fine = hash(x, y, s ^ 0x51ed270b)
      let value = shapeValue(shape, (x + 0.5) / cols, (y + 0.5) / rows, n, narrow)
      // single cells break off near the edge, so the border reads as erosion
      if (Math.abs(value) < 0.2 && fine < 0.26) value = -value
      const cx = x + 0.5
      const cy = y + 0.5
      for (const r of clear) {
        const d = distToRect(cx, cy, r)
        if (d < 1.1 + fine * 1.4) value = -1
        if (d < 1.2) quiet[y * cols + x] = 1
      }
      for (const r of solid) if (distToRect(cx, cy, r) < 1 + fine * 1.4) value = 1
      out[y * cols + x] = value > 0 ? 1 : 0
    }
  }
  return { ink: out, quiet }
}

export function SeedField({ seed, shape, cell: cellWide = 28, clear = [], solid = [], onDig, onStats, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const latest = useRef({ seed, clear, solid, onDig, onStats, reduced })
  latest.current = { seed, clear, solid, onDig, onStats, reduced }
  const setSeedRef = useRef<(s: string) => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !host || !ctx) return

    let w = 0
    let h = 0
    let dpr = 1
    let cell = cellWide
    let cols = 0
    let rows = 0
    let narrow = false
    let prev = new Uint8Array(0)
    let next = new Uint8Array(0)
    let quiet = new Uint8Array(0)
    let shown = new Uint8Array(0)
    let dug = new Uint8Array(0)
    let heat = new Float32Array(0)
    let order = new Float32Array(0)
    let tStart = 0
    let tDur = 0
    let seedNow = latest.current.seed
    let first = true
    let visible = false
    let dirty = true
    let raf = 0
    let lastFlicker = 0
    const flicker = new Map<number, number>()

    const rects = (refs: Refs): Rect[] => {
      const hb = host.getBoundingClientRect()
      const out: Rect[] = []
      for (const ref of refs) {
        const el = ref.current
        if (!el) continue
        const b = el.getBoundingClientRect()
        if (!b.width || !b.height) continue
        out.push({ x0: (b.left - hb.left) / cell, y0: (b.top - hb.top) / cell, x1: (b.right - hb.left) / cell, y1: (b.bottom - hb.top) / cell })
      }
      return out
    }

    const build = () => {
      const g = generate(seedNow, cols, rows, shape, narrow, rects(latest.current.clear), rects(latest.current.solid))
      quiet = g.quiet
      return g.ink
    }

    const regen = (animate: boolean, duration = 720) => {
      const fresh = build()
      if (animate && !latest.current.reduced) {
        prev = shown.slice()
        tStart = performance.now()
        tDur = duration
      } else {
        prev = fresh
        tDur = 0
      }
      next = fresh
      dug = new Uint8Array(cols * rows)
      let ink = 0
      for (const c of fresh) ink += c
      latest.current.onStats?.(ink)
      dirty = true
    }

    const resize = () => {
      const b = host.getBoundingClientRect()
      if (b.width === w && b.height === h && !first) return
      w = b.width
      h = b.height
      dpr = Math.min(2, window.devicePixelRatio || 1)
      narrow = w < 820
      cell = w < 640 ? Math.round(cellWide * 0.72) : cellWide
      cols = Math.ceil(w / cell)
      rows = Math.ceil(h / cell)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      shown = new Uint8Array(cols * rows)
      heat = new Float32Array(cols * rows)
      order = new Float32Array(cols * rows)
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) order[y * cols + x] = ((x + 0.5) / cols) * 0.55 + bayer(x, y) * 0.45
      regen(first && shape === 'hero', 1200)
      first = false
    }

    const inkAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < cols && y < rows ? shown[y * cols + x]! : 0)

    const draw = (now: number) => {
      const p = tDur ? Math.min(1, (now - tStart) / tDur) : 1
      if (p >= 1) tDur = 0
      for (let i = 0; i < shown.length; i++) {
        let v = p >= 1 || order[i]! < p ? next[i]! : prev[i]!
        if (dug[i]) v = 0
        if (flicker.has(i)) v = v ? 0 : 1
        shown[i] = v
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalAlpha = 1
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = INK
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (shown[y * cols + x]) ctx.fillRect(x * cell, y * cell, cell, cell)
      for (let i = 0; i < heat.length; i++) {
        const t = heat[i]!
        if (t < 0.03) continue
        ctx.globalAlpha = Math.min(1, t) * (shown[i] ? 0.95 : 0.6)
        ctx.fillStyle = shown[i] ? GLOW : GLOW_SOFT
        ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell)
      }
      ctx.globalAlpha = 1
      ctx.font = `500 ${Math.round(cell * 0.4)}px 'Geist Mono Variable', ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = DIGIT
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (shown[y * cols + x] || quiet[y * cols + x]) continue
          let n = 0
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += inkAt(x + dx, y + dy)
          if (n) ctx.fillText(String(n), x * cell + cell / 2, y * cell + cell / 2 + 0.5)
        }
      }
    }

    const pickBoundary = () => {
      for (let tries = 0; tries < 40; tries++) {
        const i = Math.floor(Math.random() * shown.length)
        const x = i % cols
        const y = Math.floor(i / cols)
        const v = shown[i]
        if (inkAt(x + 1, y) !== v || inkAt(x - 1, y) !== v || inkAt(x, y + 1) !== v || inkAt(x, y - 1) !== v) return i
      }
      return -1
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (!visible) return
      if (!latest.current.reduced && now - lastFlicker > 240) {
        lastFlicker = now
        for (const [i, until] of flicker) if (until < now) flicker.delete(i)
        const i = pickBoundary()
        if (i >= 0) flicker.set(i, now + 300 + Math.random() * 900)
        dirty = true
      }
      let hot = false
      for (let i = 0; i < heat.length; i++) {
        if (heat[i]! > 0.03) {
          heat[i]! *= 0.93
          hot = true
        } else heat[i] = 0
      }
      if (dirty || hot || tDur) {
        draw(now)
        dirty = false
      }
    }

    const cellAt = (e: MouseEvent) => {
      const b = host.getBoundingClientRect()
      return { cx: Math.floor((e.clientX - b.left) / cell), cy: Math.floor((e.clientY - b.top) / cell) }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const { cx, cy } = cellAt(e)
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue
          const i = y * cols + x
          const v = 1 - Math.hypot(dx, dy) / 2.6
          if (v > heat[i]!) heat[i] = v
        }
      }
      dirty = true
    }

    // click, not pointerdown, so starting a scroll on a touch screen never digs
    const onClick = (e: MouseEvent) => {
      if (!latest.current.onDig) return
      if ((e.target as HTMLElement | null)?.closest('a, button, input, label, summary, [data-nodig]')) return
      const { cx, cy } = cellAt(e)
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue
          if (Math.hypot(dx, dy) <= 1.2 + bayer(x, y) * 1.1) dug[y * cols + x] = 1
        }
      }
      latest.current.onDig({ x: cx * cell + cell / 2, y: cy * cell + cell / 2 })
      dirty = true
    }

    setSeedRef.current = (s: string) => {
      if (s === seedNow) return
      seedNow = s
      regen(true)
    }

    resize()
    const ro = new ResizeObserver(() => resize())
    ro.observe(host)
    // a cleared area can change size on its own, like the nav once the star count loads
    const refit = new ResizeObserver(() => {
      next = build()
      dirty = true
    })
    for (const ref of latest.current.clear) if (ref.current) refit.observe(ref.current)
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
      if (visible) dirty = true
    })
    io.observe(host)
    // text sizes shift once the webfonts land; refit the cleared areas then
    void document.fonts?.ready.then(() => {
      next = build()
      dirty = true
    })
    host.addEventListener('pointermove', onMove)
    host.addEventListener('click', onClick)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      refit.disconnect()
      io.disconnect()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('click', onClick)
      setSeedRef.current = () => {}
    }
  }, [shape, cellWide])

  useEffect(() => {
    setSeedRef.current(seed)
  }, [seed])

  return <canvas ref={canvasRef} aria-hidden="true" className={className ? `field-canvas ${className}` : 'field-canvas'} />
}
