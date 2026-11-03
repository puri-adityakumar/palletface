import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
const valid = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag ?? '')
if (!valid) throw new Error(`Expected release tag vMAJOR.MINOR.PATCH; received ${tag ?? '(none)'}`)
if (tag.slice(1) !== version) throw new Error(`Tag ${tag} does not match package version ${version}`)
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()
if (status) throw new Error('Checkout has tracked modifications; release requires a clean checkout')
console.log(`PASS release gate: ${tag} matches package version ${version}; tracked checkout clean`)
