import { useMemo } from 'react'
import { fnv1a } from 'palletface'
import { CopyButton } from '../components/CopyButton'
import { face, Face, svgUrl } from '../lib/faces'
import { useInView } from '../lib/hooks'
import { Pixelate, usePixelSteps } from '../lib/pixelate'
import { INSTALL, OPTIONS, QUICK_START } from '../lib/content'
import './how.css'

const bytes = (s: string) => new TextEncoder().encode(s).length
const MAX_CHARS = 12

export function HowItWorks({ seed }: { seed: string }) {
  const [ref, inView] = useInView<HTMLOListElement>({ threshold: 0.25 })
  const block = usePixelSteps(inView ? seed : null, { from: 18, duration: 800, steps: 5 })
  const hash = fnv1a('sprite' + seed) >>> 0
  const bits = Array.from({ length: 32 }, (_, i) => (hash >>> (31 - i)) & 1)
  const svg = useMemo(() => face(seed, 'pixel-sprite', 104), [seed])
  const chars = [...seed]
  const shown = chars.slice(0, MAX_CHARS)

  return (
    <section className="section how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="section-head">
          <h2 className="h2" id="how-title">
            Generate an avatar <em>in three steps.</em>
          </h2>
          <p className="note">Shown with your seed in Pixel Sprite.</p>
        </div>

        <ol className="how__steps" ref={ref}>
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
      </div>
    </section>
  )
}

const TOKENS = /('(?:[^']*)'|`.*`|\b(?:import|from|const)\b|\b\d+\b)/g

function Line({ text }: { text: string }) {
  const parts = text.split(TOKENS)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          part
        ) : (
          <span key={i} className={part.startsWith("'") || part.startsWith('`') ? 'tok-str' : /^\d/.test(part) ? 'tok-num' : 'tok-kw'}>
            {part}
          </span>
        ),
      )}
    </>
  )
}

export function QuickStart() {
  const sample = useMemo(() => face('user-123', 'pixel-letter', 80, 'Aditya'), [])
  const lines = QUICK_START.split('\n')
  return (
    <section className="quick" id="start" aria-labelledby="start-title">
      <div className="wrap quick__layout">
        <div className="quick__intro">
          <h2 className="h2" id="start-title">
            Seed in.
            <br />
            SVG out.
          </h2>
          <CopyButton value={INSTALL} variant="install" tone="paper" />
          <p className="quick__pin">
            Before 1.0, a minor release may change the output. Pin it with <code>--save-exact</code>.
          </p>
        </div>
        <div className="code">
          <div className="code__bar">
            <span>avatar.ts</span>
            <CopyButton value={QUICK_START} label="quick start code" />
          </div>
          <pre>
            <code>
              {lines.map((line, i) => (
                <span key={i} className="code__line">
                  <span className="code__n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <Line text={line || ' '} />
                </span>
              ))}
            </code>
          </pre>
          <div className="code__out">
            <img src={svgUrl(sample)} width={64} height={64} alt="Pixel Letter avatar with an A" />
            <p>
              <span>Output</span>
              An {bytes(sample).toLocaleString('en-US')}-byte SVG string.
            </p>
          </div>
        </div>
        <table className="opts">
          <caption>ditherFace(seed, options)</caption>
          <thead>
            <tr>
              <th scope="col">Option</th>
              <th scope="col">Controls</th>
              <th scope="col">Default</th>
            </tr>
          </thead>
          <tbody>
            {OPTIONS.map((o) => (
              <tr key={o.name}>
                <th scope="row">
                  <code>{o.name}</code>
                </th>
                <td>{o.controls}</td>
                <td>
                  <code>{o.fallback}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
