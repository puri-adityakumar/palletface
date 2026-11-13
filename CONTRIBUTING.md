# Contributing

Thanks for helping with dither-face. Bug reports, documentation improvements, tests, and focused fixes are welcome. Discuss new styles or API changes in an issue before implementing them.

## Development

Use Node 22.12+ or Node 24 and npm. No account or secrets are needed.

```sh
npm ci
npm run check
npm run typecheck:examples
npm run typecheck:site
npm run check:package
npm run build:site
npm run preview:site
```

For browser checks, install Playwright's browsers and OS dependencies once:

```sh
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

`npm run check:all` combines all checks. Linux browser results are not a substitute for native Safari testing. Blaxel is an optional clean test environment, never required for contributors. Browser reports and build output are ignored by Git.

## Scope and conventions

- TypeScript, two spaces, single quotes, no semicolons; follow nearby code.
- Core library code goes in `src/`. It must not require dependencies, a DOM, platform APIs, network, system randomness, or time to render an avatar.
- Tests live beside core code or in `tests/`. The static site imports the real library; do not copy renderers into it.
- Never commit `dist/`, `dist-site/`, credentials, `.env` files, browser caches, or test reports.
- Existing exported APIs and SVG output need deliberate compatibility review. Do not fix a failing fixture by updating it without explaining the change.

## New styles and renderer changes

1. Agree on the appearance and scope first.
2. Use the seeded PRNG; use a style-specific namespace for its seed and SVG definition IDs.
3. Validate direct-renderer inputs consistently with the public API.
4. Add determinism, diversity, SVG structure, edge-case, and style-specific tests.
5. Capture representative fixed-output expectations. Document intentional changes separately from unchanged seeded geometry.
6. Add the style to the registry/types/docs/site only after its contract is agreed.

## Pull requests

Use a focused branch and a short conventional commit message. Describe why the change is needed, which outputs or APIs change, and which checks you ran. Include desktop/mobile screenshots for site changes, without personal data. Keep dependency additions justified; core stays dependency-free.

Publishing and deployment are maintainer-only, manual operations. Do not include credentials in issues or PRs. See [security reporting](SECURITY.md) for suspected vulnerabilities.
