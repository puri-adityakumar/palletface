/** Ordered-dither helpers and an animated dither band for section edges. */
import { fnv1a, mulberry32 } from 'palletface'
import { useEffect, useRef, type CSSProperties } from 'react'
import { useReducedMotion } from './hooks'

/** 8x8 Bayer thresholds in (0, 1). */
export const BAYER8: number[][] = (() => {
  const m = [[0]]
  let out = m
  for (let size = 1; size < 8; size *= 2) {
    const next: number[][] = []
    for (let y = 0; y < size * 2; y++) {
      const row: number[] = []
      for (let x = 0; x < size * 2; x++) {
        const base = out[y % size]![x % size]! * 4
        const q = (y < size ? 0 : 2) + (x < size ? 0 : 1)
        row.push(base + [0, 2, 3, 1][q]!)
      }
      next.push(row)
    }
    out = next
  }
  return out.map((row) => row.map((v) => (v + 0.5) / 64))
})()

export const bayer = (x: number, y: number) => BAYER8[y & 7]![x & 7]!

/** A stable [0, 1) value for one grid cell and seed. */
export const hash = (x: number, y: number, s: number) => {
  let h = (s ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** A seeded [0, 1) generator from any string. */
export const rng = (seed: string) => mulberry32(fnv1a(seed))

type BandProps = {
  /** Color at the top edge. */
  from: string
  /** Color at the bottom edge. */
  to: string
  height?: number
  /** Cell size in CSS pixels. */
  cell?: number
  /** `melt` drips and drifts over time; `static` draws once. */
  mode?: 'melt' | 'static'
  /** Column jitter, 0 to 1. */
  rough?: number
  speed?: number
  seed?: string
  className?: string
  style?: CSSProperties
}

/**
 * A full-width canvas that dithers from `from` into `to`. Pauses offscreen
 * and under reduced motion.
 */
export function DitherBand({ from, to, height = 96, cell = 8, mode = 'melt', rough = 0.45, speed = 1, seed = 'band', className, style }: BandProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    let cols = 0
    let rows = 0
    let jitter: number[] = []
    let visible = true
    let raf = 0

    const resize = () => {
      cols = Math.ceil(el.clientWidth / cell)
      rows = Math.ceil(height / cell)
      el.width = cols
      el.height = rows
      const r = rng(seed)
      jitter = Array.from({ length: cols }, () => r())
    }

    const draw = (t: number) => {
      ctx.fillStyle = from
      ctx.fillRect(0, 0, cols, rows)
      ctx.fillStyle = to
      for (let x = 0; x < cols; x++) {
        const drift = mode === 'melt' ? Math.sin(x * 0.11 + t * 0.0009 * speed) * 0.12 + Math.sin(x * 0.37 - t * 0.0013 * speed) * 0.06 : 0
        const offset = (jitter[x]! - 0.5) * rough + drift
        for (let y = 0; y < rows; y++) {
          if ((y + 0.5) / rows + offset > bayer(x, y) * 0.9 + 0.05) ctx.fillRect(x, y, 1, 1)
        }
      }
    }

    resize()
    draw(0)
    const ro = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
    })
    io.observe(el)

    const loop = (t: number) => {
      if (visible) draw(t)
      raf = requestAnimationFrame(loop)
    }
    if (mode === 'melt' && !reduced) raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [from, to, height, cell, mode, rough, speed, seed, reduced])

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={className}
      style={{ width: '100%', height, imageRendering: 'pixelated', display: 'block', ...style }}
    />
  )
}
