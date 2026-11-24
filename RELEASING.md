# Palletface release runbook

The npm package and GitHub repository are named `palletface`. The standalone
browser bundle still exposes the `DitherFace` global.

Start this checklist before creating a release tag. For a full release, carry it
through npm publication, the GitHub Release with notes and a preview image, and
any applicable landing-page updates. Pause at npm approval for the maintainer
and resume from verification once they approve.

## Version policy

Package versions always use three numeric SemVer components:

```text
MAJOR.MINOR.PATCH
```

Prereleases add a channel suffix:

```text
0.2.0-alpha.1
0.2.0-beta
0.2.0-beta.1
0.2.0-beta.2
0.2.0-rc.1
0.2.0
```

Use these rules:

- `0.x` means the API is pre-1.0; it does not by itself mean beta.
- Use `-beta` for the first beta of a version. Use `-beta.1`, `-beta.2`, and
  so on for follow-up betas of the same version.
- Omit the prerelease suffix only for a stable release.
- Do not use `0.2` as a package version; npm requires `0.2.0`.
- Published npm versions are immutable. Pick the next version rather than reusing one.

Typical progression:

```text
0.2.0-beta    first beta
0.2.0-beta.1  follow-up beta
0.2.0-rc.1    release candidate
0.2.0         stable release
0.2.1         patch release
0.3.0-beta    next feature/API line
```

## Names and release references

| Purpose | Example | Where it is stored |
| --- | --- | --- |
| npm package | `palletface` | `package.json` and `package-lock.json` |
| npm version | `0.2.0-beta` | `package.json` and `package-lock.json` |
| Git release tag and annotation | `v0.2.0-beta` | Git and GitHub |
| npm distribution tag | `beta` | npm registry |
| GitHub Release title | `v0.2.0-beta` | GitHub Releases |

Git tags use a `v` prefix. npm versions use the numeric version and any
prerelease suffix. The npm `beta` dist-tag is a moving alias, for example

```text
palletface@beta -> palletface@0.1.0-beta.3
```

Exact versions remain available for reproducible installs:

```sh
npm install palletface@0.1.0-beta.3
```

Users who want the current beta can use:

```sh
npm install palletface@beta
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
point of view and cover everything shipping since the previous published tag
on the same channel. Link relevant PRs and skip empty sections. A one-fix
patch can use just **Fixes** and **Full changelog**. Omit the comparison if
there is no previous release tag.

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

1. Confirm the intended version and dist-tag. Use `beta` for prereleases and
   `latest` for stable releases. Record the previous published version on the
   same channel before the dist-tag moves. Check the remote tag, GitHub Releases,
   and npm registry before retrying an in-progress release.
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
   The following commands use an example beta version.

   ```sh
   version=0.2.0-beta
   tag="v${version}"
   channel=beta
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
   gh release create "$tag" --verify-tag --draft --prerelease \
     --title "$tag" --notes-file "$scratch/notes.md" "$scratch/preview.svg"
   ```

   Set `channel=latest` and omit `--prerelease` for stable releases. If the
   draft already exists, update it in place and upload the image if it is
   missing. If the release is already published, verify it in place. Check the
   tag, notes, and attached image.
2. Run the [Release workflow](.github/workflows/release.yml) with the matching tag,
   branch, and channel. It validates the tag, runs the full checks, and stages
   the package on npm. If the version is already staged or published, resume
   from the corresponding step. Confirm that the workflow uses npm 11.15.0 or
   later and that the npm trusted publisher matches the repository,
   `release.yml`, and the `npm-release` environment.

   ```sh
   gh workflow run release.yml --ref main \
     -f tag="$tag" -f release-branch=main -f dist-tag="$channel"
   ```

3. Check that the workflow succeeded. Have a maintainer review the staged
   package and approve it on npm with 2FA.

### Verify and publish

1. Confirm the npm channel resolves to the exact intended version. In a clean
   directory, install from that channel and render a sample avatar.

   ```sh
   npm view "palletface@$channel" version
   npm install "palletface@$channel"
   node --input-type=module -e "import assert from 'node:assert/strict'
   import { ditherFace } from 'palletface'
   assert.match(ditherFace('release-check'), /^<svg /)"
   ```

2. Publish the GitHub draft after npm verification. Update any draft wording
   about pending publication first. Verify the published release shows the
   correct tag, notes, changelog link when applicable, and downloadable image.

   ```sh
   gh release edit "$tag" --verify-tag --draft=false
   ```

3. If the landing site is live, update its displayed version, install command,
   and style showcase for the released package. If it has a changelog, add the
   release summary and link to the full notes where visitors can read them.
   Follow the build and deployment instructions in `site/README.md`, then
   verify the deployed page.
4. Record the npm version and channel, GitHub Release URL, and any updated site
   URL. Flag any incomplete step when handing off.

## Important safeguards

- Never put npm passwords, OTPs, tokens, or stage IDs in Git.
- Keep tarballs, build output, and temporary release files out of Git. Commit
  the tracked preview image as part of the release PR when it changes.
- Do not approve a staged package until its name, version, dist-tag, tarball,
  and source tag have been reviewed.
- Do not directly run `npm publish` for a beta release; use staged publishing
  so a maintainer can approve it with 2FA.
- If npm rejects a version, check `npm stage list palletface` and the public
  packument before retrying. Do not repeatedly retry blindly or reuse a
  published version.
- Use `palletface@beta` while npm's `latest` points to the `0.0.0-stage`
  placeholder. Use the default install command after a stable release has been
  verified on `latest`.
