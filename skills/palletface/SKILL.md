---
name: palletface
description: Generate deterministic SVG avatars and identicons with the palletface npm package. Use when a user asks to integrate Palletface, create pixel-art avatars from stable IDs or names, add generated profile-image fallbacks, build a Palletface style picker, or export seeded SVG avatars.
license: MIT
---

# Palletface

`palletface(seed, options?)` returns a complete SVG string. Rendering is synchronous and requires no DOM, network, or runtime dependencies. Use the named ESM export from `palletface`. Follow the project's package manager when adding the dependency, for example `npm install palletface`.

## Generate an avatar

Use an opaque, stable string ID for the seed. Keep the seed, style, size, and any display name consistent between server and client and across sessions. Use public IDs or other non-sensitive strings for seeds. Existing integrations should preserve their saved seed and style so users keep their avatar.

```js
import { palletface } from 'palletface'

const px = 48
const svg = palletface('user-123', { style: 'pixel-letter', name: 'Élodie', px })
const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
```

- `seed` accepts any string, including empty and Unicode strings. Different seeds can produce similar avatars, so use the original ID for identity checks.
- `px` sets the square SVG dimensions. It defaults to `80` and accepts any positive finite number.
- `style` defaults to `pixel-sprite`. Use `STYLES` from the installed package to populate a picker with each entry's `slug` and `title`. TypeScript can import `PalletfaceOptions` and `StyleSlug`.
- `name` supplies a glyph for `pixel-letter`, `pixelify-letter`, `pixel-stamp`, and legacy `ascii-letter`. The first ASCII letter or digit after accent normalization wins. The renderer uses the seed when `name` is omitted and `?` when there is no matching character. The seed still determines the palette.

| Look | Styles |
| --- | --- |
| Pixel art | `pixel-sprite` for mirrored creatures, `pixel-emotes` for expressive silhouettes, `pixel-relic` for inventory sprites |
| Initials | `pixel-letter` for dithering, `pixelify-letter` for a checker, `pixel-stamp` for a cutout |
| Scenery | `pixel-landscape` for layered hills, `pixel-flora` for tiny plants |
| Abstract | `dither-orb` for a radial glow, `geometric-tile` for curved tiles, `random-contours` for topography, `mirrored-signal` for symmetric identicons |

Preserve saved `ascii-letter`, `ascii-field`, and `ascii-face` selections. They remain renderable but are outside `STYLES`. ASCII glyphs use system fonts and can vary in appearance across platforms.

## Embed or save the SVG

- **Image or fallback** — Assign the encoded `src` above to an `<img>`. Use `alt=""` when a visible name already labels the image, or supply meaningful alt text when the avatar conveys identity on its own. Generate a fallback where the app already handles missing profile images.
- **Server route** — If the app's CSP excludes `data:` in `img-src`, use a same-origin image URL if allowed by that policy. Return the generated SVG with `Content-Type: image/svg+xml; charset=utf-8`. Keep the app's existing authorization rules for profile data and validate inputs from requests before rendering. For example, restrict a public style parameter to the styles the app offers and bound the dimensions to what the UI supports.
- **Static asset** — Write the returned string directly to a UTF-8 `.svg` file. In Node, use `writeFile` from `node:fs/promises`. Use the package to render the requested file and share its path.
- **Browser script without a bundler** — Serve the package's `dist/palletface.js` as a classic script, then call `Palletface.palletface(seed, options)`.

When debugging, check the installed package version, the exact seed and options, and whether the browser permits the image source. For an asset or integration change, render a representative seed and verify the output at the requested size. For deterministic fallbacks, confirm repeated calls with the same inputs produce identical SVG strings.

See the [API reference](https://palletface.palletism.art/docs/api-reference/), [style catalog](https://palletface.palletism.art/docs/styles/), and [integration examples](https://palletface.palletism.art/docs/integrations/).
