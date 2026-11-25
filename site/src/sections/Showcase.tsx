import { useRef } from 'react'
import { Marquee } from '../components/Marquee'
import { SHOWCASE_SEEDS, STYLE_COUNT } from '../lib/content'
import './showcase.css'

/** Sample avatars on an endless strip. The section pins for a while so page scroll walks the strip sideways. */
export function Showcase() {
  const section = useRef<HTMLElement>(null)
  return (
    <section ref={section} className="showcase" id="examples" aria-labelledby="examples-title">
      <div className="showcase__pin">
        <div className="wrap">
          <div className="section-head">
            <h2 className="h2" id="examples-title">
              Give every user a face <em>of their own.</em>
            </h2>
            <p className="note">
              {SHOWCASE_SEEDS.length} seeds across all {STYLE_COUNT} styles. Drag to look around.
            </p>
          </div>
        </div>
        <Marquee pin={section} />
      </div>
    </section>
  )
}
