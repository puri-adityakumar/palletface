# Agent guide

The repository is `dither-face`. The npm package is `palletface`, and the standalone browser bundle exposes the `DitherFace` global.

## Project layout

- `src/index.ts` is the public entry point and style registry. `src/styles/` contains the SVG renderers.
- Unit tests live beside the source. `src/fixtures/` pins representative SVG output, and `tests/` contains shared test helpers and release checks.
- `playground/index.html` is the standalone demo. It loads `dist/dither-face.js` after `npm run build:web`.
- `scripts/` contains the package verifier, release guard, and SVG preview and sheet generators. GitHub CI and release workflows live in `.github/workflows/`.

## Development

Use Node 22.12+ or Node 24 with npm. Run `npm ci` to install dependencies. Follow the TypeScript style and contributor guidance in [CONTRIBUTING.md](CONTRIBUTING.md).

| Command | Purpose |
| --- | --- |
| `npm test` | Run the Vitest suite. |
| `npm run check` | Typecheck, test, and build the library. |
| `npm run check:all` | Run `check` and verify the packed package in a fresh consumer. |
| `npm run build:web` | Build the standalone browser bundle for the playground. |

Keep rendering deterministic and free of runtime dependencies. Rendering must work without a DOM, network, clock, or system randomness. Review public API changes and changes to SVG output deliberately. Explain intentional fixture updates alongside the change.

## Releases

Use [RELEASING.md](RELEASING.md) for versioning, Git tags, release notes, npm distribution tags, staged approval, and verification. Follow the release checklist when a release is requested. Keep credentials and generated output out of Git.
