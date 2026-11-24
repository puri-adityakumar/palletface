import { useState } from 'react'
import { STYLES } from 'palletface'
import { Face, LETTER_STYLES } from '../lib/faces'
import { useInView } from '../lib/hooks'
import { Pixelate, usePixelSteps } from '../lib/pixelate'
import { SAMPLE_SEEDS, STYLE_COUNT } from '../lib/content'
import './styles.css'

const TRAILS = [
  { title: 'The first clearing', name: 'clearing' },
  { title: 'The winding path', name: 'path' },
  { title: 'The far end', name: 'far' },
] as const

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function StyleCard({ item, index, seed }: { item: (typeof STYLES)[number]; index: number; seed: string }) {
  const [ref, inView] = useInView<HTMLLIElement>({ threshold: 0.2, rootMargin: '0px 0px -3% 0px' })
  const block = usePixelSteps(inView ? seed : null, { from: 22, duration: 560, steps: 6 })
  const [hint, setHint] = useState(false)
  return (
    <li className="style-card" ref={ref} onPointerEnter={() => setHint(true)} onPointerLeave={() => setHint(false)}>
      <div className="style-card__top">
        <span className="label">Level {String(index + 1).padStart(2, '0')}</span>
        {LETTER_STYLES.has(item.slug) ? <span className="style-card__tag">uses name</span> : <span aria-hidden="true" className="style-card__dot" />}
      </div>
      <div className="style-card__art">
        <Pixelate block={block}>
          <Face seed={seed} style={item.slug} px={88} name={capital(seed)} alt={`${item.title} avatar for “${seed}”`} />
        </Pixelate>
      </div>
      <h3>{item.title}</h3>
      <code className={hint ? 'is-on' : undefined}>'{item.slug}'</code>
    </li>
  )
}

export function Styles({ seed, setSeed }: { seed: string; setSeed: (seed: string) => void }) {
  const next = () => {
    const i = SAMPLE_SEEDS.findIndex((s) => s === seed)
    setSeed(SAMPLE_SEEDS[(i + 1) % SAMPLE_SEEDS.length]!)
  }
  return (
    <section className="styles wrap" id="styles" aria-labelledby="styles-title">
      <div className="section-head">
        <div>
          <p className="label eyebrow">
            <span>03</span> / The field guide
          </p>
          <h2 className="section-title" id="styles-title">
            Meet the <em>locals</em>
            <b>.</b>
          </h2>
        </div>
        <div className="styles__aside">
          <p className="section-note">
            One seed, {STYLE_COUNT} looks. Type a seed and every style follows it. Three of them draw an initial from a
            name.
          </p>
          <div className="styles__seed">
            <label className="label" htmlFor="styles-seed">
              Seed
            </label>
            <span aria-hidden="true">&gt;</span>
            <input id="styles-seed" value={seed} onChange={(e) => setSeed(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={40} />
            <button type="button" onClick={next} aria-label="Try the next sample seed" title="Try the next sample seed">
              ↻
            </button>
          </div>
        </div>
      </div>
      {TRAILS.map(({ title, name }, group) => (
        <div className={`trail trail--${name}`} key={name}>
          <div className="trail__label">
            <span className="label">Trail {String(group + 1).padStart(2, '0')}</span>
            <span>{title}</span>
          </div>
          <ul className="trail__cards">
            {STYLES.slice(group * 4, group * 4 + 4).map((item, i) => (
              <StyleCard key={item.slug} item={item} index={group * 4 + i} seed={seed} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
