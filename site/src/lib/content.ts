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
  docs: '/docs/',
  releases: `${REPO}/releases`,
  issues: `${REPO}/issues`,
  license: `${REPO}/blob/main/LICENSE`,
  contributing: `${REPO}/blob/main/CONTRIBUTING.md`,
  npm: 'https://www.npmjs.com/package/palletface',
  sponsor: 'https://github.com/sponsors/puri-adityakumar',
  author: 'https://github.com/puri-adityakumar',
  palletism: 'https://palletism.art',
  x: 'https://x.com/adityawaslost',
  skill: 'https://skills.sh/puri-adityakumar/palletface/palletface',
} as const

/** Installs the agent skill in skills/palletface, as in the package README. */
export const SKILL_INSTALL = 'npx skills add puri-adityakumar/palletface --skill palletface'

/** GitHub logins of current sponsors, oldest first. Each one gets a face in the row under the showcase. */
export const SPONSORS: readonly string[] = []

export const AVATAR_IMPORT = `import { palletface } from 'palletface'`

export const QUICK_START = `${AVATAR_IMPORT}

const svg = palletface('user-123')`

/** The example strip: three seeds per style, in style order. */
export const SHOWCASE_SEEDS = [
  'ada', 'kai', 'yuki', 'élodie', 'marcus', 'rhea', 'quinn', 'zeke', 'noor', 'tomás', 'aditya', 'mina',
  'sol', 'ivo', 'priya', 'otto', 'lena', 'ravi', 'juno', 'amara', 'felix', 'hana', 'bo', 'zara',
  'leo', 'iris', 'omar', 'saga', 'theo', 'nia', 'kenji', 'inès', 'arlo', 'maya', 'dev', 'lior',
] as const

/** Seeds that read as people. Unicode on purpose: any string is a valid seed. */
export const SAMPLE_SEEDS = ['ada', 'kai', 'yuki', 'élodie', 'marcus', 'rhea', 'quinn', 'zeke', 'noor', 'tomás', 'aditya', 'mina'] as const
