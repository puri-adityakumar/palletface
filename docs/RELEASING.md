# Releasing dither-face

The package is a 0.x preview. Releases are manual and require a maintainer with npm publish access and access to the protected GitHub `npm-release` environment. Configure that environment with required human reviewers and configure npm trusted publishing for this repository and the release workflow before attempting a release. No workflow publishes on a push or pull request.

Before release, merge and review the change, run `npm run check`, `npm run check:package`, `npm run typecheck:site`, and `npm run test:browser`. Confirm the package contents and changelog, ensure the working tree is clean, then create and push an annotated `vMAJOR.MINOR.PATCH` tag matching `package.json`. Pushing a tag does not publish anything.

To publish, open Actions → Release → Run workflow and enter the exact tag. Review the tag/version gate and package consumer check. Approve the protected `npm-release` environment only after checking the tagged source and workflow run. The publish job uses npm trusted publishing via GitHub OIDC; it does not use a stored npm token. Verify the resulting npm version and GitHub release manually.

Use exact package versions for persisted avatar identity. Seeds are inputs to deterministic rendering: do not put secrets or personal data in seeds if generated SVG/data URLs may be shared. SVG generation is local and makes no network request. ASCII styles use a system monospace font stack; glyph appearance can differ by operating system and installed fonts.

## Static site

The site can be built with `npm run build:site` and deployed as static files through a separately configured Cloudflare Pages project. Configure that project manually for `https://ditherface.palletism.art`; this repository intentionally has no active deployment workflow. DNS changes and deployment require separate authorization.
