import { useRef } from 'react'
import { Marquee } from '../components/Marquee'
import { Out } from '../components/Pixel'
import { LINKS, SHOWCASE_SEEDS, SPONSORS, STYLE_COUNT } from '../lib/content'
import { Face, styleFor } from '../lib/faces'
import './showcase.css'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pad = (n: number) => String(n).padStart(2, '0')

/** Sponsors under the strip, each with a face from their GitHub login, then the open slots. */
function Sponsors() {
  const next = SPONSORS.length + 1
  return (
    <div className="sponsors" id="sponsors">
      <div className="sponsors__head">
        <p className="sponsors__k">
          <span aria-hidden="true">♥</span> Sponsors
        </p>
        <p className="sponsors__note">Sponsors keep palletface free. Each one gets a face here, drawn from their GitHub name.</p>
        <a href={LINKS.sponsor} target="_blank" rel="noreferrer">
          Become a sponsor <Out />
        </a>
      </div>
      <ul className="sponsors__row">
        {SPONSORS.map((login) => {
          const style = styleFor(login)
          return (
            <li key={login}>
              <a className="sponsors__tile" href={`https://github.com/${login}`} target="_blank" rel="noreferrer">
                <Face seed={login} style={style.slug} px={112} name={capital(login)} alt="" />
                <span className="sponsors__name">@{login}</span>
                <span className="sponsors__style">{style.title}</span>
              </a>
            </li>
          )
        })}
        <li>
          <a className="sponsors__tile sponsors__tile--open" href={LINKS.sponsor} target="_blank" rel="noreferrer">
            <span className="sponsors__hole" aria-hidden="true">
              +
            </span>
            <span className="sponsors__name">{SPONSORS.length ? 'you next?' : 'your name'}</span>
            <span className="sponsors__style">Sponsor {pad(next)} · open</span>
          </a>
        </li>
        {/* until the first sponsor, two fading slots show there is room */}
        {!SPONSORS.length &&
          [2, 3].map((n) => (
            <li key={n} className="sponsors__ghost" aria-hidden="true">
              <span className="sponsors__tile sponsors__tile--open">
                <span className="sponsors__hole">+</span>
                <span className="sponsors__name">you?</span>
                <span className="sponsors__style">Sponsor {pad(n)} · open</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}

/** Sample avatars on an endless strip. The section pins for a while so page scroll walks the strip sideways. */
export function Showcase() {
  const section = useRef<HTMLElement>(null)
  return (
    <section ref={section} className="showcase" id="examples" aria-labelledby="examples-title">
      <div className="showcase__pin">
        <div className="wrap">
          <div className="section-head">
            <h2 className="h2" id="examples-title">
              Give every user a face <em>of their own.</em>
            </h2>
            <p className="note">
              {SHOWCASE_SEEDS.length} seeds across all {STYLE_COUNT} styles. Drag to look around.
            </p>
          </div>
        </div>
        <Marquee pin={section} />
        <Sponsors />
      </div>
    </section>
  )
}
