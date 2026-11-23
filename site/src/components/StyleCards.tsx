import { useMemo, useRef, useState } from 'react'
import { STYLES } from 'palletface'
import { draw } from '../lib/dither'

function callFor(slug: string, seed: string): string {
  const isLetter = slug.includes('letter')
  return `ditherFace('${seed}', { style: '${slug}', px: 80${isLetter ? `, name: '${seed.split('-')[1] ?? seed}'` : ''} })`
}

/** The nine — click-to-copy style cards: the picker as the purchase moment. */
export function StyleCards() {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef(0)

  const cards = useMemo(
    () =>
      STYLES.map((st, i) => {
        const seed = `palletface-${st.slug}`
        return {
          st,
          num: String(i + 1).padStart(2, '0'),
          note: st.slug === 'dither-orb' ? `${st.note} the style that shipped in palletism first.` : st.note,
          call: callFor(st.slug, seed),
          svg: draw(seed, st.slug, 84, 'palletface'),
        }
      }),
    [],
  )

  const copy = async (call: string) => {
    let ok = false
    try {
      await navigator.clipboard.writeText(call)
      ok = true
    } catch {
      ok = false
    }
    setCopied(ok ? call : `fail:${call}`)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(null), 1400)
  }

  return (
    <section id="styles" className="styles band-pad light-band">
      <div className="band-head">
        <p className="s-eyebrow rv">the styles</p>
        <h2 className="s-title rv">
          pick a face, <em>copy its call</em>
          <i>.</i>
        </h2>
        <p className="s-lede rv">
          click a card and the exact <b>ditherFace</b> invocation is on your clipboard — style, seed and size,
          ready to paste.
        </p>
      </div>
      <div className="cards">
        {cards.map(({ st, num, note, call, svg }) => (
          <div
            key={st.slug}
            className="card rv"
            role="button"
            tabIndex={0}
            onClick={() => copy(call)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                copy(call)
              }
            }}
          >
            <div className="face">
              <div dangerouslySetInnerHTML={{ __html: svg }} />
            </div>
            <div className="t">
              <span className="num">{num}</span>
              <span className="name">{st.title}</span>
            </div>
            <div className="slug">{st.slug}</div>
            <div className="note">{note}</div>
            <div className={`call${copied === call ? ' copied' : ''}`} aria-live="polite">
              {copied === call ? `copied ✓  ${call}` : copied === `fail:${call}` ? 'copy failed' : call}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
