# Release Qualification Report — dither-face 0.1.0

**Status:** DRAFT — **8 of 80 scenarios executed provisionally** (Stage 1 rerun after the Q-001 fix). Parent review is **PENDING**; no final PASS claims. Q-001 remains open until parent verification.

**Baseline:** `test/release-qualification` at `3ca99d2`; Stage 1 fix revision `104195b`. Full plan: [PLAN.md](PLAN.md). Scenario matrix: [MATRIX.md](MATRIX.md). Findings: [FINDINGS.md](FINDINGS.md).

## 1. Baseline

| Item | Value |
| --- | --- |
| Repository | `dither-face` |
| Branch | `test/release-qualification` |
| Commit | `3ca99d2` plan baseline; Stage 1 fix at `104195b` |
| Package | `dither-face@0.1.0`, ESM, Node `>=22` |
| Tarball | Stage 1 R1: `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` (23,220 bytes) |
| Models | GMI GLM-5.3 Flash high (stages 3, 5, 7, 9); DeepSeek V4.1 Flash 1017 max (stages 1, 2, 4, 6, 8, 10); parent (stage 11) |
| Sandboxes | Stage 1 R1: `dither-face-q-s1-r1-202611031644-d6c686`, left alive pending parent disposition |

## 2. Stage summary

| Stage | Owner | Scenarios | Executed | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 API/direct rendering | DeepSeek V4.1 Flash 1017 max (reassigned; GLM attempt rejected) | 8 | 8 | 8 provisional PASS — parent review PENDING | [S1-R1](evidence/S1-R1.md); original failure [S1](evidence/S1.md) |
| 2 Determinism/embedding | DeepSeek V4.1 Flash 1017 max | 8 | 0 | NOT RUN | Pending |
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

Stage 1 was rerun on the Q-001 fix revision `104195b` in a new dedicated sandbox. **All eight scenarios are provisional PASS**: 469 cases, 3,012 assertions, 0 failed assertions, 0 integrity failures, 0 NOT RUN. The same unmodified S1-06 name-pair comparisons that previously reported 10, 16, and 17 differing dots now report zero. The complete unit suite passed 117/117 tests; the new regression was separately shown to fail the old implementation (8 failed / 48 passed in a disposable copy). No expected output was substituted and no checker was relaxed.

These are agent-observed provisional results. Parent review is **PENDING**, so the matrix rows are not final PASS and no release claim is made.

## 4. Findings

Q-001 remains **OPEN** pending parent verification. The targeted fix is implemented at `104195b` with a recorded ascii-letter dot migration and historical baseline retained; see [FINDINGS.md](FINDINGS.md) and [S1-R1 evidence](evidence/S1-R1.md). The original failure evidence remains in [S1 evidence](evidence/S1.md). "Fixed pending review" is not a closed finding.

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
| 1 (rerun/fix) | `104195b` | `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` | [S1-R1.md](evidence/S1-R1.md) | ignored `out/qualification/S1-R1/` | **PENDING** |

Raw logs belong in ignored `out/qualification/S<N>/`; tracked reports in `docs/testing/evidence/S<N>.md`. Evidence is retrieved before sandbox deletion.

## 9. Acceptance

| Field | Value |
| --- | --- |
| Release recommendation | Not assessed |
| Open S0/S1 | Q-001 (S1) — fix implemented at `104195b`, parent verification PENDING; not closed |
| Accepted S2/S3 | None |
| Parent reviewer | PENDING |
| Date | — |
| Signature/disposition | — |

Only the parent may complete acceptance. This draft is not a release approval.

## 10. Report change log

| Date | Change |
| --- | --- |
| 2026-11-03 | Planning templates created; execution not started |
| 2026-11-03 | Stage 1 rerun after Q-001 fix: 8 provisional PASS, 117/117 unit tests; parent review PENDING |
