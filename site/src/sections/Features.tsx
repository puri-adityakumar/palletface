import { PixelIcon } from '../components/Pixel'
import './features.css'

const INK = '#1d1d1b'
const BLUE = '#2633d9'
const SOFT = '#a9b0ff'
const LIGHT = '#f2f2ef'
const GREY = '#9a9a94'

const ICONS = {
  seed: {
    rows: ['....LL...', '...LGGL..', '.LL.LGL..', 'LGGL.SL..', '.LGGLS...', '..LLSS...', '....S....', '.DDDDDDD.', '..DBBBD..'],
    colors: { L: INK, G: SOFT, S: INK, D: INK, B: BLUE },
  },
  box: {
    rows: ['OOOOOOOOO', 'OtttOtttO', 'OOOOOOOOO', 'OswwwwwsO', 'OswwOwwsO', 'OswOwOwsO', 'OswOwOwsO', 'OswwOwwsO', 'OOOOOOOOO'],
    colors: { O: INK, t: BLUE, s: GREY, w: LIGHT },
  },
  cloud: {
    rows: ['........R', '...ccc.R.', '..cwwwR..', '.ccwwRwc.', 'cwwwRwwwc', 'cwwRwwwwc', '.cRccccc.', '.R.......', 'R........'],
    colors: { c: INK, w: LIGHT, R: BLUE },
  },
  windows: {
    rows: ['AAAAAA...', 'AwwwwA...', 'AwwwwA...', 'AwwBBBBBB', 'AAABwwwwB', '...BwwwwB', '...BwwwwB', '...BBBBBB'],
    colors: { A: INK, B: BLUE, w: LIGHT },
  },
  lens: {
    rows: ['.KKKK....', 'KwwwwK...', 'KwGGwK...', 'KwGGwK...', 'KwwwwK...', '.KKKKHH..', '.....HHH.', '......HHH', '.......HH'],
    colors: { K: INK, w: LIGHT, G: BLUE, H: INK },
  },
  braces: {
    rows: ['..KK...KK..', '.K.......K.', '.K.......K.', 'K....C....K', '.K.......K.', '.K.......K.', '..KK...KK..'],
    colors: { K: INK, C: BLUE },
  },
} as const

const FEATURES = [
  {
    icon: ICONS.seed,
    title: 'Same seed, same face',
    body: 'Pass any string. The same inputs and package version give the same SVG on every render, so there is no avatar table to keep.',
  },
  {
    icon: ICONS.box,
    title: 'Zero runtime dependencies',
    body: 'Nothing else gets installed with it. One small package, nothing extra to audit or keep up to date.',
  },
  {
    icon: ICONS.cloud,
    title: 'No network, no storage',
    body: 'Avatars are computed, not fetched. No avatar service, no image bucket, no account, and no request.',
  },
  {
    icon: ICONS.windows,
    title: 'Server or browser',
    body: 'Core rendering never touches window or the DOM. Render in Node and send the SVG, or draw it right in the page.',
  },
  {
    icon: ICONS.lens,
    title: 'Sharp at any size',
    body: 'Pixel styles are plain SVG shapes, so they stay crisp from a tiny chat bubble to a full profile header. No fonts are fetched.',
  },
  {
    icon: ICONS.braces,
    title: 'One typed function',
    body: 'ditherFace(seed, options) returns a string. ESM with TypeScript types, plus STYLES for building a style picker.',
  },
]

export function Features() {
  return (
    <section className="section features" id="features" aria-labelledby="features-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <p className="kicker">02 / Features</p>
            <h2 className="h2" id="features-title">
              Everything an avatar needs.
              <br />
              <em>Nothing it doesn’t.</em>
            </h2>
          </div>
          <p className="note">A small library that does one job well: turn a string into a face you can use anywhere.</p>
        </div>
        <ul className="features__grid">
          {FEATURES.map((f, i) => (
            <li key={f.title} className="feature">
              <div className="feature__top">
                <div className="feature__icon">
                  <PixelIcon rows={f.icon.rows} colors={f.icon.colors} scale={5} />
                </div>
                <span className="feature__n">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
