import { useEffect, useRef } from 'react'
import { BUILD } from '../lib/build'

/**
 * Floating chrome — no navbar: wordmark left, GitHub ★ + docs right.
 * Flips light over the paper bands via IntersectionObserver on
 * `[data-light-band]` elements.
 */
export function Chrome() {
  const wordmarkRef = useRef<HTMLAnchorElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const lightBands = [...document.querySelectorAll('.light-band')]
    const targets = [wordmarkRef.current, rightRef.current].filter(Boolean) as HTMLElement[]
    const visible = new Set<Element>()
    const apply = () => {
      const light = visible.size > 0
      targets.forEach((t) => t.classList.toggle('on-light', light))
    }
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) visible.add(e.target)
          else visible.delete(e.target)
        })
        apply()
      },
      { rootMargin: '-20px 0px -86% 0px' },
    )
    lightBands.forEach((b) => io.observe(b))
    return () => io.disconnect()
  }, [])

  return (
    <>
      <a ref={wordmarkRef} className="chrome chrome-left wordmark" href="#top">
        palletface<i>.</i>
      </a>
      <div ref={rightRef} className="chrome chrome-right">
        <a
          className="pill"
          href="https://github.com/puri-adityakumar/palletface"
          target="_blank"
          rel="noreferrer"
        >
          <span className="star">★</span>
          <span>{typeof BUILD.stars === 'number' ? BUILD.stars : 'github'}</span>
        </a>
        <a
          className="pill"
          href="https://github.com/puri-adityakumar/palletface#readme"
          target="_blank"
          rel="noreferrer"
        >
          docs ↗
        </a>
      </div>
    </>
  )
}
