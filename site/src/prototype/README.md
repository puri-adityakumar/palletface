# Landing page prototypes (throwaway)

> **Decision (2026-11-24):** direction **A, seed field** is the real landing page. It lives in
> `site/src` (entry `site/index.html`). Direction C, meadow, was built out first and is kept on
> the branch `droid/create-new-landing-page` (tag `deprecated/meadow-landing-page`). All five
> variants stay here as reference for pieces to borrow later. Nothing in this folder ships;
> `vite build` only builds `index.html`.

Five radically different landing page directions for palletface, switchable
with `?variant=A` … `?variant=E` or the floating bar (← and → keys also work).
This is prototype code: no tests, minimal error handling. Pick a direction,
then rebuild it properly; do not ship this folder.

```sh
cd site
npm install
npm run prototype   # opens http://localhost:5173/prototype.html (the real page is at /)
```

Avatars come from the library source in `../src` through a Vite alias, so all
twelve styles on `main` render.

| Key | Folder | Direction |
| --- | --- | --- |
| A | `variants/field` | seed field: a full-bleed pixel field generated from the seed |
| B | `variants/plotter` | plotter: graph paper and a plot head drawing each avatar |
| C | `variants/meadow` | meadow: a living dithered pixel world, Palletism homage |
| D | `variants/signal` | signal: loud mono poster with glitch bands and a live REPL |
| E | `variants/catalog` | catalog: calm editorial specimen with bordered tiles |

Shared helpers live in `lib/`: `Face` (an avatar as an image), `Pixelate`
and `usePixelSteps` (pixelated-to-crisp reveals for any element),
`DitherBand` (animated Bayer dither transitions), hooks, and shared copy.
