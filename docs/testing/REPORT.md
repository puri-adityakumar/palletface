# Release Qualification Report — dither-face 0.1.0

**Current parent disposition (2026-11-09): 70 PASS, 1 BLOCKED, 9 REVIEW REQUIRED, 0 NOT RUN (80 total).** [DISPOSITIONS.md](DISPOSITIONS.md) is authoritative.

Stages 1–7: 55 PASS. Stage 8: 8 PASS/native Safari BLOCKED. Stage 9: 7 REVIEW REQUIRED; preserve the 66 ms/50 ms failure, monitoring exceedances and history errors. Stage 10: 5 PASS based on accumulated independent checks/comparator/integrity closure; historical failed audit retained. Stage 11: fresh setup/package smoke PASS; full release gate and final disposition REVIEW REQUIRED.

Functional integrated verification is complete across two unchanged-product runs: FINAL-20261109 passed core/typechecks/117 units/builds/package consumers; FINAL-BROWSER-FREE-R1 passed 74 browser tests (2 explicit skips), S6, S8 and scoped S7. This is not one uninterrupted all-suite run and not release approval.

Q-001/Q-002/Q-003 are CLOSED for accepted revisions. F-02 is CLOSED after the accepted clean S3-COMPARATOR-R1 integration run: eight scenarios, 319 assertions and all five controls. Historical NC5 credit is withdrawn; rejected resumed S3 remains rejected.

Actual screen-reader speech remains untested; DOM/ARIA checks do not establish speech output. Mobile evidence is emulated; S8-05 did not establish native page zoom.

**Original submission (historical, superseded):** Earlier summaries reported 54 PASS, provisional S3, and pending later stages. The corrected count adds S6-09 and eight S8 rows; this is accounting, not new test credit.
