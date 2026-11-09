# Authoritative parent dispositions

Updated 2026-11-09. This record supersedes stale status summaries in historical run reports. Raw logs and recorded execution outcomes must not be rewritten.

| Stage | Scenario rows | Parent disposition | Accepted evidence |
| --- | --- | --- | --- |
| 1 | S1-01–08 | 8 PASS | S1-R1 on `104195b` |
| 2 | S2-01–08 | 8 PASS | S2-R1 on `0016a1e`; raw comparison and matched-context coverage limits retained |
| 3 | S3-01–08 | 8 PASS | S3-R1 clean run, not the rejected resumed S3; historical NC5 claim withdrawn, corrected sensitivity check must be reverified after integration |
| 4 | S4-01–07 | 7 PASS | S4; consumer-lock bootstrap provenance limitation retained |
| 5 | S5-01–07 | 7 PASS | S5; documented framework/browser versions only |
| 6 | S6-01–09 | 9 PASS | S8-R2 paired S6 run on site fix `f1e17d0` and harness `7ac425d` |
| 7 | S7-01–08 | 8 PASS | S7; native-select WebKit CSP attribution, bounded stress and conservative secret-scan limits retained |
| 8 | S8-01–08 | 8 PASS | S8-R2; parent verified archive/results/browser JSON hashes on 2026-11-07; DOM/ARIA semantics and layout-viewport equivalence only |
| 8 | S8-09 | BLOCKED | Native Safari unavailable; Linux WebKit is not a substitute |
| 9 | S9-01–07 | REVIEW REQUIRED | Measurements collected; no parent-approved release budgets. Retain all monitoring exceedances, Codex site 66 ms/50 ms regression-limit failure and WebKit history-rate-limit errors |
| 10 | S10-01–05 | REVIEW REQUIRED | Latest Codex S10-R1: four observed PASS, evidence-integrity FAIL; documentation reconciliation and integrated comparator recheck outstanding |
| 11 | S11-01–04 | NOT RUN | Final integrated qualification not performed |

Totals: **63 PASS, 1 BLOCKED, 12 REVIEW REQUIRED, 4 NOT RUN = 80**. The repeated 54/80 summary omitted S6-09 and eight newly accepted S8 rows. This is an accounting correction, not nine new test executions. Review-required rows are not approved PASS and may contain actual failed checks.

Q-001, Q-002 and Q-003 are CLOSED for their accepted revisions. S9-O1 (WebKit history-rate-limit errors) is OPEN, not waived. Actual screen-reader speech is an untested subcheck, not another scenario row. Golden snapshots establish regression stability, not an independent geometric oracle. Public registry, hosted CI, DNS, deployment and upgrade checks remain deferred.

Current executor requirement: **Codex / `gpt-6-luna` / `reasoningEffort: max`**. Local activity is restricted to editing, Git and sandbox orchestration; builds, servers, browsers and tests run in Blaxel only. Independent tasks may run concurrently with separate worktrees, sandboxes and file ownership; no duplicate runner within a sandbox.
