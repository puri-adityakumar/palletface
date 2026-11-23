import { BUILD, INSTALL_CMD } from '../lib/build'
import { CopyButton } from './CopyButton'

/** Closing — full-screen night-sky bookend (CTA 3 of 3) + metadata. */
export function Closing() {
  return (
    <div id="closing" className="closing">
      <div className="scenery" aria-hidden="true">
        <ascii-art piece="aurora-fjord" />
      </div>
      <div className="close-scrim" aria-hidden="true" />
      <div className="close-inner">
        <CopyButton
          className="close-cmd"
          text={INSTALL_CMD}
          label={
            <>
              npm install palletface<b className="k">@beta</b>
            </>
          }
        />
        <div className="close-links">
          <a href="https://github.com/puri-adityakumar/palletface" target="_blank" rel="noreferrer">
            github ↗
          </a>
          <a href="https://www.npmjs.com/package/palletface" target="_blank" rel="noreferrer">
            npm ↗
          </a>
          <a href="https://github.com/puri-adityakumar/palletface#readme" target="_blank" rel="noreferrer">
            docs ↗
          </a>
          <a href="https://palletism.art" target="_blank" rel="noreferrer">
            palletism ↗
          </a>
        </div>
        <div className="close-meta">
          palletface {BUILD.version} · mit · 9 styles · 0 deps · {BUILD.gzipKb} kb gzip
        </div>
        <div className="close-fine">{'{ one seed, nine styles }'}</div>
      </div>
    </div>
  )
}
