import { useEffect, useMemo, useRef } from 'react'
import { STYLES, type StyleSlug } from 'palletface'
import { Face, LETTER_STYLES } from '../lib/faces'
import { useInView, useReducedMotion } from '../lib/hooks'

const SEEDS = [
  'ada', 'kai', 'yuki', 'élodie', 'marcus', 'rhea', 'quinn', 'zeke', 'noor', 'tomás', 'aditya', 'mina',
  'sol', 'ivo', 'priya', 'otto', 'lena', 'ravi', 'juno', 'amara', 'felix', 'hana', 'bo', 'zara',
] as const

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type Item = { seed: string; style: StyleSlug; title: string }

/**
 * An endless line of avatars. It drifts on its own, follows page scroll a
 * little, pauses on hover, and can be dragged. Under reduced motion it only
 * moves when dragged.
 */
export function Marquee() {
  const items = useMemo<Item[]>(
    () => SEEDS.map((seed, i) => ({ seed, style: STYLES[i % STYLES.length]!.slug, title: STYLES[i % STYLES.length]!.title })),
    [],
  )
  const [wrap, inView] = useInView<HTMLDivElement>({ once: false, rootMargin: '0px' })
  const track = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const state = useRef({ offset: 0, hover: false, drag: null as null | { x: number; offset: number }, speed: 0, kick: 0 })

  useEffect(() => {
    const el = track.current
    const host = wrap.current
    if (!el || !host) return
    const s = state.current
    let raf = 0
    let last = performance.now()
    let lastScroll = window.scrollY

    const place = () => {
      const half = el.scrollWidth / 2
      if (half > 0) s.offset = ((s.offset % half) + half) % half
      el.style.transform = `translate3d(${-s.offset}px, 0, 0)`
    }

    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000
      last = now
      const target = reduced || s.hover || s.drag ? 0 : 34
      s.speed += (target - s.speed) * Math.min(1, dt * 4)
      s.offset += s.speed * dt + s.kick
      s.kick *= 0.86
      if (Math.abs(s.kick) < 0.01) s.kick = 0
      place()
      raf = requestAnimationFrame(tick)
    }

    const onScroll = () => {
      const y = window.scrollY
      if (!reduced) s.kick += Math.max(-40, Math.min(40, (y - lastScroll) * 0.06))
      lastScroll = y
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

    place()
    if (inView) raf = requestAnimationFrame(tick)
    window.addEventListener('scroll', onScroll, { passive: true })
    host.addEventListener('pointerdown', onDown)
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerup', onUp)
    host.addEventListener('pointercancel', onUp)
    host.addEventListener('pointerenter', onEnter)
    host.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointercancel', onUp)
      host.removeEventListener('pointerenter', onEnter)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [inView, reduced, wrap])

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
