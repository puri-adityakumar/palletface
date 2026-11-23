import { BUILD } from '../lib/build'

/** Facts — quantified trust: every number generated from the build, none typed. */
export function Facts() {
  return (
    <section id="facts" className="facts band-pad light-band">
      <div className="band-head">
        <p className="s-eyebrow rv">built to embed</p>
        <h2 className="s-title rv">
          small enough to <em>forget it's there</em>
          <i>.</i>
        </h2>
      </div>
      <div className="facts-chips rv">
        <span className="fact">
          <b>0</b> runtime dependencies
        </span>
        <span className="fact">
          esm + <b>typescript</b>
        </span>
        <span className="fact">
          node <b>22 &amp; 24</b> · any browser
        </span>
        <span className="fact">
          <b>{BUILD.iifeKb} kb</b> iife · <b>{BUILD.gzipKb} kb</b> gzip
        </span>
        <span className="fact">
          <b>mit</b> license
        </span>
        <span className="fact">
          no network · <b>no avatar service</b>
        </span>
        <span className="fact">fixture-pinned output</span>
      </div>
      <p className="fine-line rv">
        {'{ deterministic art, not cryptography — an avatar is a function of the id, not proof of identity }'}
      </p>
    </section>
  )
}
