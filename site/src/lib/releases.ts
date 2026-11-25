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

export const RELEASES: Release[] = [
  {
    "body": "## Highlights\n\n- **First stable release.** palletface turns any string, such as a user ID, into a deterministic SVG avatar. It runs on the server or in the browser, makes no network requests, and has zero runtime dependencies.\n- **Twelve styles.** Seven are new since the beta: `geometric-tile`, `random-contours`, `pixel-emotes`, `mirrored-signal`, `pixel-flora`, `pixel-relic`, and `pixel-stamp`. Each one also has its own renderer export, such as `pixelFlora`. ([#3](https://github.com/puri-adityakumar/palletface/pull/3), [#5](https://github.com/puri-adityakumar/palletface/pull/5))\n- **Avatars stay put.** From `1.0.0` on, minor and patch releases never change existing avatars. Only a major release can.\n- **Docs and playground** at [palletface.palletism.art](https://palletface.palletism.art): a quick start, examples, the API reference, every style, integrations, and a [playground](https://palletface.palletism.art/playground) to try any seed. ([#7](https://github.com/puri-adityakumar/palletface/pull/7))\n\n## Upgrade notes\n\nIf you used `0.2.0-beta`, the public names changed. ([#9](https://github.com/puri-adityakumar/palletface/pull/9))\n\n| Beta | 1.0.0 |\n| --- | --- |\n| `ditherFace()` | `palletface()` |\n| `DitherFaceOptions` | `PalletfaceOptions` |\n| `DitherFace` browser global | `Palletface` |\n| `dist/dither-face.js` | `dist/palletface.js` |\n\n```js\n// Before\nimport { ditherFace } from 'palletface'\nconst svg = ditherFace('user-123', { style: 'dither-orb' })\n\n// After\nimport { palletface } from 'palletface'\nconst svg = palletface('user-123', { style: 'dither-orb' })\n```\n\n- Avatars from the eight beta styles do not change. The same seed, style, size, and name draw the same SVG as in `0.2.0-beta`.\n- `STYLES` now lists the twelve current styles in a new order. The ASCII styles (`ascii-letter`, `ascii-field`, and `ascii-face`) are no longer in `STYLES`, but `palletface()` still accepts their slugs. If you pick a style by its position in `STYLES`, store the slug instead, or some users will get a different style.\n\n## Full changelog\n\n[Compare with the previous release](https://github.com/puri-adityakumar/palletface/compare/v0.2.0-beta...v1.0.0)\n",
    "html_url": "https://github.com/puri-adityakumar/palletface/releases/tag/v1.0.0",
    "name": "v1.0.0",
    "prerelease": false,
    "published_at": "2026-11-25T20:09:36Z",
    "tag_name": "v1.0.0"
  }
]
