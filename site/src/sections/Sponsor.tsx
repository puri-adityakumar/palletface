import { Out, PixelIcon } from '../components/Pixel'
import { LINKS } from '../lib/content'
import './sponsor.css'

const SPROUTS = [
  ['..LL..', '.LGGL.', 'LGLLGL', '.L..L.', '..SS..', '..S...'],
  ['......', '......', '.L..L.', 'LGLLGL', '..SS..', '..S...'],
  ['......', '......', '......', '..LL..', '.LGGL.', '..S...'],
  ['......', '......', '......', '......', '..L...', '..S...'],
] as const
const SPROUT_COLORS = { L: '#3f6b3a', G: '#8cbf6a', S: '#4f7a3e' }

const PLOTS = 8

export function Sponsor() {
  return (
    <section className="sponsor wrap" id="sponsor" aria-labelledby="sponsor-title">
      <div className="sponsor__panel">
        <div className="sponsor__copy">
          <p className="label eyebrow">
            <span>05</span> / Sponsors
          </p>
          <h2 className="section-title" id="sponsor-title">
            Help the meadow <em>grow</em>
            <b>.</b>
          </h2>
          <p className="sponsor__body">
            palletface is free, MIT-licensed, and made in the open. Sponsoring helps pay for new styles, fixes, and better docs.
          </p>
          <div className="sponsor__actions">
            <a className="btn btn--coral" href={LINKS.sponsor} target="_blank" rel="noreferrer">
              <span aria-hidden="true">♥</span> Sponsor on GitHub
              <Out />
            </a>
            <a className="btn" href={LINKS.github} target="_blank" rel="noreferrer">
              <span aria-hidden="true">★</span> Star the repo
              <Out />
            </a>
          </div>
        </div>
        <div className="garden">
          <ul aria-label="Sponsor plots">
            {Array.from({ length: PLOTS }, (_, i) => (
              <li key={i} className={i === 0 ? 'plot plot--first' : 'plot'}>
                <PixelIcon rows={SPROUTS[Math.min(i, SPROUTS.length - 1)]!} colors={SPROUT_COLORS} scale={i === 0 ? 6 : 4} />
                <span className="label">{i === 0 ? 'your name here' : 'open plot'}</span>
              </li>
            ))}
          </ul>
          <p className="garden__note">No sponsors yet. The first one gets the sunniest plot.</p>
        </div>
      </div>
    </section>
  )
}
