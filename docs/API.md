# API reference

## `ditherFace(seed, options?)`

Returns a standalone SVG string. Defaults: `{ style: 'pixel-sprite', px: 80 }`. No network, DOM, external font download, clock, or system randomness is used to generate avatars.

```ts
import { ditherFace, type DitherFaceOptions, type StyleSlug } from 'dither-face'

const style: StyleSlug = 'pixel-letter'
const options: DitherFaceOptions = { style, name: 'Élodie', px: 64 }
const svg: string = ditherFace('user-42', options)
```

- **seed**: a required string. Empty strings, punctuation, and Unicode are valid. Different seeds may hash to the same state; this is not a cryptographic identity system.
- **style**: an optional `StyleSlug`. Unknown slugs throw and list the valid choices. Missing style selects `pixel-sprite`.
- **px**: an optional positive finite number, default 80. Fractions are accepted; the viewBox and seeded design do not depend on size.
- **name**: an optional string, defaulting to the seed. Only `pixel-letter`, `ascii-letter`, and `pixelify-letter` use it. It chooses the first ASCII letter or digit after NFD accent normalization, uppercased. When none exists, the glyph is `?`. It does not affect seeded background/color choices.

Non-string seeds and supplied names, invalid sizes, and unknown styles are errors. Do not depend on an exact error message: use it for diagnosis, not program control. Inputs from JavaScript/JSON still need application-level validation; TypeScript types are not a security boundary.

## Direct renderers

Non-letter renderers take `(seed: string, px: number) => string`:

- `pixelSprite`
- `ditherOrb`
- `pixelLandscape`
- `asciiField`
- `asciiFace`

Letter renderers take `(seed: string, px: number, name?: string) => string`:

- `pixelLetter`
- `asciiLetter`
- `pixelifyLetter`

Unlike `ditherFace`, direct renderers require an explicit size. They apply the same seed/size/name validation. Use the convenience API unless you have a reason to import a specific renderer.

## `STYLES`

A readonly, sheet-ordered registry with `slug`, `title`, `note`, and `draw`. Do not mutate it or its entries.

```ts
import { STYLES } from 'dither-face'

for (const style of STYLES) {
  const svg = style.draw('user-42', 80, 'Élodie')
  console.log(style.slug, svg.length)
}
```

`draw` uniformly accepts an optional name; renderers for non-letter styles ignore it. Registry order is the display order shown in the README and site.

## Low-level exports

Existing seed/hash helpers, palettes, bitmap font helpers, and SVG grid primitives remain exported for preview compatibility. These are advanced building blocks, not a promise that arbitrary input is safe to concatenate into SVG.

In particular, `rect`, `disc`, and `asciiGrid` accept trusted colors, IDs, or SVG fragments. `esc` escapes XML **text content**, not quoted attributes or URLs. `disc` without an explicit ID uses a process-local counter and is not itself byte-deterministic. The eight renderers pass their own deterministic IDs.

Prefer the validated high-level renderers for untrusted seeds and names. Low-level utility APIs may evolve in preview minor releases.

## Output stability

- The same complete input (seed, style, name, size), package version, and supported runtime produces repeatable output. Regression fixtures pin representative cases.
- Seeds alone do not identify a design independently of the selected style/name and package version.
- 0.x minor releases may change the API or SVG output; patch releases aim to avoid appearance changes except documented bug fixes. Pin an **exact version**, not a caret range, if persistent identity matters.
- A future stable major release should preserve existing seeded appearance within that major, with any exceptions documented. That is a future commitment, not a retrospective guarantee for this preview.
- Floating-point calculations are tested on supported engines, not mathematically proven bit-identical on every JavaScript engine. ASCII glyph appearance depends on installed fonts even when SVG bytes agree.
- Repeated instances with identical deterministic definition IDs intentionally share identical geometry/gradients. Namespaced IDs avoid cross-style conflicts, but the library does not promise globally unique instance IDs or cryptographic collision resistance.

## SVG embedding

The recommended cross-framework approach is an image data URL:

```js
const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
```

Alternatively serve SVG from a route with `Content-Type: image/svg+xml`. Keep labels in your application, and never insert arbitrary user-supplied SVG/HTML alongside the library's generated output. See the README for CSP, privacy, and accessibility guidance.
