/* Prototype D: what if the library shipped as a one-ink field manual? */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fnv1a } from 'palletface'
import '@fontsource/jersey-10'
import '@fontsource-variable/geist-mono'
import { FACTS, INSTALL, LINKS, PROVENANCE, QUICK_START, SAMPLE_SEEDS, STYLE_COUNT, VERSION } from '../../lib/content'
import { bayer, DitherBand } from '../../lib/dither'
import { face, Face, LETTER_STYLES, STYLES, svgUrl, type StyleSlug } from '../../lib/faces'
import { useCopy, useInView, useReducedMotion } from '../../lib/hooks'
import { Pixelate, usePixelSteps } from '../../lib/pixelate'
import './signal.css'

const PAPER = '#ffd63d'
const INK = '#1a1a17'
const EDITION = `v${VERSION}`
const PRINTS: StyleSlug[] = ['mirrored-signal', 'pixel-sprite', 'pixel-relic', 'pixel-flora']
const PROOF_STYLE: StyleSlug = 'pixel-sprite'
const num = (value: number) => String(value).padStart(2, '0')
const digest = (value: string) => fnv1a(value).toString(16).padStart(8, '0')
const inventory = STYLES.map(({ slug, draw, title }) => {
  const [, width, height] = draw('kai', 80).match(/viewBox="0 0 (\d+) (\d+)"/) ?? []
  return { slug, title, grid: `${width}×${height}` }
})

function RasterMark({ kind = 'cross' }: { kind?: 'cross' | 'asterisk' | 'cursor' | 'corner' }) {
  const shapes = {
    cross: 'M3 0h1v3h3v1H4v3H3V4H0V3h3z',
    asterisk: 'M3 0h1v2h1V1h1v1H5v1h2v1H5v1h1v1H5V5H4v2H3V5H2v1H1V5h1V4H0V3h2V2H1V1h1v1h1z',
    cursor: 'M0 0h1v1h1v1h1v1h1v1h1v1H3v2H2V5H1v1H0z',
    corner: 'M0 0h7v1H1v6H0z',
  }
  return <svg viewBox="0 0 7 7" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d={shapes[kind]} /></svg>
}

function Bracket({ end = false }: { end?: boolean }) {
  return (
    <svg viewBox="0 0 12 23" width="18" height="35" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M12 0H4v4H2v5H0v5h2v5h2v4h8v-3H7v-3H5v-5H3v-1h2V6h2V3h5z" transform={end ? 'translate(12 0) scale(-1 1)' : undefined} />
    </svg>
  )
}

function SectionTag({ n, children }: { n: string; children: ReactNode }) {
  return <div className="sg-tag"><span>{n} /</span><Bracket />{children}<Bracket end /></div>
}

function External({ to, children }: { to: keyof typeof LINKS; children: ReactNode }) {
  return <a href={LINKS[to]} target="_blank" rel="noreferrer">{children}<span aria-hidden="true"> ↗</span></a>
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, copy] = useCopy(value)
  return (
    <button type="button" className="sg-copy" onClick={copy}>
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {state === 'ok' ? <path d="m2 8 4 4 8-8" /> : <path d="M5 5h9v9H5zM2 11V2h9" />}
      </svg>
      <span aria-live="polite">{state === 'ok' ? 'Copied' : state === 'fail' ? 'Try again' : label}</span>
    </button>
  )
}

// A one-ink print made from the library's real SVG, not a second avatar generator.
function AvatarPrint({ seed, style }: { seed: string; style: StyleSlug }) {
  const surface = useRef<HTMLCanvasElement>(null)
  const size = 80
  useEffect(() => {
    const ctx = surface.current?.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const source = new Image()
    source.onload = () => {
      ctx.clearRect(0, 0, size, size)
      ctx.drawImage(source, 0, 0, size, size)
      const { data } = ctx.getImageData(0, 0, size, size)
      // The sprite's outer field contrasts with the body; preserve it as a
      // light halftone and cut the two dark eyes out of the solid silhouette.
      const background = (8 * size + size / 2) * 4
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = INK
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const i = (y * size + x) * 4
          if (data[i + 3]! < 128) continue
          const r = data[i]!
          const g = data[i + 1]!
          const b = data[i + 2]!
          const light = r * .2126 + g * .7152 + b * .0722
          const isField = Math.abs(r - data[background]!) + Math.abs(g - data[background + 1]!) + Math.abs(b - data[background + 2]!) < 18
          let coverage = Math.max(.06, Math.min(1, (231 - light) / 159))
          if (style === 'pixel-sprite') coverage = isField ? .19 : light < 46 ? .06 : light > 174 ? .55 : 1
          if (coverage > bayer(x, y)) ctx.fillRect(x, y, 1, 1)
        }
      }
    }
    source.src = svgUrl(face(seed, style, size))
    return () => { source.onload = null }
  }, [seed, style])
  return <canvas ref={surface} width={size} height={size} className="sg-print" role="img" aria-label={`One-ink ${style} avatar for ${JSON.stringify(seed)}`} />
}

function Hero({ seed }: { seed: string }) {
  const [scope, visible] = useInView<HTMLElement>({ once: false, rootMargin: '0px' })
  const reduced = useReducedMotion()
  const [sample, setSample] = useState(0)
  const [held, setHeld] = useState(false)
  const style = PRINTS[sample % PRINTS.length]!
  const block = usePixelSteps(visible && sample > 0 ? sample : false, { from: 46, duration: 590, steps: 6 })

  useEffect(() => {
    if (!visible || held || reduced) return
    const timer = window.setTimeout(() => setSample((n) => n + 1), 6100)
    return () => window.clearTimeout(timer)
  }, [visible, held, reduced, sample])

  return (
    <section className="sg-frame sg-hero" ref={scope} aria-labelledby="sg-title">
      <div className="sg-hero-main">
        <div className="sg-poster">
          <p className="sg-eyebrow"><i /> AN AVATAR LIBRARY FOR JAVASCRIPT</p>
          <h1 id="sg-title">It’s just<br /><span>A string.</span></h1>
          <p className="sg-deck">Give <strong>palletface</strong> a string. Get a deterministic SVG avatar in one of {STYLE_COUNT} pixel, dither, and geometric styles.</p>
          <div className="sg-install"><code><span aria-hidden="true">$ </span>{INSTALL}</code><CopyButton value={INSTALL} label="Copy" /></div>
        </div>
        <figure className="sg-hero-figure">
          <div className="sg-plate-head"><span>FIG 01 / LIVE SIGNAL</span><span>PRINT #{num(sample % PRINTS.length + 1)}</span></div>
          <div className="sg-art">
            <span className="sg-reg sg-reg-nw"><RasterMark kind="corner" /></span>
            <span className="sg-reg sg-reg-ne"><RasterMark kind="corner" /></span>
            <span className="sg-reg sg-reg-sw"><RasterMark kind="corner" /></span>
            <span className="sg-reg sg-reg-se"><RasterMark kind="corner" /></span>
            <span className="sg-reticle"><RasterMark /></span>
            <span className="sg-art-cursor"><RasterMark kind="cursor" /></span>
            <Pixelate className="sg-print-wrap" block={visible && sample > 0 ? block : 1}><AvatarPrint seed={seed} style={style} /></Pixelate>
          </div>
          <figcaption className="sg-plate-foot">
            <span className="sg-plate-caption">{style}<small>seed {JSON.stringify(seed)}</small></span>
            <button type="button" className="sg-next" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)} onClick={() => setSample((n) => n + 1)} aria-label="Next live print">NEXT <span aria-hidden="true">→</span></button>
          </figcaption>
        </figure>
        <span className="sg-edition" aria-hidden="true">PALLETFACE / {EDITION}</span>
      </div>
      <div className="sg-hero-index">
        <a href="#sg-proof"><span aria-hidden="true">↓</span> SEE THE PROOF</a>
        <span className="sg-index-bar" aria-hidden="true" />
        <span>TEXT IN <b aria-hidden="true">→</b> SVG OUT</span>
      </div>
    </section>
  )
}

type SeedControls = { seed: string; onSeed: (seed: string) => void }

function Proof({ seed, onSeed }: SeedControls) {
  const [ref, inView] = useInView<HTMLElement>({ threshold: .12 })
  const runA = useMemo(() => face(seed, PROOF_STYLE, 192), [seed])
  const runB = useMemo(() => face(seed, PROOF_STYLE, 192), [seed])
  const hash = digest(runA)
  const nextSeed = () => onSeed(SAMPLE_SEEDS[(SAMPLE_SEEDS.findIndex((s) => s === seed) + 1) % SAMPLE_SEEDS.length]!)
  return (
    <section id="sg-proof" className={`sg-frame sg-section sg-proof${inView ? ' sg-wiped' : ''}`} ref={ref} aria-labelledby="sg-proof-title">
      <SectionTag n="01">DETERMINISTIC</SectionTag>
      <div className="sg-proof-body">
        <div className="sg-proof-copy">
          <h2 id="sg-proof-title">Same seed.<br /><em className="sg-highlight">Same face.</em></h2>
          <p>A seed is just text: a user ID, a name, even a blank string. Run it twice with the same options and version and you get the exact same SVG.</p>
          <div className="sg-seed-row">
            <label htmlFor="sg-proof-seed">TYPE A SEED</label>
            <div className="sg-input-shell"><span aria-hidden="true">&gt;</span><input id="sg-proof-seed" type="text" value={seed} onChange={(e) => onSeed(e.target.value)} spellCheck={false} autoComplete="off" /><button type="button" onClick={nextSeed} aria-label="Use next example seed" title="Use next example seed">↻</button></div>
          </div>
        </div>
        <div className="sg-proof-figure">
          <div className="sg-proof-register"><span>FIG 02 / REPEATABILITY TEST</span><RasterMark kind="asterisk" /></div>
          <div className="sg-proof-runs">
            <figure><span>RUN_01</span><img width="192" height="192" src={svgUrl(runA)} alt="First independent render" /><code>#{hash}</code></figure>
            <span className="sg-equals" aria-hidden="true">{runA === runB ? '=' : '≠'}</span>
            <figure><span>RUN_02</span><img width="192" height="192" src={svgUrl(runB)} alt="Second independent render" /><code>#{digest(runB)}</code></figure>
          </div>
          <p className="sg-proof-result"><i /> {runA === runB ? 'SVG STRINGS MATCH' : 'SVG STRINGS DIFFER'} <span>STYLE / {PROOF_STYLE.toUpperCase()}</span></p>
        </div>
      </div>
    </section>
  )
}

function InventoryRow({ seed, entry, index, onPick }: { seed: string; entry: (typeof inventory)[number]; index: number; onPick: (style: StyleSlug) => void }) {
  const [burst, setBurst] = useState(0)
  const block = usePixelSteps(burst || false, { from: 21, duration: 360, steps: 5 })
  return (
    <li>
      <a href="#sg-repl" className="sg-style-row" onClick={() => onPick(entry.slug)} onPointerEnter={() => setBurst((n) => n + 1)} onFocus={() => setBurst((n) => n + 1)} aria-label={`Try ${entry.title} in the live REPL`}>
        <span className="sg-style-index">{num(index + 1)}</span>
        <Pixelate className="sg-style-thumb" block={burst ? block : 1}><Face seed={seed} style={entry.slug} px={64} /></Pixelate>
        <span className="sg-style-name">{entry.slug}</span>
        <span className="sg-style-grid">{entry.grid}</span>
        <span className="sg-style-flag">{LETTER_STYLES.has(entry.slug) ? 'YES' : '—'}</span>
        <span aria-hidden="true" className="sg-style-arrow">↘</span>
      </a>
    </li>
  )
}

function StyleSheet({ seed, onPick }: { seed: string; onPick: (style: StyleSlug) => void }) {
  return (
    <section id="sg-styles" className="sg-frame sg-section sg-styles" aria-labelledby="sg-styles-title">
      <SectionTag n="02">TWELVE STYLES</SectionTag>
      <div className="sg-sheet-title">
        <h2 id="sg-styles-title">Pick a frequency.</h2>
        <p>One seed, {STYLE_COUNT} ways to draw it. Select any style to load it into the terminal.</p>
      </div>
      <div className="sg-sheet-columns">
        {[inventory.slice(0, 6), inventory.slice(6)].map((entries, group) => (
          <div key={group}>
            <div className="sg-sheet-head" aria-hidden="true"><span>#</span><span>INK</span><span>STYLE ID</span><span>GRID</span><span>NAME?</span><span /></div>
            <ol start={group * 6 + 1} className="sg-sheet-list">
              {entries.map((entry, index) => <InventoryRow key={entry.slug} entry={entry} index={group * 6 + index} seed={seed} onPick={onPick} />)}
            </ol>
          </div>
        ))}
      </div>
      <p className="sg-sheet-key"><RasterMark kind="asterisk" /> GRID = SVG VIEWBOX <span> / </span> NAME? = ACCEPTS A DISPLAY NAME FOR THE INITIAL</p>
    </section>
  )
}

function Stream({ svg, active }: { svg: string; active: boolean }) {
  const reduced = useReducedMotion()
  const node = useRef<HTMLSpanElement>(null)
  const excerpt = svg.length > 268 ? `${svg.slice(0, 268)} …` : svg
  useEffect(() => {
    const output = node.current
    if (!output) return
    if (!active || reduced) {
      output.textContent = excerpt
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 600)
      output.textContent = excerpt.slice(0, Math.ceil(excerpt.length * progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    output.textContent = ''
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, excerpt, reduced, svg])
  return <><span ref={node} aria-hidden="true" /><span className="sr-only">{excerpt}</span></>
}

// Make the printed command valid for arbitrary seeds (including quotes, slashes and controls).
function quote(seed: string): string {
  return `'${JSON.stringify(seed).slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`
}

function Melt({ invert = false }: { invert?: boolean }) {
  const [ref, visible] = useInView<HTMLDivElement>({ once: false, rootMargin: '0px' })
  const reduced = useReducedMotion()
  return (
    <div ref={ref}>
      <DitherBand from={invert ? INK : PAPER} to={invert ? PAPER : INK} height={invert ? 90 : 104} cell={8} rough={.57} speed={.85} seed={invert ? 'signal-out' : 'signal-in'} mode={visible && !reduced ? 'melt' : 'static'} />
    </div>
  )
}

function Repl({ seed, onSeed, style, onStyle }: SeedControls & { style: StyleSlug; onStyle: (style: StyleSlug) => void }) {
  const [ref, visible] = useInView<HTMLDivElement>({ once: false, rootMargin: '0px' })
  const svg = useMemo(() => face(seed, style), [seed, style])
  const bytes = new TextEncoder().encode(svg).length
  const block = usePixelSteps(visible ? svg : false, { from: 32, duration: 690, steps: 6 })
  return (
    <>
      <Melt />
      <section id="sg-repl" className="sg-black" aria-labelledby="sg-repl-title">
        <div className="sg-frame sg-section sg-repl" ref={ref}>
          <SectionTag n="03">LIVE REPL</SectionTag>
          <div className="sg-sheet-title sg-repl-title">
            <h2 id="sg-repl-title">Print to screen.</h2>
            <p>No endpoint between you and the image. This is the library’s actual return value.</p>
          </div>
          <div className="sg-terminal">
            <div className="sg-terminal-head"><span><i /> PALLETFACE / LOCAL REPL</span><span>SVG OUT <span aria-hidden="true">↘</span></span></div>
            <div className="sg-terminal-io">
              <div className="sg-terminal-main">
                <div className="sg-terminal-fields">
                  <label>SEED <input id="sg-terminal-seed" type="text" value={seed} onChange={(e) => onSeed(e.target.value)} spellCheck={false} autoComplete="off" /></label>
                  <label>STYLE <select id="sg-terminal-style" value={style} onChange={(e) => onStyle(e.target.value as StyleSlug)}>{STYLES.map(({ slug }) => <option key={slug}>{slug}</option>)}</select></label>
                </div>
                <div className="sg-log">
                  <code className="sg-log-prompt"><span aria-hidden="true">&gt; </span><b>ditherFace</b>({quote(seed)}, {'{'} style: <em>'{style}'</em> {'}'})</code>
                  <div className="sg-log-output">
                    <code><Stream svg={svg} active={visible} /></code>
                    <i className={visible ? 'sg-blink' : undefined} aria-hidden="true" />
                  </div>
                </div>
              </div>
              <figure className="sg-terminal-preview">
                <span><RasterMark /> RENDERED SVG</span>
                <Pixelate block={visible ? block : 1}><img src={svgUrl(svg)} width="80" height="80" alt={`${style} avatar for ${JSON.stringify(seed)}`} /></Pixelate>
                <figcaption>{num(STYLES.findIndex(({ slug }) => style === slug) + 1)} / {num(STYLE_COUNT)}</figcaption>
              </figure>
            </div>
            <div className="sg-terminal-foot"><span>EXCERPT / FULL OUTPUT: <strong>{bytes.toLocaleString('en-US')} BYTES</strong></span><span>UTF-8</span></div>
          </div>
        </div>
      </section>
      <Melt invert />
    </>
  )
}

function Start() {
  return (
    <section id="sg-start" className="sg-frame sg-section sg-start" aria-labelledby="sg-start-title">
      <SectionTag n="04">QUICK START</SectionTag>
      <h2 id="sg-start-title">From ID to SVG.</h2>
      <div className="sg-start-grid">
        <div className="sg-code">
          <div className="sg-code-head"><span>EXAMPLE / JS</span><CopyButton value={QUICK_START} label="Copy code" /></div>
          <pre><code>{QUICK_START.split(/('(?:[^']*)'|\b(?:import|from|const)\b)/).map((part, i) => part.startsWith("'") || /^(import|from|const)$/.test(part) ? <b key={i}>{part}</b> : part)}</code></pre>
        </div>
        <dl className="sg-facts" aria-label="Package specs">
          {FACTS.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </div>
    </section>
  )
}

export default function Variant() {
  const [seed, setSeed] = useState('kai')
  const [style, setStyle] = useState<StyleSlug>('pixel-relic')
  return (
    <div className="pf-signal" id="sg-top">
      <header className="sg-frame sg-site-head">
        <a href="#sg-top" className="sg-brand"><RasterMark kind="asterisk" />palletface<span>.</span></a>
        <span className="sg-head-index">AVATAR GENERATOR / {EDITION}</span>
        <nav aria-label="Main navigation"><a href="#sg-styles">Styles</a><a href="#sg-repl">REPL</a><External to="docs">Docs</External></nav>
      </header>
      <main>
        <Hero seed={seed} />
        <Proof seed={seed} onSeed={setSeed} />
        <StyleSheet seed={seed} onPick={setStyle} />
        <Repl seed={seed} onSeed={setSeed} style={style} onStyle={setStyle} />
        <Start />
      </main>
      <footer className="sg-frame sg-footer">
        <div className="sg-footer-box">
          <div className="sg-footer-brand"><Face seed="palletface" style="mirrored-signal" px={46} /><div><a href="#sg-top">palletface.</a><p>{PROVENANCE}</p></div></div>
          <nav aria-label="Project links"><External to="github">GitHub</External><External to="npm">npm</External><External to="docs">Docs</External><External to="palletism">palletism.art</External></nav>
        </div>
        <div className="sg-colophon"><span>END OF TRANSMISSION / {EDITION}</span><a href="#sg-top">BACK TO TOP <span aria-hidden="true">↑</span></a></div>
      </footer>
    </div>
  )
}
