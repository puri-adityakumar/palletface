import { useRef, useState } from 'react'
import { STYLES } from 'palletface'
import { gsap, useGSAP } from '../lib/gsap'
import { PREFERS_REDUCED_MOTION, draw } from '../lib/dither'

const STRIP_USERS = ['ada', 'kai', 'yuki', 'élodie', 'marcus', 'rhea', 'quinn', 'yuki', 'ada']

/**
 * Showcase — one line + the horizontal filmstrip of all nine styles, pinned and
 * scrubbed by ScrollTrigger (animation-design.md: pin + translateX + scrub: 1).
 * Active card derives from cached centers — no per-frame rect reads.
 */
export function Showcase() {
  const runwayRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const centersRef = useRef<number[]>([])
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)

  useGSAP(
    () => {
      if (PREFERS_REDUCED_MOTION) return // native snap scroller via html.rm
      const measure = () => {
        centersRef.current = [...(stripRef.current?.children ?? [])].map((c) => {
          const h = c as HTMLElement
          return h.offsetLeft + h.offsetWidth / 2
        })
      }
      measure()
      window.addEventListener('resize', measure)
      document.fonts?.ready.then(measure)

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: runwayRef.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const max = Math.max(0, (stripRef.current?.scrollWidth ?? 0) - window.innerWidth + 60)
            const offset = -self.progress * max
            const center = window.innerWidth / 2
            let best = 0
            let bestD = Infinity
            centersRef.current.forEach((c, i) => {
              const d = Math.abs(c + offset - center)
              if (d < bestD) {
                bestD = d
                best = i
              }
            })
            if (best !== activeRef.current) {
              activeRef.current = best
              setActive(best)
            }
          },
        },
      })
      tl.to(
        stripRef.current,
        {
          x: () => -Math.max(0, (stripRef.current?.scrollWidth ?? 0) - window.innerWidth + 60),
          ease: 'none',
        },
        0,
      ).to(barRef.current, { scaleX: 1, ease: 'none' }, 0)

      return () => {
        window.removeEventListener('resize', measure)
      }
    },
    { dependencies: [] },
  )

  return (
    <div className="showcase-runway light-band" id="showcase" ref={runwayRef}>
      <div className="show-pin" ref={pinRef}>
        <div className="show-head">
          <p className="s-eyebrow rv">showcase</p>
          <h2 className="s-title rv">
            nine faces of <em>one id</em>
            <i>.</i>
          </h2>
        </div>
        <div className="strip-zone">
          <div className="strip" ref={stripRef}>
            {STYLES.map((st, i) => (
              <div className={`cell${i === active ? ' on' : ''}`} key={st.slug}>
                <div className="face">
                  <div
                    className="swap-target"
                    dangerouslySetInnerHTML={{
                      __html: draw(`palletface-${STRIP_USERS[i]}`, st.slug, 230, STRIP_USERS[i]),
                    }}
                  />
                </div>
                <div className="tag">
                  {String(i + 1).padStart(2, '0')} · {st.slug}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="show-progress">
          <div className="bar" ref={barRef} />
        </div>
      </div>
    </div>
  )
}
