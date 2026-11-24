import { useEffect, useMemo, useRef, useState } from 'react'
import { STYLES } from 'palletface'
import { Face, face } from '../lib/faces'
import { useReducedMotion } from '../lib/hooks'
import { INSTALL, STYLE_COUNT } from '../lib/content'
import './features.css'

const FEATURES = [
  {
    title: 'Same seed, same face',
    body: 'Pass the same seed and options and you get the same SVG back, byte for byte. On the same package version, a user keeps the same avatar across visits, devices, and servers, so there is no avatar to save.',
    detail: (seed: string) => `ditherFace('${seed}') === ditherFace('${seed}')`,
    tag: 'Same seed',
  },
  {
    title: 'Zero dependencies',
    body: 'Installing palletface adds one package and nothing else: no image library, no canvas, no font files. There is less code to audit and less to keep updated.',
    detail: () => `${INSTALL} → added 1 package`,
    tag: 'Zero dependencies',
  },
  {
    title: 'No network, no storage',
    body: 'Each face is computed from its seed on the spot. There is no avatar service to call, no image to upload or store, and no account to create, so it keeps working offline.',
    detail: () => '0 requests · 0 stored files',
    tag: 'Offline',
  },
  {
    title: 'Server or browser',
    body: 'Core rendering never touches window, the DOM, or server-only APIs. Render in a Node route, at build time, or right in the page. The same call returns the same string in each place.',
    detail: () => 'Tested on Node 22 and 24',
    tag: 'In Node',
  },
  {
    title: 'Sharp at any size',
    body: 'Every face is a standalone SVG with its own width, height, and viewBox, so it stays crisp from a tiny badge to a large profile header. Letters are drawn as shapes, so no fonts are fetched.',
    detail: () => 'px: 80 by default',
    tag: 'Any size',
  },
  {
    title: 'One typed function',
    body: `Call ditherFace with a seed and get an SVG string back. Pick one of ${STYLE_COUNT} styles, set the size with px, and pass a name for the letter styles. It ships as ESM with TypeScript types.`,
    detail: () => 'ditherFace(seed, { style, px, name })',
    tag: 'One function',
  },
] as const

const SIZES = { wide: [160, 80, 40, 20], narrow: [96, 48, 24, 12] } as const

/** Clicking a feature scrolls smoothly; scroll updates wait this long so the active feature doesn't flicker on the way. */
const SCROLL_LOCK_MS = 900

/** The viewport line a feature has to cross to become active: mid-screen beside the plotter, lower when the plotter sticks on top. */
function activationLine() {
  const stacked = window.matchMedia('(max-width: 900px) and (min-height: 561px)').matches
  return window.innerHeight * (stacked ? 0.74 : 0.5)
}

/** The plotter beside the list. Each feature gets its own small demo, drawn from the page seed. */
function Plot({ seed, active, visit, reduced }: { seed: string; active: number; visit: number; reduced: boolean }) {
  // 1 and 2 are the two drawing passes; 3 means both finished.
  const [run, setRun] = useState(3)
  const [tick, setTick] = useState(0)

  const proof = useMemo(() => {
    const first = face(seed, 'pixel-sprite')
    return { same: first === face(seed, 'pixel-sprite'), bytes: new TextEncoder().encode(first).length }
  }, [seed])

  useEffect(() => {
    if (active !== 0) return
    if (reduced) return setRun(3)
    setRun(1)
    const second = window.setTimeout(() => setRun(2), 1300)
    const done = window.setTimeout(() => setRun(3), 2600)
    return () => {
      window.clearTimeout(second)
      window.clearTimeout(done)
    }
  }, [active, visit, reduced])

  useEffect(() => {
    setTick(0)
    if (reduced || (active !== 3 && active !== 5)) return
    const id = window.setInterval(() => setTick((n) => n + 1), active === 3 ? 1800 : 900)
    return () => window.clearInterval(id)
  }, [active, visit, reduced])

  const inNode = tick % 2 === 0
  const shownStyle = STYLES[tick % STYLES.length]!
  const tag = active === 3 ? (inNode ? 'In Node' : 'In the browser') : FEATURES[active]!.tag
  const foot = [
    run === 3 ? (proof.same ? `Runs match · ${proof.bytes.toLocaleString('en')} bytes` : 'Runs differ') : `Run ${run} · drawing`,
    '1 package added',
    '9 faces · 0 requests',
    'Same SVG both ways',
    'One SVG, any px',
    reduced ? `${STYLE_COUNT} styles, one call` : `style: '${shownStyle.slug}'`,
  ][active]

  return (
    <figure className="plotter" aria-label={`Live plot: ${FEATURES[active]!.title}`}>
      <div className="plotter__label" aria-hidden="true">
        <span>
          <i /> Live plot
        </span>
        <span>{tag}</span>
      </div>
      <div className="plotter__grid" aria-hidden="true">
        <span className="plotter__cross plotter__cross--nw" />
        <span className="plotter__cross plotter__cross--ne" />
        <span className="plotter__cross plotter__cross--sw" />
        <span className="plotter__cross plotter__cross--se" />
        <span className="plotter__axis plotter__axis--x">X</span>
        <span className="plotter__axis plotter__axis--y">Y</span>
        <div className="plotter__view" key={`${active}-${visit}`}>
          {active === 0 && (
            <>
              <Face seed={seed} style="pixel-sprite" px={240} className={`plotter__art${run < 3 ? ' is-drawing' : ''}`} key={run} />
              {run < 3 && <span className="plotter__pen" key={`pen-${run}`} />}
            </>
          )}
          {active === 1 && (
            <>
              <Face seed={seed} style="pixel-sprite" px={240} className="plotter__art" />
              <div className="plotter__term">
                <p>
                  <span>$</span> <b>{INSTALL}</b>
                </p>
                <p className="plotter__out">added 1 package</p>
              </div>
            </>
          )}
          {active === 2 && (
            <>
              <div className="plotter__crowd">
                {Array.from({ length: 9 }, (_, i) => (
                  <Face key={i} seed={i === 0 ? seed : `${seed}-${i}`} style="pixel-sprite" px={96} />
                ))}
              </div>
              <span className="plotter__badge">0 requests · 0 files stored</span>
            </>
          )}
          {active === 3 && (
            <>
              <Face seed={seed} style="pixel-sprite" px={240} className="plotter__art" />
              <div className="plotter__chip" key={inNode ? 'node' : 'browser'}>
                <span>{inNode ? 'server.ts' : 'page.tsx'}</span>
                <code>ditherFace(user.id)</code>
              </div>
            </>
          )}
          {active === 4 &&
            (['wide', 'narrow'] as const).map((set) => (
              <div key={set} className={`plotter__sizes plotter__sizes--${set}`}>
                {SIZES[set].map((px, i) => (
                  <figure key={px}>
                    <Face seed={seed} style="pixel-sprite" px={px} />
                    <figcaption>{i === SIZES[set].length - 1 ? `${px} px` : px}</figcaption>
                  </figure>
                ))}
              </div>
            ))}
          {active === 5 && (
            <div className="plotter__styles">
              {STYLES.map((s) => (
                <span key={s.slug} className={!reduced && s.slug === shownStyle.slug ? 'is-on' : undefined}>
                  <Face seed={seed} style={s.slug} px={80} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <figcaption className="plotter__foot">
        <span>
          seed: <b>{seed === '' ? '“”' : seed}</b>
        </span>
        <span>{foot}</span>
      </figcaption>
    </figure>
  )
}

/** Six features beside one plotter. Scrolling (or clicking a feature) picks the one the plotter demonstrates. */
export function Features({ seed }: { seed: string }) {
  const reduced = useReducedMotion()
  const [active, setActive] = useState(0)
  const [visit, setVisit] = useState(0)
  const items = useRef<(HTMLLIElement | null)[]>([])
  const lockUntil = useRef(0)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      if (performance.now() < lockUntil.current) return
      const line = activationLine()
      let next = 0
      items.current.forEach((item, i) => {
        if (item && item.getBoundingClientRect().top < line) next = i
      })
      setActive(next)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const pick = (i: number) => {
    setActive(i)
    setVisit((n) => n + 1)
    const item = items.current[i]
    if (!item) return
    lockUntil.current = performance.now() + SCROLL_LOCK_MS
    window.scrollTo({ top: window.scrollY + item.getBoundingClientRect().top - activationLine() + 2, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <section className="section features" id="features" aria-labelledby="features-title">
      <div className="wrap">
        <div className="section-head">
          <h2 className="h2" id="features-title">
            Everything an avatar needs.
            <br />
            <em>Nothing it doesn’t.</em>
          </h2>
          <p className="note">A small library with one job: turn a string into a face.</p>
        </div>
        <div className="features__story">
          <div className="features__stage">
            <Plot seed={seed} active={active} visit={visit} reduced={reduced} />
          </div>
          <ol className="features__list">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                ref={(node) => {
                  items.current[i] = node
                }}
                className={i === active ? 'feature is-on' : 'feature'}
                onClick={() => pick(i)}
              >
                <div className="feature__copy">
                  <h3>
                    <button type="button" aria-current={i === active ? 'step' : undefined}>
                      {f.title}
                    </button>
                  </h3>
                  <p>{f.body}</p>
                  <code>{f.detail(seed)}</code>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
