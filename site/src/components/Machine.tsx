import { useMemo, useState } from 'react'
import { draw } from '../lib/dither'

const MACHINE_STYLES = ['pixel-sprite', 'pixel-letter', 'dither-orb']

/** The machine — type an id, meet its face: three live styles redraw per keystroke. */
export function Machine() {
  const [seed, setSeed] = useState('palletface')
  const faces = useMemo(
    () =>
      MACHINE_STYLES.map((slug, i) => ({
        slug,
        svg: draw(`${seed}-machine`, slug, i === 1 ? 148 : 116, seed),
        mid: i === 1,
      })),
    [seed],
  )

  return (
    <section id="machine" className="machine band-pad">
      <div className="machine-inner">
        <p className="s-eyebrow rv">the machine</p>
        <h2 className="s-title rv">
          type an id, <em>meet its face</em>
          <i>.</i>
        </h2>
        <div className="machine-seed rv">
          <label htmlFor="seed-machine">seed</label>
          <input
            id="seed-machine"
            type="text"
            value={seed}
            spellCheck={false}
            autoComplete="off"
            aria-label="seed"
            placeholder="anything — try 'ada'"
            onChange={(e) => setSeed(e.target.value)}
          />
        </div>
        <div className="machine-faces rv" aria-live="polite">
          {faces.map((f) => (
            <figure key={f.slug} className={f.mid ? 'mid' : undefined}>
              <div className="face">
                <div className="swap-target" key={seed + f.slug} dangerouslySetInnerHTML={{ __html: f.svg }} />
              </div>
              <figcaption>{f.slug}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
