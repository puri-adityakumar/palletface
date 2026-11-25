import { useDeferredValue, useState } from 'react'
import { palletface, STYLES, type StyleSlug } from 'palletface'
import { Code } from '../components/Code'
import { SeedInput } from '../components/SeedInput'
import { SubHead } from '../components/SubHead'
import { Footer } from '../sections/Footer'
import { callFor, Face, LETTER_STYLES, quote, svgUrl } from '../lib/faces'
import { useCopy } from '../lib/hooks'
import { AVATAR_IMPORT, STYLE_COUNT } from '../lib/content'
import { usePageMeta } from '../lib/router'
import './page.css'

const PRESETS = [32, 64, 80, 128, 256] as const
const LADDER = [16, 24, 32, 48, 64, 96, 128] as const
const STAGE_MAX = 320
const TEAM = ['kai', 'yuki', 'marcus', 'noor', 'rhea'] as const
const COMMENTS = [
  ['kai', 'Pushed the new sign-up flow.'],
  ['yuki', 'Looks good. Merging it now.'],
  ['marcus', 'Thanks, both.'],
] as const

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const bytes = (s: string) => new TextEncoder().encode(s).length
const titleOf = (slug: StyleSlug) => STYLES.find((s) => s.slug === slug)?.title ?? slug
const fileName = (seed: string, style: StyleSlug) => {
  const base = seed
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)
  return `${base || 'avatar'}-${style}.svg`
}

function codeFor(seed: string, style: StyleSlug, px: number, name?: string) {
  const options = [`style: ${quote(style)}`, ...(name === undefined ? [] : [`name: ${quote(name)}`]), `px: ${px}`]
  return `${AVATAR_IMPORT}

const svg = palletface(${quote(seed)}, {
${options.map((o) => `  ${o},`).join('\n')}
})`
}

function copyLabel(state: 'idle' | 'ok' | 'fail', idle: string) {
  return state === 'ok' ? 'Copied ✓' : state === 'fail' ? 'Copy failed' : idle
}

type BuilderProps = {
  seed: string
  setSeed: (seed: string) => void
  thumbSeed: string
  style: StyleSlug
  setStyle: (style: StyleSlug) => void
  name: string
  setName: (name: string) => void
  size: string
  setSize: (size: string) => void
}

function Builder({ seed, setSeed, thumbSeed, style, setStyle, name, setName, size, setSize }: BuilderProps) {
  const px = Number(size)
  const valid = size.trim() !== '' && Number.isFinite(px) && px > 0
  const named = LETTER_STYLES.has(style)
  const nameOption = named && name !== '' ? name : undefined
  const svg = valid ? palletface(seed, { style, px, name: nameOption }) : ''
  const code = valid ? codeFor(seed, style, px, nameOption) : ''
  const [codeState, copyCode] = useCopy(code)
  const [svgState, copySvg] = useCopy(svg)
  const shown = Math.min(px, STAGE_MAX)

  return (
    <section className="pg" id="builder" aria-label="Builder">
      <div className="pg__stage">
        <div className="pg__preview">
          {valid ? (
            <img src={svgUrl(svg)} width={shown} height={shown} alt={`${titleOf(style)} avatar for “${seed}”`} />
          ) : (
            <p id="pg-size-error" className="pg__error" role="status">
              Enter a size greater than zero.
            </p>
          )}
        </div>
        <p className="pg__meta">
          {valid ? (
            <>
              <span>
                {px} × {px} px{px > STAGE_MAX ? `, shown at ${STAGE_MAX}` : ''}
              </span>
              <span>{bytes(svg).toLocaleString('en-US')} bytes</span>
            </>
          ) : (
            <span>No avatar</span>
          )}
        </p>
        <div className="pg__actions">
          <button type="button" className="btn btn--blue" onClick={copyCode} disabled={!valid}>
            <span aria-live="polite">{copyLabel(codeState, 'Copy code')}</span>
          </button>
          <button type="button" className="btn" onClick={copySvg} disabled={!valid}>
            <span aria-live="polite">{copyLabel(svgState, 'Copy SVG')}</span>
          </button>
          {valid && (
            <a className="btn" href={svgUrl(svg)} download={fileName(seed, style)}>
              Download SVG
            </a>
          )}
        </div>
      </div>

      <div className="pg__controls">
        <SeedInput id="pg-seed" seed={seed} setSeed={setSeed} />

        <fieldset className="pg__styles">
          <legend>Style</legend>
          <div className="pg__grid">
            {STYLES.map((s) => (
              <label key={s.slug} className={s.slug === style ? 'pg__style is-on' : 'pg__style'} title={s.title}>
                <input
                  type="radio"
                  name="pg-style"
                  className="sr-only"
                  value={s.slug}
                  checked={s.slug === style}
                  onChange={() => setStyle(s.slug)}
                />
                <Face seed={thumbSeed} style={s.slug} px={56} name={name === '' ? undefined : name} />
                <span className="sr-only">{s.title}</span>
              </label>
            ))}
          </div>
          <p className="pg__picked">
            <strong>{titleOf(style)}</strong>
            <code>'{style}'</code>
            {named && <span>Uses name</span>}
          </p>
        </fieldset>

        <div className="pg__fields">
          <div className={named ? 'seed-input' : 'seed-input is-off'}>
            <label htmlFor="pg-name">Name</label>
            <input
              id="pg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!named}
              placeholder={named ? 'Uses the seed' : 'Letter styles only'}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
            />
          </div>
          <div className="seed-input pg__size">
            <label htmlFor="pg-size">Size</label>
            <input
              id="pg-size"
              type="number"
              inputMode="decimal"
              min={1}
              step="any"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              aria-invalid={!valid}
              aria-describedby={valid ? undefined : 'pg-size-error'}
            />
            <span aria-hidden="true">px</span>
          </div>
          <div className="pg__presets" role="group" aria-label="Size presets">
            {PRESETS.map((p) => (
              <button key={p} type="button" aria-pressed={valid && px === p} onClick={() => setSize(String(p))}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pg__code">{valid && <Code code={code} />}</div>
    </section>
  )
}

function GalleryCard({ seed, slug, title, name, on, pick }: { seed: string; slug: StyleSlug; title: string; name?: string; on: boolean; pick: () => void }) {
  const named = LETTER_STYLES.has(slug)
  const call = callFor(seed, slug, 200, named ? name : undefined)
  const [state, copy] = useCopy(`${AVATAR_IMPORT}\n\nconst svg = ${call}`)
  return (
    <li className={on ? 'gal is-on' : 'gal'}>
      <button type="button" className="gal__open" onClick={pick} title="Open in the builder">
        <Face seed={seed} style={slug} px={200} name={name} alt="" className="gal__art" />
        <span className="sr-only">Open {title} in the builder</span>
      </button>
      <h3 className="gal__name">{title}</h3>
      <p className="gal__meta">
        <code>'{slug}'</code>
        {named && <span>uses name</span>}
      </p>
      <button type="button" className="gal__call" onClick={copy} title="Copy the call">
        <code>{call}</code>
        <span className="gal__copy" aria-live="polite">
          {copyLabel(state, 'Copy call')}
        </span>
      </button>
    </li>
  )
}

function Sizes({ seed, style, name }: { seed: string; style: StyleSlug; name?: string }) {
  const title = titleOf(style)
  return (
    <section className="pg-sec" aria-labelledby="pg-sizes">
      <div className="pg-sec__head">
        <h2 id="pg-sizes">Sizes</h2>
        <p className="note">
          {title} at common sizes, then in the places avatars usually go. Change the style or seed above and these follow.
        </p>
      </div>
      <ul className="ladder">
        {LADDER.map((px) => (
          <li key={px}>
            <Face seed={seed} style={style} px={px} name={name} alt={`${title} at ${px} pixels`} />
            <code>{px}</code>
          </li>
        ))}
      </ul>
      <div className="uses">
        <figure className="use">
          <ul className="use__comments">
            {COMMENTS.map(([who, said]) => (
              <li key={who}>
                <Face seed={who} style={style} px={32} alt="" />
                <p>
                  <strong>{capital(who)}</strong>
                  {said}
                </p>
              </li>
            ))}
          </ul>
          <figcaption>Comments · 32 px</figcaption>
        </figure>
        <figure className="use">
          <div className="use__team">
            <ul aria-label="Team members">
              {TEAM.map((who) => (
                <li key={who}>
                  <Face seed={who} style={style} px={40} alt={capital(who)} />
                </li>
              ))}
              <li className="use__more">
                +7<span className="sr-only"> more</span>
              </li>
            </ul>
            <p>12 people on this project</p>
          </div>
          <figcaption>Team · 40 px</figcaption>
        </figure>
        <figure className="use">
          <div className="use__profile">
            <Face seed={seed} style={style} px={96} name={name} alt="" />
            <p>
              <strong>{capital(name ?? seed) || 'Anonymous'}</strong>
              <span>@{seed || 'anonymous'}</span>
            </p>
          </div>
          <figcaption>Profile · 96 px</figcaption>
        </figure>
      </div>
    </section>
  )
}

/** Build one avatar, then see every style and a range of sizes for the same seed. */
export function PlaygroundPage() {
  usePageMeta('Playground · palletface')
  const [seed, setSeed] = useState('ada')
  const [style, setStyle] = useState<StyleSlug>('pixel-sprite')
  const [name, setName] = useState('')
  const [size, setSize] = useState('80')
  const later = useDeferredValue(seed)
  const laterName = useDeferredValue(name)
  const shownName = laterName === '' ? undefined : laterName
  const named = LETTER_STYLES.has(style)

  const pick = (slug: StyleSlug) => {
    setStyle(slug)
    document.getElementById('builder')?.scrollIntoView({ block: 'start' })
  }

  return (
    <div>
      <SubHead />
      <main className="wrap page">
        <div className="page__head">
          <h1 className="h2">Playground.</h1>
          <p className="note">Pick a seed, a style, and a size. Then copy the code or download the SVG.</p>
        </div>

        <Builder
          seed={seed}
          setSeed={setSeed}
          thumbSeed={later}
          style={style}
          setStyle={setStyle}
          name={name}
          setName={setName}
          size={size}
          setSize={setSize}
        />

        <section className="pg-sec" aria-labelledby="pg-styles">
          <div className="pg-sec__head">
            <h2 id="pg-styles">Every style</h2>
            <p className="note">
              All {STYLE_COUNT} styles for “{later}”. Click an avatar to open it in the builder, or click a call to copy it.
            </p>
          </div>
          <ul className="gallery">
            {STYLES.map((s) => (
              <GalleryCard
                key={s.slug}
                seed={later}
                slug={s.slug}
                title={s.title}
                name={shownName}
                on={s.slug === style}
                pick={() => pick(s.slug)}
              />
            ))}
          </ul>
        </section>

        <Sizes seed={later} style={style} name={named ? shownName : undefined} />
      </main>
      <Footer seed={later} />
    </div>
  )
}
