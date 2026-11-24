import { useState } from 'react'
import { STYLES, type StyleSlug } from 'palletface'
import { SeedInput } from '../components/SeedInput'
import { callFor, Face, LETTER_STYLES } from '../lib/faces'
import { useCopy, useInView } from '../lib/hooks'
import { Pixelate, usePixelSteps } from '../lib/pixelate'
import { STYLE_COUNT } from '../lib/content'
import './styles.css'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pad = (n: number) => String(n).padStart(2, '0')

function Tile({ seed, slug, title, index, play }: { seed: string; slug: StyleSlug; title: string; index: number; play: boolean }) {
  const named = LETTER_STYLES.has(slug)
  const [state, copy] = useCopy(callFor(seed, slug, 80, named ? capital(seed) : undefined))
  const [hover, setHover] = useState(0)
  const block = usePixelSteps(play ? `${seed}:${hover}` : null, { from: 30, duration: 520, steps: 6 })
  return (
    <li className="tile" style={{ transitionDelay: `${index * 40}ms` }}>
      <button type="button" onClick={copy} onPointerEnter={(e) => e.pointerType === 'mouse' && setHover((n) => n + 1)}>
        <span className="tile__meta">
          <span>{pad(index + 1)}</span>
          {state === 'idle' ? (
            <span className="tile__status">
              <span className="tile__tag">{named ? 'Uses name' : ''}</span>
              <span className="tile__copy" aria-hidden="true">
                Copy call
              </span>
            </span>
          ) : (
            <span className="tile__status" aria-live="polite">
              {state === 'ok' ? 'Copied ✓' : 'Copy failed'}
            </span>
          )}
        </span>
        <Pixelate block={block} className="tile__art">
          <Face seed={seed} style={slug} px={136} name={capital(seed)} alt={`${title} avatar for “${seed}”`} />
        </Pixelate>
        <span className="tile__name">{title}</span>
        <code className="tile__slug">'{slug}'</code>
        <span className="sr-only">Copy call</span>
      </button>
    </li>
  )
}

export function Styles({ seed, input, setSeed }: { seed: string; input: string; setSeed: (seed: string) => void }) {
  const [ref, inView] = useInView<HTMLUListElement>({ rootMargin: '0px 0px -12% 0px' })
  return (
    <section className="section styles" id="styles" aria-labelledby="styles-title">
      <div className="wrap styles__layout">
        <div className="styles__head">
          <p className="kicker">03 / Styles</p>
          <h2 className="h2" id="styles-title">
            {STYLE_COUNT} styles.
            <br />
            One seed: <em className="styles__word">{seed === '' ? '“”' : seed}</em>
          </h2>
          <p className="note">Type a seed and all {STYLE_COUNT} follow it. Click a tile to copy its call.</p>
          <SeedInput id="styles-seed" seed={input} setSeed={setSeed} />
          <p className="styles__legend">
            <span /> Styles marked “Uses name” draw an initial from <code>name</code>.
          </p>
        </div>
        <ul ref={ref} className="tiles">
          {STYLES.map((s, i) => (
            <Tile key={s.slug} seed={seed} slug={s.slug} title={s.title} index={i} play={inView} />
          ))}
        </ul>
      </div>
    </section>
  )
}
