import { CopyButton } from '../components/CopyButton'
import { Out, PixelBloom } from '../components/Pixel'
import { INSTALL, LINKS, PROVENANCE, VERSION } from '../lib/content'
import { Scene } from '../meadow/Scene'
import './footer.css'

const COLUMNS = [
  {
    title: 'Project',
    links: [
      ['GitHub', LINKS.github],
      ['npm', LINKS.npm],
      ['Docs', LINKS.docs],
      ['Releases', LINKS.releases],
    ],
  },
  {
    title: 'Help',
    links: [
      ['Issues', LINKS.issues],
      ['Contributing', LINKS.contributing],
      ['MIT license', LINKS.license],
    ],
  },
  {
    title: 'Friends',
    links: [
      ['Sponsor', LINKS.sponsor],
      ['Palletism', LINKS.palletism],
    ],
  },
] as const

export function Footer({ seed }: { seed: string }) {
  return (
    <footer className="footer">
      <Scene seed={seed} night footer />
      <div className="wrap footer__content">
        <div className="footer__cta">
          <a href="#top" className="brand">
            <PixelBloom size={20} /> palletface
          </a>
          <p className="footer__night">
            Goodnight, <em>meadow</em>
            <b>.</b>
          </p>
          <p className="footer__line">Plant your first seed tomorrow morning. Or right now.</p>
          <CopyButton value={INSTALL} variant="install" />
        </div>
        <nav className="footer__links" aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="label">{col.title}</p>
              <ul>
                {col.links.map(([name, href]) => (
                  <li key={name}>
                    <a href={href} target="_blank" rel="noreferrer">
                      {name}
                      <Out />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <p className="wrap footer__meta label">
        <span>v{VERSION} · MIT</span>
        <span>{PROVENANCE}</span>
      </p>
    </footer>
  )
}
