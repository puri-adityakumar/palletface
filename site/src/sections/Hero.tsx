import { CopyButton } from '../components/CopyButton'
import { Out, PixelBloom } from '../components/Pixel'
import { INSTALL, LINKS, SAMPLE_SEEDS, STYLE_COUNT, VERSION } from '../lib/content'
import { Scene } from '../meadow/Scene'
import './hero.css'

type Props = {
  seed: string
  setSeed: (seed: string) => void
  night: boolean
  setNight: (night: boolean) => void
}

function SunMoon({ night }: { night: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" shapeRendering="crispEdges">
      {night ? (
        <path d="M7 1h2v3H7zM7 12h2v3H7zM1 7h3v2H1zM12 7h3v2h-3zM5 5h6v6H5zM3 3h2v2H3zM11 3h2v2h-2zM11 11h2v2h-2zM3 11h2v2H3z" />
      ) : (
        <path d="M5 1h5v2H8v2H7v4h2v2h5v2h-2v2H5v-2H3v-2H1V5h2V3h2z" />
      )}
    </svg>
  )
}

export function Hero({ seed, setSeed, night, setNight }: Props) {
  const nextSeed = () => {
    const index = SAMPLE_SEEDS.findIndex((sample) => sample === seed)
    setSeed(SAMPLE_SEEDS[(index + 1) % SAMPLE_SEEDS.length]!)
  }

  return (
    <section className={`hero${night ? ' hero--night' : ''}`} aria-labelledby="hero-title">
      <header className="nav wrap">
        <a href="#top" className="brand">
          <PixelBloom /> palletface
        </a>
        <nav aria-label="Main">
          <a className="nav__extra" href="#styles">
            Styles
          </a>
          <a className="nav__extra" href="#how">
            How it works
          </a>
          <a className="nav__extra" href="#faq">
            FAQ
          </a>
          <a href={LINKS.github} target="_blank" rel="noreferrer">
            GitHub
            <Out />
          </a>
          <button className="nav__time" type="button" aria-label="Night mode" aria-pressed={night} onClick={() => setNight(!night)}>
            <SunMoon night={night} />
          </button>
        </nav>
      </header>

      <div className="hero__content wrap">
        <p className="label hero__note">
          <span aria-hidden="true">✦</span> The pixel avatar library <span className="hero__version">/ v{VERSION}</span>
        </p>
        <h1 id="hero-title">
          a little world
          <br /> for every <em>user</em>
          <b>.</b>
        </h1>
        <p className="hero__lead">
          Deterministic SVG avatars in {STYLE_COUNT} pixel, dither, and geometric styles.
          <span className="hero__lead-more"> One seed in, one face out, with zero runtime dependencies.</span>
        </p>
        <div className="hero__actions">
          <CopyButton value={INSTALL} variant="install" />
          <a className="hero__docs" href={LINKS.docs} target="_blank" rel="noreferrer">
            Read the docs
            <Out />
          </a>
        </div>
      </div>

      <div className="terminal">
        <div className="terminal__top label">
          <span>Seed terminal</span>
          <span className="terminal__online" aria-hidden="true" />
        </div>
        <div className="terminal__inner">
          <label htmlFor="seed">Type a seed</label>
          <div className="terminal__entry">
            <span aria-hidden="true">&gt;</span>
            <input
              id="seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={40}
              aria-describedby="seed-note"
            />
            <button type="button" aria-label="Try the next sample seed" title="Try the next sample seed" onClick={nextSeed}>
              ↻
            </button>
          </div>
          <p id="seed-note">Same seed, same face. Watch the screen.</p>
        </div>
      </div>

      <div className="hero__ground wrap">
        <a className="label" href="#problem">
          <span aria-hidden="true">↓</span> Walk the field
        </a>
        <span className="label hero__stamp">{night ? '02 / After dark' : '01 / The meadow'}</span>
      </div>
      <Scene seed={seed} night={night} />
    </section>
  )
}
