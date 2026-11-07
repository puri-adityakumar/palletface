# Qualification Findings — dither-face 0.1.0

**Status:** Q-001, Q-002 and Q-003 are closed for their tested revisions. Open audit/process findings remain from the independent Stage 10 review: stale master status, stale report headers, weak S3-NC5, and evidence reconciliation. No open product S0/S1 finding from executed stages. Native Safari and screen-reader speech remain blocked coverage limitations.

**Baseline:** `test/release-qualification` at `3ca99d2`; original S1 run at `7637956`; targeted fix at `104195b`; Stage 3 provisional at `704309e`/`28a8a0b`.

## 1. Classification and disposition

| Severity | Meaning | Disposition |
| --- | --- | --- |
| S0 | Integrity, security, secrets, package tamper, core determinism, or false release claim | Release blocker; must be fixed and re-run; cannot be accepted |
| S1 | Required functional, compatibility, accessibility, or agreed-performance failure | Release blocker; must be fixed and re-run; cannot be accepted |
| S2 | Non-blocking defect | Release owner written acceptance only |
| S3 | Cosmetic or documentation issue | Release owner written acceptance only |

Agents cannot approve their own findings or accept risk. A finding is closed only by fixed evidence from a re-run, or by written release-owner acceptance for S2/S3. "Won't fix" without owner acceptance remains open.

## 2. Open findings

**Q-003 (S1, S8-07) CLOSED 2026-11-07:** placeholder and control contrast passed the fresh S8-R2 recheck; no avatar/package output changed.

**Q-002 (S2, S6-09) CLOSED 2026-11-07:** blocked/boot-failure startup feedback, disabled controls and no false preview/gallery passed the fresh S6/S8 recheck. Missing CSS remains documented graceful degradation; WebKit select CSP behavior remains documented.

**S9-O1 (S2 observation, open):** Linux WebKit 27.2 produced 905 `history.replaceState` rate-limit `SecurityError`s during a 1,000-event synthetic rapid burst; other engines produced none. No current product defect disposition; parent may accept as browser/platform limitation or require throttling/recheck. See S9-SITE evidence.

**S9-O2 (S2/S3 observation):** Firefox made one bounded duplicate app.js request when the asset was blocked; no infinite retry. Parent review required.

| Finding | Stage | Scenario | Severity | Observation | Evidence | Owner | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-001 | 1 | S1-06 | S1 | ascii-letter consumed dot RNG conditionally on glyph coverage; changing name shifted dots outside both glyphs, violating documented background invariance. | [Original failure S1](evidence/S1.md), raw S1-06.json; [fix rerun S1-R1](evidence/S1-R1.md), raw S1-06.json | Implementation agent | **CLOSED — parent accepted the `104195b` fix and S1-R1 on 2026-11-03. Agent did not self-close.** |

| F-01 | 10 | Evidence integrity | S2 | Master qualification status and several report headers are stale/inconsistent with parent dispositions. | [S10 evidence](evidence/S10.md) | Parent | OPEN — reconcile master records |
| F-02 | 10 | Negative control | S2 | S3-NC5 compares hashes rather than exercising the real golden comparator. | [S10 evidence](evidence/S10.md) | Parent | OPEN — replace/re-run control |
| F-03 | 10 | Evidence hygiene | S3 | S8-R1/R2 and extra S10 sandboxes/worktrees require explicit reconciliation and cleanup. | [S10 evidence](evidence/S10.md) | Parent | OPEN — reconcile artifacts |

## 3. Accepted lower-severity issues

| Finding | Severity | Rationale | Accepted by | Date |
| --- | --- | --- | --- | --- |
| — | — | None recorded | — | — |

## 4. Finding record template

```text
Finding ID:
Scenario:
Stage / model:
Commit / tarball SHA-256:
Environment and versions:
Command:
Expected:
Actual:
Evidence (tracked report + raw log/artifact):
Severity (S0/S1/S2/S3):
Reproduction steps:
Proposed fix / re-test scope:
Parent disposition:
```

## 5. Rules

- Findings must link to a matrix scenario and traceable evidence.
- Do not hide failed assertions, skips, or environment limitations; record them.
- Any source change after a finding invalidates affected PASS evidence and requires a new revision and re-runs.
- Release remains blocked while any S0/S1 finding is open.
- This file must not be edited to claim a pass; parent disposition is required.
