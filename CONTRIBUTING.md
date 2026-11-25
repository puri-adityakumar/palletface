# Contributing

Thanks for helping with palletface. Bug reports, documentation improvements, tests, and focused fixes are welcome. Discuss new styles or API changes in an issue before implementing them. Follow the [code of conduct](CODE_OF_CONDUCT.md).

## Development

Use Node 22 (22.12 or later) or Node 24 and npm. No account or secrets are needed.

```sh
npm ci
npm run check:all
```

To try the standalone playground, run `npm run build:web` and open `playground/index.html` in your browser.

## Scope and conventions

- TypeScript, two spaces, single quotes, no semicolons; follow nearby code.
- Core library code goes in `src/`. It must not require dependencies, a DOM, platform APIs, network, system randomness, or time to render an avatar.
- Tests live beside core code or in `tests/`.
- Keep `dist/`, credentials, `.env` files, and generated test reports out of Git.
- Existing exported APIs and SVG output need deliberate compatibility review. Do not fix a failing fixture by updating it without explaining the change.

## New styles and renderer changes

1. Agree on the appearance and scope first.
2. Use the seeded PRNG; use a style-specific namespace for its seed and SVG definition IDs.
3. Validate direct-renderer inputs consistently with the public API.
4. Add determinism, diversity, SVG structure, edge-case, and style-specific tests.
5. Capture representative fixed-output expectations. Document intentional changes separately from unchanged seeded geometry.
6. Update the style registry, public types, README, and [docs style catalog](site/public/docs/guide.md#styles) once the style contract is agreed.

## Pull requests

Use a focused branch and a short conventional commit message. Describe why the change is needed, which outputs or APIs change, and which checks you ran. Justify any new development dependencies and keep the library free of runtime dependencies.

Ordinary PRs leave the package version and release tags alone. Put version bumps in a release PR, for example `chore(release): prepare 1.0.0`. See the [merge and tagging policy](RELEASING.md#merging-and-tagging) for the release order.

Maintainers publish npm releases manually. See [the release guide](RELEASING.md) for versioning, tags, staged publishing, and verification. Do not include credentials in issues or PRs. See [security reporting](SECURITY.md) for suspected vulnerabilities.
