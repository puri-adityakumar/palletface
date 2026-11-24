import { Marquee } from '../components/Marquee'
import { STYLE_COUNT } from '../lib/content'
import './problem.css'

function Ghost() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#d9d9d6" />
      <circle cx="50" cy="40" r="17" fill="#b4b4b0" />
      <path d="M18 88c4-18 17-28 32-28s28 10 32 28a50 50 0 0 1-64 0z" fill="#b4b4b0" />
    </svg>
  )
}

function Egg() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#cdd5d9" />
      <ellipse cx="50" cy="55" rx="20" ry="26" fill="#eceff0" />
    </svg>
  )
}

function Initials() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#c6c3bd" />
      <text x="50" y="62" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="32" fontWeight="600" fill="#fff">
        AK
      </text>
    </svg>
  )
}

function Broken() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="1" y="1" width="98" height="98" rx="14" fill="#e6e5e1" stroke="#c9c8c3" strokeWidth="2" />
      <path d="M26 30h48v40H26z" fill="none" stroke="#a9a8a3" strokeWidth="4" strokeLinejoin="round" />
      <path d="M30 64l12-14 9 10 6-6 13 10" fill="none" stroke="#a9a8a3" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="61" cy="40" r="4" fill="#a9a8a3" />
      <path d="M48 26l6 10-6 8 6 10-4 8 6 12" fill="none" stroke="#e6e5e1" strokeWidth="5" />
    </svg>
  )
}

function Nothing() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="none" stroke="#bdbcb7" strokeWidth="3" strokeDasharray="7 6" />
      <text x="50" y="63" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="36" fill="#bdbcb7">
        ?
      </text>
    </svg>
  )
}

const DULL = [
  { Art: Ghost, label: 'default.png' },
  { Art: Egg, label: 'the egg' },
  { Art: Initials, label: 'two initials' },
  { Art: Broken, label: 'image failed' },
  { Art: Nothing, label: 'no photo yet' },
]

export function Problem() {
  return (
    <section className="problem" id="problem" aria-labelledby="problem-title">
      <div className="wrap problem__head">
        <div>
          <p className="label eyebrow">
            <span>01</span> / Before
          </p>
          <h2 className="section-title" id="problem-title">
            Still using profile
            <br /> pictures <em>like this</em>
            <b>?</b>
          </h2>
        </div>
        <p className="section-note">Grey ghosts, eggs, and two letters on a flat circle. Every user looks the same, and nobody looks like themselves.</p>
      </div>

      <ul className="wrap dull" aria-label="Typical placeholder avatars">
        {DULL.map(({ Art, label }) => (
          <li key={label}>
            <div className="dull__art">
              <Art />
            </div>
            <span className="label">{label}</span>
          </li>
        ))}
      </ul>

      <div className="wrap problem__turn">
        <p className="label eyebrow">
          <span>↓</span> After
        </p>
        <h3>
          Give every user a face <em>of their own</em>
          <b>.</b>
        </h3>
        <p>
          One string in, one avatar out. Here are 24 seeds across all {STYLE_COUNT} styles. Drag the line to look around.
        </p>
      </div>
      <Marquee />
    </section>
  )
}
