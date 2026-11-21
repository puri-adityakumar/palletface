# Releasing palletface

This project uses the npm package name `palletface`. The GitHub repository and
the browser bundle keep the project name `dither-face`.

## Version policy

Package versions always use three numeric SemVer components:

```text
MAJOR.MINOR.PATCH
```

Prereleases add a numbered channel suffix:

```text
0.2.0-alpha.1
0.2.0-beta.1
0.2.0-beta.2
0.2.0-rc.1
0.2.0
```

Use these rules:

- `0.x` means the API is pre-1.0; it does not by itself mean beta.
- Use `-beta.N` for a beta and increment `N` for each beta of the same base version.
- Omit the prerelease suffix only for a stable release.
- Do not use `0.2` as a package version; npm requires `0.2.0`.
- Published npm versions are immutable. Pick the next version rather than reusing one.

Typical progression:

```text
0.1.0-beta.3  current beta line
0.1.0-beta.4  next beta
0.1.0-rc.1    release candidate
0.1.0          first stable release
0.1.1          patch release
0.2.0-beta.1  next feature/API line
```

## Names and release references

| Purpose | Example | Where it is stored |
| --- | --- | --- |
| npm package | `palletface` | `package.json` and `package-lock.json` |
| npm version | `0.1.0-beta.3` | `package.json` and `package-lock.json` |
| Git release tag | `v0.1.0-beta.3` | Git and GitHub |
| npm distribution tag | `beta` | npm registry |
| human-facing title | `Palletface v0.1 Beta` | GitHub Release, README, announcements |

The `v` is a Git tag convention; it is not part of the npm version. The npm
`beta` dist-tag is a moving alias:

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
before tagging the reviewed commit. Merging a PR does not publish to npm.

If a release tag already exists on the PR branch, use a merge commit to keep
the tagged commit in `main`'s history. A squash merge creates a new commit and
leaves the tag pointing at the original commit. Keep pushed tags at their
original commits.

## Release checklist

1. Confirm the intended version and dist-tag. Use `beta` for prereleases and
   `latest` only for stable releases.
2. Update `version` in `package.json` and the matching root entries in
   `package-lock.json`.
3. Run the full checks:

   ```sh
   npm run check:all
   npm pack --dry-run
   ```

4. Review the tarball. It should contain the built library, declarations,
   README, and license, and no tests or development files.
5. Merge the release PR into `main`. Check out the reviewed release commit
   and run the checks again if it differs from the commit already verified.
6. Create and push a matching annotated Git tag on that commit, for example:

   ```sh
   git tag -a v0.2.0-beta.1 -m "Release palletface v0.2.0-beta.1"
   git push origin refs/tags/v0.2.0-beta.1
   ```

7. Run the **Release** GitHub Actions workflow with the matching tag, `main`
   as the release branch, and the intended npm dist-tag. The workflow validates
   the tag, runs `npm run check:all`, and uses staged publishing.
8. Review and approve the staged package on npm with 2FA. Staging alone does
   not make the package version publicly available.
9. Verify the result from a clean directory:

    ```sh
    npm view palletface version dist-tags
    npm install palletface@beta
    ```

## Important safeguards

- Never put npm passwords, OTPs, tokens, or stage IDs in Git.
- Do not approve a staged package until its name, version, dist-tag, tarball,
  and source tag have been reviewed.
- Do not directly run `npm publish` for a beta release; use staged publishing
  so a maintainer can approve it with 2FA.
- If npm rejects a version, check `npm stage list palletface` and the public
  packument before retrying. Do not repeatedly retry blindly or reuse a
  published version.
- The current first publication may show npm's `0.0.0-stage` placeholder under
  `latest`; the intended prerelease is installed through the `beta` tag until
  a stable `0.1.0` release is published.
