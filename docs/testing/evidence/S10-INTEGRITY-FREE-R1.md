# S10-INTEGRITY-FREE-R1 — independent evidence-integrity closure recheck

**Agent-observed result: 17/17 integrity checks PASS, 4/4 negative controls detected, 2 S3 documentation findings reported. Parent disposition: PENDING.** This record does not approve itself, does not close F-01 or F-03, and does not advance Stage 10. DISPOSITIONS.md remains authoritative. Executor: OpenCode FREE GLM (`opencode/glm-5.3-flash-free`), explicitly approved by the parent to replace the quota-blocked Codex executor for this task.

## Scope

Documentation/evidence integrity closure only, for the parent's F-01 (documentation reconciliation) and F-03 (evidence hygiene) review. No product, site, dependency, master-document, or old-raw-evidence file was edited; no push, PR, publish, deploy, or DNS action. No product test matrix or performance rebenchmark; the parallel browser-gate task was not touched. Harness: `scripts/testing/integrity-free-audit.mjs` (dependency-free Node, in-repo). Audited documents and selected raw evidence were copied into a dedicated sandbox by explicit paths only (no `.env`, `.git`, auth, backups, `node_modules`).

## Run identity

| Item | Observed value |
| --- | --- |
| Source commit (fresh manifest; no reuse of an older commit manifest) | `8c31e3e8db5d3de3eae79f52d629fceafadbd58c` |
| Sandbox | `dither-q-integrity-free-a71`; `blaxel/ts-app:latest`, `us-pdx-1`, 4096 MB, platform-default CPU, no volumes, 30-minute TTL, 600 s command timeout |
| Runtime | Debian 12 (bookworm), Node `v24.22.2`, npm `11.19.1`, x86_64 |
| Audited-tree manifest | 87 files; sorted-path digest `092ea41562e84873a5b57c6eedd2b549…` (full digest in `source-manifest-integrity.json`) |
| Execution | All checks and negative controls ran inside the sandbox (`ifree-audit-r5`, exit 0). Failed attempts `ifree-audit`…`r4` (one path bug, three auditor assertion-pattern bugs) are retained in the orchestration records; no result was discarded or rewritten. |

## Check results (17/17 PASS)

| Check | Result | Substance |
| --- | --- | --- |
| input.files | PASS | 12 required documents present (6 master + 6 evidence) |
| matrix.rowcount | PASS | Parsed matrix rows: 63 PASS, 1 BLOCKED, 12 REVIEW REQUIRED, 4 NOT RUN = 80; sum matches DISPOSITIONS header exactly |
| matrix.stagegrid | PASS | Per-stage rows 8/8/8/7/7/9/8/9/7/5/4 = 80 |
| headers.current | PASS | PLAN, REPORT, MATRIX, DISPOSITIONS all carry the 2026-11-09 "63 PASS, 1 BLOCKED, 12 REVIEW REQUIRED, 4 NOT RUN" header |
| headers.findings | PASS | FINDINGS.md current-status header matches DISPOSITIONS state (F-02 CLOSED, S9-O1 OPEN, S10-04 FAIL) |
| stale54.historical-only | PASS | Every "54" summary is explicitly historical or inside a dated log section; none is a current claim |
| s3.comparator-accepted | PASS | S3-COMPARATOR-R1 carries the current ACCEPTED parenthetical while retaining the original PENDING record; F-02 closure and no-retroactive-NC5-credit wording present |
| s3.nc5-withdrawn | PASS | NC5 withdrawal stated in MATRIX (×2), DISPOSITIONS, REPORT, EXECUTION-LOG |
| s3.original-rejected | PASS | `evidence/S3.md` retains the `--resume-from` attempt; REPORT/S3-R1 keep "rejected resumed S3 remains rejected and retained" |
| s8r2.separate-r1 | PASS | S10-R1 keeps S8-R1 as a separate historical 7 PASS/1 FAIL/1 BLOCKED run at `7c86da9`; S8-R2 carries run commit `7ac425d` and the evidence-tar SHA; the stale "FULL BROWSER SUITE PASS" headline is absent from S8-R2 |
| s8r2.hashes | PASS | SHA256SUMS cross-verified in-sandbox: 68 of 87 listed entries verified byte-exact (19 skipped as not necessary to upload); zero mismatches; evidence-tar SHA matches S8-R2.md |
| s3cmp.summary | PASS | Raw `summary.json`: 8/8 scenarios, 68 cases, 319 assertions, 0 failures, 5/5 controls detected, `helperResolutionPass: true`, tarball `ed4c359b…`, commit `c44471e…`, sandbox `…r8q3` |
| s3cmp.markers | PASS | timeline.json plus the four named-process records (`s3cmp-source-prepare`, `s3cmp-npm-ci`, `s3cmp-full-qualify`, `s3cmp-controls`) all completed exit 0 |
| tarball.sha-agreement | PASS | Approved tarball SHA `ed4c359b…` agrees across S3-COMPARATOR-R1, S10-R1, FINAL-20261109 and the raw summary |
| s10.not-rewritten | PASS | S10-R1 remains the historical 4/5 record with S10-04 evidence-integrity FAIL (86/92); not relabelled PASS |
| final.partial | PASS | FINAL-20261109 stays partial-only: S6 exit 137 inconclusive, S8 build failed, full Playwright suite not run, "do not satisfy S11-02", no Stage 11 PASS claim, no release recommendation |
| scope.notwaived | PASS | S8-09 BLOCKED (native Safari), S9 all 7 REVIEW REQUIRED with the 66 ms/50 ms failure and S9-O1 retained, S11 all 4 NOT RUN, 8 GB provisioning failure recorded as non-product ("No test workload ran in that attempt") |

Raw original run hashes were verified against the exact old snapshots (S8-R2 `SHA256SUMS`, S3-COMPARATOR-R1 `summary.json`); no current document was required to match a historical hash, and no historical text was flagged as current.

## Negative controls (4/4 detected by the same auditor code)

| Control | Mutation | Result |
| --- | --- | --- |
| wrong-rowcount | One S10-04 REVIEW REQUIRED row relabelled PASS | Auditor FAILED on `matrix.rowcount` as required |
| wrong-hash | One character flipped in the raw summary tarball SHA | Auditor FAILED on `s3cmp.summary` as required |
| stale-header | Current REPORT header replaced with a bare "54 PASS" claim | Auditor FAILED on `headers.current` as required |
| missing-report | FINDINGS.md removed | Auditor FAILED on `input.files` as required |

## Findings for parent review (not edited; files outside task ownership)

1. **S3 — docs/testing/evidence/FINAL-20261109.md:53 (stale cross-reference).** The record states MATRIX.md:5,41 and EXECUTION-LOG.md:17,25 "still describe the accepted S3 comparator integration recheck as pending." That was accurate when the record was written (13:01); MATRIX.md was reworded to "accepted" at 13:03 (`2fcab4e`) and EXECUTION-LOG.md moved at 13:09 (`8c31e3e`). The run record is correct raw history; the master documents have since moved further than it claims. Annotate only; do not rewrite.
2. **S3 — docs/testing/EXECUTION-LOG.md:30 (also :38) chronology tension.** Mapping-table cells still say the "Integrated S3 comparator recheck remains pending" while a later same-day section in the same file records parent acceptance of S3-COMPARATOR-R1 (also accepted in MATRIX and DISPOSITIONS). The dated log makes the sequence recoverable, but the "Remaining verification" column is pre-acceptance text. Annotate as time-of-reconciliation, or update in a scoped parent edit.

No current-document contradiction of the 63/1/12/4 disposition, the accepted S3-COMPARATOR-R1 evidence, the S8-R1/R2 separation, or the withdrawn NC5 credit was found.

## Recommendation (parent decides; no self-approval)

The evidence supports the parent treating F-01's documentation reconciliation as verified and F-03's retained-artifact hygiene as verified, leaving only the parent's own review action. Stage 10 remains REVIEW REQUIRED regardless: this recheck is documentation integrity only and does not supersede the historical S10-R1 S10-04 FAIL or complete S11. Latest browser-gate work stays IN PROGRESS with the parallel task; no result for it is claimed here.

## Raw evidence

- Worktree artifacts: `out/qualification/S10-INTEGRITY-FREE-R1/` (upload tree, orchestration records including failed attempts, `retrieved/out/` with `results.json`, `audit.log`, `source-manifest-integrity.json`, `negcontrol-*.json`)
- Parent copy: `/Users/aditya/Projects/dither-face/out/qualification/S10-INTEGRITY-FREE-R1/`
- Audited raw inputs (hash-verified in-sandbox): parent `out/qualification/S8-R2/` and `out/qualification/S3-COMPARATOR-R1/attempts/20261109-r8q3/`
- Sandbox `dither-q-integrity-free-a71` was deleted after retrieval and parent-side copy were verified.
