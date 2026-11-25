import { useDeferredValue, useState } from 'react'
import { STYLES, type StyleSlug } from 'palletface'
import { SeedInput } from '../components/SeedInput'
import { SubHead } from '../components/SubHead'
import { Footer } from '../sections/Footer'
import { callFor, Face, LETTER_STYLES } from '../lib/faces'
import { useCopy } from '../lib/hooks'
import { AVATAR_IMPORT, STYLE_COUNT } from '../lib/content'
import { usePageMeta } from '../lib/router'
import './page.css'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function GalleryCard({ seed, slug, title }: { seed: string; slug: StyleSlug; title: string }) {
  const named = LETTER_STYLES.has(slug)
  const call = callFor(seed, slug, 200, named ? capital(seed) : undefined)
  const [state, copy] = useCopy(`${AVATAR_IMPORT}\n\nconst svg = ${call}`)
  return (
    <li className="gal">
      <Face seed={seed} style={slug} px={200} name={capital(seed)} alt={`${title} avatar for “${seed}”`} className="gal__art" />
      <h2 className="gal__name">{title}</h2>
      <p className="gal__meta">
        <code>'{slug}'</code>
        {named && <span>uses name</span>}
      </p>
      <button type="button" className="gal__call" onClick={copy} title="Copy the call">
        <code>{call}</code>
        <span className="gal__copy" aria-live="polite">
          {state === 'ok' ? 'Copied ✓' : state === 'fail' ? 'Copy failed' : 'Copy call'}
        </span>
      </button>
    </li>
  )
}

/** All twelve styles at full size, following one seed. */
export function StylesPage() {
  usePageMeta('Styles · palletface')
  const [seed, setSeed] = useState('ada')
  const later = useDeferredValue(seed)
  return (
    <div>
      <SubHead />
      <main className="wrap page">
        <div className="page__head">
          <h1 className="h2">
            Every style.
            <br />
            One seed: <em>{seed === '' ? '“”' : seed}</em>
          </h1>
          <p className="note">
            All {STYLE_COUNT} styles at full size. Type a seed and they all follow it. Click a call to copy it.
          </p>
          <SeedInput id="gallery-seed" seed={seed} setSeed={setSeed} />
        </div>
        <ul className="gallery">
          {STYLES.map((s) => (
            <GalleryCard key={s.slug} seed={later} slug={s.slug} title={s.title} />
          ))}
        </ul>
      </main>
      <Footer seed={later} />
    </div>
  )
}
