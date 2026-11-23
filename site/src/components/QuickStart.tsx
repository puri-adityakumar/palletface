import { BUILD, INSTALL_CMD } from '../lib/build'
import { CopyButton } from './CopyButton'

/** QuickStart — six lines + the beta/pin strip (CTA 2 of 3). */
export function QuickStart() {
  return (
    <section id="quickstart" className="quickstart band-pad light-band">
      <div className="band-head">
        <p className="s-eyebrow rv">quick start</p>
        <h2 className="s-title rv">
          drop it <em>in</em>
          <i>.</i>
        </h2>
      </div>
      <div className="install-bar rv">
        <span className="cmd">
          npm install palletface<b className="k">@beta</b>
        </span>
        <CopyButton text={INSTALL_CMD} label="copy" className="copy-btn" />
      </div>
      <div className="beta-strip rv">
        <span className="tag">{BUILD.version} beta</span>
        <span>
          the <code>@beta</code> dist-tag moves at 1.0. minor releases may change the api or avatar output before
          then — when identities must stay stable, pin it:{' '}
          <code>npm install palletface@{BUILD.version}</code>
        </span>
      </div>
      <div className="codeblock rv">
        <header>
          <span>browser</span>
          <span>esm · 6 lines</span>
        </header>
        <pre>{`import { ditherFace } from 'palletface'

const svg = ditherFace('user-123', {
  style: 'pixel-letter', name: 'Aditya', px: 80,
})

img.src = \`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(svg)}\``}</pre>
      </div>
      <p className="naming rv">
        <code>ditherFace</code> is the api; <code>palletface</code> is the package — the name kept from the original
        dither-face experiments. if your csp forbids <code>data:</code> urls, serve the svg from your own route.
      </p>
    </section>
  )
}
