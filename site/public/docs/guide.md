# palletface docs

`palletface` turns a string into a standalone SVG avatar in Node or the browser. It has zero runtime dependencies.

## Quick start

### Install

Use an ESM project. For Node, use 22.12+ or 24.

```sh
npm install palletface@beta
```

### Generate an SVG

Save as `avatar.mjs` and run `node avatar.mjs` to write `avatar.svg`.

```js
import { writeFileSync } from 'node:fs'
import { ditherFace as palletface } from 'palletface'

const svg = palletface('user-123', {
  style: 'pixel-letter',
  name: 'Ada',
  px: 80,
})

writeFileSync('avatar.svg', svg)
```

The snippets work with `@beta`. The avatars in these docs and in the [playground](/playground) come from this site's source build, which can include styles ahead of npm.

## Examples

Each snippet below runs when the docs are built, and the avatars under it are what it returns. To try your own seed, open the [playground](/playground).

The snippets use this import:

```js
import { ditherFace as palletface, STYLES } from 'palletface'
```

### Default avatar

Pass only a seed to get `pixel-sprite` at 80 px.

```js example
const svg = palletface('user-123')
```

### Choose a style

Set `style` to any slug from the [style list](/docs/styles/).

```js example
const svg = palletface('user-123', { style: 'dither-orb' })
```

### Set the size

`px` sets the width and height in CSS pixels.

```js example
const sizes = [24, 40, 64, 96]
const avatars = sizes.map((px) =>
  palletface('user-123', { style: 'pixel-landscape', px }),
)
```

### Draw an initial

Initial styles draw the first letter or digit of `name`. Accents are dropped, so `Élodie` draws `E`. The seed still picks the colors, and without a name the style uses the seed.

```js example
const names = ['Ada', 'Élodie', '42']
const avatars = names.map((name) =>
  palletface('user-123', { style: 'pixel-letter', name }),
)
```

### Every style for one seed

Loop over `STYLES` to show every style in your installed version.

```js example
const avatars = STYLES.map(({ slug }) =>
  palletface('user-123', { style: slug, px: 64 }),
)
```

### One style for many users

Use a stable user ID as the seed. Each user keeps the same avatar every time it renders.

```js example
const users = ['ada', 'kai', 'yuki', 'noor', 'tomás', 'mina']
const avatars = users.map((id) =>
  palletface(id, { style: 'pixel-flora' }),
)
```

To show an SVG in a page or return it from a server, see [Integrations](/docs/integrations/).
## API reference

### Options

Palletface exports `ditherFace`. The examples import it as `palletface`.

```ts
ditherFace(seed: string, options?: DitherFaceOptions): string
```

| Input | Type | Default | Behavior |
| --- | --- | --- | --- |
| `seed` | `string` | Required | Drives the design. Empty and Unicode strings are valid. |
| `style` | `StyleSlug` | `'pixel-sprite'` | Style slug from your installed version. |
| `px` | `number` | `80` | SVG width and height in CSS pixels. Must be finite and greater than zero. |
| `name` | `string` | Seed | Supplies the glyph for initial styles. The palette still comes from the seed. |

The return value has an SVG namespace, dimensions, and a `viewBox`. Invalid seed, options, name, or style types throw `TypeError`. Invalid sizes throw `RangeError`. An unknown style slug throws `Error`.

Initial styles use the first ASCII letter or digit after accent normalization. `Élodie` yields `E`. An explicit empty name or a name without a matching character yields `?`.

### Style picker

Use the exports from the installed package to build a picker. Each `STYLES` entry has a `slug`, `title`, `note`, and `draw(seed, px, name?)`.

```js
import { STYLES } from 'palletface'

const choices = STYLES.map(({ slug, title }) => ({ value: slug, label: title }))
```

TypeScript can import `DitherFaceOptions`, `StyleSlug`, and `AvatarStyle` from the package entry point.

### Stability

- The same inputs and package version produce the same SVG in supported runtimes. Pin the exact version with `npm install --save-exact palletface@beta` when appearance matters across deploys.
- Use an opaque, stable ID as the seed. Keep emails, tokens, and secrets out of seeds. Different seeds can produce identical or similar avatars.

## Styles

### Current styles

| Slug | Renderer export | Appearance | Uses name |
| --- | --- | --- | --- |
| `pixel-sprite` | `pixelSprite` | Mirrored creature | No |
| `pixel-letter` | `pixelLetter` | Bitmap initial on a dithered grid | Yes |
| `dither-orb` | `ditherOrb` | Dithered radial gradient | No |
| `pixel-landscape` | `pixelLandscape` | Sun and layered hills | No |
| `pixelify-letter` | `pixelifyLetter` | Bitmap initial on a checkerboard | Yes |
| `geometric-tile` | `geometricTile` | Curved color tiles | No |
| `random-contours` | `randomContours` | Topographic lines | No |
| `pixel-emotes` | `pixelEmotes` | Pixel silhouettes | No |
| `mirrored-signal` | `mirroredSignal` | Mirrored 7×7 identicon | No |
| `pixel-flora` | `pixelFlora` | Fern, cactus, or wildflower | No |
| `pixel-relic` | `pixelRelic` | Key, lantern, or potion | No |
| `pixel-stamp` | `pixelStamp` | Initial cut through a chipped stamp | Yes |

Direct renderers take `(seed, px)`. Initial renderers also accept `name` as a third argument.

### Legacy ASCII styles

The source registry keeps `ascii-letter`, `ascii-field`, and `ascii-face` out of `STYLES`. Saved slugs still render through `ditherFace` or the `asciiLetter`, `asciiField`, and `asciiFace` exports. Only `ascii-letter` uses `name`. ASCII glyphs use system monospace fonts and can look different across platforms.

## Integrations

### Browser with a bundler

Add `<img id="avatar" width="80" height="80" alt="Ada's avatar">` to the page.

```js
import { ditherFace as palletface } from 'palletface'

const svg = palletface('user-123', { style: 'pixel-letter', name: 'Ada' })
document.getElementById('avatar').src =
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
```

If your Content Security Policy disallows `data:` in `img-src`, use a URL for the SVG on your own server. Use `alt=""` when a visible name already labels the avatar.

### Browser without a bundler

Serve `node_modules/palletface/dist/dither-face.js` next to your HTML. The file exposes `DitherFace`.

```html
<img id="avatar" width="80" height="80" alt="Ada's avatar">
<script src="./dither-face.js"></script>
<script>
  const { ditherFace: palletface } = DitherFace
  const svg = palletface('user-123')
  document.getElementById('avatar').src =
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
</script>
```

### Server response

Return the SVG as `image/svg+xml`. This example uses the Fetch `Response` API.

```js
import { ditherFace as palletface } from 'palletface'

export function avatarResponse(userId) {
  return new Response(palletface(userId), {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
  })
}
```
