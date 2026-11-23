import { useEffect } from 'react'

/**
 * Scroll-reveal for `.rv` elements: adds `.on` when a band enters the view.
 * Reduced-motion users get the CSS-forced visible state regardless.
 */
export function useReveal() {
  useEffect(() => {
    const nodes = [...document.querySelectorAll('.rv')]
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('on'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on')
            io.unobserve(e.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    nodes.forEach((n) => io.observe(n))
    // safety fallback so captures never catch a hidden band
    const t = setTimeout(() => nodes.forEach((n) => n.classList.add('on')), 2500)
    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [])
}
