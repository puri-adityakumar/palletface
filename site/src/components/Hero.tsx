import { useEffect, useMemo, useRef, useState } from 'react'
import { STYLES } from 'palletface'
import { ScrollTrigger, useGSAP } from '../lib/gsap'
import { PREFERS_REDUCED_MOTION, draw } from '../lib/dither'
import { INSTALL_CMD } from '../lib/build'
import { CopyButton } from './CopyButton'

const HERO_SEED = 'palletface-hero'

/**
 * Hero — full-screen sky, one line + one CTA, and the face machine:
 * the pinned stage switches through all nine styles while scrolling.
 * Scroll progress maps discretely (floor(p*9)) — face swaps only at crossings.
 */
export function Hero() {
  const runwayRef = useRef<HTMLDivElement>(null)
  const tachRef = useRef<HTMLDivElement>(null)
  const idxRef = useRef(0)
  const [idx, setIdx] = useState(0)

  const faceSvg = useMemo(() => draw(HERO_SEED, STYLES[idx].slug, 230, 'palletface'), [idx])

  // lazy-load the ascii.rest element (aurora-fjord sky); offline = night ground + scrim only
  useEffect(() => {
    import('ascii.rest/element').catch(() => {})
  }, [])

  useGSAP(
    () => {
      if (PREFERS_REDUCED_MOTION) return // first-frame hold: face 01, tach at 0
      const st = ScrollTrigger.create({
        trigger: runwayRef.current,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          if (tachRef.current) tachRef.current.style.transform = `scaleX(${self.progress.toFixed(4)})`
          const i = Math.min(8, Math.floor(self.progress * 9))
          if (i !== idxRef.current) {
            idxRef.current = i
            setIdx(i)
          }
        },
      })
      return () => st.kill()
    },
    { dependencies: [] },
  )

  const style = STYLES[idx]

  return (
    <div className="hero-runway" id="top" ref={runwayRef}>
      <div className="hero-pin">
        <div className="scenery" aria-hidden="true">
          <ascii-art piece="aurora-fjord" />
        </div>
        <div className="sky-scrim" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <h1>
              one seed, <em>nine styles</em>
              <i>.</i>
            </h1>
            <p className="sub">same id in, same svg out. zero dependencies, one function call.</p>
            <div className="hero-cta">
              <CopyButton
                className="btn"
                text={INSTALL_CMD}
                label={
                  <>
                    npm install palletface<b className="k">@beta</b>
                  </>
                }
                okColor="var(--spruce)"
                failColor="var(--coral)"
              />
            </div>
          </div>
          <div className="stage">
            <div className="face">
              <div className="veil" />
              <div className="swap-target" key={idx} dangerouslySetInnerHTML={{ __html: faceSvg }} />
            </div>
            <div className="stage-cap">
              <div className="style-name">{style.title}</div>
              <div className="style-slug">
                {style.slug} · {HERO_SEED}
              </div>
            </div>
          </div>
        </div>
        <div className="hero-count">
          face <b>{String(idx + 1).padStart(2, '0')}</b> / 09
        </div>
        <div className="tach-wrap">
          <div className="tach" ref={tachRef} />
        </div>
      </div>
    </div>
  )
}
