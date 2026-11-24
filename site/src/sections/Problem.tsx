import { useEffect, useId, useRef, useState, type ComponentType } from 'react'
import { STYLES, type StyleSlug } from 'palletface'
import { Marquee } from '../components/Marquee'
import { STYLE_COUNT } from '../lib/content'
import { bayer } from '../lib/dither'
import { face, svgUrl } from '../lib/faces'
import { useInView, useReducedMotion } from '../lib/hooks'
import './problem.css'

function Ghost() {
  return (
    <g>
      <circle cx="50" cy="50" r="50" fill="#d3d3ce" />
      <circle cx="50" cy="40" r="17" fill="#b0b0aa" />
      <path d="M18 88c4-18 17-28 32-28s28 10 32 28a50 50 0 0 1-64 0z" fill="#b0b0aa" />
    </g>
  )
}

function Egg() {
  return (
    <g>
      <circle cx="50" cy="50" r="50" fill="#c9d0d3" />
      <ellipse cx="50" cy="55" rx="20" ry="26" fill="#eceeee" />
    </g>
  )
}

function Initials() {
  return (
    <g>
      <circle cx="50" cy="50" r="50" fill="#bdbab3" />
      <text x="50" y="62" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="32" fontWeight="600" fill="#fff">
        AK
      </text>
    </g>
  )
}

function Broken() {
  return (
    <g>
      <rect x="1" y="1" width="98" height="98" rx="14" fill="#deded9" stroke="#c4c4be" strokeWidth="2" />
      <path d="M26 30h48v40H26z" fill="none" stroke="#a4a49e" strokeWidth="4" strokeLinejoin="round" />
      <path d="M30 64l12-14 9 10 6-6 13 10" fill="none" stroke="#a4a49e" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="61" cy="40" r="4" fill="#a4a49e" />
      <path d="M48 26l6 10-6 8 6 10-4 8 6 12" fill="none" stroke="#deded9" strokeWidth="5" />
    </g>
  )
}

function Nothing() {
  return (
    <g>
      <circle cx="50" cy="50" r="47" fill="none" stroke="#b5b5af" strokeWidth="3" strokeDasharray="7 6" />
      <text x="50" y="63" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="36" fill="#b5b5af">
        ?
      </text>
    </g>
  )
}

function Blank() {
  return (
    <g>
      <rect width="100" height="100" fill="#cacac4" />
      <circle cx="50" cy="38" r="15" fill="#e2e2dd" />
      <path d="M22 100c0-22 13-36 28-36s28 14 28 36z" fill="#e2e2dd" />
    </g>
  )
}

type Tile = { Art: ComponentType; before: string; seed: string; style: StyleSlug; name?: string }

const TILES: Tile[] = [
  { Art: Ghost, before: 'default.png', seed: 'ada', style: 'pixel-sprite' },
  { Art: Egg, before: 'the egg', seed: 'kai', style: 'dither-orb' },
  { Art: Initials, before: 'initials', seed: 'aditya', style: 'pixel-letter', name: 'Aditya' },
  { Art: Broken, before: 'image failed', seed: 'yuki', style: 'pixel-landscape' },
  { Art: Nothing, before: 'no photo', seed: 'noor', style: 'geometric-tile' },
  { Art: Blank, before: 'grey square', seed: 'zeke', style: 'pixel-flora' },
]

const GRID = 10
const CELLS = Array.from({ length: GRID * GRID }, (_, i) => {
  const x = i % GRID
  const y = Math.floor(i / GRID)
  return { x: x * 10, y: y * 10, at: bayer(x, y) * 0.6 + ((x + 0.5) / GRID) * 0.4 }
})
const titleOf = (slug: StyleSlug) => STYLES.find((s) => s.slug === slug)!.title

/** One placeholder that a dithered sweep of cells turns into a palletface avatar. `p` runs 0 to 1. */
function Swap({ tile, p }: { tile: Tile; p: number }) {
  const id = 'sw' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [url] = useState(() => svgUrl(face(tile.seed, tile.style, 120, tile.name)))
  const after = p >= 0.5
  const { Art } = tile
  return (
    <li className={after ? 'swap is-after' : 'swap'}>
      <svg className="swap__art" viewBox="0 0 100 100" role="img" aria-label={after ? `${titleOf(tile.style)} avatar for “${tile.seed}”` : `Placeholder: ${tile.before}`}>
        {p < 1 && <Art />}
        <clipPath id={id}>
          {CELLS.filter((c) => c.at < p).map((c, i) => (
            <rect key={i} x={c.x} y={c.y} width="10.2" height="10.2" />
          ))}
        </clipPath>
        <image href={url} width="100" height="100" clipPath={`url(#${id})`} style={{ imageRendering: 'pixelated' }} />
      </svg>
      <span className="swap__label">
        <span className="swap__before">{tile.before}</span>
        <span className="swap__after">
          “{tile.seed}” · {titleOf(tile.style)}
        </span>
      </span>
    </li>
  )
}

const DURATION = 1700

export function Problem() {
  const reduced = useReducedMotion()
  const [rowRef, inView] = useInView<HTMLUListElement>({ threshold: 0.5, rootMargin: '0px' })
  const [target, setTarget] = useState<0 | 1>(0)
  const [progress, setProgress] = useState(0)
  const touched = useRef(false)
  const raf = useRef(0)
  const current = useRef(0)

  // hold the placeholders on screen for a moment so the before registers, then sweep
  useEffect(() => {
    if (!inView || touched.current) return
    const t = window.setTimeout(() => {
      if (!touched.current) setTarget(1)
    }, 600)
    return () => window.clearTimeout(t)
  }, [inView])

  useEffect(() => {
    if (reduced) {
      current.current = target
      setProgress(target)
      return
    }
    const from = current.current
    const start = performance.now()
    const span = Math.abs(target - from) * DURATION
    if (!span) return
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / span)
      current.current = from + (target - from) * k
      setProgress(current.current)
      if (k < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, reduced])

  const choose = (t: 0 | 1) => {
    touched.current = true
    setTarget(t)
  }

  const local = (i: number) => Math.max(0, Math.min(1.01, (progress - i * 0.09) / 0.55))

  return (
    <section className="section problem" id="problem" aria-labelledby="problem-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <p className="kicker">01 / Before</p>
            <h2 className="h2" id="problem-title">
              Are you still using
              <br /> PFPs <em>like this?</em>
            </h2>
          </div>
          <div className="problem__aside">
            <p className="note">Grey ghosts, eggs, and initials. Every user looks the same.</p>
            <div className="toggle" role="group" aria-label="Compare before and after">
              <button type="button" aria-pressed={target === 0} onClick={() => choose(0)}>
                Before
              </button>
              <button type="button" aria-pressed={target === 1} onClick={() => choose(1)}>
                After
              </button>
            </div>
          </div>
        </div>

        <ul className="swaps" ref={rowRef}>
          {TILES.map((tile, i) => (
            <Swap key={tile.before} tile={tile} p={local(i)} />
          ))}
        </ul>

        <div className="problem__turn">
          <h3>
            Give every user a face <em>of their own.</em>
          </h3>
          <p>24 seeds across all {STYLE_COUNT} styles. Drag to look around.</p>
        </div>
      </div>
      <Marquee />
    </section>
  )
}
