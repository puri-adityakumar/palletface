/**
 * PROTOTYPE A, "seed field": the whole hero is a cell field grown from the
 * seed you type. Paper cells count their ink neighbours like minesweeper, the
 * pointer glows, and clicking digs up a face. Below it, every style for the
 * same seed, a quick start, and a footer field.
 */
import '@fontsource-variable/inter-tight'
import '@fontsource-variable/geist-mono'
import './field.css'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { STYLES, type StyleSlug } from 'palletface'
import { FACTS, INSTALL, LEDE, LINKS, PROVENANCE, QUICK_START, SAMPLE_SEEDS, STYLE_COUNT, VERSION } from '../../lib/content'
import { callFor, face, Face, LETTER_STYLES, svgUrl } from '../../lib/faces'
import { useCopy, useInView, useReducedMotion } from '../../lib/hooks'
import { Pixelate, usePixelSteps } from '../../lib/pixelate'
import { DitherBand } from '../../lib/dither'
import { SeedField, type Dig, type FieldPalette } from './SeedField'

const PAPER = '#e7e7e3'
const INK = '#151515'

const HERO_PALETTE: FieldPalette = { paper: PAPER, ink: INK, glow: '#2633d9', glowSoft: '#a9b0ff', digit: '#6b6b66' }
const FOOT_PALETTE: FieldPalette = { paper: PAPER, ink: INK, glow: '#2633d9', glowSoft: '#a9b0ff', digit: '#6b6b66' }

const pad = (n: number) => String(n).padStart(2, '0')
const nameFor = (seed: string) => seed.charAt(0).toUpperCase() + seed.slice(1)

function CopyInstall({ tone = 'paper' }: { tone?: 'paper' | 'ink' }) {
  const [state, copy] = useCopy(INSTALL)
  return (
    <button type="button" className={`ff-install ff-install--${tone}`} onClick={copy} data-nodig>
      <span className="ff-install__cmd">
        <span aria-hidden="true">$ </span>
        {INSTALL}
      </span>
      <span className="ff-install__state" aria-live="polite">
        {state === 'ok' ? 'copied' : state === 'fail' ? 'press ⌘C' : 'copy'}
      </span>
    </button>
  )
}

/** The big avatar in the dark part of the field. Steps through styles on its own. */
function SeedCard({ seed }: { seed: string }) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [hold, setHold] = useState(false)
  const style = STYLES[index]!.slug
  const block = usePixelSteps(`${seed}:${style}`, { from: 36, duration: 560, steps: 6 })

  useEffect(() => {
    if (reduced || hold) return
    const t = window.setInterval(() => setIndex((i) => (i + 1) % STYLES.length), 2600)
    return () => window.clearInterval(t)
  }, [reduced, hold])

  return (
    <button
      type="button"
      className="ff-card"
      data-nodig
      onClick={() => setIndex((i) => (i + 1) % STYLES.length)}
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      aria-label={`Avatar for ${seed} in the ${STYLES[index]!.title} style. Next style.`}
    >
      <span className="ff-card__top">
        <span>{pad(index + 1)}/{pad(STYLE_COUNT)}</span>
        <span>{STYLES[index]!.title}</span>
      </span>
      <Pixelate block={block} className="ff-card__art">
        <Face seed={seed} style={style} px={208} name={nameFor(seed)} />
      </Pixelate>
      <code className="ff-card__call">
        ditherFace('{seed}', {'{'}
        <br />
        {'  '}style: '{style}'{LETTER_STYLES.has(style) ? ', name' : ''} {'}'})
      </code>
    </button>
  )
}

type Dug = { id: number; x: number; y: number; seed: string; style: StyleSlug; size: number }

function DugFace({ dug }: { dug: Dug }) {
  const block = usePixelSteps(dug.id, { from: Math.round(dug.size / 3), duration: 420, steps: 4 })
  return (
    <Pixelate
      block={block}
      className="ff-dug"
      style={{ left: dug.x - dug.size / 2, top: dug.y - dug.size / 2, width: dug.size, height: dug.size }}
    >
      <Face seed={dug.seed} style={dug.style} px={dug.size} name={nameFor(dug.seed)} />
    </Pixelate>
  )
}

function Hero({ seed, setSeed }: { seed: string; setSeed: (s: string) => void }) {
  const navRef = useRef<HTMLElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const ledeRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLParagraphElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(seed)
  const [dug, setDug] = useState<Dug[]>([])
  const [ink, setInk] = useState(0)
  const digCount = useRef(0)

  useEffect(() => setDraft(seed), [seed])

  const onDig = (d: Dig) => {
    const n = digCount.current++
    const s = SAMPLE_SEEDS[(n * 5 + seed.length) % SAMPLE_SEEDS.length]!
    const style = STYLES[(n * 7 + 3) % STYLES.length]!.slug
    const size = window.innerWidth < 640 ? 54 : 72
    setDug((list) => [...list.slice(-7), { id: n + 1, x: d.x, y: d.y, seed: s, style, size }])
  }

  const shuffle = () => {
    const i = SAMPLE_SEEDS.indexOf(seed as (typeof SAMPLE_SEEDS)[number])
    setSeed(SAMPLE_SEEDS[(i + 1) % SAMPLE_SEEDS.length]!)
    setDug([])
  }

  const clear = useMemo(() => [navRef, headRef, ledeRef, hintRef], [])
  const solid = useMemo(() => [cardRef], [])

  return (
    <section className="ff-hero" aria-label="palletface">
      <SeedField
        seed={seed}
        mode="hero"
        palette={HERO_PALETTE}
        clear={clear}
        solid={solid}
        onDig={onDig}
        onStats={(s) => setInk(s.ink)}
      />
      {dug.map((d) => (
        <DugFace key={d.id} dug={d} />
      ))}

      <nav ref={navRef} className="ff-nav" data-nodig>
        <a className="ff-logo" href="#top">
          <Face seed="palletface" style="pixel-sprite" px={22} />
          palletface
        </a>
        <ul>
          <li>
            <a href="#styles">Styles</a>
          </li>
          <li>
            <a href="#start">Quick start</a>
          </li>
          <li>
            <a href={LINKS.github}>GitHub</a>
          </li>
          <li>
            <a href={LINKS.npm}>npm</a>
          </li>
        </ul>
      </nav>

      <div ref={headRef} className="ff-head">
        <h1>
          Every seed
          <br />
          grows a face.
        </h1>
        <form
          className="ff-seed"
          data-nodig
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) setSeed(draft.trim())
          }}
        >
          <label htmlFor="ff-seed-input">seed</label>
          <input
            id="ff-seed-input"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            maxLength={32}
            onChange={(e) => {
              setDraft(e.target.value)
              if (e.target.value.trim()) setSeed(e.target.value.trim())
            }}
          />
          <button type="button" onClick={shuffle} aria-label="Try another seed">
            ↻
          </button>
        </form>
      </div>

      <div ref={cardRef} className="ff-cardwrap">
        <SeedCard seed={seed} />
      </div>

      <p ref={hintRef} className="ff-hint">
        <span>{ink.toLocaleString('en-US')} cells grown from “{seed}”</span>
        <span>click the field to dig up a face</span>
      </p>

      <div ref={ledeRef} className="ff-lede" data-nodig>
        <p>{LEDE}</p>
        <CopyInstall />
      </div>
    </section>
  )
}

function StyleTile({ seed, slug, title, index, play }: { seed: string; slug: StyleSlug; title: string; index: number; play: boolean }) {
  const [state, copy] = useCopy(callFor(seed, slug, 80, nameFor(seed)))
  const [delayed, setDelayed] = useState<string | null>(null)
  useEffect(() => {
    if (!play) return
    const t = window.setTimeout(() => setDelayed(`${seed}:${slug}`), index * 70)
    return () => window.clearTimeout(t)
  }, [play, seed, slug, index])
  const block = usePixelSteps(delayed, { from: 40, duration: 620, steps: 6 })
  return (
    <li className="ff-tile">
      <button type="button" onClick={copy}>
        <span className="ff-tile__meta">
          <span>{pad(index + 1)}</span>
          <span>{state === 'ok' ? 'call copied' : state === 'fail' ? 'copy failed' : LETTER_STYLES.has(slug) ? 'uses name' : ''}</span>
        </span>
        <Pixelate block={block} className="ff-tile__art">
          <Face seed={seed} style={slug} px={144} name={nameFor(seed)} />
        </Pixelate>
        <span className="ff-tile__name">{title}</span>
        <code className="ff-tile__slug">'{slug}'</code>
      </button>
    </li>
  )
}

function Styles({ seed }: { seed: string }) {
  const [ref, inView] = useInView<HTMLUListElement>({ rootMargin: '0px 0px -15% 0px' })
  return (
    <section id="styles" className="ff-section ff-styles">
      <header className="ff-sechead">
        <p className="ff-kicker">01 / styles</p>
        <h2>
          {STYLE_COUNT} styles.
          <br />
          One seed: <span className="ff-seedword">{seed}</span>
        </h2>
        <p className="ff-secnote">Same input, same output, every time. Click a tile to copy its call.</p>
      </header>
      <ul ref={ref} className="ff-grid">
        {STYLES.map((s, i) => (
          <StyleTile key={s.slug} seed={seed} slug={s.slug} title={s.title} index={i} play={inView} />
        ))}
      </ul>
    </section>
  )
}

function QuickStart() {
  const svg = useMemo(() => face('user-123', 'pixel-letter', 80, 'Aditya'), [])
  const [state, copy] = useCopy(QUICK_START)
  const lines = QUICK_START.split('\n')
  return (
    <section id="start" className="ff-section ff-start">
      <header className="ff-sechead">
        <p className="ff-kicker">02 / quick start</p>
        <h2>
          Seed in.
          <br />
          SVG out.
        </h2>
        <ol className="ff-steps">
          <li>Install the package. It has no runtime dependencies.</li>
          <li>Pass any string: a user ID, an email hash, a name.</li>
          <li>Use the SVG string anywhere: an img, a file, an API response.</li>
        </ol>
        <CopyInstall tone="ink" />
      </header>
      <div className="ff-code">
        <div className="ff-code__bar">
          <span>app.ts</span>
          <button type="button" onClick={copy}>
            {state === 'ok' ? 'copied' : state === 'fail' ? 'copy failed' : 'copy'}
          </button>
        </div>
        <pre>
          {lines.map((line, i) => (
            <span key={i} className="ff-code__line">
              <span className="ff-code__n" aria-hidden="true">
                {i + 1}
              </span>
              {line || ' '}
            </span>
          ))}
        </pre>
        <div className="ff-code__out">
          <img src={svgUrl(svg)} width={80} height={80} alt="The avatar this code draws" />
          <span>
            → an &lt;svg&gt; string
            <br />
            the same bytes on every run
          </span>
        </div>
      </div>
    </section>
  )
}

function Facts() {
  return (
    <section className="ff-section ff-facts" aria-label="Facts">
      <dl>
        {FACTS.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Footer({ seed }: { seed: string }) {
  const headRef = useRef<HTMLDivElement>(null)
  const linksRef = useRef<HTMLUListElement>(null)
  const metaRef = useRef<HTMLParagraphElement>(null)
  const clear = useMemo(() => [headRef, linksRef, metaRef], [])
  return (
    <footer className="ff-foot">
      <SeedField seed={`${seed}/footer`} mode="footer" palette={FOOT_PALETTE} clear={clear} />
      <div ref={headRef} className="ff-foot__head" data-nodig>
        <h2>Plant a seed.</h2>
        <CopyInstall />
      </div>
      <ul ref={linksRef} className="ff-foot__links" data-nodig>
        <li>
          <a href={LINKS.github}>GitHub</a>
        </li>
        <li>
          <a href={LINKS.npm}>npm</a>
        </li>
        <li>
          <a href={LINKS.docs}>Docs</a>
        </li>
        <li>
          <a href={LINKS.issues}>Issues</a>
        </li>
        <li>
          <a href={LINKS.palletism}>Palletism</a>
        </li>
      </ul>
      <p ref={metaRef} className="ff-foot__meta">
        <span>v{VERSION} · MIT</span>
        <span>{PROVENANCE}</span>
      </p>
    </footer>
  )
}

export default function Variant() {
  const [seed, setSeed] = useState<string>('ada')
  return (
    <div className="pf-field" id="top" style={{ '--paper': PAPER, '--ink': INK } as CSSProperties}>
      <Hero seed={seed} setSeed={setSeed} />
      <Styles seed={seed} />
      <DitherBand from={PAPER} to={INK} height={72} cell={8} seed={`${seed}:band`} />
      <div className="ff-dark">
        <QuickStart />
        <Facts />
      </div>
      <DitherBand from={INK} to={PAPER} height={72} cell={8} seed={`${seed}:band2`} mode="static" />
      <Footer seed={seed} />
    </div>
  )
}
