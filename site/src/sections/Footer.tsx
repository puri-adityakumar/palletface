import { useMemo, useRef } from 'react'
import { CopyButton } from '../components/CopyButton'
import { FieldMark, Out } from '../components/Pixel'
import { SeedField } from '../field/SeedField'
import { INSTALL, LINKS, PROVENANCE, STYLE_COUNT, VERSION } from '../lib/content'
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

const SPECS = [
  ['Styles', String(STYLE_COUNT)],
  ['Runtime deps', '0'],
  ['Network requests', '0'],
  ['Output', 'SVG string'],
  ['Runs in', 'Node + browser'],
  ['Ships as', 'ESM + types'],
] as const

export function Footer({ seed }: { seed: string }) {
  const headRef = useRef<HTMLDivElement>(null)
  const linksRef = useRef<HTMLElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const metaRef = useRef<HTMLParagraphElement>(null)
  const clear = useMemo(() => [headRef, linksRef], [])
  const solid = useMemo(() => [legendRef, metaRef], [])
  return (
    <footer className="foot">
      <SeedField seed={`${seed}/footer`} shape="footer" clear={clear} solid={solid} />
      <div className="wrap foot__layout">
        <div ref={headRef} className="foot__head">
          <a className="brand" href="#top">
            <FieldMark size={20} />
            palletface
          </a>
          <h2>Plant a seed.</h2>
          <p>Give every user a face of their own, in one line of code.</p>
          <CopyButton value={INSTALL} variant="install" />
        </div>

        <nav ref={linksRef} className="foot__links" aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p>{col.title}</p>
              <ul>
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noreferrer">
                      {label} <Out />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div ref={legendRef} className="legend">
          <p className="legend__title">Legend</p>
          <ul className="legend__keys">
            <li>
              <span className="legend__cell legend__cell--ink" /> Ink cell, grown from the seed
            </li>
            <li>
              <span className="legend__cell legend__cell--digit">3</span> Ink cells next to this one
            </li>
            <li>
              <span className="legend__cell legend__cell--glow" /> Your pointer
            </li>
          </ul>
          <dl className="legend__specs">
            {SPECS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p ref={metaRef} className="foot__meta">
          <span>
            v{VERSION} · MIT ·{' '}
            <a href={LINKS.author} target="_blank" rel="noreferrer">
              @puri-adityakumar
            </a>
          </span>
          <span>{PROVENANCE}</span>
        </p>
      </div>
    </footer>
  )
}
