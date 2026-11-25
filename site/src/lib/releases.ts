/** GitHub releases, bundled so the changelog works while the repo is private.
 * Refresh with `npm run sync:releases` (uses gh). The page also tries the public API at runtime.
 */
export type Release = {
  tag_name: string
  name: string | null
  published_at: string
  prerelease: boolean
  html_url: string
  body: string | null
}

export const RELEASES: Release[] = [
  {
    "body": "This beta updates the project’s release and contribution process. Install it with `npm install palletface@beta`.\n\n## Highlights\n\n- Added a [release guide](https://github.com/puri-adityakumar/palletface/blob/v0.2.0-beta/RELEASING.md) covering versioning, package verification, and staged npm publishing. The release workflow now defaults to the reviewed `main` branch. [#2](https://github.com/puri-adityakumar/palletface/pull/2)\n- Updated the GitHub issue and pull request templates to clarify what to include in reports and contributions.\n\n## Full changelog\n\n[Compare with v0.1.0-beta.3](https://github.com/puri-adityakumar/palletface/compare/v0.1.0-beta.3...v0.2.0-beta)\n",
    "html_url": "https://github.com/puri-adityakumar/palletface/releases/tag/v0.2.0-beta",
    "name": "v0.2.0-beta",
    "prerelease": true,
    "published_at": "2026-11-24T08:43:40Z",
    "tag_name": "v0.2.0-beta"
  }
]
