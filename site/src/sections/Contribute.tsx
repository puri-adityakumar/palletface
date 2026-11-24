import { Out } from '../components/Pixel'
import { LINKS } from '../lib/content'
import { Face } from '../lib/faces'
import './contribute.css'

const FACES = ['first-contributor', 'second-contributor', 'third-contributor'] as const

/** A small call for contributors, attached under the sponsor panel. */
export function Contribute() {
  return (
    <div className="contribute">
      <div className="contribute__faces" aria-hidden="true">
        {FACES.map((seed) => (
          <Face key={seed} seed={seed} style="pixel-sprite" px={56} />
        ))}
        <span className="contribute__more">++</span>
      </div>
      <div className="contribute__copy">
        <h3>Just become a contributor.</h3>
        <p>New styles, fixes, and docs are all welcome.</p>
      </div>
      <a className="btn" href={LINKS.contributing} target="_blank" rel="noreferrer">
        Read the guide <Out />
      </a>
    </div>
  )
}
