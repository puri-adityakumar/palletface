import { PixelIcon } from '../components/Pixel'
import './features.css'

const ICONS = {
  seed: {
    rows: ['....LL...', '...LGGL..', '.LL.LGL..', 'LGGL.SL..', '.LGGLS...', '..LLSS...', '....S....', '.DDDDDDD.', '..DBBBD..'],
    colors: { L: '#3f6b3a', G: '#8cbf6a', S: '#4f7a3e', D: '#7a4a32', B: '#d08257' },
  },
  box: {
    rows: ['OOOOOOOOO', 'OtttOtttO', 'OOOOOOOOO', 'OswwwwwsO', 'OswwOwwsO', 'OswOwOwsO', 'OswOwOwsO', 'OswwOwwsO', 'OOOOOOOOO'],
    colors: { O: '#5c4330', t: '#e7b977', s: '#c98b52', w: '#fff8e6' },
  },
  cloud: {
    rows: ['........R', '...ccc.R.', '..cwwwR..', '.ccwwRwc.', 'cwwwRwwwc', 'cwwRwwwwc', '.cRccccc.', '.R.......', 'R........'],
    colors: { c: '#5d77b8', w: '#e4ecfb', R: '#e8553e' },
  },
  windows: {
    rows: ['AAAAAA...', 'AwwwwA...', 'AwwwwA...', 'AwwBBBBBB', 'AAABwwwwB', '...BwwwwB', '...BwwwwB', '...BBBBBB'],
    colors: { A: '#2b4fa5', B: '#e8553e', w: '#fff8e6' },
  },
  lens: {
    rows: ['.KKKK....', 'KwwwwK...', 'KwGGwK...', 'KwGGwK...', 'KwwwwK...', '.KKKKHH..', '.....HHH.', '......HHH', '.......HH'],
    colors: { K: '#302d26', w: '#cfe3ea', G: '#5f9b4b', H: '#8c5c3b' },
  },
  braces: {
    rows: ['..KK...KK..', '.K.......K.', '.K.......K.', 'K....C....K', '.K.......K.', '.K.......K.', '..KK...KK..'],
    colors: { K: '#302d26', C: '#e8553e' },
  },
} as const

const FEATURES = [
  {
    icon: ICONS.seed,
    tint: '#e1e8c9',
    title: 'Same seed, same face',
    body: 'Pass any string. The same inputs and package version give the same SVG on every render, so there is no avatar table to keep.',
  },
  {
    icon: ICONS.box,
    tint: '#f1e4ce',
    title: 'Zero runtime dependencies',
    body: 'Nothing else gets installed with it. One small package, nothing extra to audit or keep up to date.',
  },
  {
    icon: ICONS.cloud,
    tint: '#e0e7f3',
    title: 'No network, no storage',
    body: 'Avatars are computed, not fetched. No avatar service, no image bucket, no account, and no request.',
  },
  {
    icon: ICONS.windows,
    tint: '#f6e1d9',
    title: 'Server or browser',
    body: 'Core rendering never touches window or the DOM. Render in Node and send the SVG, or draw it right in the page.',
  },
  {
    icon: ICONS.lens,
    tint: '#e0ebeb',
    title: 'Sharp at any size',
    body: 'Pixel styles are plain SVG shapes, so they stay crisp from a tiny chat bubble to a full profile header. No fonts are fetched.',
  },
  {
    icon: ICONS.braces,
    tint: '#efe6f1',
    title: 'One typed function',
    body: 'ditherFace(seed, options) returns a string. ESM with TypeScript types, plus STYLES for building a style picker.',
  },
]

export function Features() {
  return (
    <section className="features" id="features" aria-labelledby="features-title">
      <div className="wrap">
        <div className="section-head">
          <div>
            <p className="label eyebrow">
              <span>02</span> / Features
            </p>
            <h2 className="section-title features__title" id="features-title">
              Everything an avatar needs<b>.</b>
              <br /> <em>Nothing it doesn’t</em>
              <b>.</b>
            </h2>
          </div>
          <p className="section-note">A tiny library that does one job well: turn a string into a face you can use anywhere.</p>
        </div>
        <ul className="features__grid">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature">
              <div className="feature__icon" style={{ backgroundColor: f.tint }}>
                <PixelIcon rows={f.icon.rows} colors={f.icon.colors} scale={5} />
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
