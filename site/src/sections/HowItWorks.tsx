import { useMemo } from 'react'
import { fnv1a } from 'palletface'
import { CopyButton } from '../components/CopyButton'
import { face, Face, svgUrl } from '../lib/faces'
import { useInView } from '../lib/hooks'
import { Pixelate, usePixelSteps } from '../lib/pixelate'
import { INSTALL, QUICK_START } from '../lib/content'
import './how.css'

const bytes = (s: string) => new TextEncoder().encode(s).length

function Code() {
  const parts = QUICK_START.split(/('(?:[^']*)'|`.*`|\b(?:import|from|const)\b|\b\d+\b)/g)
  return (
    <pre>
      <code>
        {parts.map((part, i) =>
          i % 2 === 0 ? (
            part
          ) : (
            <span key={i} className={part.startsWith("'") || part.startsWith('`') ? 'tok-str' : /^\d/.test(part) ? 'tok-num' : 'tok-kw'}>
              {part}
            </span>
          ),
        )}
      </code>
    </pre>
  )
}

export function HowItWorks({ seed }: { seed: string }) {
  const [ref, inView] = useInView<HTMLOListElement>({ threshold: 0.25 })
  const block = usePixelSteps(inView ? seed : null, { from: 16, duration: 900, steps: 5 })
  const hash = (fnv1a('sprite' + seed) >>> 0).toString(16).padStart(8, '0')
  const svg = useMemo(() => face(seed, 'pixel-sprite', 80), [seed])
  const sample = useMemo(() => face('user-123', 'pixel-letter', 80, 'Aditya'), [])
  const shown = seed === '' ? '' : seed

  return (
    <section className="how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <p className="label eyebrow">
              <span>04</span> / How it works
            </p>
            <h2 className="section-title" id="how-title">
              From seed to <em>face</em>
              <b>.</b>
            </h2>
          </div>
          <p className="section-note">Three steps, all on your side. The example below follows the seed you typed in the meadow.</p>
        </div>

        <ol className="steps" ref={ref}>
          <li className="step">
            <span className="label step__n">Step 01</span>
            <div className="step__visual">
              <span className="seed-chip">‘{shown}’</span>
              <span className="label step__caption">any string</span>
            </div>
            <h3>Plant a seed</h3>
            <p>Pass any string: a user ID, a handle, a row key. Empty and Unicode strings work too.</p>
          </li>
          <li className="step">
            <span className="label step__n">Step 02</span>
            <div className="step__visual step__visual--grow">
              <code className="hash">
                fnv1a → <b>0x{hash}</b>
              </code>
              <Pixelate block={block}>
                <Face seed={seed} style="pixel-sprite" px={64} alt="" />
              </Pixelate>
            </div>
            <h3>It grows</h3>
            <p>Each style hashes the seed. A seeded generator then picks the palette, the shape, and every pixel. No clock, no randomness.</p>
          </li>
          <li className="step">
            <span className="label step__n">Step 03</span>
            <div className="step__visual">
              <code className="svg-chip">&lt;svg …&gt;</code>
              <span className="label step__caption">{bytes(svg).toLocaleString('en-US')} bytes</span>
            </div>
            <h3>Use the SVG</h3>
            <p>You get one complete SVG string. Put it in an image, send it from your server, or save it as a file.</p>
          </li>
        </ol>

        <div className="quick">
          <div className="quick__intro">
            <h3>Quick start</h3>
            <p>Install it, call one function, and use the string. That is the whole API.</p>
            <CopyButton value={INSTALL} variant="install" />
          </div>
          <div className="code">
            <div className="code__bar">
              <span className="label">avatar.ts</span>
              <CopyButton value={QUICK_START} label="quick start code" />
            </div>
            <Code />
            <div className="code__out">
              <img src={svgUrl(sample)} width={56} height={56} alt="The avatar this code draws: a pixel letter A" />
              <p>
                <span className="label">Output</span>
                An SVG string, {bytes(sample).toLocaleString('en-US')} bytes. The same on every run.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
