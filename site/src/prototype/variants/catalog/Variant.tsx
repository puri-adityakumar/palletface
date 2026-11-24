/** Prototype E: a seed-driven specimen book. */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { FACTS, INSTALL, LEDE, LINKS, PROVENANCE, QUICK_START, STYLE_COUNT, VERSION } from '../../lib/content'
import { Face, LETTER_STYLES, STYLES, face, svgUrl, type StyleSlug } from '../../lib/faces'
import { useCopy, useInView } from '../../lib/hooks'
import { Pixelate, usePixelSteps } from '../../lib/pixelate'
import { readStudio, type Studio } from './studio'
import './catalog.css'

const FAMILIES = [
  {
    title: 'Creatures', note: 'Expressions, sprites & signals',
    styles: ['pixel-sprite', 'pixel-emotes', 'mirrored-signal'],
  },
  {
    title: 'Letters', note: 'Three ways to leave an initial',
    styles: ['pixel-letter', 'pixelify-letter', 'pixel-stamp'],
  },
  {
    title: 'Scenes', note: 'Places, plants & pocket objects',
    styles: ['pixel-landscape', 'pixel-flora', 'pixel-relic'],
  },
  {
    title: 'Fields', note: 'Color, geometry & contours',
    styles: ['dither-orb', 'geometric-tile', 'random-contours'],
  },
] as const satisfies ReadonlyArray<{ title: string; note: string; styles: readonly StyleSlug[] }>

const SIZES = [
  [16, 'Nav'], [24, 'Comment'], [32, 'List'], [48, 'Card'], [80, 'Profile'], [160, 'Hero'],
] as const

const numbered = (value: number) => String(value).padStart(2, '0')
const derivesSeed = (name: string, take: number) => take === 1 ? name : JSON.stringify([name, take])

function Mark() {
  return (
    <svg className="pf-catalog-mark" width="19" height="19" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M6 0h1v3H6zM2 2h1v1H2zM10 2h1v1h-1zM4 4h5v1H4zM3 5h2v3H3zM8 5h2v3H8zM6 6h1v1H6zM4 8h5v1H4zM6 10h1v3H6zM2 10h1v1H2zM10 10h1v1h-1zM0 6h2v1H0zM11 6h2v1h-2z" />
    </svg>
  )
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {diagonal
        ? <path d="M5 5l10 10m0-8v8H7" stroke="currentColor" strokeWidth="1.2" />
        : <path d="M2 10h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, copy] = useCopy(text, 1800)
  return (
    <span className="pf-catalog-copy-wrap">
      <button className="pf-catalog-copy pf-catalog-label" type="button" aria-label={`Copy ${label}`} onClick={copy}>
        {state === 'ok' ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m3 8 3 3 7-7" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 6h7.5v7.5H6zM3.5 10.5h-1v-8h8v1" stroke="currentColor" />
          </svg>
        )}
        {state === 'ok' ? 'Copied' : state === 'fail' ? 'Retry' : 'Copy'}
      </button>
      <span className="sr-only" role="status">
        {state === 'ok' ? `Copied ${label}` : state === 'fail' ? `Could not copy ${label}. Select the text to copy it manually.` : ''}
      </span>
    </span>
  )
}

function Install() {
  return (
    <div className="pf-catalog-install">
      <code><span aria-hidden="true">$ </span>{INSTALL}</code>
      <CopyButton text={INSTALL} label="install command" />
    </div>
  )
}

function Tile({ slug, seed, name, block, number }: {
  slug: StyleSlug; seed: string; name: string; block: number; number: number
}) {
  const { src, size } = useMemo(() => {
    const svg = face(seed, slug, 192, LETTER_STYLES.has(slug) ? name : undefined)
    return { src: svgUrl(svg), size: svg.match(/viewBox="0 0 (\d+) (\d+)"/)?.slice(1).join(' × ') }
  }, [slug, seed, name])
  const [studio, setStudio] = useState<Studio>()
  useEffect(() => {
    let current = true
    readStudio(src).then((next) => {
      if (current && next) setStudio(next)
    })
    return () => { current = false }
  }, [src])

  const title = STYLES.find((style) => style.slug === slug)?.title ?? slug
  const isVector = slug === 'geometric-tile' || slug === 'random-contours'
  const stageStyle = studio && {
    '--studio-wall': studio.wall,
    '--studio-floor': studio.floor,
    '--studio-shade': studio.shade,
  } as CSSProperties | undefined

  return (
    <li className="pf-catalog-tile">
      <figure>
        <div className="pf-catalog-stage" style={stageStyle}>
          <span className="pf-catalog-register" aria-hidden="true" />
          <div className="pf-catalog-object">
            <Pixelate block={block}>
              <img src={src} width="192" height="192" alt="" draggable={false} />
            </Pixelate>
          </div>
          {studio && (
            <span className="pf-catalog-swatches" aria-hidden="true">
              {studio.swatches.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
            </span>
          )}
        </div>
        <figcaption>
          <span className="pf-catalog-tile-title">{title}</span>
          <span className="pf-catalog-tile-number pf-catalog-label" aria-hidden="true">{numbered(number)}</span>
          <span className="pf-catalog-tile-meta pf-catalog-label">
            <span>{isVector ? 'Vector' : size}</span>
            <span aria-hidden="true"> · </span>
            <span>{LETTER_STYLES.has(slug) ? 'Uses name' : 'Seeded'}</span>
          </span>
        </figcaption>
      </figure>
    </li>
  )
}

function Family({ family, index, name, take, onNext }: {
  family: (typeof FAMILIES)[number]; index: number; name: string; take: number; onNext: () => void
}) {
  const seed = derivesSeed(name, take)
  const [ref, visible] = useInView<HTMLOListElement>({ once: false, rootMargin: '0px' })
  const block = usePixelSteps(visible ? JSON.stringify([name, take]) : null, { from: 23, duration: 900, steps: 8 })
  return (
    <section className="pf-catalog-family" aria-labelledby={`catalog-family-${index}`}>
      <header className="pf-catalog-family-heading">
        <span className="pf-catalog-family-number pf-catalog-label" aria-hidden="true">{numbered(index + 1)} /</span>
        <h3 id={`catalog-family-${index}`}>{family.title}</h3>
        <p>{family.note}</p>
      </header>
      <ol className="pf-catalog-tiles" ref={ref} start={index * 3 + 1}>
        {family.styles.map((slug, tileIndex) => (
          <Tile key={slug} slug={slug} seed={seed} name={name} block={visible ? block : 1} number={index * 3 + tileIndex + 1} />
        ))}
      </ol>
      <div className="pf-catalog-take">
        <button type="button" onClick={onNext} aria-label={`Next ${family.title.toLowerCase()} seed`} title="Next seed">
          <Arrow />
        </button>
        <span className="pf-catalog-label" aria-live="polite">Take {numbered(take)}</span>
      </div>
    </section>
  )
}

function SizeSpecimen({ name, seed }: { name: string; seed: string }) {
  const [ref, visible] = useInView<HTMLOListElement>({ once: false, rootMargin: '0px' })
  const block = usePixelSteps(visible ? JSON.stringify([seed, name]) : null, { from: 20, duration: 900, steps: 8 })
  return (
    <section className="pf-catalog-measure" aria-labelledby="catalog-scale">
      <div className="pf-catalog-divider pf-catalog-label"><span>02 / Scale</span><span>True to size</span></div>
      <div className="pf-catalog-measure-head">
        <h2 id="catalog-scale">One face, six sizes.</h2>
        <p>The Pixel Sprite above, rendered at actual size. Only the <code>px</code> value changes.</p>
      </div>
      <ol className="pf-catalog-sizes" ref={ref}>
        {SIZES.map(([px, use]) => (
          <li key={px}>
            <div className="pf-catalog-size-face">
              <Pixelate block={visible ? Math.min(block, Math.max(3, Math.round(px / 5))) : 1}>
                <Face seed={seed} style="pixel-sprite" px={px} />
              </Pixelate>
            </div>
            <div className="pf-catalog-size-key">
              <span className="pf-catalog-label">{px} PX</span>
              <span>{use}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function BuildIndex({ name, seed }: { name: string; seed: string }) {
  const example = QUICK_START.replace(/'user-123'|'Aditya'/g, (token) => JSON.stringify(token === "'user-123'" ? seed : name))

  return (
    <section className="pf-catalog-build" id="catalog-build" aria-labelledby="catalog-start">
      <div className="pf-catalog-divider pf-catalog-label"><span>03 / The library</span><span>Reference</span></div>
      <div className="pf-catalog-reference">
        <div className="pf-catalog-example">
          <h2 id="catalog-start">Draw your first face.</h2>
          <p>A quick start, using your Pixel Letter specimen.</p>
          <figure className="pf-catalog-code">
            <figcaption>
              <span>From seed to SVG</span>
              <CopyButton text={example} label="quick-start code" />
            </figcaption>
            <pre><code>{example}</code></pre>
          </figure>
        </div>
        <div className="pf-catalog-facts">
          <h2>Technical index</h2>
          <dl>
            {FACTS.map(({ label, value }) => (
              <div key={label}>
                <dt className="pf-catalog-label">{label}</dt>
                <dd>{value === 'mit' ? 'MIT' : value === 'svg string' ? 'SVG string' : value === 'node + browser' ? 'Node + browser' : value === 'esm + ts' ? 'ESM + TS types' : value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

export default function Variant() {
  const [name, setName] = useState('Ada')
  const [takes, setTakes] = useState([1, 1, 1, 1])
  return (
    <div className="pf-catalog">
      <header className="pf-catalog-masthead">
        <a href="#catalog-cover" className="pf-catalog-wordmark">palletface<span>.</span></a>
        <span className="pf-catalog-label">Specimen book <span className="pf-catalog-edition-dot">·</span> v{VERSION}</span>
      </header>

      <div className="pf-catalog-frame" id="catalog-cover">
        <div className="pf-catalog-framebar">
          <span className="pf-catalog-label pf-catalog-frame-edition"><Mark /> A field guide to pixel avatars</span>
          <nav aria-label="On this page" className="pf-catalog-label">
            <a href="#catalog-index">Styles</a>
            <a href="#catalog-build">Quick start <Arrow diagonal /></a>
          </nav>
        </div>

        <main className="pf-catalog-inner">
          <section className="pf-catalog-hero" aria-labelledby="catalog-heading">
            <div className="pf-catalog-intro">
              <div className="pf-catalog-label pf-catalog-eyebrow">Deterministic pixel & dither avatars</div>
              <h1 id="catalog-heading" aria-label={`Welcome to palletface, ${name}.`}>
                <span>Welcome to</span>
                <span>palletface, <label className="pf-catalog-name">
                  <span className="pf-catalog-sizer" aria-hidden="true">{name || '\u00a0\u00a0'}</span>
                  <input id="catalog-seed" aria-label="Name to use as a seed" aria-describedby="catalog-edit" type="text" value={name} onChange={(event) => {
                    setName(event.target.value)
                    setTakes([1, 1, 1, 1])
                  }} autoComplete="off" spellCheck={false} />
                </label><span className="pf-catalog-period">.</span></span>
              </h1>
              <label id="catalog-edit" htmlFor="catalog-seed" className="pf-catalog-label pf-catalog-edit">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M10 10H2V2m0 0v4m0-4h4" stroke="currentColor" />
                </svg>
                Edit the name to redraw the book
              </label>
              <p className="pf-catalog-lede">{LEDE}</p>
            </div>
            <aside className="pf-catalog-aside">
              <div className="pf-catalog-label"><span aria-hidden="true" /> A note on seeds</div>
              <p>Same seed,<br /> <em>same face.</em></p>
              <Install />
            </aside>
          </section>

          <section className="pf-catalog-index" id="catalog-index" aria-label="Style index">
            <div className="pf-catalog-divider pf-catalog-label">
              <span>01 / Style index</span><span>{STYLE_COUNT} specimens · 4 families</span>
            </div>
            {FAMILIES.map((family, index) => (
              <Family key={family.title} family={family} index={index} name={name} take={takes[index] ?? 1} onNext={() => {
                setTakes((old) => old.map((take, i) => i === index ? take + 1 : take))
              }} />
            ))}
          </section>

          <SizeSpecimen name={name} seed={derivesSeed(name, takes[0] ?? 1)} />
          <BuildIndex name={name} seed={derivesSeed(name, takes[1] ?? 1)} />
        </main>

        <footer className="pf-catalog-footer">
          <p>{PROVENANCE}</p>
          <nav aria-label="Project links" className="pf-catalog-label">
            <a href={LINKS.github} target="_blank" rel="noreferrer">GitHub</a>
            <a href={LINKS.npm} target="_blank" rel="noreferrer">npm</a>
            <a href={LINKS.docs} target="_blank" rel="noreferrer">Docs</a>
            <a href={LINKS.palletism} target="_blank" rel="noreferrer">Palletism</a>
          </nav>
        </footer>
      </div>

      <div className="pf-catalog-colophon pf-catalog-label" aria-hidden="true">
        <span>End of folio</span><span>PF / {numbered(STYLE_COUNT)}</span>
      </div>
    </div>
  )
}
