# palletface — landing page

The marketing site for [palletface](https://github.com/puri-adityakumar/palletface):
Vite + React + TypeScript, GSAP ScrollTrigger for the two pinned sections, the
`palletface` library itself for every face on the page, and ascii.rest's
aurora-fjord piece as the full-screen sky. Structure, copy and interaction
details are the signed-off v4.2 mockup (`../out/landing-src.html`) translated
component-by-component; see `../out/research/` for the design decisions.

## Commands

```sh
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
```

## Deploy (Cloudflare Pages)

The repo lives in the parent project's account; the site deploys at a subdomain
of the parent domain. Two routes:

- **Dashboard:** connect the repo — root directory `site`, build command
  `npm run build`, output directory `dist`.
- **CLI:** `npx wrangler pages deploy dist` from this directory (config in
  `wrangler.toml`).

## Build-time numbers

`vite.config.ts` injects `__BUILD__` — the library version, its iife + gzip
sizes (computed from the installed bundle), and the GitHub star count via the
authenticated `gh` CLI (falls back to `null`; the pill then reads "github").
Nothing is hand-typed.

## Note on the library dependency

`palletface` is a `file:..` workspace dependency because npm's published
`beta` dist-tag (0.1.0-beta.3) predates the nine-style lineup. Switch to
`palletface@beta` (then `@latest`) once 0.2.0 publishes.
