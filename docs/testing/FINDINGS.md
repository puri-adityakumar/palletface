# Qualification Findings — dither-face 0.1.0

**Status:** No open findings. **Q-001 CLOSED by parent review, 2026-11-03**: targeted fix and complete Stage 1 recheck accepted on product revision `104195b`; 8/8 scenarios PASS. Stage 2 R1 was parent-accepted at harness revision `0016a1e` (product source `e3c5ead`), no new product finding. Stage 3 was executed at product source `a9685b7`: 8/8 provisional PASS, no new product finding, parent disposition PENDING; the observed S3 failures were qualification-harness timeout/JSON/ordering/symlink-removal defects, corrected and re-run without product or package changes. The original finding and provisional submissions below are retained for audit, superseded by these dispositions.

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

**Current open issue Q-002 (S2, S6-09):** When the site JavaScript asset fails to load with scripting otherwise enabled, static content remains readable but the playground has no explanatory failure state. Evidence: [S6 report](evidence/S6.md), raw `out/qualification/S6/attempts/202611031953-71be63/retrieved/reports/S6-09.json`. Parent disposition: owner acceptance or targeted fix/recheck required; S6-09 not approved. Missing CSS alone is expected graceful degradation, not automatically a defect. Q-001 is closed per superseding parent disposition above. WebKit CSP warning is under separate security investigation, not yet a confirmed vulnerability.

| Finding | Stage | Scenario | Severity | Observation | Evidence | Owner | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-001 | 1 | S1-06 | S1 | ascii-letter consumed dot RNG conditionally on glyph coverage; changing name shifted dots outside both glyphs, violating documented background invariance. | [Original failure S1](evidence/S1.md), raw S1-06.json; [fix rerun S1-R1](evidence/S1-R1.md), raw S1-06.json | Implementation agent | **CLOSED — parent accepted the `104195b` fix and S1-R1 on 2026-11-03. Agent did not self-close.** |

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
