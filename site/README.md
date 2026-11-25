# palletface site

The landing page and documentation for [palletface](https://github.com/puri-adityakumar/palletface), built with React and Vite and hosted on Cloudflare Pages.

The page renders avatars with the library source in `../src` through a Vite alias, so it always shows the styles and version of the commit it was built from. The displayed version comes from the root `package.json`.

## Develop

Use Node 22.12+ or Node 24.

```sh
cd site
npm ci
npm run dev        # http://localhost:5173/
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server for the landing page and `/docs/`. |
| `npm run prototype` | Open the throwaway design prototypes at `/prototype.html`. They are never deployed. |
| `npm run typecheck` | Typecheck the site and the library source it imports. |
| `npm run build` | Typecheck, then build the site into `dist/`. |
| `npm run preview` | Serve the built `dist/` locally. |

## Layout

- `index.html` and `src/main.tsx` are the entry points. `src/App.tsx` orders the sections.
- [`public/docs/guide.md`](public/docs/guide.md) is the source for the static docs pages and the Markdown at `/docs/guide.md`. `docs/markdown.ts` maps each top-level section to its HTML route with a shared sidebar. `public/llms.txt` links agents to the full guide. The docs default to dark mode and remember the reader's theme preference.
- `src/sections/` holds one component and one stylesheet per page section.
- `src/field/SeedField.tsx` draws the seed field on a canvas behind the hero, the sponsor panel, and the footer. Ink cells grow from the seed, paper cells show how many ink neighbours they have, and areas passed as `clear` or `solid` stay paper or ink.
- `src/components/` and `src/lib/` hold shared pieces: copy buttons, the seed input, pixel icons, avatar helpers, pixel reveals, and the page copy in `lib/content.ts`.
- `src/prototype/` and `prototype.html` are the five throwaway design prototypes the page grew from. Keep them out of production code. Their extra fonts are dev dependencies.

Keep claims in `src/lib/content.ts` and the sections in line with the package README.

The GitHub link in the nav shows the repo's star count from the public GitHub API, cached for an hour per tab. It stays hidden while the count is zero, while the repo is private, or when the API fails.

## Brand images

The landing page and docs share the pixel bloom in `src/assets/pixel-bloom.svg`, the Geist wordmark, and the colors and type styles in `src/styles/theme.css`.

| File | Use |
| --- | --- |
| `public/favicon.svg` | Browser tab icon. |
| `public/apple-touch-icon.png` | Home screen icon on iOS (180 × 180). |
| `public/icon-512.png` | Square icon for avatars and profiles (512 × 512). |
| `public/social-preview.png` | Link preview image (1280 × 640). Upload it in the repo's **Settings → General → Social preview**. |

## Deploy to Cloudflare Pages

The site builds from the full repository, because it imports the library from `../src`.

First-time setup in the Cloudflare dashboard (**Workers & Pages → Create → Pages → Connect to Git**):

| Setting | Value |
| --- | --- |
| Repository | `puri-adityakumar/palletface` |
| Production branch | `main` |
| Root directory | `site` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `22.12.0` |

Cloudflare installs dependencies from `site/package-lock.json` before the build. Every push to `main` deploys to production, and other branches get preview URLs.

To deploy by hand instead, build locally and upload `dist/` with Wrangler:

```sh
cd site
npm ci
npm run build
npx wrangler pages deploy dist --project-name palletface
```

`public/_headers` sets caching for hashed assets and a few security headers.

## After a release

Follow step 3 of [Verify and publish](../RELEASING.md#verify-and-publish) in the release runbook:

1. Check that `main` has the released version in the root `package.json`.
2. Check the install commands in `src/lib/content.ts` and `public/docs/guide.md`. Use `npm install palletface` once the stable release is on `latest`.
3. Deploy (a push to `main` does it), then open the live page and check the version, the install command, and that every style in the showcase renders.
