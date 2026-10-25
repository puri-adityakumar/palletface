# dither-face

Deterministic seeded SVG avatars — pixel and ascii faces picked from a user id, so they never change between renders.

## API

```bash
npm install dither-face
```

Draw one avatar as a standalone `<svg>` string. The same seed always yields the same face — no `Math.random` anywhere, so server and client agree byte for byte:

```js
import { ditherFace } from 'dither-face'

const svg = ditherFace('user-123', { style: 'pixel-landscape', px: 80 })
```

Options (both optional): `style` — one of the slugs below, default `'pixel-sprite'`; `px` — box size in css pixels, default `80`. An unknown slug throws, listing the valid ones.

The eight styles, in sheet order:

| slug | look |
| --- | --- |
| `pixel-sprite` | a mirrored 8x8 creature with ink eyes — no letter, pure identity |
| `pixel-letter` | the initial in a 5x7 bitmap font with a colored drop shadow |
| `dither-orb` | a three-color radial glow rendered as chunky dithered pixels |
| `pixel-landscape` | a tiny 16x16 scene: dithered sky, sun, two hills |
| `ascii-letter` | the initial drawn with one random character on a sprinkled dot field |
| `ascii-field` | seeded value noise mapped to a density ramp — a glow rendered in text |
| `ascii-face` | a kaomoji assembled from random brackets, eyes and a mouth |
| `pixelify-letter` | the pixel-font initial on a two-tone checker |

Each look is also exported directly (`pixelSprite`, `pixelLetter`, `ditherOrb`, `pixelLandscape`, `asciiLetter`, `asciiField`, `asciiFace`, `pixelifyLetter` — each `(seed, px) => svg`), and the `STYLES` registry carries them in sheet order with `slug`, `title`, `note` and `draw` — which is what `npm run sheet` lays out into `out-sheet/sheet.svg`.

