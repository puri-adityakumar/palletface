/** HowItWorks — three steps, one line each, de-risking the integration. */
export function HowItWorks() {
  return (
    <section id="how" className="how band-pad light-band">
      <div className="dither-edge top" aria-hidden="true" />
      <div className="dither-edge fine top" style={{ marginTop: 20 }} aria-hidden="true" />
      <div className="band-head">
        <p className="s-eyebrow rv">how it works</p>
        <h2 className="s-title rv">
          three steps, <em>no infrastructure</em>
          <i>.</i>
        </h2>
      </div>
      <div className="steps">
        <div className="step rv">
          <div className="num">01</div>
          <h3>
            give it an id<i>.</i>
          </h3>
          <p>any string seeds the art. use an opaque, stable user id — keep secrets out of it.</p>
        </div>
        <div className="step rv">
          <div className="num">02</div>
          <h3>
            call the function<i>.</i>
          </h3>
          <p>one call draws all nine styles, at any size in css pixels.</p>
          <div className="code">
            <b>ditherFace</b>(&apos;user-123&apos;, {'{'}
            {'\n'}
            {'  '}style: &apos;pixel-letter&apos;,
            {'\n'}
            {'  '}px: 80,
            {'\n'}
            {')'})
          </div>
        </div>
        <div className="step rv">
          <div className="num">03</div>
          <h3>
            ship the svg<i>.</i>
          </h3>
          <p>standalone output: data-url it into an img, inline it, or serve it.</p>
        </div>
      </div>
    </section>
  )
}
