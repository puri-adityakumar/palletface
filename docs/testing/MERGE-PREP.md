# Worktree analysis and merge preparation

Snapshot date: 2026-11-13. This is a preparation report, not merge or release approval.

## Authorized integration and preservation update

The owner subsequently authorized the development merge into `main`, with the handoff retained, local worktree/branch cleanup, remote branches retained, and **no release tags**.

The preservation prerequisite is complete:

- [Cleanup preservation record](../../out/merge-prep/20261113-e3546e9/cleanup-preservation.json), SHA-256 `fee3a78661d869594f0091d56e949062ef0943bc9da61dfbe227547aeb9f7a4e`.
- All 32 worktree statuses matched the original inspection before preservation.
- Six patches and ten authored untracked files were saved; eight generated untracked files and five Finder metadata files were also copied and hash-verified.
- 6,212 non-cache artifact file entries map to verified content already in main `out/` or to 1,022 additional objects (100,439,717 bytes) under the snapshot's `evidence-objects/`.
- [Local branch bundle](../../out/merge-prep/20261113-e3546e9/local-branches.bundle) preserves all 36 original local branch refs and passed `git bundle verify`. This includes both unique historical-report commits; they need not be cherry-picked or retain local branch refs to remain recoverable.
- Raw archive/snapshot contents remain local and ignored. They are not uploaded with this change. Dependency/browser caches are deliberately not preserved.
- Finder metadata is excluded from the intended Git tree using an ignore rule and index-only removal; existing local metadata files are retained.

The existing [PR #1](https://github.com/puri-adityakumar/dither-face/pull/1) targets `main`. Its original `e3546e9` head had successful Node 22, Node 24, and browser CI checks. Updated-head checks must complete before merging; these are hosted CI checks, not a repeat of the unresolved Stage 9 qualification.

The analysis below is retained as the earlier snapshot. Statements that preservation or authorization were pending describe that snapshot, not the update above. Actual merge and cleanup execution will be recorded locally in `out/merge-prep/20261113-e3546e9/cleanup-result.json`; no operation is claimed complete before it succeeds.

## Recommendation

Use **`test/release-qualification` as the single integration branch**, then review it for merging into `main`. Do not merge all 32 worktree branches: their useful committed product/harness changes are already integrated, often through cherry-picks.

No missing product change was found in the worktrees inspected. Two unique commits add historical reports only. Preserve the pending drafts and remaining raw artifacts before removing any worktree. Do not import older harnesses, replace accepted reports, or promote performance results to PASS.

No merge, cherry-pick, worktree/branch deletion, tag, publication, push, or deployment was performed during this analysis.

## Git state and merge scope

| Ref at inspection | Commit | Relationship to integration branch |
| --- | --- | --- |
| `test/release-qualification` and its remote | `e3546e9` | Integration tip; includes the earlier handoff |
| Local `main` | `3ca99d2` | Ancestor, 101 commits behind integration |
| Live `origin/main` | `a6ed110` | Ancestor, 107 commits behind integration |

Both comparisons have zero commits exclusive to the target. A fast-forward is possible at these exact refs; no checkout-changing merge was needed to establish this. Recheck the remote before acting.

Remote `main` is six commits behind local `main`, so the eventual remote change is larger than qualification alone. Those six commits add preview contracts/docs, package verification and CI/release workflows, integration safeguards, typed API/validation, the site, and playground hardening.

Against remote `main`, the inspected branch changes **262 files: 45,749 insertions and 42 deletions**. This is not a small documentation-only merge. Qualification adds harnesses, fixtures, reports, the ascii-letter correction, and site fallback/contrast fixes on top of the preview work.

### Current hygiene blockers

- Later commit `e3546e9` tracks four Finder files: `.DS_Store`, `examples/.DS_Store`, `src/.DS_Store`, and `tests/.DS_Store`. They should not enter the intended merge.
- The root `.DS_Store` also has an uncommitted user change. It was left untouched. Preserve it if needed, then explicitly approve untracking the metadata and adding an ignore rule. Use a follow-up commit; do not rewrite already-pushed history.
- Whole-branch `git diff --check main...test/release-qualification` reports one existing trailing-whitespace line at `evidence/FINAL-BROWSER-R1.md:3`. It is a Markdown hard-break line in a historical report, not a newly introduced product failure. This analysis did not rewrite that historical report.
- Hosted CI, branch protection, and PR review status were not checked. Local Git ancestry is not CI approval.

## Preservation performed

Local snapshot: `out/merge-prep/20261113-e3546e9/` (ignored, approximately 8.5 MiB).

- [Summary](../../out/merge-prep/20261113-e3546e9/summary.json): one record per worktree.
- [Full inventory](../../out/merge-prep/20261113-e3546e9/inventory.json): branch/HEAD, pending status, saved-file checksums, and per-file ignored-output hashes.
- `pending/<worktree>/unstaged.patch` and, where applicable, `staged.patch` preserve tracked edits/deletions.
- `pending/<worktree>/untracked/` preserves authored untracked files under `docs/`, `scripts/`, and `tests/`.
- **16 saved files were verified:** six patches and ten authored untracked files, across ten worktrees. The eleventh dirty worktree contains generated `dist-site/`, which was not copied.
- Inventory SHA-256: `ca7c4c91b3fc4f8f0ba4daf0abc714de638e37e5cf54275d4ce61516bed7cf4a`.

These are local safety copies, not new qualification evidence and not Git commits. Original worktree files remain unchanged. The ignored snapshot will not accompany a Git push.

### Ignored artifact check

- Hashed 10,020 files in the main checkout's existing `out/` tree, excluding the new preservation folder.
- 28 worktrees have an `out/` tree. Twenty contain some file bytes not found as an identical standalone file in main `out/`.
- Large unmatched trees in `t3-dc7a2b36` and `t3-f1cbb79f-b749a0fec808e249` are mostly `node_modules` caches, not missing test results. The latter's non-cache output is already represented by identical content in main `out/`.
- Other unmatched trees include real S9 rerun results, audit results, attempt logs, lifecycle records, and failed provisioning evidence.
- Files were compared by size and SHA-256, independent of their relative path. Archive contents were not searched. An unmatched extracted file might still be inside an existing archive; it is not automatically lost evidence or new qualification coverage.
- Symlinks were not followed. Raw artifacts were inventoried, **not copied into this preservation snapshot**. Archive/checksum the required remaining artifacts before deleting their worktrees.

## All 32 worktrees

Base directory: `/Users/aditya/.t3/worktrees/dither-face/`. A clean Git status does not imply an empty directory or absence of ignored evidence.

Legend: **E** = inspect/archive unmatched non-cache output first; **D** = pending authored work saved locally; **H** = unique historical-report commit; **C** = committed work integrated and inspected non-cache output represented in main `out/`; **G** = generated build/cache only; **N** = no pending files or ignored output found. These are preparation classifications, not permission to delete.

| Directory | Branch after `t3/` unless noted | Classification / next action |
| --- | --- | --- |
| `s8-r1-20261107-1416` | `test/s8-r1` | H; preserve/report the rejected historical run; raw output already represented |
| `t3-0ee9de75` | `build-dither-face-site` | G; site commit integrated; only generated `dist-site/` plus dependencies |
| `t3-15838b17` | `s3-harness-integration` | C |
| `t3-1e36fcb0` | `site-fallback-contrast-fixes` | E; earlier S8 attempt records |
| `t3-1f58a8bf` | `stage4-consumer-testing` | C |
| `t3-217a162c-d5c6ec7bf63240d5` | `integrity-evidence-closure` | C |
| `t3-26316efe-b63aca590ae67947` | `final-browser-qualification` | E; provisioning response/stderr |
| `t3-2cfbeb28` | `independent-harness-review` | D + E; preserve alternative audit/comparator work, do not merge over accepted controls |
| `t3-2f3872b5` | `s3-fresh-qualification-run` | C |
| `t3-33af73ca` | `site-performance-qualification` | E; separate baseline manifest |
| `t3-37072172` | `stage7-security-privacy` | E; orchestration log |
| `t3-3cd05b81` | `s9-site-performance-qualification` | E; failed-attempt records |
| `t3-3fc30200` | `stage8-accessibility-visuals` | E; orchestration log |
| `t3-4c416769` | `review-harness-evidence` | E; Codex audit-retry artifacts |
| `t3-4ecac080` | `stage6-qualification` | D + E; preserve pending patch, do not propagate deleted report or obsolete startup expectations |
| `t3-59f2b211` | `library-performance-qualification` | D + E; separate library rerun report/raw results |
| `t3-5bfb9f5c` | `s10-independent-harness-review` | D + E; historical rerun report/audit edits, not replacement for current accepted state |
| `t3-646da04d` | `rerun-s9-site-performance` | D + E; preserve site rerun and its own expected-budget file |
| `t3-7b893b0a-fe110335b11c0b84` | `final-evidence-verification` | C |
| `t3-8b3f65a8` | `s10-qualification-review` | D; standalone package-review draft, not established new coverage |
| `t3-9873edd6` | `s9-library-performance` | E; attempt/retrieval markers |
| `t3-98cb5d53` | `rerun-s9-library-performance` | D + E; a second, different library rerun report/raw results |
| `t3-99cc32f2` | `s9-library-perf-track` | D + E; unexecuted library draft and provisioning-failure record |
| `t3-b22c2e74-9b1dc367687dc621` | `s10-integrity-final-audit` | D + E; focused audit draft and setup/result artifacts |
| `t3-ba3a6798` | `site-qualification-run` | N; current HEAD already an integration ancestor |
| `t3-bd4fe6d5` | `site-qualification-recheck` | C |
| `t3-cc5ebe80` | `stage-10-independent-review` | E; original audit/attempt artifacts |
| `t3-dc7a2b36` | `site-performance-resilience` | D + G; abandoned site harness; tool locks match integrated copies; unmatched non-cache output is a 21-byte probe |
| `t3-df3cb7e8-224a77654c0525a9` | `serialize-browser-harness` | H; historical browser R2 report; raw output already represented |
| `t3-f1cbb79f-b749a0fec808e249` | `finish-browser-verification` | C + G; non-cache results represented; dependency cache remains |
| `t3-f9c251f3` | `stage5-framework-qualification` | E; orchestration log |
| `t3-fe25ae6c` | `reconcile-test-docs` | N; changes patch-equivalent to integrated work |

Across the 32 worktrees, 30 have no patch-unique committed change relative to integration. The remaining two unique commits are below. The additional local branches without worktrees, `t3/dither-avatar-library` and `t3/packaging-ci-checks`, are also patch-equivalent to integrated commits.

## What to carry forward, and what not to merge

### Two unique committed reports

1. **`7c86da9`, `test/s8-r1`: `docs/testing/evidence/S8-R1.md`.** Historical S8 R1: S8 7 PASS / 1 FAIL / 1 BLOCKED and S6 8 PASS / 1 FAIL, followed by later accepted rechecks. Preserve it as historical evidence with a current-disposition annotation if bringing it into the integration branch. It supplies no new PASS credit.
2. **`6d480f5`, `t3/serialize-browser-harness`: `docs/testing/evidence/FINAL-BROWSER-R2.md`.** A separate successful browser component run, not the already accepted FREE-R1 run. The serialized harness itself is already patch-equivalent to integrated code. Preserve this report as a separate run, not as another release approval or replacement result.

These reports can be carried selectively after review; merging their entire old branches is unnecessary. Their branch refs currently preserve both commits.

### Pending authored files

- **Keep both library reruns separately.** `t3-59f2b211` and `t3-98cb5d53` contain different reports and measurements, not duplicates. They still record monitoring exceedances. If retained in Git, give each its own dated/run-specific evidence file and keep the current master disposition.
- **Keep the site rerun with its inputs.** `t3-646da04d` contains `S9-SITE-RERUN-20261108.md`, changed expected budgets, and earlier-report edits. Its 66 ms versus 50 ms failure is already acknowledged in current dispositions. Preserve the report, its own expected file, and raw hashes together; do not replace the existing accepted-input file or declare S9 PASS.
- **Do not import the alternative S3/S10 harnesses wholesale.** Drafts in `t3-2cfbeb28` and `t3-5bfb9f5c` differ from the later integrated comparator and omit some currently accepted wrong-expected/faulty-comparator controls. They require a separate change and requalification if revived.
- **Do not import obsolete S6 expectations or delete its report.** The pending `t3-4ecac080` state predates current failure-feedback checks. It is not a candidate replacement for current S6 evidence/harness.
- **Archive abandoned scripts instead of treating them as new features:** `s10-review-package.mjs`, `integrity-final.mjs`, `perf-site-qualify.mjs`, and the unexecuted alternate library track. The library draft's report explicitly says pending execution, with six draft rows rather than the current seven-row S9 scheme.
- **Do not merge generated `dist-site/` or dependency caches.** Two site tool-lock files in the abandoned track are byte-identical to the integrated versions.

## Ordered preparation and merge checklist

1. Preserve the local snapshot and review the pending-file decisions above. Before removing worktrees, archive required unmatched raw artifacts with checksums and provenance; do not upload logs or entire workspaces without checking for secrets.
2. Carry only the selected historical/rerun reports under distinct names, with run-specific inputs and historical/current-status annotations. Do not overwrite raw evidence or accepted fixtures. Revalidate local links and report arithmetic.
3. Obtain approval to exclude tracked Finder metadata, preserving the user's modified local file. Add a `.DS_Store` ignore rule in a follow-up change.
4. Review the full diff against **remote `main`**, including the six local-main commits. Verify fresh remote refs, CI and review requirements. No product checks were rerun for this storage/Git analysis.
5. Keep merge and publication separate. A development merge can retain explicitly unresolved release findings; it must not be described as release approval. If the desired merge is release-ready, resolve S9 and final-gate decisions first.
6. When explicitly authorized, perform the reviewed integration into `main` (fast-forward possible at inspected refs, or follow the repository's PR policy). Do not force-push or rewrite published history.
7. Remove redundant worktrees only after preservation is verified and removal is explicitly authorized. Keep branch refs until their remaining report/history decisions are settled.

Current release gates remain **70 PASS, 1 BLOCKED, 9 REVIEW REQUIRED**. Performance thresholds, WebKit history-rate-limit errors, native Safari, screen-reader speech, mobile/native-zoom limits, and the final release disposition have not been waived. See [HANDOFF.md](HANDOFF.md) and [DISPOSITIONS.md](DISPOSITIONS.md).

## What “release” means here

A release is a named, published package snapshot, not a branch and not a worktree. The version has three numbers: **major.minor.patch**.

- Current candidate in `package.json`: **`0.1.0`**, an early `0.x` preview.
- Matching Git tag: **`v0.1.0`**.
- Published npm package: **`dither-face@0.1.0`**.
- Later compatible fixes would normally use `0.1.1`; another preview feature increment could use `0.2.0`. No version bump was made here.

No local or remote Git tags existed at inspection. Public npm registry/version availability was not checked, so this is a candidate version, not confirmation that the npm name/version is available.

Merging into `main` does **not** publish. The release workflow is manual (`workflow_dispatch`) and takes an existing tag. `scripts/check-release.mjs` requires the tag to match the package version, point at the checked-out commit, be on remote `main`, and have a clean checkout. The workflow then runs its checks and uses the `npm-release` environment before publishing with provenance. Actual environment protection and npm trusted-publishing configuration remain unverified.

The current tag checker supports only `vMAJOR.MINOR.PATCH`, not prerelease suffixes such as `-beta.1`. Creating a tag, running the release workflow, and deploying the site all need separate explicit authorization.
