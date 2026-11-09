# S3 comparator integration recheck

**Agent-observed result: 8/8 scenarios PASS, 68 cases, 319 assertions, 0 failed assertions; all five negative controls detected. Parent disposition: PENDING.** This report records qualification evidence and does not approve itself or advance a stage.

## Frozen inputs

| Input | Value |
| --- | --- |
| Source/harness commit | `c44471e4ee961b6ced468312fbec09956d90940e` |
| Uploaded tracked source | 260 files; manifest digest `9f008ee5d44e5fd74420e1720dcf0e61294d3667d9dd8b33fb6cb1a2453455dc` |
| `s3-qualify.mjs` SHA-256 | `cbd61e45c146226a68de572b75438170b28b62091e2c3bfc25ba04ab91644e8a` |
| `s3-controls.mjs` SHA-256 | `f6036d51843e37835daf5fe80bc662368a7dc7d6e2cb48da8605c6f63ab9e7e9` |
| `s3-render.mjs` / `s3-golden.mjs` SHA-256 | `687c2b72bd89123b7ccb4aefd9c938c9c5a28a7c043414160ad5a79eaed19657` / `936b82d63fa146c30e36dc4f30a73de877e48965f8d74ed4ac2c5931b16c5769` |
| Expected and produced tarball | `dither-face-0.1.0.tgz`, 23,220 bytes, 32 entries, SHA-256 `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` |
| Sandbox | `dither-face-q-codex-s3-comparator-20261109-r8q3` |
| Image / region / memory | `blaxel/ts-app:latest`, `us-pdx-1`, 4096 MB, platform-default CPU, no volumes, 30-minute TTL |
| Runtime | Debian 12; system Node `v24.22.2`; consumer Node `v22.23.4` and `v24.22.2` |
| Package managers | npm `11.19.1`, pnpm `12.16.1`, Yarn `4.18.1` (PnP) |
| TypeScript | `7.0.2` and `6.0.3` |

The tracked source archive was built with `git archive`, uploaded without `.git`, `.env`, credentials, backups, or `node_modules`, and checked against all 260 manifest entries in the sandbox. The actual tarball matched the previously approved SHA byte-for-byte.

## Run record

| UTC | Named process | Result |
| --- | --- | --- |
| 06:51:42–06:51:43 | `s3cmp-source-prepare` | Source extraction and all 260 manifest hashes verified; no Git metadata, `.env`, or uploaded dependencies |
| 06:51:48–06:51:51 | `s3cmp-npm-ci` | `npm ci --no-audit --no-fund`, exit 0 |
| 06:52:04–06:52:50 | `s3cmp-full-qualify` | One fresh `s3-qualify.mjs` invocation, no resume flags, exit 0 |
| 06:53:01–06:53:07 | `s3cmp-controls` | `s3-controls.mjs`, exit 0; all five controls detected |
| 06:55:12–06:55:13 | `s3cmp-copy-resolution-audit-r2` | Renderer/helper adjacency and installed-package root audit, exit 0 |

Every sandbox process was named and awaited synchronously. The CLI request timeout was 600 seconds. No build, test, or server ran on the host.

## Scenario results

| ID | Result | Cases | Assertions | Failed assertions |
| --- | --- | ---: | ---: | ---: |
| S3-01 | PASS | 5 | 28 | 0 |
| S3-02 | PASS | 5 | 48 | 0 |
| S3-03 | PASS | 7 | 34 | 0 |
| S3-04 | PASS | 6 | 14 | 0 |
| S3-05 | PASS | 7 | 35 | 0 |
| S3-06 | PASS | 7 | 89 | 0 |
| S3-07 | PASS | 24 | 37 | 0 |
| S3-08 | PASS | 7 | 34 | 0 |
| **Total** | **8 PASS, 0 FAIL, 0 BLOCKED** | **68** | **319** | **0** |

The harness ran the real prepack lifecycle twice and compared reproducible archives, installed the produced tarball into fresh consumers, rendered all eight golden fixtures under Node 22 and 24, and exercised npm, pnpm, and Yarn PnP installs. Expected nonzero exits in invalid TypeScript and intentionally broken-export probes are recorded as negative evidence; they are not failed qualification assertions.

## Comparator controls and consumer integration

All five `s3-controls.mjs` controls were detected:

| Control | Detected | Evidence |
| --- | --- | --- |
| NC1 forbidden archive entry | Yes | Added source and source-map paths are rejected by the archive checker. |
| NC2 injected dependencies | Yes | Added `react` and `left-pad` are rejected by package metadata checks. |
| NC3 broken export path | Yes | The mutated package installs but its root import fails; metadata reports the missing path. |
| NC4 invalid TypeScript | Yes | The invalid style fixture exits nonzero with a TypeScript diagnostic. |
| NC5 golden mismatch | Yes | The real installed-package SVG matches its fixed SHA. A changed SVG and a changed expected SHA are both rejected by `compareGolden`. A disposable copy modified to always return `equal: true` accepts both bad inputs, and the control records that faulty comparator as exposed. |

NC5 uses the same `compareGolden` imported by [`s3-render.mjs`](../../../scripts/testing/s3-render.mjs) and does not modify the renderer helper or installed package. The revised control is in [`s3-controls.mjs`](../../../scripts/testing/s3-controls.mjs).

The separately retrieved copy audit confirms that `.s3-render.mjs` imports an adjacent `s3-golden.mjs` with the same SHA-256 (`936b82d63fa146c30e36dc4f30a73de877e48965f8d74ed4ac2c5931b16c5769`) in canonical npm, npm production, pnpm production, and Yarn PnP consumers. Renderer logs resolve package version `0.1.0` from the installed tarball package roots, all outside the uploaded repository. Yarn PnP reports its virtual path inside the `.yarn` cache archive, as expected for PnP; the renderer's ESM import and all eight hashes passed.

## Earlier excluded attempt

An initial attempt in sandbox `dither-face-q-codex-s3-comparator-20261109-k7m2` used a host-created tar archive with macOS extended attributes. Extraction produced AppleDouble `._*` files in `src`, which Vitest parsed as binary TypeScript and caused prepack to fail. This was an upload artifact, not a product defect or comparator result. Its S3-02 log and scenario record are retained separately under `failed-upload-attempt/`; none of its output was reused. The successful run used a clean `git archive` in a new sandbox with new output and work directories.

The first supplemental package-root audit also failed because its host-side check tried to `realpath` Yarn's virtual path inside the PnP ZIP archive. The corrected audit reads the Yarn root and version reported by the installed-package renderer, while filesystem-realpath checks remain in place for npm and pnpm. Its failed and corrected process records are both retained; the qualification results were unaffected.

## Reproduction commands

The successful non-resumed invocation was:

```sh
node scripts/testing/s3-qualify.mjs \
  --repo /tmp/s3-comparator-r8q3/repo \
  --out /tmp/s3-comparator-r8q3/out-qualify \
  --fixtures /tmp/s3-comparator-r8q3/repo/tests/qualification/s3 \
  --expected /tmp/s3-comparator-r8q3/repo/tests/qualification/s3/expected-results.json \
  --source-manifest /tmp/source-manifest.json \
  --commit c44471e4ee961b6ced468312fbec09956d90940e \
  --sandbox dither-face-q-codex-s3-comparator-20261109-r8q3 \
  --image blaxel/ts-app:latest \
  --work /tmp/s3-comparator-r8q3/work \
  --tarball-name dither-face-0.1.0.tgz \
  --npm-version 11.19.1 --pnpm-version 12.16.1 --yarn-version 4.18.1 \
  --ts-current 7.0.2 --ts-prior 6.0.3 \
  --node22 22.23.4 --node24 24.22.2
```

The separate five-control invocation was:

```sh
node scripts/testing/s3-controls.mjs \
  --repo /tmp/s3-comparator-r8q3/repo \
  --fixtures /tmp/s3-comparator-r8q3/repo/tests/qualification/s3 \
  --out /tmp/s3-comparator-r8q3/out-controls \
  --work /tmp/s3-comparator-r8q3/work \
  --tarball /tmp/s3-comparator-r8q3/work/pack1/dither-face-0.1.0.tgz \
  --ts-version 7.0.2 --node-version 24.22.2
```

`--node-version 24.22.2` was supplied as required by the controls CLI. The controls script does not currently consume that value; the process ran under system Node `v24.22.2`, which the full qualification records in `environment.json`.

## Raw evidence and disposition

The complete retrieved output tree includes `results.json`, S3-01 through S3-08 records, environment and tarball manifests, the actual tarball, all qualification logs, `controls-final.json`, all controls logs, and the consumer-helper resolution audit. Orchestration command files and process responses are retained alongside the excluded upload attempt.

- Worktree raw evidence: `out/qualification/S3-COMPARATOR-R1/attempts/20261109-r8q3/`
- Parent raw evidence: `/Users/aditya/Projects/dither-face/out/qualification/S3-COMPARATOR-R1/attempts/20261109-r8q3/`

**Parent disposition: PENDING.** No product source, site, root dependencies, README, LICENSE, master testing reports, or package metadata changed. No push, PR, publish, deploy, DNS, or stage advancement was performed.
