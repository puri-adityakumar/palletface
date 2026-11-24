import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { STYLES } from '../../lib/faces'
import { FACTS, INSTALL, LEDE, LINKS, QUICK_START, STYLE_COUNT, TAGLINE, VERSION } from '../../lib/content'
import { useAnimationFrame, useCopy, useInView, useReducedMotion } from '../../lib/hooks'
import { Pixelate, usePixelSteps } from '../../lib/pixelate'
import { makePlot, samplePlot, type Cell, type Job } from './plot'
import '@fontsource-variable/inter-tight'
import '@fontsource-variable/geist-mono'
import './plotter.css'

const plates = [
  ['pixel-flora', 'A fern, cactus or wildflower on a pastel disc.'],
  ['geometric-tile', 'Curved pieces, turned and colored by your seed.'],
  ['pixel-sprite', 'A mirrored creature with two ink-dot eyes.'],
  ['dither-orb', 'An ordered-dither gradient, one square at a time.'],
  ['pixel-landscape', 'A sun, two hills and a dithered sky in 16 × 16.'],
  ['pixel-letter', 'A shadowed bitmap initial over a dithered field.'],
  ['random-contours', 'Topographic lines with a different center and spacing for each seed.'],
  ['mirrored-signal', 'A mirrored 7 × 7 mark with hollow terminals.'],
  ['pixelify-letter', 'A chunky initial on a two-tone checker.'],
  ['pixel-emotes', 'A small expressive silhouette with a pixel shadow.'],
  ['pixel-relic', 'A key, lantern or potion from a tiny inventory.'],
  ['pixel-stamp', 'A bitmap initial cut out of a chipped stamp.'],
] as const

const digits = (n: number) => String(n).padStart(2, '0')
const DRAW_MS = 1800
const RESOLVE_MS = 420
const HOLD_MS = 4700
const TEAR_MS = 340
const RESOLVED_AT = DRAW_MS + RESOLVE_MS
const TEAR_AT = RESOLVED_AT + HOLD_MS
const END_AT = TEAR_AT + TEAR_MS

function CopyButton({ value }: { value: string }) {
  const [state, copy] = useCopy(value)
  return (
    <button className="pt-copy" type="button" onClick={copy}>
      {state === 'ok' ? 'Copied' : state === 'fail' ? 'Try again' : 'Copy'} <span aria-hidden="true">↗</span>
    </button>
  )
}

function Plot({
  index, job, cells, auto, frontispiece, onFinish, progress,
}: {
  index: number
  job: Job
  cells: Cell[] | undefined
  auto: boolean
  frontispiece: boolean
  onFinish: () => void
  progress: RefObject<HTMLButtonElement | null>
}) {
  const [area, visible] = useInView<HTMLDivElement>({ once: false, rootMargin: '0px', threshold: 0.05 })
  const reduced = useReducedMotion()
  const canvas = useRef<HTMLCanvasElement>(null)
  const ship = useRef<HTMLDivElement>(null)
  const phase = useRef<HTMLSpanElement>(null)
  const coordinates = useRef<HTMLSpanElement>(null)
  const tint = useRef<HTMLSpanElement>(null)
  const swatch = useRef<HTMLSpanElement>(null)
  const head = useRef<HTMLSpanElement>(null)
  const elapsed = useRef(frontispiece ? RESOLVED_AT : 0)
  const drawn = useRef(0)
  const [settled, setSettled] = useState(frontispiece)
  const preview = frontispiece || reduced
  const last = preview ? cells?.at(-1) : undefined
  const unit = 78 / job.grid

  useEffect(() => {
    drawn.current = 0
    elapsed.current = preview ? RESOLVED_AT : 0
    setSettled(preview)
    progress.current?.style.setProperty('--pass-progress', preview ? '1' : '0')
  }, [cells, progress, preview])

  useAnimationFrame(visible && !reduced && !!cells?.length && (auto || !settled), (_, delta) => {
    const el = canvas.current
    if (!el || !cells || !ship.current) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const next = elapsed.current + Math.max(0, Math.min(delta, 48))
    const time = auto ? next : Math.min(RESOLVED_AT, next)
    elapsed.current = time
    const quantity = Math.min(cells.length, 1 + Math.floor(time / DRAW_MS * cells.length))
    if (!frontispiece && quantity > drawn.current) {
      if (drawn.current === 0) ctx.clearRect(0, 0, job.grid, job.grid)
      for (let i = drawn.current; i < quantity; i++) {
        const cell = cells[i]!
        ctx.fillStyle = cell.hex
        ctx.fillRect(cell.x, cell.y, 1, 1)
      }
      const cell = cells[quantity - 1]!
      const center = (n: number) => `${(n + 0.5) / job.grid * 100}%`
      if (coordinates.current) coordinates.current.textContent = `x${digits(cell.x)} y${digits(cell.y)}`
      if (tint.current) tint.current.textContent = cell.hex
      if (swatch.current) swatch.current.style.background = cell.hex
      head.current?.style.setProperty('--head-x', center(cell.x))
      head.current?.style.setProperty('--head-y', center(cell.y))
      drawn.current = quantity
    }

    const nextPhase = time < DRAW_MS ? 'plotting' : time < RESOLVED_AT ? 'resolving' : time < TEAR_AT ? 'resolved' : 'tearing'
    if (ship.current.dataset.phase !== nextPhase) {
      ship.current.dataset.phase = nextPhase
      if (phase.current) phase.current.textContent = nextPhase === 'resolved' ? 'SVG resolved' : nextPhase === 'tearing' ? 'Advancing' : nextPhase
    }
    progress.current?.style.setProperty('--pass-progress', String(auto ? Math.min(1, time / END_AT) : time / RESOLVED_AT))
    if (time >= END_AT && auto) onFinish()
    if (time >= RESOLVED_AT && !auto && !settled) setSettled(true)
  })

  return (
    <div ref={area} className="pt-plot" style={{ '--unit': `${unit}%`, '--grid-origin': `${1100 / (100 - unit)}%` } as CSSProperties}>
      <figure className="pt-stage">
        <figcaption className="pt-stage-label">
          <span><i /> Live plot</span>
          <span>Fig. {digits(index + 1)}</span>
        </figcaption>
        <div className="pt-grid">
          <span className="pt-register pt-nw" aria-hidden="true" />
          <span className="pt-register pt-ne" aria-hidden="true" />
          <span className="pt-register pt-sw" aria-hidden="true" />
          <span className="pt-register pt-se" aria-hidden="true" />
          <span className="pt-axis pt-axis-x" aria-hidden="true">X</span>
          <span className="pt-axis pt-axis-y" aria-hidden="true">Y</span>
          <div className="pt-art" ref={ship} data-phase={preview ? 'resolved' : cells?.length ? 'loading' : 'preview'}>
            <canvas ref={canvas} width={job.grid} height={job.grid} aria-hidden="true" />
            <img className="pt-crisp" src={job.url} alt={`${STYLES.find(item => item.slug === job.style)!.title} avatar for ${JSON.stringify(job.seed)}`} draggable={false} />
            <img className="pt-slice pt-slice-a" src={job.url} alt="" aria-hidden="true" draggable={false} />
            <img className="pt-slice pt-slice-b" src={job.url} alt="" aria-hidden="true" draggable={false} />
            <img className="pt-slice pt-slice-c" src={job.url} alt="" aria-hidden="true" draggable={false} />
            <span className="pt-head" ref={head} aria-hidden="true" />
          </div>
        </div>
        <div className="pt-axis-caption">
          <span>0,0</span>
          <span>{job.grid} × {job.grid} {job.native === job.grid ? 'native grid' : 'sample grid'}</span>
        </div>
      </figure>
      <aside className="pt-inspector" aria-label="Plot settings">
        <div className="pt-counter"><strong>{digits(index + 1)}</strong><span> / {STYLE_COUNT}</span></div>
        <dl>
          <div className="pt-inspector-pass"><dt>Pattern</dt><dd>{job.pass}</dd></div>
          <div className="pt-inspector-cursor"><dt>Draw head</dt><dd aria-hidden="true"><span ref={coordinates}>{last ? `x${digits(last.x)} y${digits(last.y)}` : 'x— y—'}</span><span className="pt-ink"><span ref={swatch} style={last ? { background: last.hex } : undefined} /> <span ref={tint}>{last?.hex ?? '#——————'}</span></span></dd></div>
          <div><dt>Status</dt><dd className="pt-status"><i /><span ref={phase}>{preview ? 'SVG resolved' : 'Plot queued'}</span></dd></div>
        </dl>
      </aside>
    </div>
  )
}

function Plate({ index, job, selected, choose }: { index: number; job: Job; selected: boolean; choose: () => void }) {
  const [playing, setPlaying] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visibleRef, visible] = useInView<HTMLButtonElement>({ once: false, rootMargin: '0px' })
  const reduced = useReducedMotion()
  useEffect(() => {
    const el = canvas.current
    if (!el || !playing || !visible || reduced) return
    let raf = 0
    let cancel = false
    const ctx = el.getContext('2d')
    if (!ctx) return
    samplePlot(job).then(cells => {
      if (cancel || !cells.length) return
      ctx.clearRect(0, 0, job.grid, job.grid)
      el.dataset.drawing = 'true'
      const start = performance.now()
      let drawn = 0
      const frame = (now: number) => {
        const count = Math.min(cells.length, Math.floor((now - start) / 420 * cells.length))
        for (; drawn < count; drawn++) {
          const cell = cells[drawn]!
          ctx.fillStyle = cell.hex
          ctx.fillRect(cell.x, cell.y, 1, 1)
        }
        if (count < cells.length) raf = requestAnimationFrame(frame)
        else delete el.dataset.drawing
      }
      raf = requestAnimationFrame(frame)
    }).catch(() => {})
    return () => {
      cancel = true
      cancelAnimationFrame(raf)
      delete el.dataset.drawing
    }
  }, [job, playing, reduced, visible])

  return (
    <button ref={visibleRef} type="button" className="pt-plate" aria-pressed={selected} onClick={choose}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setPlaying(true) }}
      onPointerLeave={() => setPlaying(false)} onFocus={() => setPlaying(true)} onBlur={() => setPlaying(false)}>
      <span className="pt-plate-image" aria-hidden="true">
        <span className="pt-plate-number">{digits(index + 1)}</span>
        <canvas ref={canvas} width={job.grid} height={job.grid} />
        <img src={job.url} alt="" draggable={false} />
        <span className="pt-plate-cross">+</span>
      </span>
      <span className="pt-plate-label">{job.style}<span aria-hidden="true">↗</span></span>
    </button>
  )
}

export default function Variant() {
  const [seed, setSeed] = useState('ada')
  const [index, setIndex] = useState(0)
  const [auto, setAuto] = useState(true)
  const [run, setRun] = useState(0)
  const [frontispiece, setFrontispiece] = useState(true)
  const [sample, setSample] = useState<{ job: Job; cells: Cell[] }>()
  const currentTick = useRef<HTMLButtonElement>(null)
  const hero = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const jobs = useMemo(() => plates.map(([style], i) => makePlot(seed, style, i)), [seed])
  const job = jobs[index]!
  const activeStyle = STYLES.find(item => item.slug === job.style)!
  const words = activeStyle.title.split(' ')
  const cells = sample?.job === job ? sample.cells : undefined
  const block = usePixelSteps(job.style, { from: 12, duration: 380, steps: 5 })
  const advance = useCallback(() => {
    setFrontispiece(false)
    setIndex(i => (i + 1) % STYLE_COUNT)
  }, [])
  const select = (i: number, jump = false) => {
    setAuto(false)
    setIndex((i + STYLE_COUNT) % STYLE_COUNT)
    setRun(r => r + 1)
    setFrontispiece(false)
    if (jump) {
      hero.current?.scrollIntoView()
      hero.current?.focus({ preventScroll: true })
    }
  }

  useEffect(() => {
    let cancelled = false
    samplePlot(job).then(next => {
      if (!cancelled) setSample({ job, cells: next })
    }).catch(() => {
      if (!cancelled) setSample({ job, cells: [] })
    })
    return () => { cancelled = true }
  }, [job])

  return (
    <main className="pf-plotter" id="pt-top">
      <section ref={hero} tabIndex={-1} className="pt-hero" aria-label="Palletface plotter">
        <header className="pt-nav">
          <a className="pt-brand" href="#pt-top">palletface<span>.</span></a>
          <span className="pt-nav-release">SVG avatar library <b>/</b> v{VERSION}</span>
          <a href="#pt-sheet">01 / Styles</a>
          <a href="#pt-start">02 / Quick start</a>
          <a className="pt-nav-source" href={LINKS.github} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
        </header>
        <div className="pt-workbench">
          <div className="pt-datum" aria-hidden="true" />
          <span className="pt-ghost" aria-hidden="true">{seed || 'seed'}</span>
          <div className="pt-title">
            <p className="pt-title-id"><span>/{digits(index + 1)}</span><span>Style in view</span></p>
            <Pixelate as="h1" block={frontispiece ? 1 : block}><span>{words[0]}</span>{' '}<span>{words[1]}<b>.</b></span></Pixelate>
            <p className="pt-style-note">{plates[index]![1]}</p>
            <label className="pt-seed">
              <span>Input / seed</span>
              <span className="pt-seed-line"><b aria-hidden="true">&gt;</b><input value={seed} placeholder="type any string" autoComplete="off" spellCheck={false} onChange={event => { setFrontispiece(false); setAuto(false); setSeed(event.target.value) }} /><span aria-hidden="true">↵</span></span>
            </label>
          </div>
          <Plot key={JSON.stringify([seed, index, run])} index={index} job={job} cells={cells} auto={auto} frontispiece={frontispiece} onFinish={advance} progress={currentTick} />
        </div>
        <div className="pt-console">
          <div className="pt-proposition"><span>Input → image</span><p>{TAGLINE} <span className="pt-proposition-repeat">Same seed, same face.</span></p></div>
          <div className="pt-transport" role="group" aria-label="Style playback">
            <button type="button" aria-label="Previous style" onClick={() => select(index - 1)}>←</button>
            <button type="button" aria-label={auto && !reduced ? 'Pause auto advance' : 'Start auto advance'} disabled={reduced} className="pt-play" onClick={() => setAuto(!auto)}>
              <span aria-hidden="true" className={auto && !reduced ? 'pt-icon-pause' : 'pt-icon-play'} />
            </button>
            <button type="button" aria-label="Next style" onClick={() => select(index + 1)}>→</button>
          </div>
          <div className="pt-track" role="group" aria-label="Choose a style">
            {jobs.map((entry, i) => (
              <button key={entry.style} ref={i === index ? currentTick : null} type="button" aria-label={`Plot ${entry.style.replace('-', ' ')}`}
                aria-current={i === index ? 'true' : undefined} onClick={() => select(i)}>
                <span aria-hidden="true">{digits(i + 1)}</span><i />
              </button>
            ))}
          </div>
        </div>
        <div className="pt-edge">
          <span>Vector output / SVG</span><span>MIT / Zero deps</span>
          <a href={LINKS.palletism} target="_blank" rel="noreferrer">A Palletism project ↗</a>
        </div>
      </section>

      <section id="pt-sheet" className="pt-section pt-sheet" aria-labelledby="pt-sheet-title">
        <div className="pt-section-line"><span><b>01</b> / Style index</span><span>{STYLE_COUNT} plates / 1 seed</span></div>
        <div className="pt-section-intro">
          <h2 id="pt-sheet-title">Contact sheet<b>.</b></h2>
          <p>One seed, {STYLE_COUNT} ways to draw it. Hold over a plate to watch it plot, or select it to put it on the bench.</p>
        </div>
        <div className="pt-plates">
          {jobs.map((entry, i) => <Plate key={entry.style} index={i} job={entry} selected={i === index} choose={() => select(i, true)} />)}
        </div>
      </section>

      <section id="pt-start" className="pt-section pt-start" aria-labelledby="pt-start-title">
        <div className="pt-section-line"><span><b>02</b> / Quick start</span><a href={LINKS.docs} target="_blank" rel="noreferrer">Read the docs ↗</a></div>
        <div className="pt-section-intro">
          <h2 id="pt-start-title">From string to SVG<b>.</b></h2>
          <p>{LEDE}</p>
        </div>
        <div className="pt-workorder">
          <div className="pt-instructions">
            <div className="pt-install"><span aria-hidden="true">$</span><code>{INSTALL}</code><CopyButton value={INSTALL} /></div>
            <div className="pt-file">example.ts <span>01 / render</span></div>
            <pre><code>{QUICK_START}</code></pre>
          </div>
          <div className="pt-report">
            <div className="pt-file"><span><i /> Live plot log</span><span>Job / {digits(index + 1)}</span></div>
            <div className="pt-log">
              <p><b>&gt;</b> plot {job.style}</p>
              <p className="pt-log-seed">seed={JSON.stringify(seed)}</p>
              <p>{job.grid}×{job.grid} {job.native !== job.grid ? 'samples' : 'cells'} / {cells ? cells.length : '—'} inked</p>
              <p><b>↳</b> {job.ms === 0 ? 'under timer resolution' : `${job.ms.toFixed(2)} ms`} · SVG generation</p>
            </div>
            <dl className="pt-specs">
              {FACTS.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </div>
        </div>
      </section>

      <footer className="pt-footer">
        <a className="pt-brand" href="#pt-top">palletface<span>.</span></a>
        <span>v{VERSION} / MIT</span>
        <nav aria-label="Project links">
          <a href={LINKS.github} target="_blank" rel="noreferrer">GitHub ↗</a>
          <a href={LINKS.npm} target="_blank" rel="noreferrer">npm ↗</a>
          <a href={LINKS.docs} target="_blank" rel="noreferrer">Docs ↗</a>
          <a href={LINKS.palletism} target="_blank" rel="noreferrer">Palletism ↗</a>
        </nav>
      </footer>
    </main>
  )
}
