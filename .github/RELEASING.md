# Releasing dither-face

## Before publishing

- Review the tracked source and Git history before opening the repository. Keep local session artifacts and credentials out of public refs.
- Confirm npm package-name access and maintainer 2FA. Configure trusted publishing for `.github/workflows/release.yml` and the `npm-release` environment with required human reviewers. Follow npm's bootstrap procedure if the first publication cannot use trusted publishing.
- Use Node 24 and an npm CLI with OIDC publishing support. Check the changelog and every intentional change to avatar output.

## Rehearse the release

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run check:all
```

Checks cover the library, examples, static site, browsers, and an actual packed tarball installed into a scratch consumer. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contributor workflow.

## Qualification status

The archived qualification snapshot is `68bcfc7`. Its latest accepted record covers 80 scenarios: 70 passed, 1 blocked, and 9 require review. Functional verification was split across two runs on unchanged product code. Review remains open for the integrated release gate and the following findings:

- A site performance check measured 66 ms against a 50 ms limit. Node 24 soak RSS rose 85.02 MiB against a 64 MiB monitoring threshold. Throttled browser p95 long-task duration reached 690 ms against a 400 ms monitoring threshold. Approve budgets and disposition the exceedances before publishing.
- Rapid input hit WebKit's `history.replaceState()` rate limit. Firefox made one bounded retry for a blocked app script. Review both findings against the intended site behavior.
- Native Safari and actual screen-reader speech remain untested. Mobile coverage used emulation.

The standard release workflow checks the tag and runs the ordinary suite. The `npm-release` reviewer records the disposition of the outstanding qualification findings before approving publication.

## Publish

1. Merge the reviewed release to `main`. Match the version in `package.json` and the lockfile.
2. Create and push an annotated `vMAJOR.MINOR.PATCH` tag for the reviewed commit on `main`.
3. Manually run [Release](workflows/release.yml) with that tag. The publish job uses the checked commit SHA and waits for the environment review.
4. Verify the published tarball with an independent install and create GitHub release notes from the changelog.

## Landing page

Build with `npm run build:site`. The separate [Cloudflare configuration](../wrangler.jsonc) serves `dist-site/`. Confirm hosting and DNS for `ditherface.palletism.art` separately. After deployment, verify HTTPS, metadata, the playground, share links, and SVG downloads.
