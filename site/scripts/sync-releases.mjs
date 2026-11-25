// Refreshes site/src/lib/releases.ts from GitHub with every stable release. Needs the gh CLI.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const json = execFileSync('gh', [
  'api',
  'repos/puri-adityakumar/palletface/releases',
  '--jq',
  'map(select(.prerelease | not) | {tag_name, name, published_at, prerelease, html_url, body})',
], { encoding: 'utf8' })

const releases = JSON.parse(json)
const header = `/** Stable GitHub releases, bundled so the changelog works while the repo is private.
 * Refresh with \`npm run sync:releases\` (uses gh). The page also tries the public API at runtime.
 */
export type Release = {
  tag_name: string
  name: string | null
  published_at: string
  prerelease: boolean
  html_url: string
  body: string | null
}

export const RELEASES: Release[] = `
writeFileSync(new URL('../src/lib/releases.ts', import.meta.url), header + JSON.stringify(releases, null, 2) + '\n')
console.log(\`Bundled \${releases.length} release(s).\`)
