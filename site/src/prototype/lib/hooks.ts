import { useCallback, useEffect, useRef, useState } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** [ref, inView]. With `once`, stays true after the first intersection. */
export function useInView<T extends Element>({ once = true, rootMargin = '0px 0px -10% 0px', threshold = 0 } = {}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) setInView(false)
      },
      { rootMargin, threshold },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [once, rootMargin, threshold])
  return [ref, inView] as const
}

/** Run `frame(timeMs, dtMs)` every animation frame while `active`. */
export function useAnimationFrame(active: boolean, frame: (time: number, dt: number) => void) {
  const cb = useRef(frame)
  cb.current = frame
  useEffect(() => {
    if (!active) return
    let id = 0
    let last = performance.now()
    const loop = (now: number) => {
      cb.current(now, now - last)
      last = now
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [active])
}

export type CopyState = 'idle' | 'ok' | 'fail'

export function useCopy(text: string, resetMs = 1400) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef(0)
  const copy = useCallback(async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = false
    }
    setState(ok ? 'ok' : 'fail')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), resetMs)
  }, [text, resetMs])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return [state, copy] as const
}
