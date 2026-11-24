<img src="site/public/icon-512.png" width="72" height="72" alt="palletface pixel bloom logo">

# dither-face

**Deterministic pixel, dither, and geometric avatars. One seed, twelve styles, zero runtime dependencies.**

Turn a user ID into a standalone SVG, on the server or in the browser. No avatar service, image storage, account, or network request required. An independent, MIT-licensed sister project of [Palletism](https://palletism.art).

![Samples of all twelve avatar styles listed below](.github/preview.svg)

> **0.1 beta.** Install the preview with the `beta` dist-tag. Before 1.0, minor releases may change the API or avatar output. Pin an exact version when identities need to stay stable across upgrades.

## Quick start

After the beta is approved on npm:

```sh
npm install palletface@beta
```

```ts
import { ditherFace } from 'palletface'

const svg = ditherFace('user-123', {
  style: 'pixel-letter',
  name: 'Aditya',
  px: 80,
})

// Use as an image without inserting raw HTML.
const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
```

`svg` is a complete SVG string with an XML namespace, dimensions, and a viewBox. The same inputs produce the same output with the same package version in the tested runtimes. For the simplest call, `ditherFace('user-123')` uses `pixel-sprite` at 80px.

## Twelve styles

| `style` | Appearance | Display name used? |
| --- | --- | --- |
| `pixel-sprite` | Mirrored 8×8 creature with ink eyes | No |
| `pixel-letter` | 5×7 bitmap initial, shadow, and dithered background | Yes |
| `dither-orb` | Three-color radial glow made of dithered pixels | No |
| `pixel-landscape` | Tiny sky, sun, and layered hills | No |
| `pixelify-letter` | Bitmap initial over a two-tone checker | Yes |
| `geometric-tile` | Curved color tiles with a seeded palette and rotation | No |
| `random-contours` | Nested topographic lines with seeded shape, spacing, and count | No |
| `pixel-emotes` | Emoji-like pixel silhouettes with dithered shading | No |
| `mirrored-signal` | Symmetric 7×7 identicon with hollow terminals | No |
| `pixel-flora` | 16×16 fern, cactus, or wildflower with seeded shape and colors | No |
| `pixel-relic` | 16×16 key, lantern, or potion with chunky inventory-sprite highlights | No |
| `pixel-stamp` | Bitmap initial cut through a chipped block on a rounded square | Yes |

Use `STYLES` to populate a style picker. Saved `ascii-letter`, `ascii-field`, and `ascii-face` selections remain renderable through `ditherFace` and their direct exports.

`pixelFlora(seed, px)`, `pixelRelic(seed, px)`, and `pixelStamp(seed, px, name?)` are also available as named exports.

## Options

```ts
import { ditherFace, type DitherFaceOptions, type StyleSlug } from 'palletface'
```

| Input | Type | Default | Behavior |
| --- | --- | --- | --- |
| `seed` | `string` | Required | Stable input to the seeded design; empty and Unicode strings are valid |
| `style` | `StyleSlug` | `'pixel-sprite'` | A current style slug or a legacy ASCII slug |
| `px` | `number` | `80` | Positive finite width and height in CSS pixels |
| `name` | `string` | Seed | Initial for Pixel Letter, Pixelify Letter, Pixel Stamp, and legacy ASCII Letter. Seeded colors stay the same. |

Invalid seeds, names, sizes, and unknown styles throw descriptive errors. Initials use the first ASCII letter or digit after accent normalization. Names without one use `?`.

## Integrations

### Browser

```ts
const image = document.querySelector<HTMLImageElement>('#avatar')!
image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
image.alt = 'Aditya’s avatar'
```

Use your existing bundler, or run `npm run build:web` in this repository for the `DitherFace` browser global.

### Server-side rendering

```js
import { ditherFace } from 'palletface'

const svg = ditherFace('user-123', { style: 'pixel-emotes', px: 80 })
// Send as an SVG response with Content-Type: image/svg+xml,
// or encode it into an image's data URL in your HTML template.
```

Package verification exercises Node against the installed tarball. Core rendering does not use `window`, a DOM, or server APIs.

## Compatibility, privacy, and accessibility

- **ESM only**, with TypeScript declarations. CI tests Node 22 and 24.
- Pixel styles use SVG geometry. ASCII styles use a system monospace font stack, so glyph shape and layout can vary between platforms. No external font is fetched.
- This is deterministic art, **not cryptography or a uniqueness guarantee**. Hash collisions and visually similar avatars are possible. An avatar is not proof of identity.
- Use an opaque, stable ID. SVGs can reveal initials and generated design details, so keep emails, tokens, and secrets out of seeds.
- For an avatar next to a visible user name, `alt=""` often avoids repetition. Otherwise provide a meaningful label. Generated SVG strings do not include a user-facing accessible name; the embedding application owns it.
- Data URLs require `data:` in your application's `img-src` CSP. If your policy forbids them, serve the SVG from your own route.

## Run locally

Use Node 22.12+ or Node 24 and npm, then:

```sh
npm ci
npm run build:web
```

Open `playground/index.html` in your browser. `npm run sheet -- out-sheet` generates the reference SVG sheet, and `npm run check:all` runs the library and installed-package checks.

## Project

- [Contributing](CONTRIBUTING.md) · [Releasing](RELEASING.md) · [Security](SECURITY.md) · [MIT license](LICENSE)

dither-face grew from Palletism's avatar experiments, but is independently installable and usable in any application. Palletism's existing avatars are not automatically migrated by this package.
