/** Shared facts and copy, so every variant states the same true things. */
import pkg from '../../../../package.json'
import { STYLES } from 'palletface'

export const VERSION: string = pkg.version
export const STYLE_COUNT = STYLES.length
export const INSTALL = 'npm install palletface'

export const LINKS = {
  github: 'https://github.com/puri-adityakumar/palletface',
  docs: 'https://github.com/puri-adityakumar/palletface#readme',
  npm: 'https://www.npmjs.com/package/palletface',
  issues: 'https://github.com/puri-adityakumar/palletface/issues',
  palletism: 'https://palletism.art',
} as const

export const TAGLINE = 'Deterministic pixel, dither, and geometric avatars.'
export const PITCH = `One seed, ${STYLE_COUNT} styles, zero runtime dependencies.`
export const LEDE =
  'Turn a user ID into a standalone SVG, on the server or in the browser. No avatar service, image storage, account, or network request required.'

export const QUICK_START = `import { palletface } from 'palletface'

const svg = palletface('user-123', {
  style: 'pixel-letter',
  name: 'Aditya',
  px: 80,
})

img.src = \`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(svg)}\``

export const FACTS = [
  { label: 'styles', value: String(STYLE_COUNT) },
  { label: 'runtime dependencies', value: '0' },
  { label: 'network requests', value: '0' },
  { label: 'output', value: 'svg string' },
  { label: 'runs on', value: 'node + browser' },
  { label: 'types', value: 'esm + ts' },
  { label: 'license', value: 'mit' },
] as const

/** Seeds that read as people. Unicode on purpose: any string is a valid seed. */
export const SAMPLE_SEEDS = ['ada', 'kai', 'yuki', 'élodie', 'marcus', 'rhea', 'quinn', 'zeke', 'noor', 'tomás', 'aditya', 'mina'] as const

export const PROVENANCE = 'An independent, MIT-licensed sister project of Palletism.'
