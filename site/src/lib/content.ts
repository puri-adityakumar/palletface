/** Facts and copy for the landing page. Keep every claim in line with the package README. */
import pkg from '../../../package.json'
import { STYLES } from 'palletface'

export const VERSION: string = pkg.version
export const STYLE_COUNT = STYLES.length
export const INSTALL = 'npm install palletface'

const REPO = 'https://github.com/puri-adityakumar/palletface'
export const REPO_API = 'https://api.github.com/repos/puri-adityakumar/palletface'

export const LINKS = {
  github: REPO,
  docs: `${REPO}#readme`,
  releases: `${REPO}/releases`,
  issues: `${REPO}/issues`,
  license: `${REPO}/blob/main/LICENSE`,
  contributing: `${REPO}/blob/main/CONTRIBUTING.md`,
  npm: 'https://www.npmjs.com/package/palletface',
  sponsor: 'https://github.com/sponsors/puri-adityakumar',
  author: 'https://github.com/puri-adityakumar',
  palletism: 'https://palletism.art',
} as const

export const QUICK_START = `import { ditherFace } from 'palletface'

const svg = ditherFace('user-123', {
  style: 'pixel-letter',
  name: 'Aditya',
  px: 80,
})

img.src = \`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(svg)}\``

/** The `ditherFace` options, with the defaults from the package source. */
export const OPTIONS = [
  { name: 'style', controls: `Which of the ${STYLE_COUNT} styles to draw`, fallback: "'pixel-sprite'" },
  { name: 'px', controls: 'Size in CSS pixels', fallback: '80' },
  { name: 'name', controls: 'The initial in Letter and Stamp styles', fallback: 'seed' },
] as const

/** Seeds that read as people. Unicode on purpose: any string is a valid seed. */
export const SAMPLE_SEEDS = ['ada', 'kai', 'yuki', 'élodie', 'marcus', 'rhea', 'quinn', 'zeke', 'noor', 'tomás', 'aditya', 'mina'] as const

export const PROVENANCE = 'A sister project of Palletism.'
