/** Stable GitHub releases, bundled so the changelog works while the repo is private.
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

export const RELEASES: Release[] = []
