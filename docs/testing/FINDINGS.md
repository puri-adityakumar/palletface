# Qualification Findings — dither-face 0.1.0

**Status:** OPEN — **1 confirmed finding**. Stage 1 failed; later stages remain gated.

**Baseline:** `test/release-qualification` at `3ca99d2`.

## 1. Classification and disposition

| Severity | Meaning | Disposition |
| --- | --- | --- |
| S0 | Integrity, security, secrets, package tamper, core determinism, or false release claim | Release blocker; must be fixed and re-run; cannot be accepted |
| S1 | Required functional, compatibility, accessibility, or agreed-performance failure | Release blocker; must be fixed and re-run; cannot be accepted |
| S2 | Non-blocking defect | Release owner written acceptance only |
| S3 | Cosmetic or documentation issue | Release owner written acceptance only |

Agents cannot approve their own findings or accept risk. A finding is closed only by fixed evidence from a re-run, or by written release-owner acceptance for S2/S3. "Won't fix" without owner acceptance remains open.

## 2. Open findings

| Finding | Stage | Scenario | Severity | Observation | Evidence | Owner | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-001 | 1 | S1-06 | S1 | ascii-letter consumes dot RNG conditionally on glyph coverage; changing name shifts dots outside both glyphs, violating documented background invariance. | [S1 evidence](evidence/S1.md), raw S1-06.json; parent inspected checker and source | Implementation agent | CONFIRMED; fix and fresh-sandbox rerun required |

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
