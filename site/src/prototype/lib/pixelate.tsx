/**
 * Pixelated-to-crisp reveals for any element: real text stays real text, and
 * images stay images. An SVG filter samples one pixel per block and grows it
 * into a square, so changing `block` per frame animates the mosaic.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { useReducedMotion } from './hooks'

type PixelateProps = {
  block: number
  children: ReactNode
  as?: ElementType
  className?: string
  style?: CSSProperties
}

export function Pixelate({ block, children, as: Tag = 'div', className, style }: PixelateProps) {
  const id = 'px' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const b = Math.max(1, Math.round(block))
  const on = b > 1
  const half = Math.floor(b / 2)
  return (
    <>
      {on && (
        <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden="true" focusable="false">
          <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feFlood x={half} y={half} width="1" height="1" />
            <feComposite width={b} height={b} />
            <feTile result="grid" />
            <feComposite in="SourceGraphic" in2="grid" operator="in" />
            <feMorphology operator="dilate" radius={Math.ceil(b / 2)} />
          </filter>
        </svg>
      )}
      <Tag className={className} style={{ ...style, filter: on ? `url(#${id})` : style?.filter }}>
        {children}
      </Tag>
    </>
  )
}

type StepOptions = {
  /** Block size in CSS pixels at the start. */
  from?: number
  duration?: number
  /** Number of visible steps between `from` and crisp. */
  steps?: number
}

/**
 * The current block size for a reveal. While `play` is null or false the
 * element stays at `from`; each new truthy `play` value replays the reveal.
 */
export function usePixelSteps(play: unknown, { from = 32, duration = 700, steps = 7 }: StepOptions = {}): number {
  const reduced = useReducedMotion()
  const [block, setBlock] = useState(play == null || play === false ? from : 1)
  const raf = useRef(0)
  useEffect(() => {
    if (play == null || play === false) {
      setBlock(from)
      return
    }
    if (reduced) {
      setBlock(1)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const step = Math.min(steps, Math.floor(p * (steps + 1)))
      const next = p >= 1 ? 1 : Math.max(1, Math.round(from * Math.pow(1 / from, step / steps)))
      setBlock(next)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    setBlock(from)
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [play, from, duration, steps, reduced])
  return block
}
