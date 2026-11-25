import { useState } from 'react'
import '@fontsource-variable/lora'
import '@fontsource-variable/lora/wght-italic.css'
import '@fontsource-variable/manrope'
import '@fontsource-variable/pixelify-sans'
import { DitherBand } from '../../lib/dither'
import { Face, STYLES } from '../../lib/faces'
import { useCopy, useInView } from '../../lib/hooks'
import { FACTS, INSTALL, LEDE, LINKS, QUICK_START, SAMPLE_SEEDS, STYLE_COUNT, VERSION } from '../../lib/content'
import { Pixelate, usePixelSteps } from '../../lib/pixelate'
import { Scene } from './Scene'
import { FIELD_GREEN, FIELD_NIGHT } from './world'
import './meadow.css'

const PAPER = '#fbf9f4'
const TRAILS = [
  { title: 'The first clearing', name: 'clearing' },
  { title: 'The winding path', name: 'path' },
  { title: 'The far end', name: 'far' },
] as const

function PixelBloom() {
  return (
    <svg viewBox="0 0 11 11" width="24" height="24" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M4 0h3v3h1V2h2v2H9v1h2v2H8v1h1v2H7V9H6v2H4V8H3v1H1V7h1V6H0V4h3V3H2V1h2z" />
      <path fill="#e8553e" d="M4 4h3v3H4z" />
    </svg>
  )
}

function CopyButton({ value, install = false }: { value: string; install?: boolean }) {
  const [state, copy] = useCopy(value)
  const status = state === 'ok' ? 'Copied' : state === 'fail' ? 'Retry' : 'Copy'
  return (
    <button type="button" className={install ? 'pf-meadow-install' : 'pf-meadow-code-copy'} onClick={copy}>
      {install && <><span className="pf-meadow-prompt" aria-hidden="true">$</span><code>{value}</code></>}
      <span className="pf-meadow-copy-label" aria-live="polite">{status}<span className="sr-only">{install ? ' install command' : ' quick start code'}</span></span>
    </button>
  )
}

function StyleCard({ item, index, seed }: { item: (typeof STYLES)[number]; index: number; seed: string }) {
  const [ref, inView] = useInView<HTMLLIElement>({ threshold: 0.2, rootMargin: '0px 0px -3% 0px' })
  const block = usePixelSteps(inView, { from: 23, duration: 600, steps: 6 })
  return (
    <li className="pf-meadow-style-card" ref={ref}>
      <div className="pf-meadow-style-top">
        <span className="pf-meadow-label">LEVEL {String(index + 1).padStart(2, '0')}</span>
        <span aria-hidden="true" className="pf-meadow-card-dot" />
      </div>
      <div className="pf-meadow-medallion">
        <Pixelate block={block}><Face seed={seed} style={item.slug} px={88} /></Pixelate>
      </div>
      <h3>{item.title}</h3>
    </li>
  )
}

function QuickStart() {
  const tokens = QUICK_START.split(/('(?:[^']*)'|`.*`|\b(?:import|from|const)\b|\b\d+\b)/g)
  return (
    <section className="pf-meadow-guide" id="meadow-quick" aria-labelledby="meadow-quick-title">
      <div className="pf-meadow-wrap">
        <div className="pf-meadow-guide-main">
          <div className="pf-meadow-guide-intro">
            <p className="pf-meadow-label pf-meadow-eyebrow"><span>02</span> / QUICK START</p>
            <h2 id="meadow-quick-title">Grow your<br /> <em>own faces</em><b>.</b></h2>
            <p>{LEDE}</p>
            <a href={LINKS.docs} target="_blank" rel="noreferrer">Read the docs <span aria-hidden="true">↗</span></a>
          </div>
          <div className="pf-meadow-code">
            <div className="pf-meadow-code-bar">
              <span className="pf-meadow-label">AVATAR.TS</span>
              <CopyButton value={QUICK_START} />
            </div>
            <pre><code>{tokens.map((part, i) => i % 2 === 0 ? part : <span key={i} className={part.startsWith('\'') || part.startsWith('`') ? 'pf-meadow-str' : 'pf-meadow-kw'}>{part}</span>)}</code></pre>
          </div>
        </div>
        <dl className="pf-meadow-facts">
          {FACTS.filter(({ label }) => label !== 'styles' && label !== 'network requests').map(({ label, value }) => (
            <div key={label}><dt className="pf-meadow-label">{label}</dt><dd>{label === 'output' ? 'SVG string' : label === 'runs on' ? 'Node + browser' : value === 'esm + ts' ? 'ESM + TS types' : value === 'mit' ? 'MIT' : value}</dd></div>
          ))}
        </dl>
      </div>
    </section>
  )
}

export default function Variant() {
  const [seed, setSeed] = useState('ada')
  const [night, setNight] = useState(false)
  const nextSeed = () => {
    const index = SAMPLE_SEEDS.findIndex(sample => sample === seed)
    setSeed(SAMPLE_SEEDS[(index + 1) % SAMPLE_SEEDS.length]!)
  }

  return (
    <div className="pf-meadow" id="meadow-top">
      <main>
        <section className={`pf-meadow-hero${night ? ' pf-meadow-night' : ''}`} aria-labelledby="meadow-title">
          <header className="pf-meadow-header pf-meadow-wrap">
            <a href="#meadow-top" className="pf-meadow-brand"><PixelBloom /> palletface</a>
            <nav aria-label="Meadow">
              <a href="#meadow-atlas">Styles</a>
              <a href={LINKS.github} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
              <button className="pf-meadow-time" type="button" aria-label="Night mode" aria-pressed={night} onClick={() => setNight(!night)}>
                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" shapeRendering="crispEdges">
                  {night
                    ? <path d="M7 1h2v3H7zM7 12h2v3H7zM1 7h3v2H1zM12 7h3v2h-3zM5 5h6v6H5zM3 3h2v2H3zM11 3h2v2h-2zM11 11h2v2h-2zM3 11h2v2H3z" />
                    : <path d="M5 1h5v2H8v2H7v4h2v2h5v2h-2v2H5v-2H3v-2H1V5h2V3h2z" />}
                </svg>
              </button>
            </nav>
          </header>
          <div className="pf-meadow-hero-content pf-meadow-wrap">
            <p className="pf-meadow-label pf-meadow-hero-note"><span aria-hidden="true">✦</span> THE PIXEL AVATAR LIBRARY <span className="pf-meadow-version">/ V{VERSION}</span></p>
            <h1 id="meadow-title">a little world<br /> for every <em>user</em><b>.</b></h1>
            <p className="pf-meadow-lead">Deterministic SVG avatars in {STYLE_COUNT} pixel, dither, and geometric styles.</p>
            <CopyButton value={INSTALL} install />
          </div>
          <div className="pf-meadow-terminal">
            <div className="pf-meadow-terminal-top pf-meadow-label"><span>SEED TERMINAL</span><span className="pf-meadow-online" aria-hidden="true" /></div>
            <div className="pf-meadow-terminal-inner">
              <label htmlFor="meadow-seed">Type a seed</label>
              <div className="pf-meadow-entry">
                <span aria-hidden="true">&gt;</span>
                <input id="meadow-seed" value={seed} onChange={e => setSeed(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-describedby="meadow-seed-note" />
                <button type="button" aria-label="Try the next sample seed" title="Try the next sample seed" onClick={nextSeed}>↻</button>
              </div>
              <p id="meadow-seed-note">Same seed, same face.</p>
            </div>
          </div>
          <div className="pf-meadow-ground pf-meadow-wrap">
            <a className="pf-meadow-label" href="#meadow-atlas"><span aria-hidden="true">↓</span> WALK THE FIELD</a>
            <span className="pf-meadow-label pf-meadow-timestamp">{night ? '02 / AFTER DARK' : '01 / THE MEADOW'}</span>
          </div>
          <Scene seed={seed} night={night} />
        </section>
        <DitherBand from={night ? FIELD_NIGHT : FIELD_GREEN} to={PAPER} height={68} cell={4} mode="static" rough={0.31} seed="meadow/paper-edge" />
        <section className="pf-meadow-atlas pf-meadow-wrap" id="meadow-atlas" aria-labelledby="meadow-atlas-title">
          <div className="pf-meadow-atlas-head">
            <div>
              <p className="pf-meadow-label pf-meadow-eyebrow"><span>01</span> / THE FIELD GUIDE</p>
              <h2 id="meadow-atlas-title">Meet the <em>locals</em><b>.</b></h2>
            </div>
            <div className="pf-meadow-atlas-aside">
              <p>One seed, twelve looks. Change it at the terminal and follow it through the whole field.</p>
              <a href="#meadow-seed" className="pf-meadow-label">SEED <code>{seed === '' ? '(empty)' : seed}</code> <span aria-hidden="true">↖</span></a>
            </div>
          </div>
          {TRAILS.map(({ title, name }, group) => (
            <div className={`pf-meadow-trail pf-meadow-trail-${name}`} key={name}>
              <div className="pf-meadow-trail-label">
                <span className="pf-meadow-label">TRAIL {String(group + 1).padStart(2, '0')}</span>
                <span>{title}</span>
              </div>
              <ul className="pf-meadow-trail-cards">
                {STYLES.slice(group * 4, group * 4 + 4).map((item, i) => (
                  <StyleCard key={item.slug} item={item} index={group * 4 + i} seed={seed} />
                ))}
              </ul>
            </div>
          ))}
        </section>
        <QuickStart />
      </main>
      <footer className="pf-meadow-footer">
        <Scene seed={seed} night footer />
        <div className="pf-meadow-wrap pf-meadow-footer-content">
          <div>
            <a href="#meadow-top" className="pf-meadow-brand"><PixelBloom /> palletface</a>
            <p className="pf-meadow-goodnight">Goodnight, <em>meadow</em><b>.</b></p>
            <p>A sister project of <a href={LINKS.palletism} target="_blank" rel="noreferrer">palletism.art</a>.</p>
          </div>
          <nav aria-label="Project">
            <a href={LINKS.github} target="_blank" rel="noreferrer">GitHub ↗</a>
            <a href={LINKS.npm} target="_blank" rel="noreferrer">npm ↗</a>
            <a href={LINKS.docs} target="_blank" rel="noreferrer">Docs ↗</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
