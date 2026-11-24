/**
 * PROTOTYPE: a full-bleed cell field generated from the seed. Ink cells grow
 * from a seeded value-noise shape, paper cells next to ink show how many ink
 * neighbours they have (like minesweeper), the pointer leaves a blue glow, and
 * clicking digs a hole. A new seed sweeps the old field into the new one in
 * dithered order.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { fnv1a } from 'palletface'
import { bayer } from '../../lib/dither'
import { useReducedMotion } from '../../lib/hooks'

export type Dig = { cx: number; cy: number; x: number; y: number }
export type FieldStats = { cols: number; rows: number; ink: number }
export type FieldPalette = { paper: string; ink: string; glow: string; glowSoft: string; digit: string }

type Rect = { x0: number; y0: number; x1: number; y1: number }
type Refs = RefObject<HTMLElement | null>[]

type Props = {
  seed: string
  mode: 'hero' | 'footer'
  palette: FieldPalette
  clear?: Refs
  solid?: Refs
  onDig?: (dig: Dig) => void
  onStats?: (stats: FieldStats) => void
}

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

function generate(seed: string, cols: number, rows: number, mode: Props['mode'], clear: Rect[], solid: Rect[]) {
  const s = fnv1a(seed)
  const out = new Uint8Array(cols * rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const u = (x + 0.5) / cols
      const v = (y + 0.5) / rows
      const n = noise(x / 7, y / 7, s) * 0.65 + noise(x / 3, y / 3, s ^ 0x9e3779b9) * 0.35
      const fine = hash(x, y, s ^ 0x51ed270b)
      let value = mode === 'hero' ? (v - (0.72 - 0.56 * u)) * 2.6 + (n - 0.5) * 1.5 : (v - 0.36) * 2.8 + (n - 0.5) * 1.4
      // single cells break off near the edge, so the border reads as erosion
      if (Math.abs(value) < 0.2 && fine < 0.26) value = -value
      const cx = x + 0.5
      const cy = y + 0.5
      for (const r of clear) if (distToRect(cx, cy, r) < 1.4 + fine * 1.6) value = -1
      for (const r of solid) if (distToRect(cx, cy, r) < 1.2 + fine * 1.4) value = 1
      out[y * cols + x] = value > 0 ? 1 : 0
    }
  }
  return out
}

export function SeedField({ seed, mode, palette, clear = [], solid = [], onDig, onStats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const latest = useRef({ seed, palette, clear, solid, onDig, onStats, reduced })
  latest.current = { seed, palette, clear, solid, onDig, onStats, reduced }
  const setSeedRef = useRef<(s: string) => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !host || !ctx) return

    let w = 0
    let h = 0
    let dpr = 1
    let cell = 24
    let cols = 0
    let rows = 0
    let prev = new Uint8Array(0)
    let next = new Uint8Array(0)
    let shown = new Uint8Array(0)
    let dug = new Uint8Array(0)
    let heat = new Float32Array(0)
    let order = new Float32Array(0)
    let tStart = 0
    let tDur = 0
    let seedNow = latest.current.seed
    let first = true
    let visible = true
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
        out.push({ x0: (b.left - hb.left) / cell, y0: (b.top - hb.top) / cell, x1: (b.right - hb.left) / cell, y1: (b.bottom - hb.top) / cell })
      }
      return out
    }

    const regen = (animate: boolean, duration = 720) => {
      const fresh = generate(seedNow, cols, rows, mode, rects(latest.current.clear), rects(latest.current.solid))
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
      latest.current.onStats?.({ cols, rows, ink })
      dirty = true
    }

    const resize = () => {
      const b = host.getBoundingClientRect()
      w = b.width
      h = b.height
      dpr = Math.min(2, window.devicePixelRatio || 1)
      cell = w < 640 ? 18 : 24
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
      regen(first, 1200)
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
      const pal = latest.current.palette
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalAlpha = 1
      ctx.fillStyle = pal.paper
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = pal.ink
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (shown[y * cols + x]) ctx.fillRect(x * cell, y * cell, cell, cell)
      for (let i = 0; i < heat.length; i++) {
        const t = heat[i]!
        if (t < 0.03) continue
        ctx.globalAlpha = Math.min(1, t) * (shown[i] ? 0.95 : 0.6)
        ctx.fillStyle = shown[i] ? pal.glow : pal.glowSoft
        ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell)
      }
      ctx.globalAlpha = 1
      ctx.font = `600 ${Math.round(cell * 0.42)}px 'Geist Mono Variable', ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = pal.digit
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (shown[y * cols + x]) continue
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
      if (!latest.current.reduced && now - lastFlicker > 140) {
        lastFlicker = now
        for (const [i, until] of flicker) if (until < now) flicker.delete(i)
        const i = pickBoundary()
        if (i >= 0) flicker.set(i, now + 260 + Math.random() * 900)
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

    const cellAt = (e: PointerEvent) => {
      const b = host.getBoundingClientRect()
      return { cx: Math.floor((e.clientX - b.left) / cell), cy: Math.floor((e.clientY - b.top) / cell) }
    }

    const onMove = (e: PointerEvent) => {
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

    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('a, button, input, label, [data-nodig]')) return
      const { cx, cy } = cellAt(e)
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue
          if (Math.hypot(dx, dy) <= 1.2 + bayer(x, y) * 1.1) dug[y * cols + x] = 1
        }
      }
      latest.current.onDig?.({ cx, cy, x: cx * cell + cell / 2, y: cy * cell + cell / 2 })
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
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
    })
    io.observe(host)
    // headline size shifts once the webfont lands; refit the cleared areas then
    void document.fonts?.ready.then(() => {
      next = generate(seedNow, cols, rows, mode, rects(latest.current.clear), rects(latest.current.solid))
      dirty = true
    })
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerdown', onDown)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerdown', onDown)
      setSeedRef.current = () => {}
    }
  }, [mode])

  useEffect(() => {
    setSeedRef.current(seed)
  }, [seed])

  return <canvas ref={canvasRef} aria-hidden="true" className="field-canvas" />
}
