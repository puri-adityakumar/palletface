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

## ascii-letter dot migration (Q-001)

The Stage 1 execution found `ascii-letter` consumed its dot PRNG only on cells the glyph did not cover, so changing `name` shifted dots outside the glyph. The approved fix consumes exactly one dot decision for every 9x9 grid cell and overlays the glyph afterwards. This intentionally changes existing `ascii-letter` dot patterns once; seeded background/character/dot/accent picks, glyph shape, clip IDs, and the other seven styles are unchanged.

- Historical baseline fixture: [src/fixtures/baseline.json](../src/fixtures/baseline.json) remains byte-unchanged; regression tests reproduce its old ascii-letter digests with a test-local legacy oracle and separately verify the new per-cell mask.
- Exact preview fixture (raw SVG SHA-256): old `449be0cee10b1d7eca10002b468f0a51bcaa6571ecb2202947939bf132129bec` → new `ebfcb2cf41b1437e9637deb4304ed20555a84d5f12a1739813c78af8514bade8`. The old/new pair is recorded in [src/fixtures/preview.json](../src/fixtures/preview.json).
- README preview `docs/preview.svg` regenerated from the fixed library: old file SHA-256 `b1371c7cd0259913c403563d352795b5537a742deabba3a2da93aafea6911102` → new `44875f64ede83cdde0c731f444e70e9a865ca0fffafd5b3792c5e5c3512a4eb5`.
- Test-local independent PRNG/oracle coverage: [tests/helpers/ascii-letter-oracle.ts](../tests/helpers/ascii-letter-oracle.ts), exercised by `src/styles/ascii-letter.test.ts` and `src/regression.test.ts`.

Rerun `npm run check:all` after functional changes. Browser installation instructions and release prerequisites are in [RELEASING.md](RELEASING.md).
