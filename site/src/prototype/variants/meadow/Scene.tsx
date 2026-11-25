import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useAnimationFrame, useInView, useReducedMotion } from '../../lib/hooks'
import { makeAir, paintBackdrop, paintDesk, paintResidents, rasterAvatar, RESIDENTS, worldLayout } from './world'

type SceneProps = { seed: string; night?: boolean; footer?: boolean }

export function Scene({ seed, night = false, footer = false }: SceneProps) {
  const [wrap, inView] = useInView<HTMLDivElement>({ once: false, rootMargin: '0px' })
  const canvas = useRef<HTMLCanvasElement>(null)
  const redraw = useRef<((time: number) => void) | null>(null)
  const sample = useRef<HTMLCanvasElement | null>(null)
  const sprites = useRef<(HTMLCanvasElement | null)[]>(RESIDENTS.map(() => null))
  const clock = useRef(0)
  const prevFrame = useRef(0)
  const reduced = useReducedMotion()
  const [spots, setSpots] = useState<CSSProperties[]>([])

  useEffect(() => {
    let current = true
    RESIDENTS.forEach(({ seed, style }, i) => {
      rasterAvatar(seed, style, style === 'pixel-sprite' ? 12 : 16, true).then(sprite => {
        if (!current) return
        sprites.current[i] = sprite
        redraw.current?.(clock.current)
      }).catch(() => {})
    })
    return () => { current = false }
  }, [])

  useEffect(() => {
    if (footer) return
    let current = true
    rasterAvatar(seed, 'pixel-sprite', 12, false).then(sprite => {
      if (!current) return
      sample.current = sprite
      redraw.current?.(clock.current)
    }).catch(() => {})
    return () => { current = false }
  }, [seed, footer])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    const backing = document.createElement('canvas')
    const print = backing.getContext('2d')
    if (!ctx || !print) return

    const setup = () => {
      const { width: cssWidth, height: cssHeight } = el.getBoundingClientRect()
      if (!cssWidth || !cssHeight) return
      const compact = cssWidth <= 680
      const cell = compact ? 3 : 4
      const width = Math.round(cssWidth / cell)
      const height = Math.round(cssHeight / cell)
      el.width = backing.width = width
      el.height = backing.height = height
      ctx.imageSmoothingEnabled = false
      const layout = worldLayout(width, height, compact, footer)
      const air = makeAir(compact, night, footer)
      paintBackdrop(print, width, height, compact, night, footer)
      if (!footer) setSpots(layout.residents.map(({ x, y, size }) => ({
        left: `${x / width * 100}%`,
        top: `${y / height * 100}%`,
        width: (size + 2) * (cssWidth / width),
        height: (size + 4) * (cssHeight / height),
      })))
      const draw = (time: number) => {
        const moment = reduced ? 0 : time
        ctx.drawImage(backing, 0, 0)
        air(ctx, width, height, moment)
        if (!footer) paintDesk(ctx, layout.desk.x, layout.desk.y, sample.current, moment, night)
        paintResidents(ctx, layout.residents, sprites.current, moment, night, footer)
      }
      redraw.current = draw
      draw(clock.current)
    }

    setup()
    const observer = new ResizeObserver(setup)
    observer.observe(el)
    return () => {
      observer.disconnect()
      redraw.current = null
    }
  }, [footer, night, reduced])

  useAnimationFrame(inView && !reduced, (_time, delta) => {
    clock.current += Math.min(delta, 42)
    if (clock.current - prevFrame.current < 38) return
    prevFrame.current = clock.current
    redraw.current?.(clock.current)
  })

  return (
    <div className="pf-meadow-scene" ref={wrap}>
      <canvas ref={canvas} aria-hidden="true" />
      {!footer && spots.map((position, i) => (
        <div
          className="pf-meadow-resident"
          key={RESIDENTS[i]!.seed}
          style={position}
          role="img"
          aria-label={`Meadow resident: ${RESIDENTS[i]!.seed}`}
          tabIndex={0}
        >
          <span aria-hidden="true">“{RESIDENTS[i]!.seed}”</span>
        </div>
      ))}
    </div>
  )
}
