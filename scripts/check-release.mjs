import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version
const tag = process.argv[2] ?? process.env.RELEASE_TAG
const valid = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag ?? '')
if (!valid) throw new Error(`Expected release tag vMAJOR.MINOR.PATCH; received ${tag ?? '(none)'}`)
if (tag.slice(1) !== version) throw new Error(`Tag ${tag} does not match package version ${version}`)
const head = git('rev-parse', 'HEAD')
const taggedCommit = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`)
if (taggedCommit !== head) throw new Error(`Checkout HEAD does not match tag ${tag}`)
git('merge-base', '--is-ancestor', head, 'refs/remotes/origin/main')
if (git('status', '--porcelain')) throw new Error('Release requires a clean checkout, including untracked files')
console.log(`PASS release gate: ${tag} matches package version ${version}; ${head} is on main; checkout clean`)
