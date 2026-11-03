# Releasing dither-face

The first public package is a **0.x preview**. Nothing in these instructions authorizes publication, repository visibility changes, DNS changes, or deployment. Implementation work stays on a local feature branch until the owner approves the launch actions.

## Package prerequisites

1. Review the source and commit history before making the repository public. Keep session artifacts, credentials, generated output, and sibling-project work out of the repository.
2. Confirm the npm package name is available and the maintainer account has publishing access and 2FA. An earlier name-availability check is not a reservation.
3. Configure the GitHub `npm-release` environment with required human reviewers. An environment without protection is not a human approval gate.
4. Set up npm trusted publishing for this repository and `.github/workflows/release.yml`, including the `npm-release` environment. Follow npm's current bootstrap procedure if the first publication cannot use trusted publishing. Never put tokens in chat, the repo, or workflow logs.
5. Use a current supported npm CLI with OIDC publishing support. CI uses Node 24. No stored npm publishing token is configured by this repository.

## Release rehearsal

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run check:all
```

The package check runs `npm pack` with the real prepack lifecycle, inspects the tarball, installs it in a scratch consumer, checks runtime/IIFE parity and declarations, and runs the Node example. React is a development-only test dependency; it is not shipped as a runtime dependency.

Review representative output fixtures and every intentional SVG change. Update the changelog and documentation; do not imply that an unreleased site/version is live. Preview minor releases may change the API and avatar output. Recommend exact versions for persistent identity.

## Publish after approval

1. Merge the reviewed work to `main` through the maintainer's normal process.
2. Set `package.json` and the lockfile to the release version, review it, and ensure the checkout is clean.
3. Create and push an annotated `vMAJOR.MINOR.PATCH` tag for the reviewed commit on `main`. Pushing a tag alone does **not** publish anything.
4. Run **Actions → Release → Run workflow**, using the reviewed workflow on `main`, and enter that exact tag.
5. The check job verifies tag/version agreement, exact checked-out commit, membership in `origin/main`, a clean checkout, and the complete suite. The publish job checks out the verified commit SHA, not a tag that could move during approval.
6. Approve the protected environment only after inspecting the source and check results. npm publication uses GitHub OIDC and provenance.
7. Verify the resulting npm tarball with an independent install. Create GitHub release notes from the changelog. Confirm installation/docs links and make a short launch announcement.

No workflow publishes on a push or pull request. Publication is not generally reversible: use a follow-up version rather than relying on unpublish. No action here deletes or rewrites tags automatically.

## Static site

Build the static site with `npm run build:site`; its output is `dist-site/`. A separate Cloudflare Workers static-assets configuration is prepared in `wrangler.jsonc`. It serves only site assets and has no access to Palletism's database, auth, or other backend resources.

After explicit hosting approval:

- Create the separate Cloudflare project/Worker and connect the reviewed build.
- Use `ditherface.palletism.art` as the intended custom domain; configure DNS/domain ownership separately. The checked-in configuration must not silently change Palletism's routes.
- Verify HTTPS, canonical metadata, sitemap/robots, favicon, content types, no broken assets, and share links.
- Check desktop/mobile keyboard access, copy/download behavior, and privacy copy. Seeds in shared URLs are public inputs, not secrets.

No site deployment workflow or local deploy package script is enabled. Deployment credentials are not needed for builds or tests.

## Clean sandbox verification

All checks remain runnable locally and on GitHub Actions. Blaxel is an optional extra clean Linux environment, not a contributor requirement. For a disposable verification run:

1. Create one dedicated sandbox with Node 22.12+ or Node 24 on Debian/Ubuntu and enough disk/memory for all three Playwright browsers.
2. Transfer **only the reviewed tracked source**, not `.git` credentials, `.env` files, ignored backups, local caches, or `node_modules`.
3. Run `npm ci`, install Playwright browsers with OS dependencies, then `npm run check:all`.
4. Retrieve logs, test reports, and selected screenshots through binary filesystem download. Record runtime versions and the tested commit/source digest.
5. Delete only that run's sandbox after retrieving results, whether verification passes or fails.

Linux WebKit is useful compatibility coverage but is not native Safari/macOS testing. A passing local suite does not mean hosted CI, npm trusted publishing, or Cloudflare deployment has been exercised.
