import type { Ref } from 'react'
import { LINKS } from '../lib/content'
import { PixelBloom } from './Pixel'

/** The palletface lockup: the bloom and the name, with a small "by palletism.art" line under the name. */
export function Brand({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="brand" data-nodig>
      <a className="brand__home" href="#top">
        <PixelBloom size={22} />
        palletface
      </a>
      <a className="brand__by" href={LINKS.palletism} target="_blank" rel="noreferrer">
        by{' '}
        <span className="brand__pm">
          palletism<span className="brand__dot">.</span>art
        </span>
      </a>
    </div>
  )
}
