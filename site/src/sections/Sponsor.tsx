import { useEffect, useMemo, useRef, useState } from 'react'
import { STYLES } from 'palletface'
import { Out } from '../components/Pixel'
import { Contribute } from './Contribute'
import { SeedField } from '../field/SeedField'
import { LINKS } from '../lib/content'
import { Face } from '../lib/faces'
import { useInView, useReducedMotion } from '../lib/hooks'
import { Pixelate, usePixelSteps } from '../lib/pixelate'
import './sponsor.css'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The open sponsor slot: the visitor's seed, cycling through every style while it is on screen. */
function Slot({ seed }: { seed: string }) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ once: false, rootMargin: '0px' })
  const [index, setIndex] = useState(STYLES.findIndex((s) => s.slug === 'pixel-stamp'))
  const item = STYLES[index]!
  const block = usePixelSteps(`${seed}:${item.slug}`, { from: 24, duration: 480, steps: 5 })
  useEffect(() => {
    if (reduced || !inView) return
    const t = window.setInterval(() => setIndex((i) => (i + 1) % STYLES.length), 2400)
    return () => window.clearInterval(t)
  }, [reduced, inView])
  return (
    <div ref={ref} className="slot__art">
      <Pixelate block={block}>
        <Face seed={seed} style={item.slug} px={96} name={capital(seed)} alt={`A ${item.title} avatar for “${seed}”`} />
      </Pixelate>
      <span className="slot__style">{item.title}</span>
    </div>
  )
}

export function Sponsor({ seed }: { seed: string }) {
  const slotRef = useRef<HTMLDivElement>(null)
  const clear = useMemo(() => [slotRef], [])
  return (
    <section className="section sponsor" id="sponsor" aria-labelledby="sponsor-title">
      <div className="wrap">
        <div className="sponsor__panel">
          <div className="sponsor__copy">
            <h2 className="h2" id="sponsor-title">
              Keep the field <em>growing.</em>
            </h2>
            <p className="note">palletface is free and MIT-licensed. Sponsoring pays for new styles, fixes, and docs.</p>
            <div className="sponsor__actions">
              <a className="btn btn--sponsor" href={LINKS.sponsor} target="_blank" rel="noreferrer">
                <span aria-hidden="true">♥</span> Sponsor on GitHub <Out />
              </a>
              <a className="btn" href={LINKS.github} target="_blank" rel="noreferrer">
                <span className="btn__star" aria-hidden="true">★</span> Star the repo <Out />
              </a>
            </div>
          </div>
          <div className="sponsor__field">
            <SeedField seed="sponsor" shape="sponsor" cell={22} clear={clear} />
            <div ref={slotRef} className="slot">
              <span className="slot__n">Sponsor 01</span>
              <Slot seed={seed} />
              <span className="slot__note">Yours could be the first.</span>
            </div>
          </div>
        </div>
        <Contribute />
      </div>
    </section>
  )
}
