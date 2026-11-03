# Release Qualification Report — dither-face 0.1.0

**Latest parent disposition (2026-11-03): 16/80 approved PASS.** Stages 1 and 2 accepted; Q-001 closed. Stage 2 R1: 6,065 cases / 15,270 assertions, exact raw SVG agreement and matched-context full-pixel checks with documented platform/sample limits. Remaining 63 scenarios NOT RUN and native Safari BLOCKED. Earlier summaries below are submission history, superseded by this disposition; no release approval.

**Status:** DRAFT — **8 of 80 scenarios parent-approved PASS** (Stage 1 R1 on `104195b`) and **8 of 80 provisional Stage 2 R1 PASS** at qualification harness revision `0016a1e` (product source `e3c5ead`). Parent accepted S1-R1 and closed Q-001 on 2026-11-03 after inspecting the fix, regression/oracle logic and retrieved artifact hashes. The prior Stage 2 run was returned for a focused S2-05 measurement correction; Stage 2 R1 parent disposition is **PENDING**. Remaining stages are not qualified. No overall release approval is implied.

**Baseline:** `test/release-qualification` at `3ca99d2`; Stage 1 fix revision `104195b`. Full plan: [PLAN.md](PLAN.md). Scenario matrix: [MATRIX.md](MATRIX.md). Findings: [FINDINGS.md](FINDINGS.md).

## 1. Baseline

| Item | Value |
| --- | --- |
| Repository | `dither-face` |
| Branch | `test/release-qualification` |
| Commit | `3ca99d2` plan baseline; Stage 1 fix at `104195b`; Stage 2 R1 harness at `0016a1e` (product source `e3c5ead`) |
| Package | `dither-face@0.1.0`, ESM, Node `>=22` |
| Tarball | Stage 1 R1 and Stage 2 R1: `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` (23,220 bytes) |
| Models | GMI GLM-5.3 Flash high (stages 3, 5, 7, 9); DeepSeek V4.1 Flash 1017 max (stages 1, 2, 4, 6, 8, 10); parent (stage 11) |
| Sandboxes | Stage 1 R1: `dither-face-q-s1-r1-202611031644-d6c686`; Stage 2 R1: `dither-face-q-s2-r1-202611031739-5c3627`, both left alive pending parent disposition. The returned Stage 2 sandbox `dither-face-q-s2-202611031706-f58c61` was deleted after its evidence was retrieved. |

## 2. Stage summary

| Stage | Owner | Scenarios | Executed | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 API/direct rendering | DeepSeek V4.1 Flash 1017 max (reassigned; GLM attempt rejected) | 8 | 8 | 8 PASS — parent accepted 2026-11-03 | [S1-R1](evidence/S1-R1.md); original failure [S1](evidence/S1.md) |
| 2 Determinism/embedding | DeepSeek V4.1 Flash 1017 max | 8 | 8 | 8 provisional PASS (R1) — parent review PENDING; prior S2 returned | [S2-R1](evidence/S2-R1.md); returned run [S2](evidence/S2.md) |
| 3 Packaging/consumers | GLM-5.3 Flash high | 8 | 0 | NOT RUN | Pending |
| 4 Node/TS/Vite browser | DeepSeek V4.1 Flash 1017 max | 7 | 0 | NOT RUN | Pending |
| 5 Frameworks/SSR/Worker/offline | GLM-5.3 Flash high | 7 | 0 | NOT RUN | Pending |
| 6 Playground interaction | DeepSeek V4.1 Flash 1017 max | 9 | 0 | NOT RUN | Pending |
| 7 Security/privacy/resources | GLM-5.3 Flash high | 8 | 0 | NOT RUN | Pending |
| 8 Accessibility/visuals | DeepSeek V4.1 Flash 1017 max | 9 | 0 | NOT RUN (1 BLOCKED) | Pending |
| 9 Performance/resilience | GLM-5.3 Flash high | 7 | 0 | NOT RUN | Pending |
| 10 Challenge/negative controls | DeepSeek V4.1 Flash 1017 max | 5 | 0 | NOT RUN | Pending |
| 11 Final integrated suite | Parent | 4 | 0 | NOT RUN | Pending |

## 3. Results

Stage 1 R1 reran the Q-001 fix revision `104195b` and was **parent-accepted**: 8/8 scenarios, 469 cases, 3,012 assertions, 0 failures. The same unmodified S1-06 comparisons that previously reported 10, 16, and 17 differing dots report zero; the new regression fails the old implementation (8 failed / 48 passed in a disposable copy). Stage 1 R1 remains the accepted Stage 1 record; this Stage 2 R1 recheck does not relabel it.

Stage 2 was returned for a focused S2-05 measurement correction after text/edge exclusions had been widened and the crafted control did not use the real acceptance function. Stage 2 R1 reran the full suite on unchanged product source `e3c5ead` with harness/fixtures through `0016a1e` in a new dedicated sandbox. **All eight scenarios are provisional PASS**: 6,065 cases, 15,270 assertions, 0 failed assertions, 0 blocked, 0 integrity failures, 0 NOT RUN. The packed tarball is byte-identical to Stage 1 (`ed4c359b…`). Node 22.23.4/24.22.2 fresh processes agree; 144/144 raw SVG comparisons match Node/Chromium/Firefox/WebKit; 153 adversarial XML/Unicode cases pass; 82 mixed avatars have 0 conflicting duplicate-ID definitions. S2-05 now compares the full target box in matched context: **82/82 Chromium, 10/10 Firefox and 10/10 WebKit targets are pixel-identical, 1,130,816 eligible pixels with 0 differing**, no text or clip-edge mask; ASCII text-glyph (118 px), text-opacity (104 px), clip, gradient, colour and conflicting-ID controls are all rejected by the same comparator. Data-URL and file/HTTP embedding make no external request and execute no script; pairwise, size and name invariances pass, including the Q-001 exact fixture. Five harness-only attempts (run1–run5) are documented; no product source changed.

Stage 2 R1 is agent-observed and provisional. Parent review is **PENDING**; matrix rows are not final PASS and no release claim is made.

## 4. Findings

Q-001 is **CLOSED**: parent accepted the `104195b` fix and S1-R1 on 2026-11-03. The original failure remains in [S1 evidence](evidence/S1.md) and the accepted recheck in [S1-R1](evidence/S1-R1.md). Stage 1 R1 remains the parent-accepted Stage 1 record; this Stage 2 R1 recheck does not alter it. Stage 2 produced no new product finding; the prior S2 return and the R1 attempts were qualification-harness measurement/API corrections only.

## 5. Blocked and deferred items

| Item | Status | Reason |
| --- | --- | --- |
| S8-09 Native Safari/macOS | BLOCKED | Native Safari unavailable; Linux WebKit is not a substitute |
| Public registry publication | FUTURE | Separate launch permission required; not a prelaunch PASS |
| Staging deployment | FUTURE | Separate authorization and evidence |
| Production deployment | FUTURE | Separate authorization and evidence |
| Upgrade paths | FUTURE | No prior qualified release; separate authorization required |
| DNS/custom domain | FUTURE | Separate authorization required |
| Hosted CI/release automation | FUTURE | Not exercised in qualification |

## 6. Performance

No baselines measured and no budgets agreed. Stage 9 will measure first; numeric budgets require parent agreement before acceptance. This report makes no performance promises.

## 7. Historical context (not qualification)

`docs/VERIFICATION.md` records a prior preview verification: 114 Vitest tests and 38 browser checks (2 intentionally skipped), a `npm pack` lifecycle, and Node 22/24 checks. Those results are historical, were not produced under this plan, and must not be counted as qualification PASS rows. Native Safari was also unavailable then.

## 8. Evidence manifest

| Stage | Commit | Tarball SHA-256 | Tracked report | Raw logs | Parent review |
| --- | --- | --- | --- | --- | --- |
| 1 (original) | `7637956` | `985ebf8d1b75fb91e63889d9df8c08ea5457557dc19e581f11ab234415c7c88b` | [S1.md](evidence/S1.md) | ignored `out/qualification/S1/` | FAIL confirmed (Q-001); historical |
| 1 (rerun/fix) | `104195b` | `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` | [S1-R1.md](evidence/S1-R1.md) | ignored `out/qualification/S1-R1/` | **PASS — parent accepted 2026-11-03** |
| 2 (returned) | `6cc38c2` (product `e3c5ead`) | `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` | [S2.md](evidence/S2.md) | ignored `out/qualification/S2/` | RETURNED for S2-05 measurement correction; historical |
| 2 (R1 final) | `0016a1e` (product `e3c5ead`) | `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` | [S2-R1.md](evidence/S2-R1.md) | ignored `out/qualification/S2-R1/` | **PENDING (8 provisional PASS; matched full-pixel S2-05)** |

Raw logs belong in ignored `out/qualification/S<N>/`; tracked reports in `docs/testing/evidence/S<N>.md`. Evidence is retrieved before sandbox deletion.

## 9. Acceptance

| Field | Value |
| --- | --- |
| Release recommendation | Not assessed; 8/80 parent-approved PASS plus 8 provisional Stage 2 R1 PASS, 64 scenarios not run or blocked |
| Open S0/S1 | None. Q-001 closed by parent 2026-11-03; Stage 2 R1 has no product finding and its provisional results await review. |
| Accepted S2/S3 | None |
| Parent reviewer | PENDING |
| Date | 2026-11-03 (Stage 1 R1 acceptance); Stage 2 R1 parent review pending |
| Signature/disposition | — |

Only the parent may complete acceptance. This draft is not a release approval.

## 10. Report change log

| Date | Change |
| --- | --- |
| 2026-11-03 | Planning templates created; execution not started |
| 2026-11-03 | Stage 1 rerun after Q-001 fix: 8 provisional PASS, 117/117 unit tests; parent accepted and Q-001 closed |
| 2026-11-03 | Stage 2: 8 provisional PASS, 5,379 cases, 14,830 assertions, 0 failures; returned for S2-05 measurement correction |
| 2026-11-03 | Stage 2 R1: matched-context full-pixel S2-05; 8 provisional PASS, 6,065 cases, 15,270 assertions, 0 failures, 0 blocked; 1,130,816 eligible pixels 0 differing; parent review PENDING |
