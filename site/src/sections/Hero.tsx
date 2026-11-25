import { useEffect, useMemo, useRef, useState } from 'react'
import { STYLES, type StyleSlug } from 'palletface'
import { Brand } from '../components/Brand'
import { CopyButton } from '../components/CopyButton'
import { GitHubLink } from '../components/GitHubLink'
import { SeedField, type Dig } from '../field/SeedField'
import { INSTALL, LINKS, SAMPLE_SEEDS, STYLE_COUNT } from '../lib/content'
import { Face, LETTER_STYLES } from '../lib/faces'
import { useReducedMotion } from '../lib/hooks'
import { Pixelate, usePixelSteps } from '../lib/pixelate'
import './hero.css'

const pad = (n: number) => String(n).padStart(2, '0')
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The big avatar inside the ink. It steps through every style on its own; hover holds it, click moves on. */
function StyleCard({ seed }: { seed: string }) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(1)
  const [hold, setHold] = useState(false)
  const item = STYLES[index]!
  const block = usePixelSteps(`${seed}:${item.slug}`, { from: 36, duration: 560, steps: 6 })

  useEffect(() => {
    if (reduced || hold) return
    const t = window.setInterval(() => setIndex((i) => (i + 1) % STYLES.length), 2800)
    return () => window.clearInterval(t)
  }, [reduced, hold])

  return (
    <button
      type="button"
      className="card"
      data-nodig
      onClick={() => setIndex((i) => (i + 1) % STYLES.length)}
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
    >
      <span className="card__top">
        <span>
          {pad(index + 1)}/{pad(STYLE_COUNT)}
        </span>
        <span aria-live="polite">{item.title}</span>
      </span>
      <Pixelate block={block} className="card__art">
        <Face seed={seed} style={item.slug} px={232} name={capital(seed)} alt={`${item.title} avatar for “${seed}”`} />
      </Pixelate>
      <code className="card__call">
        palletface('{seed}', {'{'} style: '{item.slug}'{LETTER_STYLES.has(item.slug) ? `, name: '${capital(seed)}'` : ''} {'}'})
      </code>
      <span className="card__next" aria-hidden="true">
        next style →
      </span>
      <span className="sr-only">Next style</span>
    </button>
  )
}

type Dug = { id: number; x: number; y: number; seed: string; style: StyleSlug; size: number }

function DugFace({ dug }: { dug: Dug }) {
  const block = usePixelSteps(dug.id, { from: Math.round(dug.size / 3), duration: 420, steps: 4 })
  return (
    <Pixelate block={block} className="dug" style={{ left: dug.x - dug.size / 2, top: dug.y - dug.size / 2, width: dug.size, height: dug.size }}>
      <Face seed={dug.seed} style={dug.style} px={dug.size} name={capital(dug.seed)} />
    </Pixelate>
  )
}

export function Hero({ seed }: { seed: string }) {
  const brandRef = useRef<HTMLDivElement>(null)
  const linksRef = useRef<HTMLUListElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [dug, setDug] = useState<Dug[]>([])
  const digs = useRef(0)

  useEffect(() => setDug([]), [seed])

  const onDig = (d: Dig) => {
    const n = digs.current++
    const s = SAMPLE_SEEDS[(n * 5 + 3) % SAMPLE_SEEDS.length]!
    const style = STYLES[(n * 7 + 3) % STYLES.length]!.slug
    const size = window.innerWidth < 640 ? 56 : 76
    setDug((list) => [...list.slice(-7), { id: n + 1, x: d.x, y: d.y, seed: s, style, size }])
  }

  const clear = useMemo(() => [brandRef, linksRef, copyRef], [])
  const solid = useMemo(() => [cardRef], [])

  return (
    <header className="hero" aria-label="palletface">
      <SeedField seed={seed} shape="hero" clear={clear} solid={solid} onDig={onDig} />
      {dug.map((d) => (
        <DugFace key={d.id} dug={d} />
      ))}

      <nav className="nav" aria-label="Main">
        <Brand ref={brandRef} />
        <ul ref={linksRef} data-nodig>
          <li>
            <a href={LINKS.docs}>Docs</a>
          </li>
          <li>
            <GitHubLink />
          </li>
        </ul>
      </nav>

      <div className="hero__grid">
        <div ref={copyRef} className="hero__copy" data-nodig>
          <h1>
            Generate <span>unique-looking</span> avatars from seeds.
          </h1>
          <p className="hero__lede">
            Turn any string, like a user ID, into a <strong>deterministic SVG</strong> in <strong>Node or the browser</strong>. No network requests,{' '}
            <strong>zero dependencies</strong>.
          </p>
          <div className="hero__actions">
            <CopyButton value={INSTALL} variant="install" />
            <a className="btn" href={LINKS.docs}>Read the docs</a>
          </div>
        </div>

        <div className="hero__stage">
          <div ref={cardRef} className="hero__card">
            <StyleCard seed={seed} />
          </div>
        </div>
      </div>
    </header>
  )
}
