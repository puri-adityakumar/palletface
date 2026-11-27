# palletface site

The landing page and documentation for [palletface](https://github.com/puri-adityakumar/palletface), built with React and Vite and hosted on Cloudflare Workers at [palletface.palletism.art](https://palletface.palletism.art).

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
| `npm run sync:releases` | Refresh the changelog's bundled releases from GitHub. Needs the `gh` CLI. |

## Layout

- `index.html` and `src/main.tsx` are the entry points. `src/App.tsx` orders the sections.
- [`public/docs/guide.md`](public/docs/guide.md) is the source for the static docs pages and the Markdown at `/docs/guide.md`. `docs/markdown.ts` maps each top-level section to its HTML route with a shared sidebar. Code blocks fenced with `` ```js example `` run when the docs build, and the avatars they draw appear under them. A table whose first column is `Slug` gets a preview column drawn from each slug. `public/llms.txt` links agents to the full guide. The docs default to dark mode and remember the reader's theme preference.
- `src/sections/` holds one component and one stylesheet per page section.
- `src/sections/People.tsx` shows replies to the launch post on X, listed in `src/lib/replies.ts`. The photos in `src/assets/people/` are copies of each person's X profile photo, so the page loads nothing from X.
- The sponsor list in the Sponsor section shows the GitHub logins in `SPONSORS` in `src/lib/content.ts`, each with a face drawn from the login, then open slots that link to GitHub Sponsors. The support toast thanks each sponsor by name too. The page promises sponsors a spot in the package README, so add each new sponsor to its Sponsor section as well.
- `src/sections/SupportToast.tsx` is the face in the bottom-right corner that asks for a star or a sponsor. It stays hidden while the hero or the Sponsor section is on screen, and **Not now** hides it for 30 days.
- `src/pages/` holds the playground at `/playground` and the changelog at `/changelog`. `src/App.tsx` picks the page from the path. The changelog shows only stable releases. It starts from the ones bundled in `src/lib/releases.ts` and refreshes them from the GitHub API when it can, skipping pre-releases.
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
| `public/og.png` | Link preview image for the site and docs (1200 × 630). |
| `../.github/social-preview.png` | Link preview image for the GitHub repo (1280 × 640). Upload it in the repo's **Settings → General → Social preview**. |

## Deploy to Cloudflare

The site is a Cloudflare Worker named `palletface` that serves the built `dist/` folder as static assets. [`wrangler.jsonc`](wrangler.jsonc) holds its settings: the `palletface.palletism.art` custom domain, no `workers.dev` address, and single-page app mode, which serves `index.html` for paths without a file so `/playground` and `/changelog` load directly. `public/_headers` sets caching for hashed assets and a few security headers.

To deploy by hand, build and upload with Wrangler:

```sh
cd site
npm ci
npm run build
npx wrangler deploy
```

To deploy on every push to `main`, connect the repository once in the Cloudflare dashboard (**Workers & Pages → palletface → Settings → Builds → Connect**):

| Setting | Value |
| --- | --- |
| Repository | `puri-adityakumar/palletface` |
| Production branch | `main` |
| Root directory | `site` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

The site builds from the full repository, because it imports the library from `../src`. Cloudflare installs dependencies from `site/package-lock.json` before the build.

Pull request builds use the **Previews Base** tab on the same page. Set its root directory to `site` as well, with the build command `npm run build` and the Preview command `npx wrangler preview`. Cloudflare copies these settings into each branch on its first preview build, so later changes only reach branches that have not built yet. Deleting the Preview with `npx wrangler preview delete` does not reset a branch's copy.

## After a release

Follow step 3 of [Verify and publish](../RELEASING.md#verify-and-publish) in the release runbook:

1. Check that `main` has the released version in the root `package.json`.
2. Run `npm run sync:releases` so the changelog bundles the new release, and commit `src/lib/releases.ts`.
3. Deploy (a push to `main` does it), then open the live page and check the version, the install command, and that every style in the showcase renders.
