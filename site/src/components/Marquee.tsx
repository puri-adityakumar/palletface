import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { STYLES, type StyleSlug } from 'palletface'
import { SHOWCASE_SEEDS } from '../lib/content'
import { Face, LETTER_STYLES } from '../lib/faces'
import { useInView, useReducedMotion } from '../lib/hooks'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** How far the strip travels across one full pin: 1.5 viewport widths, and at least 8 tiles on narrow screens. */
const TRAVEL_WIDTHS = 1.5
const TRAVEL_TILES = 8

type Item = { seed: string; style: StyleSlug; title: string }

/**
 * An endless line of avatars. It drifts on its own, pauses on hover, and can
 * be dragged. While `pin` is held in place by a sticky layout, page scroll
 * moves the strip sideways. Under reduced motion it only moves when dragged.
 */
export function Marquee({ pin }: { pin?: RefObject<HTMLElement | null> }) {
  const items = useMemo<Item[]>(
    () =>
      SHOWCASE_SEEDS.map((seed, i) => ({ seed, style: STYLES[i % STYLES.length]!.slug, title: STYLES[i % STYLES.length]!.title })),
    [],
  )
  const [wrap, inView] = useInView<HTMLDivElement>({ once: false, rootMargin: '0px' })
  const track = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const state = useRef({ offset: 0, hover: false, drag: null as null | { x: number; offset: number }, speed: 0, pinned: false })

  useEffect(() => {
    const el = track.current
    const host = wrap.current
    if (!el || !host) return
    const s = state.current
    const section = pin?.current ?? null
    let raf = 0
    let last = performance.now()

    const measure = () => {
      const inner = section?.firstElementChild
      s.pinned = !reduced && !!inner && getComputedStyle(inner).position === 'sticky'
    }

    const scrolled = () => {
      if (!s.pinned || !section) return 0
      const r = section.getBoundingClientRect()
      const span = r.height - window.innerHeight
      if (span <= 0) return 0
      const tile = el.querySelector('li')?.offsetWidth ?? 0
      const travel = Math.max(window.innerWidth * TRAVEL_WIDTHS, tile * TRAVEL_TILES)
      return Math.min(1, Math.max(0, -r.top / span)) * travel
    }

    const place = () => {
      const half = el.scrollWidth / 2
      if (half > 0) s.offset = ((s.offset % half) + half) % half
      const x = s.offset + scrolled()
      el.style.transform = `translate3d(${-(half > 0 ? x % half : x)}px, 0, 0)`
    }

    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000
      last = now
      const target = reduced || s.hover || s.drag ? 0 : 34
      s.speed += (target - s.speed) * Math.min(1, dt * 4)
      s.offset += s.speed * dt
      place()
      raf = requestAnimationFrame(tick)
    }

    const onDown = (e: PointerEvent) => {
      s.drag = { x: e.clientX, offset: s.offset }
      host.setPointerCapture(e.pointerId)
      host.classList.add('is-dragging')
    }
    const onMove = (e: PointerEvent) => {
      if (!s.drag) return
      s.offset = s.drag.offset - (e.clientX - s.drag.x)
      place()
    }
    const onUp = () => {
      s.drag = null
      host.classList.remove('is-dragging')
    }
    const onEnter = () => (s.hover = true)
    const onLeave = () => (s.hover = false)

    measure()
    place()
    if (inView) raf = requestAnimationFrame(tick)
    window.addEventListener('resize', measure)
    host.addEventListener('pointerdown', onDown)
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerup', onUp)
    host.addEventListener('pointercancel', onUp)
    host.addEventListener('pointerenter', onEnter)
    host.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointercancel', onUp)
      host.removeEventListener('pointerenter', onEnter)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [inView, reduced, wrap, pin])

  const tiles = (copy: number) =>
    items.map((item) => (
      <li key={`${copy}-${item.seed}`} className="strip__tile" aria-hidden={copy > 0 || undefined}>
        <Face seed={item.seed} style={item.style} px={112} name={capital(item.seed)} alt="" />
        <span className="strip__seed">“{item.seed}”</span>
        <span className="strip__style">
          {item.title}
          {LETTER_STYLES.has(item.style) ? ' · name' : ''}
        </span>
      </li>
    ))

  return (
    <div className="strip" ref={wrap}>
      <div className="strip__track" ref={track}>
        <ul aria-label={`${items.length} sample avatars across ${STYLES.length} styles`}>{tiles(0)}</ul>
        <ul aria-hidden="true">{tiles(1)}</ul>
      </div>
    </div>
  )
}
