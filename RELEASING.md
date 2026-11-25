# Palletface release runbook

The npm package and GitHub repository are named `palletface`. The browser
bundle, `dist/palletface.js`, exposes the `Palletface` global.

Start this checklist before creating a release tag. For a full release, carry it
through npm publication, the GitHub Release with notes and a preview image, and
any applicable landing-page updates. Pause at npm approval for the maintainer
and resume from verification once they approve.

## Version policy

Package versions use three numeric SemVer components:

```text
MAJOR.MINOR.PATCH
```

Avatars are part of the public contract, so the version also tells users
whether the avatars they already show can change:

| Release | Example | What it can contain | Existing avatars |
| --- | --- | --- | --- |
| Patch | `1.0.1` | Bug fixes and docs that leave output unchanged | Unchanged |
| Minor | `1.1.0` | New styles, options, or exports | Unchanged |
| Major | `2.0.0` | Breaking API changes or any change to existing SVG output | May change |

Use these rules:

- Every release is published to the npm `latest` dist-tag.
- Published npm versions are immutable. Pick the next version rather than reusing one.
- If a change needs outside testing before release, publish a release candidate
  such as `1.1.0-rc.1` on the `next` dist-tag, never on `latest`. Release
  candidates stay out of the changelog.

## Names and release references

| Purpose | Example | Where it is stored |
| --- | --- | --- |
| npm package | `palletface` | `package.json` and `package-lock.json` |
| npm version | `1.0.0` | `package.json` and `package-lock.json` |
| Git release tag and annotation | `v1.0.0` | Git and GitHub |
| npm distribution tag | `latest` | npm registry |
| GitHub Release title | `v1.0.0` | GitHub Releases |

Git tags use a `v` prefix. npm versions use the numeric version. Users install
the latest release with:

```sh
npm install palletface
```

Exact versions remain available for reproducible installs:

```sh
npm install --save-exact palletface@1.0.0
```

## Merging and tagging

Ordinary PRs merge without a package version change or a release tag. For a
release PR, update the package version and lockfile, then merge into `main`
before tagging the reviewed commit. Use the exact tag name as its annotation.

If a release tag already exists on the PR branch, use a merge commit to keep
the tagged commit in `main`'s history. A squash merge creates a new commit and
leaves the tag pointing at the original commit. Keep pushed tags at their
original commits.

## Release notes

Use the exact Git tag as the GitHub Release title. Write from the reader's
point of view and cover everything shipping since the previous release. Link
relevant PRs and skip empty sections. A one-fix patch can use just **Fixes**
and **Full changelog**. Omit the comparison if there is no previous release tag.

```markdown
## Highlights

- Describe the most important changes users will see.

## Fixes

- Describe what was broken and what now works. Link the PR when useful.

## Upgrade notes

- Include breaking changes, migrations, and any actions users need to take.

## Full changelog

[Compare with the previous release](https://github.com/puri-adityakumar/palletface/compare/vPREVIOUS...vX.Y.Z)
```

## Release checklist

### Prepare and tag

1. Confirm the intended version against the [version policy](#version-policy).
   Record the previous published version. Check the remote tag, GitHub
   Releases, and npm registry before retrying an in-progress release.
2. Update `version` in `package.json` and the matching root entries in
   `package-lock.json`. Review the package README, install command, and links
   against the version being shipped. Draft the [release notes](#release-notes).
3. Install dependencies with `npm ci` and run `npm run preview:render` from
   the repository root. Review
   `.github/preview.svg` against the released styles and commit any change to the
   tracked image in the release PR. Use that image for the GitHub Release.
4. Run the full checks.

   ```sh
   npm run check:all
   npm pack --dry-run
   ```

   Review the tarball for the built library, declarations, README, and license.
   Check that it excludes tests and development files.
5. Merge the release PR into `main`. Check out the reviewed release commit
   and run the checks again if it differs from the commit already verified.
6. Create and push a matching annotated Git tag on that commit. If the tag
   already exists, confirm it points to the intended commit before continuing.

   ```sh
   version=1.0.0
   tag="v${version}"
   git tag -a "$tag" -m "$tag"
   git push origin "refs/tags/$tag"
   ```

### Draft the GitHub Release and stage on npm

1. Create or update the draft GitHub Release for the existing tag. Set its
   title to the tag and use the reviewed release notes. Attach `preview.svg`
   from the tagged commit as a release asset. For a new draft, save the notes
   as `notes.md` in a temporary directory and set `scratch` to that directory.

   ```sh
   git show "${tag}:.github/preview.svg" > "$scratch/preview.svg"
   gh release create "$tag" --verify-tag --draft \
     --title "$tag" --notes-file "$scratch/notes.md" "$scratch/preview.svg"
   ```

   If the draft already exists, update it in place and upload the image if it
   is missing. If the release is already published, verify it in place. Check
   the tag, notes, and attached image.
2. Run the [Release workflow](.github/workflows/release.yml) with the matching
   tag and branch. It validates the tag, runs the full checks, and stages the
   package on npm. If the version is already staged or published, resume from
   the corresponding step. Confirm that the workflow uses npm 11.15.0 or later
   and that the npm trusted publisher matches the repository, `release.yml`,
   and the `npm-release` environment.

   ```sh
   gh workflow run release.yml --ref main \
     -f tag="$tag" -f release-branch=main -f dist-tag=latest
   ```

3. Check that the workflow succeeded. Have a maintainer review the staged
   package and approve it on npm with 2FA.

### Verify and publish

1. Confirm `latest` resolves to the exact intended version. In a clean
   directory, install the package and render a sample avatar.

   ```sh
   npm view palletface dist-tags
   npm install palletface
   node --input-type=module -e "import assert from 'node:assert/strict'
   import { palletface } from 'palletface'
   assert.match(palletface('release-check'), /^<svg /)"
   ```

2. Publish the GitHub draft after npm verification. Update any draft wording
   about pending publication first. Verify the published release shows the
   correct tag, notes, changelog link when applicable, and downloadable image.

   ```sh
   gh release edit "$tag" --verify-tag --draft=false
   ```

3. Run `npm run sync:releases` in `site/` so the changelog bundles the new
   release, and commit the result. If the landing site is live, check its
   displayed version, install command, and style showcase for the released
   package. Follow the build and deployment instructions in `site/README.md`,
   then verify the deployed page.
4. Record the npm version, GitHub Release URL, and any updated site URL. Flag
   any incomplete step when handing off.

## Important safeguards

- Never put npm passwords, OTPs, tokens, or stage IDs in Git.
- Keep tarballs, build output, and temporary release files out of Git. Commit
  the tracked preview image as part of the release PR when it changes.
- Do not approve a staged package until its name, version, dist-tag, tarball,
  and source tag have been reviewed.
- Do not directly run `npm publish`; use staged publishing so a maintainer can
  approve the release with 2FA.
- If npm rejects a version, check `npm stage list palletface` and the public
  packument before retrying. Do not repeatedly retry blindly or reuse a
  published version.
