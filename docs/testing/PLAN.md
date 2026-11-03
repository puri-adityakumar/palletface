# Release Qualification Plan — dither-face 0.1.0

**Status:** Planning complete; execution **not started**. No scenario has run and no release claim is made.

**Baseline:** `test/release-qualification` at `3ca99d2`, clean. Package `dither-face@0.1.0`, ESM, Node `>=22`, zero runtime dependencies. Historical preview results in [VERIFICATION.md](../VERIFICATION.md) are context only and are **not** qualification evidence.

## 1. Objective and scope

Qualify the tracked source and the actual packed tarball for a prelaunch release decision. Planning and evidence collection are separate from launch: registry publication, staging, production, upgrade paths, DNS, and hosted CI require separate launch authorization.

**In scope**

- Public API, defaults, invalid options, Unicode, initials, and types.
- Direct renderer output, determinism, fresh-process and cross-engine behavior, XML, repeated IDs, and inline/file/HTTP embedding.
- Tarball contents, `prepack`, manifest, exports, types, zero runtime dependencies, and npm/pnpm/Yarn consumers.
- Independent Node/TypeScript/Vite vanilla and React dev and production browser use.
- Next.js SSR/hydration/production, Vue, Svelte, Web Worker, and offline plain HTML.
- Playground URL/history/parameter handling, rapid input, copy/download, snippets, and asset failure.
- Injection, privacy, CSP, referrer, network, secrets, and extreme resource inputs.
- Automated and manual accessibility, zoom, mobile, contrast, reduced motion, forced colors, and visual inspection.
- Performance baselines/budgets, bundle size, tree-shaking, memory/object URLs, throttling, and resilience.
- Independent challenge review with negative controls, then a parent-run final integrated suite.

**Out of scope (deferred / blocked)**

- npm or other public registry publication, staging, production deployment, upgrade paths, DNS, PRs, pushes, and hosted CI: **FUTURE**, requires launch permission, and must never be reported as PASS prelaunch.
- Native Safari/macOS: **BLOCKED** in this environment; Linux WebKit is not a substitute and must be labelled as such.
- Source or site changes during qualification. Any defect fix creates a new revision and requires affected re-runs.

## 2. Roles, models, and sequencing

| Stage | Owner | Focus |
| --- | --- | --- |
| 1 | GMI GLM-5.3 Flash high via OpenCode | API, direct renderers, defaults, invalid options, Unicode, initials, types |
| 2 | DeepSeek V4.1 Flash 1017 max via OpenCode | Determinism, fresh process, cross-engine, XML, mixed IDs, embedding |
| 3 | GMI GLM-5.3 Flash high | Tarball, prepack, manifest, exports, types, zero deps, consumers |
| 4 | DeepSeek V4.1 Flash 1017 max | Independent Node JS, strict TS, Vite vanilla/React dev and production browser |
| 5 | GMI GLM-5.3 Flash high | Next SSR/hydration/prod, Vue, Svelte, Worker, offline HTML |
| 6 | DeepSeek V4.1 Flash 1017 max | Playground URL/history/params, rapid input, copy/download, snippets, asset failures |
| 7 | GMI GLM-5.3 Flash high | Injection, privacy, CSP, referrer, network, secrets, extreme inputs |
| 8 | DeepSeek V4.1 Flash 1017 max | Accessibility, keyboard, labels, status, zoom, mobile, contrast, motion, visuals |
| 9 | GMI GLM-5.3 Flash high | Performance at 1/100/1000, size, tree-shaking, memory, throttling, resilience |
| 10 | DeepSeek V4.1 Flash 1017 max | Independent challenge review and negative controls |
| 11 | Parent | Final integrated suite on fresh sandbox, final revision and tarball |

Rules:

- **One active agent task at a time.** The parent reviews each stage's evidence and records disposition before dispatching the next stage.
- Agents cannot approve their own work or accept risk. S0/S1 findings are release blockers and cannot be accepted; only the release owner may accept lower-severity (S2/S3) issues in writing.
- Stage owners execute the assigned scenarios only. Scope changes require parent approval before execution.
- Stage output is evidence, not a verdict. Parent review converts it to PASS/FAIL/BLOCKED dispositions.

## 3. Sandbox, resource, and data rules

- **One new dedicated Blaxel sandbox per execution stage.** No sandbox is reused between stages and no two agent tasks share one.
- Default allowance: **4 GB RAM, Node 24, Debian default image**. The parent records the explicit CPU/disk/network allowance for each stage in the dispatch. Each stage has a **30-minute active budget**; request an extension before expiry and stop if it is denied.
- Upload only necessary tracked source at the recorded commit, the actual tarball, and pinned fixture manifests/lockfiles.
- **Never upload** secrets, `.env` files, auth material, backups, `.git` credentials, or `node_modules`.
- All test workloads run in the sandbox. Local tools may orchestrate, edit qualification files, collect evidence, and commit docs.
- Retrieve and verify evidence **before** deleting the stage sandbox. Delete your own sandbox only after parent disposition.
- Raw logs go to ignored `out/qualification/S<N>/`; concise tracked reports go to `docs/testing/evidence/S<N>.md`. Confirm the ignore rule before Stage 1 writes logs.
- Fixtures are representative and defensible: adversarial and pairwise sampling to control combinatorial growth. No blind fixtures, weakened assertions, hidden skips, or self-generated expectations that merely mirror observed output.

## 4. Evidence contract

Every scenario record contains:

| Field | Requirement |
| --- | --- |
| Scenario | Matrix ID and short title |
| Revision | Commit SHA; working tree clean |
| Artifact | Actual tarball filename and SHA-256; source-only stage records "not applicable" |
| Environment | Sandbox ID, OS/image, Node/npm/pnpm/Yarn/browser versions, model |
| Command | Exact command(s), including environment variables that affect results |
| Expected / actual | Written expectation before execution; observed result |
| Evidence | Tracked concise report plus raw log path; screenshots/recordings where relevant |
| Severity | S0/S1/S2/S3 if failed |
| Disposition | Status and parent reviewer/date; no agent self-approval |

Statuses: **NOT RUN / RUNNING / PASS / FAIL / BLOCKED / NOT APPLICABLE**. Every skip or BLOCKED row needs a reason and parent acknowledgement. Fixed findings require a re-run with new evidence, not an assertion.

Severity:

- **S0** — integrity, security, secrets, package tamper, core determinism, or false release claims. Release blocker.
- **S1** — required functional, compatibility, accessibility, or agreed performance failure. Release blocker.
- **S2** — non-blocking defect; release owner written acceptance only.
- **S3** — cosmetic or documentation; release owner written acceptance only.

## 5. Stage gates

| Gate | Exit criteria |
| --- | --- |
| G0 Planning | This plan, matrix, findings/report templates, and decision record committed; `git diff --check` clean |
| G1–G10 | All assigned scenarios have evidence; every S0/S1 is fixed and re-run or the stage is FAIL; parent disposition recorded; evidence retrieved |
| G11 Final | Fresh sandbox at final revision; full integrated suite and final tarball pass; evidence manifest and parent sign-off; launch actions remain FUTURE |

A stage with an open S0/S1 blocks progression. A stage may proceed with accepted S2/S3 only after written owner acceptance. Any source change invalidates prior PASS evidence for affected scenarios and requires a new revision and affected re-runs.

Parent G0 review (2026-11-03): accepted with matrix corrections. Native Safari is a coverage limitation, not an observed defect: it prevents an unqualified Safari support claim, but does not halt unrelated Linux stages. Preserve agent-observed results separately from parent acceptance. Product baseline is 3ca99d2; execution must record actual current clean HEAD, including planning commits. Stage 5 includes both local Cloudflare workerd/Miniflare and browser Web Worker checks, not just one of them.

## 6. Performance and acceptance discipline

Stage 9 measures a baseline first on the declared sandbox class. Budgets are agreed with the parent **before** PASS/FAIL acceptance. This plan intentionally states no numeric performance promises. Bundle-size and tree-shaking results are reported with the exact build command and measurement method. Memory/object-URL checks include cleanup and repeated-render observation. Throttled runs report device/CPU/network settings.

## 7. Stage 1 dispatch brief

```text
Role: Stage 1 execution agent (implementation sub-agent)
Model: GMI GLM-5.3 Flash high via OpenCode
Baseline: test/release-qualification at current clean HEAD; record full SHA. Product baseline 3ca99d2. Do not switch branches.
Sandbox: one new dedicated Blaxel sandbox, explicitly allowed; 4 GB RAM, Node 24,
  Debian default; 30-minute active budget; request extension before expiry.
Scope: matrix S1-01..S1-08 only — ESM import, all eight documented renderers,
  default equivalence, invalid options, Unicode/normalization, initials,
  strict TypeScript declarations, SVG validity and safe markup.
Data: necessary tracked source at 3ca99d2 plus the actual built tarball only.
  Never upload secrets/.env/auth/backups/.git credentials/node_modules.
Work: install the actual tarball (no repo alias/symlink), run each scenario with
  exact commands, record expected before actual, capture artifacts, and write
  docs/testing/evidence/S1.md. Raw logs: out/qualification/S1/ (ignored).
Restrictions: no src/site changes, no push/PR/publish/deploy/DNS, no self-approval,
  no weakened assertions, no hidden skips, no invented results.
Deliver: S1 evidence with commit, tarball SHA-256, versions, commands,
  expected/actual, artifacts, severity for failures, and sandbox ID.
Stop: on S0/S1 finding, budget expiry, missing authorization, or any instruction
  requiring out-of-scope changes; report blocker precisely and wait for parent.
```

## 8. Historical context

`docs/VERIFICATION.md` reports 114 Vitest tests and 38 browser checks (2 intentionally skipped), plus a prior `npm pack` lifecycle and preview verification. These are **historical** results, not new qualification, not reproducible evidence for this plan, and must not be counted as PASS rows in the matrix or report.

## 9. Launch boundary

Only the parent's final disposition may support a release recommendation. Registry publication, staging, production, upgrade-path testing, DNS, and public announcements are separate launch activities requiring explicit permission and their own evidence; they are outside this qualification.
