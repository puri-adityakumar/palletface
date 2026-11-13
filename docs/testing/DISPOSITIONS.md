# Authoritative parent dispositions

Updated 2026-11-09. This record supersedes stale status summaries in historical run reports. Raw logs and recorded execution outcomes must not be rewritten.

| Stage | Scenario rows | Parent disposition | Accepted evidence |
| --- | --- | --- | --- |
| 1 | S1-01–08 | 8 PASS | S1-R1 on `104195b` |
| 2 | S2-01–08 | 8 PASS | S2-R1 on `0016a1e`; raw comparison and matched-context coverage limits retained |
| 3 | S3-01–08 | 8 PASS | Clean S3-R1 plus parent-accepted S3-COMPARATOR-R1 integration recheck; historical hash-only NC5 claim withdrawn |
| 4 | S4-01–07 | 7 PASS | S4; consumer-lock bootstrap provenance limitation retained |
| 5 | S5-01–07 | 7 PASS | S5; documented framework/browser versions only |
| 6 | S6-01–09 | 9 PASS | S8-R2 paired S6 run on site fix `f1e17d0` and harness `7ac425d` |
| 7 | S7-01–08 | 8 PASS | S7; native-select WebKit CSP attribution, bounded stress and conservative secret-scan limits retained |
| 8 | S8-01–08 | 8 PASS | S8-R2; parent verified archive/results/browser JSON hashes on 2026-11-07; DOM/ARIA semantics and layout-viewport equivalence only |
| 8 | S8-09 | BLOCKED | Native Safari unavailable; Linux WebKit is not a substitute |
| 9 | S9-01–07 | REVIEW REQUIRED | Measurements collected; no parent-approved release budgets. Retain all monitoring exceedances, Codex site 66 ms/50 ms regression-limit failure and WebKit history-rate-limit errors |
| 10 | S10-01–05 | 5 PASS | Independent Codex checks/tamper controls plus accepted S3 comparator and GLM integrity closure. Historical failed audit retained. |
| 11 | S11-01, S11-03 | 2 PASS | Fresh-source setup and real package consumers from FINAL-20261109, with remaining browser components completed by FINAL-BROWSER-FREE-R1 on unchanged product. |
| 11 | S11-02, S11-04 | REVIEW REQUIRED | Functional components verified across split runs; complete release gate cannot pass while S9 criteria remain unresolved. |

Totals: **70 PASS, 1 BLOCKED, 9 REVIEW REQUIRED, 0 NOT RUN = 80**. Parent accepts five Stage 10 rows and two Stage 11 components from reviewed accumulated evidence. Previous counts are historical. No release approval; performance failures and observations are not waived.

Q-001, Q-002 and Q-003 are CLOSED for their accepted revisions. S9-O1 (WebKit history-rate-limit errors) is OPEN, not waived. Actual screen-reader speech is an untested subcheck, not another scenario row. Golden snapshots establish regression stability, not an independent geometric oracle. Public registry, hosted CI, DNS, deployment and upgrade checks remain deferred.

Current executor permission: **OpenCode Free DeepSeek/GLM at max**, explicitly authorized after Codex quota failure. Local editing/Git/orchestration only; builds, browsers, servers and tests remain sandbox-only. Parallel tasks require separate ownership and sandboxes.
