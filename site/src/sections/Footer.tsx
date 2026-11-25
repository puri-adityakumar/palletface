import { useRef } from 'react'
import { GitHubMark, Out } from '../components/Pixel'
import { CliffScene } from '../field/CliffScene'
import { LINKS, VERSION } from '../lib/content'
import { Link } from '../lib/router'
import './footer.css'

const COLUMNS = [
  {
    title: 'Project',
    links: [
      ['GitHub', LINKS.github],
      ['npm', LINKS.npm],
      ['Docs', LINKS.docs],
      ['Playground', '/playground'],
      ['Changelog', '/changelog'],
    ],
  },
  {
    title: 'Community',
    links: [
      ['Issues', LINKS.issues],
      ['Contributing', LINKS.contributing],
      ['Sponsor', LINKS.sponsor],
      ['Palletism', LINKS.palletism],
    ],
  },
] as const

/** The npm mark (Simple Icons `npm`). */
function NpmMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"
      />
    </svg>
  )
}

/** The X mark (Simple Icons `x`). */
function XMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
      />
    </svg>
  )
}

/** Links and credits on paper, then the cliff scene with the name set in its ground. */
export function Footer({ seed }: { seed: string }) {
  const wordRef = useRef<HTMLParagraphElement>(null)
  return (
    <footer className="foot">
      <div className="wrap foot__top">
        <div className="foot__intro">
          <h2>
            A unique face <em>for every user.</em>
          </h2>
          <p>Same user, same face, every time.</p>
          <div className="foot__social">
            <a href={LINKS.github} target="_blank" rel="noreferrer" aria-label="palletface on GitHub">
              <GitHubMark size={20} />
            </a>
            <a href={LINKS.npm} target="_blank" rel="noreferrer" aria-label="palletface on npm">
              <NpmMark size={20} />
            </a>
            <a href={LINKS.x} target="_blank" rel="noreferrer" aria-label="@adityawaslost on X">
              <XMark size={18} />
            </a>
          </div>
        </div>

        <nav className="foot__links" aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p>{col.title}</p>
              <ul>
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    {href === LINKS.docs ? (
                      <a href={href}>{label}</a>
                    ) : href.startsWith('/') ? (
                      <Link to={href}>{label}</Link>
                    ) : (
                      <a href={href} target="_blank" rel="noreferrer">
                        {label} <Out />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="wrap">
        <p className="foot__bar">
          <span>
            © {new Date().getFullYear()}{' '}
            <a href={LINKS.author} target="_blank" rel="noreferrer">
              @puri-adityakumar
            </a>{' '}
            ·{' '}
            <a href={LINKS.license} target="_blank" rel="noreferrer">
              MIT
            </a>
          </span>
          <span>
            <Link to="/changelog">v{VERSION}</Link> · A sister project of{' '}
            <a className="foot__pm" href={LINKS.palletism} target="_blank" rel="noreferrer">
              <span className="brand__pm">
                palletism<span className="brand__dot">.</span>art
              </span>
            </a>
          </span>
        </p>
      </div>

      <div className="foot__art">
        <CliffScene seed={seed} ground={wordRef} />
        <div className="wrap foot__name">
          <p ref={wordRef} className="foot__word" aria-hidden="true">
            palletface<span className="foot__dot" />
          </p>
        </div>
      </div>
    </footer>
  )
}
