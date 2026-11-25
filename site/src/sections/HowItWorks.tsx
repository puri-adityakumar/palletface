import { useMemo, useState, type UIEvent } from 'react'
import { fnv1a } from 'palletface'
import { Code } from '../components/Code'
import { CopyButton } from '../components/CopyButton'
import { face, Face, svgUrl } from '../lib/faces'
import { useInView, useReducedMotion } from '../lib/hooks'
import { Pixelate, usePixelSteps } from '../lib/pixelate'
import { INSTALL, LINKS, QUICK_START, STYLE_COUNT } from '../lib/content'
import './how.css'

const bytes = (s: string) => new TextEncoder().encode(s).length
const MAX_CHARS = 12
const STEPS = ['Seed', 'Hash', 'SVG'] as const

export function HowItWorks({ seed }: { seed: string }) {
  const [ref, inView] = useInView<HTMLOListElement>({ threshold: 0.25 })
  const block = usePixelSteps(inView ? seed : null, { from: 18, duration: 800, steps: 5 })
  const hash = fnv1a('sprite' + seed) >>> 0
  const bits = Array.from({ length: 32 }, (_, i) => (hash >>> (31 - i)) & 1)
  const svg = useMemo(() => face(seed, 'pixel-sprite', 104), [seed])
  const chars = [...seed]
  const shown = chars.slice(0, MAX_CHARS)
  const reduced = useReducedMotion()
  const [active, setActive] = useState(0)

  // Below 1000px the steps become a swipe slider; these only matter there.
  const onScroll = (e: UIEvent<HTMLOListElement>) => {
    const el = e.currentTarget
    const [a, b] = el.children as unknown as HTMLElement[]
    const step = a && b ? b.offsetLeft - a.offsetLeft : 0
    if (step <= 0) return
    // On wide screens the last step cannot scroll all the way to the left edge, so the end counts as last.
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
    setActive(atEnd ? STEPS.length - 1 : Math.min(STEPS.length - 1, Math.max(0, Math.round(el.scrollLeft / step))))
  }
  const go = (i: number) => {
    const el = ref.current
    const target = el?.children[i] as HTMLElement | undefined
    if (!el || !target) return
    el.scrollTo({ left: target.offsetLeft - (el.children[0] as HTMLElement).offsetLeft, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <section className="section how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="section-head">
          <h2 className="h2" id="how-title">
            Generate an avatar <em>in three steps.</em>
          </h2>
          <p className="note">Shown with your seed in Pixel Sprite.</p>
        </div>

        <ol className="how__steps" ref={ref} onScroll={onScroll}>
          <li className="how__step">
            <span className="how__n">01 · Seed</span>
            <div className="how__visual">
              <div className="chars" aria-label={`Seed “${seed}”`}>
                {shown.length ? (
                  shown.map((c, i) => (
                    <span key={i} className="chars__cell">
                      {c === ' ' ? '␣' : c}
                    </span>
                  ))
                ) : (
                  <span className="chars__cell chars__cell--empty">∅</span>
                )}
                {chars.length > MAX_CHARS && <span className="chars__more">+{chars.length - MAX_CHARS}</span>}
              </div>
              <code className="how__caption">
                ‘{seed}’ · {bytes(seed)} {bytes(seed) === 1 ? 'byte' : 'bytes'} of UTF-8
              </code>
            </div>
            <h3>Pass any string</h3>
            <p>A user ID, handle, or key. Empty and Unicode strings work too.</p>
          </li>
          <li className="how__step">
            <span className="how__n">02 · Hash</span>
            <div className="how__visual">
              <div className="bits" role="img" aria-label={`32-bit hash 0x${hash.toString(16).padStart(8, '0')}`}>
                {bits.map((b, i) => (
                  <span key={i} className={b ? 'bits__cell is-on' : 'bits__cell'} />
                ))}
              </div>
              <code className="how__caption">
                fnv1a('sprite' + seed) = <b>0x{hash.toString(16).padStart(8, '0')}</b>
              </code>
            </div>
            <h3>It hashes the seed</h3>
            <p>A seeded generator picks the palette, shape, and pixels. No clock or system randomness.</p>
          </li>
          <li className="how__step">
            <span className="how__n">03 · SVG</span>
            <div className="how__visual">
              <Pixelate block={block} className="how__face">
                <Face seed={seed} style="pixel-sprite" px={104} alt={`Pixel Sprite avatar for “${seed}”`} />
              </Pixelate>
              <code className="how__caption">
                &lt;svg …&gt; · {bytes(svg).toLocaleString('en-US')} bytes
              </code>
            </div>
            <h3>You get an SVG string</h3>
            <p>Use it in an image, return it from an API, or save it to disk.</p>
          </li>
        </ol>
        <div className="how__nav">
          <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous step">
            ←
          </button>
          <div className="how__dots">
            {STEPS.map((name, i) => (
              <button
                key={name}
                type="button"
                className={i === active ? 'is-on' : undefined}
                onClick={() => go(i)}
                aria-label={`Step ${i + 1}: ${name}`}
                aria-current={i === active ? 'step' : undefined}
              />
            ))}
          </div>
          <button type="button" onClick={() => go(active + 1)} disabled={active === STEPS.length - 1} aria-label="Next step">
            →
          </button>
        </div>
      </div>
    </section>
  )
}

export function QuickStart() {
  const sample = useMemo(() => face('user-123', 'pixel-sprite', 80), [])
  return (
    <section className="quick" id="start" aria-labelledby="start-title">
      <div className="wrap quick__layout">
        <div className="quick__intro">
          <h2 className="h2" id="start-title">
            Seed in.
            <br />
            SVG out.
          </h2>
          <p className="quick__pin">
            Before 1.0, a minor release may change the output. Pin it with <code>--save-exact</code>.
          </p>
        </div>
        <div className="quick__steps">
          <div className="quick__step">
            <h3>Install the package</h3>
            <CopyButton value={INSTALL} variant="install" tone="paper" />
          </div>
          <div className="quick__step">
            <h3>Call it with any string</h3>
            <div className="quick__call">
              <Code code={QUICK_START} />
              <span className="quick__arrow" aria-hidden="true">
                →
              </span>
              <img src={svgUrl(sample)} width={80} height={80} alt="Pixel Sprite avatar for user-123" />
            </div>
          </div>
          <p className="quick__more">
            Change it with <code>style</code>, <code>px</code>, and <code>name</code>. See the <a href={`${LINKS.docs}styles/`}>docs</a> for all{' '}
            {STYLE_COUNT} styles.
          </p>
        </div>
      </div>
    </section>
  )
}
