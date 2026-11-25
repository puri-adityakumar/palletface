import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ditherFace, STYLES, type StyleSlug } from 'palletface'
import { CopyButton } from '../components/CopyButton'
import { AVATAR_IMPORT } from '../lib/content'
import { LETTER_STYLES, svgUrl } from '../lib/faces'

function Playground() {
  const [seed, setSeed] = useState('user-123')
  const [style, setStyle] = useState<StyleSlug>('pixel-letter')
  const [name, setName] = useState('Ada')
  const [size, setSize] = useState('80')

  const px = Number(size)
  const validSize = Number.isFinite(px) && px > 0
  const hasInitial = LETTER_STYLES.has(style)
  const displayName = hasInitial && name !== '' ? name : undefined
  const svg = validSize ? svgUrl(ditherFace(seed, { style, name: displayName, px })) : undefined
  const nameOption = displayName === undefined ? '' : `\n  name: ${JSON.stringify(displayName)},`
  const code = `${AVATAR_IMPORT}

const svg = palletface(${JSON.stringify(seed)}, {
  style: ${JSON.stringify(style)},${nameOption}
  px: ${px},
})`

  return (
    <div className="playground">
      <div className="playground-workspace">
        <div className="playground-fields">
          <div className="playground-field-wide">
            <label htmlFor="avatar-seed">Seed</label>
            <input id="avatar-seed" type="text" value={seed} onChange={(event) => setSeed(event.target.value)} spellCheck={false} />
          </div>
          <div className="playground-field-wide">
            <label htmlFor="avatar-style">Style</label>
            <select id="avatar-style" value={style} onChange={(event) => setStyle(event.target.value as StyleSlug)}>
              {STYLES.map(({ slug }) => <option key={slug}>{slug}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="avatar-name">Name <span>(optional)</span></label>
            <input
              id="avatar-name"
              type="text"
              value={hasInitial ? name : ''}
              placeholder={hasInitial ? 'Defaults to seed' : 'Used by initial styles'}
              disabled={!hasInitial}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="avatar-size">Size (px)</label>
            <input
              id="avatar-size"
              type="number"
              step="any"
              value={size}
              onChange={(event) => setSize(event.target.value)}
              aria-invalid={!validSize}
              aria-describedby={validSize ? undefined : 'size-error'}
            />
          </div>
          {!validSize && <p id="size-error" className="playground-error" role="status">Enter a finite size greater than zero.</p>}
        </div>
        <div className="playground-preview">
          {svg && (
            <>
              <div className="playground-image">
                <img src={svg} alt={`Generated ${style} avatar`} style={{ width: Math.min(px, 192) }} />
              </div>
              <a className="download-svg" href={svg} download="avatar.svg">Download SVG</a>
            </>
          )}
        </div>
      </div>
      {svg && (
        <div className="playground-code">
          <div className="playground-code-header">
            <span>JavaScript</span>
            <CopyButton value={code} />
          </div>
          <pre tabIndex={0}><code>{code}</code></pre>
        </div>
      )}
    </div>
  )
}

const container = document.getElementById('avatar-playground')
if (container) createRoot(container).render(<Playground />)
