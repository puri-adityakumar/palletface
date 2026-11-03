# Preview verification — 2026-11-03

The integrated preview was tested in a dedicated ephemeral Blaxel sandbox on Debian 12, using the reviewed tracked source only. Credentials, Git metadata, ignored backups, and local dependency folders were not uploaded.

## Results

- **Node 24.22.2 / npm 11.19.1:** `npm ci` and `CI=1 npm run check:all` passed.
- **Node 22.23.4:** core checks, site/example typechecking, and real-package consumer verification passed.
- **114 tests in 13 Vitest files** passed on both Node versions. These include 40 pre-change design digests (only SVG definition identifiers canonicalized), 8 exact preview-output digests, core utilities, public API validation, React SSR, and release-guard tests.
- **38 browser checks passed; 2 intentionally skipped.** Chromium, Firefox, WebKit, and mobile Chromium covered URL restoration including empty seeds, initial selection, all eight renderers against Node output, input safety, SVG download bytes, manual-copy fallback, keyboard interaction, narrow layouts, assets, and server behavior.
- Native clipboard-read assertions run only on Chromium/Chromium mobile because permission APIs differ. Firefox/WebKit run the manual-copy fallback checks instead.
- **Real `npm pack` lifecycle passed:** 32 allowed tarball files, zero runtime dependencies, ESM imports, strict TypeScript consumer checks, Node example execution, and ESM/browser-bundle parity.
- Fresh sandbox dependency audit reported **0 vulnerabilities**. Local production-dependency audit also reported 0.
- Desktop and mobile screenshots were downloaded and inspected. Screenshots are test artifacts, not pixel-perfect regression baselines.

The initial browser run found that the size selector's label included its option text. An explicit `aria-labelledby` fixed it; the complete suite passed afterward. A subsequent screenshot-attachment-only test change passed its four-engine smoke run.

The passing full-suite source manifest is saved with local artifacts. Its SHA-256 was `2e0c28b71de6064a03b5de383ef7e17de4f596e843937d38be3d38f64876c82b` (74 tracked files before this verification note and the final documentation-only changes). Logs/reports are in ignored `out/blaxel-verification/`; they are not npm or repository artifacts.

## Limits

- Linux WebKit is not native Safari/macOS. Native Safari was not tested.
- This verifies representative inputs on tested engines, not a mathematical proof of cross-engine floating-point equivalence or avatar uniqueness.
- Hosted GitHub Actions, npm trusted publication, repository visibility changes, custom-domain DNS, and Cloudflare deployment were **not performed**.
- No package was published, branch pushed, PR created, or Palletism application changed.

Rerun `npm run check:all` after functional changes. Browser installation instructions and release prerequisites are in [RELEASING.md](RELEASING.md).
