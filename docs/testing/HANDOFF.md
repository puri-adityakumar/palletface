# Release qualification handoff

Written 2026-11-13. Latest accepted test results: 2026-11-09.

## Current state

- Repository/package: `dither-face`, version `0.1.0`.
- Working branch: `test/release-qualification`.
- Starting commit for this handoff: `db90484` (accepted final browser components and integrity closure).
- **80 scenarios: 70 PASS, 1 BLOCKED, 9 REVIEW REQUIRED, 0 NOT RUN.**
- Functional verification is complete across two unchanged-product runs, not one uninterrupted full-suite run.
- **Release is not approved.** Performance failures/observations have not been waived. No package publication, deployment, or DNS change has occurred.
- [DISPOSITIONS.md](DISPOSITIONS.md) is authoritative. Historical reports may contain older counts, provisional PASS claims, or pending-review text; they do not override it.

## What we did

1. Built and executed an 11-stage qualification plan covering the library API, determinism, embedding, packaging, real consumers, frameworks, site interactions, security/privacy, accessibility, performance, and evidence integrity.
2. Fixed Q-001: `ascii-letter` consumed background randomness conditionally on glyph coverage. The fix consumes one dot decision per grid cell before overlaying the letter. The regression rejects the old implementation, and the full Stage 1 recheck passed.
3. Corrected Stage 2 raster verification to compare full pixels in matched rendering contexts, without hiding text or clip-edge differences. Added corrupt-output controls using the same acceptance logic.
4. Verified the actual packed artifact through Node 22/24, TypeScript, npm, pnpm, Yarn PnP, Vite, framework, SSR, Worker, and offline fixtures, within the documented version and environment limits.
5. Fixed site-only Q-002/Q-003: startup-failure feedback/disabled controls and accessibility contrast. Fresh affected Stage 6/8 checks passed; the fixes did not change package output.
6. Corrected the shared Stage 3 golden comparator and exercised it through real consumers, mutated SVG, altered expected hashes, and a deliberately faulty comparator. Historical hash-only NC5 sensitivity claims were withdrawn.
7. Reconciled evidence and master statuses. Independent challenge checks and the focused integrity recheck closed F-01/F-02/F-03 for their reviewed scopes. Historical failed audits and rejected runs remain visible.
8. Recovered final browser verification after an inconclusive exit-137 run. An 8 GB sandbox request was rejected by the platform's 4096 MB maximum. Serialized browser lifetimes, one worker, and a shared browser cache allowed the approved suites to complete at 4096 MB without reducing assertions or engine coverage.

## Accepted stage results

| Stage | Scope | Current disposition |
| --- | --- | --- |
| 1 | API and direct rendering | 8 PASS |
| 2 | Determinism and embedding | 8 PASS |
| 3 | Packaging and consumers | 8 PASS |
| 4 | Independent Node/TypeScript/Vite use | 7 PASS |
| 5 | Frameworks, SSR, Worker, offline | 7 PASS |
| 6 | Playground interaction | 9 PASS |
| 7 | Security, privacy, resource abuse | 8 PASS, bounded to recorded checks |
| 8 | Accessibility and visuals | 8 PASS; native Safari BLOCKED |
| 9 | Performance and resilience | 7 REVIEW REQUIRED |
| 10 | Independent challenge and integrity | 5 PASS from accumulated reviewed evidence |
| 11 | Final integration | Fresh setup and tarball smoke: 2 PASS; full release gate and final disposition: 2 REVIEW REQUIRED |

These are scenario dispositions, not unit-test or assertion totals. Do not add repeated-run counts together as distinct coverage.

## Final verification results

### Core/package run: FINAL-20261109

- Clean install, library/site/example type checks, library build, browser bundle, and site build passed. Example type checking required building the library first.
- Unit tests: **117 PASS across 13 files**, zero failures.
- Corrected Stage 3 integration: **8/8 scenarios, 68 cases, 319 assertions**, zero failed assertions.
- Stage 3 negative controls: **5/5 detected**, including real comparator sensitivity checks.
- Real npm, pnpm, and Yarn PnP consumers matched all eight fixed SVG goldens.
- Two actual package builds were byte-reproducible: `dither-face-0.1.0.tgz`, 23,220 bytes, 32 entries, SHA-256:
  `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021`.
- The browser portion was incomplete: Stage 6 exited 137, and subsequent sandbox execution requests failed. This attempt is retained as inconclusive, not counted as a product failure or browser PASS.

### Browser completion: FINAL-BROWSER-FREE-R1

Unchanged product freeze: `f1e17d08878c4ca2278aaeb7aba2d2fdbb7ae3df`. The browser harness changes were integrated as `8a20d61`; its evidence report as `ed3b37b`.

| Component | Recorded result |
| --- | --- |
| Root Playwright suite, one worker | 74 PASS, 2 explicit clipboard-permission skips, 0 FAIL |
| Stage 6 | 9/9 PASS; 90 cases; 1,141 assertions; 3/3 negative controls detected |
| Stage 8 | 8 PASS, native Safari BLOCKED; 64 cases; 407 assertions; 4/4 controls detected |
| Scoped Stage 7 (`browser-final`) | S7-01 through S7-06: 6/6 PASS; 34 cases; 2,538 assertions; 5/5 controls detected |

Stage 7 extreme/OOM stress (S7-07/08) was intentionally not repeated in this final browser scope; its earlier accepted evidence retains its own revision and limits. No exit 137 occurred in the completed browser run. Evidence was retrieved and that task sandbox was deleted.

The focused integrity closure separately passed **17/17 checks and four tamper controls**. It reverified 68 uploaded S8-R2 checksum entries, not the 19 omitted entries. Stage 10 approval is based on accumulated reviewed evidence, not a relabelled historical audit PASS.

## What is left

### 1. Resolve Stage 9 performance criteria

All seven performance rows still need review. Measurements and functional checks are evidence, not approved release budgets.

- Preserve the recorded **66 ms result against a 50 ms site regression limit**, which failed.
- Node 24 soak RSS growth was **85.02 MiB against a 64 MiB monitoring limit**.
- Throttled p95 long task was **690 ms against a 400 ms monitoring limit**.
- Stable heap and successful cleanup do not prove absence of all memory issues. Fatal V8 OOM is not caught or gracefully recovered from.
- The release owner must approve meaningful performance budgets and determine the required fixes/rechecks. Do not silently loosen thresholds or convert baselines into PASS.

### 2. Disposition the WebKit history errors and Firefox retry

- **S9-O1 remains OPEN, not waived:** Linux WebKit emitted 905 errors during a 1,000-event synthetic burst:
  `SecurityError: Attempt to use history.replaceState() more than 100 times per 10 seconds`.
- `site/main.ts` updates history on every render. The next decision is whether to fix/throttle that behavior and recheck, or obtain an explicit permitted disposition. Final rendered correctness does not erase the errors.
- **S9-O2:** Firefox made one bounded duplicate request for blocked `app.js`. No infinite retry was observed; record an explicit review disposition.

### 3. Complete or explicitly disposition coverage limits

- **S8-09:** native macOS Safari was unavailable in the Linux sandbox. Playwright Linux WebKit is not a substitute.
- Actual screen-reader speech remains untested; DOM/ARIA checks do not establish spoken output.
- Mobile checks were emulated. Layout-viewport equivalence does not establish native page zoom or physical-device behavior.
- Keep the documented runtime-version, bounded-security/stress, consumer-lock provenance, and golden-oracle limitations visible.

### 4. Close the overall release gate

- S11-02 (full integrated suite) and S11-04 (final evidence/disposition) remain REVIEW REQUIRED.
- After resolving performance and coverage dispositions, rerun affected checks on the exact final revision and request final review. Any product change invalidates affected prior PASS evidence.
- Do not describe the existing split functional verification as an uninterrupted all-suite run or as release approval.
- Public registry, hosted CI, DNS, deployment, and upgrade checks remain deferred launch work. This handoff's Git push does not authorize those actions.

## Evidence and resumption notes

Start with:

- [Current dispositions](DISPOSITIONS.md), [summary report](REPORT.md), [scenario matrix](MATRIX.md), [findings](FINDINGS.md), and [execution history](EXECUTION-LOG.md).
- [Core/package final run](evidence/FINAL-20261109.md) and [completed browser run](evidence/FINAL-BROWSER-FREE-R1.md).
- [Library performance](evidence/S9-LIBRARY.md) and [site performance](evidence/S9-SITE.md).
- [Corrected comparator](evidence/S3-COMPARATOR-R1.md), [focused integrity closure](evidence/S10-INTEGRITY-FREE-R1.md), and [annotated Stage 10 closure](evidence/S10-CLOSURE.md).

Raw evidence lives in ignored `out/qualification/`, including `FINAL-20261109/`, `FINAL-BROWSER-FREE-R1/`, `S9-LIBRARY/`, and `S9-SITE/`. **A Git clone/push does not include those artifacts.** Preserve them separately and use the reports' manifests/checksums when transferring selected evidence; never include secrets, auth files, or an unrestricted workspace archive.

Keep builds, tests, servers, and browsers sandbox-only under the recorded execution rules. Local work is limited to editing, Git, orchestration, and evidence inspection. Check current provider/resource permissions before resuming; do not substitute models or increase limits without approval.

The last report-delivery attempts failed independently of the product: the earlier GMI GPT route returned `Rate limit exceeded`; the GLM route returned `Internal server error` after the UI reported 10 retries. No Bubbles report was published by those attempts. These are provider/delivery failures, not additional test failures.

This handoff update changes documentation only. It summarizes previously accepted results and does not claim fresh test execution or new release approval. Untracked macOS `.DS_Store` files are excluded from the handoff commit.
