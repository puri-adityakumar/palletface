# Release Qualification Matrix — dither-face 0.1.0

**Current parent disposition (2026-11-09): 70 PASS, 1 BLOCKED, 9 REVIEW REQUIRED, 0 NOT RUN (80 total).** Stages 1–8: 63 PASS/1 BLOCKED; Stage 9: 7 REVIEW REQUIRED; Stage 10: 5 PASS; Stage 11: 2 PASS/2 REVIEW REQUIRED. See [DISPOSITIONS.md](DISPOSITIONS.md).

**Documentation executor:** Codex / `gpt-6-luna` / `max`. Historical model labels and run identities remain as recorded. S3-R1 is accepted for eight rows; historical NC5 sensitivity credit is withdrawn and replaced by the accepted [S3-COMPARATOR-R1](evidence/S3-COMPARATOR-R1.md) recheck.

**Status summary:** 80 scenarios — **70 PASS, 1 BLOCKED, 9 REVIEW REQUIRED, 0 NOT RUN**. S9 performance and the full release gate remain unresolved. Functional final components passed across split runs on unchanged product.

**Severity if failed:** S0 = integrity/security/secrets/determinism/package/false-claim blocker; S1 = required functional, compatibility, accessibility, or agreed-performance blocker; S2/S3 = release owner written acceptance only. No agent may self-approve. Every row requires the evidence fields in section 2, including commit, tarball SHA-256, versions, exact command, expected/actual, artifact, severity, and parent approval.

## 1. Scenarios

### Stage 1 — API and direct rendering (DeepSeek V4.1 Flash 1017 max; reassigned after GLM attempt rejection)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S1-01 | ESM entry import | Install actual tarball in empty Node 24 project; import package root; enumerate exports. | Import succeeds; documented named exports exist; no side effects or network. | S1 | PASS (parent accepted 2026-11-03) |
| S1-02 | All eight renderers direct render | Call each documented renderer with fixed seeds (`alice`, `bob`, `用户`, empty); XML-parse output. | Non-empty well-formed SVG per renderer; documented structure; no throw. | S1 | PASS (parent accepted 2026-11-03) |
| S1-03 | Default option equivalence | Compare ditherFace(seed), empty options, explicit sprite/80 defaults, and pixelSprite(seed,80). Test missing direct-renderer px separately. | Equivalent high-level defaults match; direct renderers reject missing px. | S1 | PASS (parent accepted 2026-11-03) |
| S1-04 | Invalid options | Test invalid types, null, NaN/Infinity, unknown styles, zero/negative px; test fractional/tiny/large finite positive px. | Invalid inputs throw; unknown extra keys may be ignored; no undocumented upper size cap. | S1 | PASS (parent accepted 2026-11-03) |
| S1-05 | Unicode and normalization | Seeds: ASCII, emoji, combining marks, CJK, RTL, whitespace-only, 10k chars; repeat twice. | Deterministic, safely escaped, no crash/hang; normalization matches documentation. | S1 | PASS (parent accepted 2026-11-03) |
| S1-06 | Initials extraction | Names: Latin, CJK, Arabic, emoji, punctuation, single char, extra spaces; inspect rendered text. | Documented initials/letters; XML-escaped; deterministic. | S1 | PASS (parent accepted 2026-11-03) |
| S1-07 | Strict TypeScript declarations | Strict consumer imports types/options; `tsc --noEmit` under declared module resolution. | Valid usage compiles; documented invalid usage errors; no missing declarations. | S1 | PASS (parent accepted 2026-11-03) |
| S1-08 | SVG validity and safe markup | XML-parse every output; scan for `script`, `on*` handlers, `foreignObject`, external URLs. | Well-formed SVG; no executable content or external references. | S0 | PASS (parent accepted 2026-11-03) |

### Stage 2 — Determinism and embedding (DeepSeek V4.1 Flash 1017 max; R1 recheck)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S2-01 | In-process determinism | 100 repeated calls per renderer/seed/options; hash output bytes. | All hashes equal for identical inputs. | S0 | PASS (parent accepted 2026-11-03) |
| S2-02 | Fresh-process determinism | Three separate Node processes, same inputs; compare SHA-256. | Identical bytes/hashes across processes. | S0 | PASS (parent accepted 2026-11-03) |
| S2-03 | Cross-engine output | Compare raw output in Node/Chromium/Firefox/WebKit first; canonicalization is diagnostic only. | Sampled output agrees or discrepancies are reported, never hidden by normalization. | S1 | PASS (parent accepted 2026-11-03) |
| S2-04 | XML and Unicode embedding | XML-parse outputs for Unicode/RTL/emoji/control-character seeds. | Well-formed; invalid XML chars absent; safe escaping. | S1 | PASS (parent accepted 2026-11-03) |
| S2-05 | Mixed repeated IDs | Same page/HTML/CSS cell and integral coordinates with all 82 mixed avatars, then remove only the other SVG elements retaining wrappers; compare the full target raster (no text/edge mask) in Chromium 82/82 and representative Firefox/WebKit; controls use the same comparator. | Repeated IDs allowed only for byte-equivalent definitions; full target pixels identical with eligibleFraction 1.0; glyph/opacity/clip/gradient/colour/ID corruption rejected. | S1 | PASS (parent accepted 2026-11-03) |
| S2-06 | Inline data URL | Embed SVG as `data:image/svg+xml` in `img`/canvas; monitor requests. | Renders; no external requests; no script execution. | S1 | PASS (parent accepted 2026-11-03) |
| S2-07 | File and HTTP embedding | Save `.svg`, load via `file://`; serve over localhost HTTP and embed. | Both render; identical structure; no non-local network. | S1 | PASS (parent accepted 2026-11-03) |
| S2-08 | Pairwise options and invariance | Pairwise renderer/seed/name/px samples; interleave calls; compare fixed fixtures; remove only outer dimensions for size comparison. | Repeatable fixture-preserving output; px does not alter design, name does not alter seeded backgrounds. | S1 | PASS (parent accepted 2026-11-03) |

Stage 2 R1 was parent-accepted on 2026-11-03. Its accepted evidence retains raw-comparison and matched-context coverage limits: [S2-R1](evidence/S2-R1.md); returned run: [S2](evidence/S2.md).

S3-R1 and S3-COMPARATOR-R1 are parent-accepted for all eight scenario rows. Historical hash-only NC5 receives no credit; the integrated shared comparator's positive, mutation and faulty-comparator checks passed. The original rejected resumed S3 remains rejected and retained. Evidence: [S3-R1](evidence/S3-R1.md), [S3-COMPARATOR-R1](evidence/S3-COMPARATOR-R1.md), [S3](evidence/S3.md).

### Stage 3 — Packaging and consumers (DeepSeek V4.1 Flash 1017 max; reassigned after GLM execution failures)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S3-01 | Tarball manifest | `npm pack --dry-run --json`; compare packed file list to declared allowlist. | Only intended dist/license/readme/package files; no source, secrets, maps, or logs. | S0 | PASS (parent accepted 2026-11-04) |
| S3-02 | Prepack lifecycle | Clean checkout; `npm pack`; record lifecycle output and tarball SHA-256. | `clean:dist`, `check`, `build:web` run; tarball produced; hash recorded. | S1 | PASS (parent accepted 2026-11-04) |
| S3-03 | Actual tarball install | Empty project `npm install <tarball.tgz>`; no repo alias/symlink; import package. | Install and import succeed from the packed artifact. | S0 | PASS (parent accepted 2026-11-04) |
| S3-04 | Zero runtime dependencies | Inspect manifest and installed tree with `npm ls --omit=dev`. | No `dependencies`; no runtime packages installed. | S0 | PASS (parent accepted 2026-11-04) |
| S3-05 | Exports resolution | Import root; attempt documented-unsupported deep paths. | Root resolves; unsupported deep imports fail or match documented behavior. | S1 | PASS (parent accepted 2026-11-04) |
| S3-06 | Types from tarball | Strict TS consumer resolves package types under Node16 and bundler resolution. | Types resolve; compile succeeds; no missing-declaration warnings. | S1 | PASS (parent accepted 2026-11-04) |
| S3-07 | npm/pnpm/Yarn consumers | Pinned dummy dependencies and lockfiles; install tarball and run script in all three. | All three install and execute identically. | S1 | PASS (parent accepted 2026-11-04) |
| S3-08 | Manifest truth | Compare name/version/engines/license/sideEffects/files with repo and packed output. | Values match; no unexpected runtime fields or files. | S1 | PASS (parent accepted 2026-11-04) |

### Stage 4 — Independent Node/TS/Vite browser use (DeepSeek V4.1 Flash 1017 max)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S4-01 | Plain Node ESM JS | Plain JS project imports tarball and renders all renderers. | Runs; output matches Node golden. | S1 | PASS (parent accepted 2026-11-04) |
| S4-02 | Strict TypeScript app | Strict TS project compiles and runs against tarball. | Compiles cleanly; runtime output valid. | S1 | PASS (parent accepted 2026-11-04) |
| S4-03 | Vite vanilla dev | Vite vanilla dev server; real browser loads page. | All tested avatars render; no console errors. | S1 | PASS (parent accepted 2026-11-04) |
| S4-04 | Vite vanilla production | Production build and preview; real browser. | Renders; no missing assets; parity with dev. | S1 | PASS (parent accepted 2026-11-04) |
| S4-05 | Vite React dev | Vite React dev server; real browser. | React tree renders avatar; no runtime errors. | S1 | PASS (parent accepted 2026-11-04) |
| S4-06 | Vite React production | Production build/preview; browser and console check. | Renders; no errors; output matches Node golden. | S1 | PASS (parent accepted 2026-11-04) |
| S4-07 | Browser/Node parity | Compare browser markup or canvas output to Node golden. | Canonical output matches or differences are documented. | S1 | PASS (parent accepted 2026-11-04) |

### Stage 5 — Frameworks, SSR, Worker, offline (GLM-5.3 Flash high)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S5-01 | Next.js SSR | Inspect server HTML for inline SVG or decoded image data URL. | Expected SVG is present inline or encoded; no client-only crash. | S1 | PASS (parent accepted 2026-11-04) |
| S5-02 | Next production/hydration | Production build/start; browser console and hydration check. | No hydration mismatch/errors; avatar stable after hydration. | S1 | PASS (parent accepted 2026-11-04) |
| S5-03 | Vue client build | Vue 3 production build; browser render. | Renders; no console errors; output matches golden. | S1 | PASS (parent accepted 2026-11-04) |
| S5-04 | Svelte client build | Svelte production build; browser render. | Renders; no console errors; output matches golden. | S1 | PASS (parent accepted 2026-11-04) |
| S5-05 | Cloudflare and browser Worker | Install tarball in local workerd/Miniflare SVG route; separately test browser Web Worker. | Both work without DOM/Node-specific assumptions; no deployment required. | S1 | PASS (parent accepted 2026-11-04) |
| S5-06 | Plain HTML offline | Plain HTML plus bundled asset via `file://` with network disabled. | Renders fully offline; no failed external requests. | S1 | PASS (parent accepted 2026-11-04) |
| S5-07 | Framework parity | Hash framework outputs against Node golden canonical form. | Match for tested fixtures or documented engine differences. | S1 | PASS (parent accepted 2026-11-04) |

### Stage 6 — Playground interaction (DeepSeek V4.1 Flash 1017 max)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S6-01 | URL state restore | Load playground with valid seed/renderer/options parameters. | State restored; output matches requested configuration. | S1 | PASS (parent accepted 2026-11-07) |
| S6-02 | Back/forward history | Navigate distinct share URLs/history entries and back/forward; edit controls within an entry. | UI restores on navigation; replaceState edits need not create per-keystroke history entries. | S1 | PASS (parent accepted 2026-11-07) |
| S6-03 | Invalid parameters | Unknown renderer, wrong types, out-of-range, empty required values. | Documented fallback; no crash; URL normalized safely. | S1 | PASS (parent accepted 2026-11-07) |
| S6-04 | Duplicate parameters | Repeated keys in varying order. | Documented precedence applied consistently. | S1 | PASS (parent accepted 2026-11-07) |
| S6-05 | Malformed/encoded parameters | Malformed percent-encoding, very long values, injection payloads. | No crash/XSS; rejected or safely encoded; bounded work. | S0 | PASS (parent accepted 2026-11-07) |
| S6-06 | Rapid input | Rapid typing, size selection, and style changes for 30 seconds. | Final state matches last input; no runaway work; no particular debounce/queue design required. | S1 | PASS (parent accepted 2026-11-07) |
| S6-07 | Copy and download | Copy snippet and download SVG; compare with displayed avatar. | Output matches displayed bytes; safe; failures explained. | S1 | PASS (parent accepted 2026-11-07) |
| S6-08 | Executable snippets | Execute generated snippets in a clean project; inspect for injection. | Snippets work or are clearly labelled; no script injection. | S0 | PASS (parent accepted 2026-11-07) |
| S6-09 | Asset failure | Block font/style/JS chunks in devtools; reload. | Graceful degradation with visible status; no blank page or infinite retry. | S2 | PASS (parent accepted 2026-11-07) |

### Stage 7 — Security, privacy, and resource abuse (GLM-5.3 Flash high)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S7-01 | SVG injection | Seed/initials/options with `<script>`, `onload`, entities, CDATA breakouts. | Escaped; no executable elements/handlers; valid output. | S0 | PASS (parent accepted 2026-11-04) |
| S7-02 | UI injection | HTML/attribute payloads in labels and status regions. | Rendered as text; no DOM injection. | S0 | PASS (parent accepted 2026-11-04) |
| S7-03 | CSP compatibility | Serve with strict CSP (no `unsafe-inline`/`eval`) as documented. | Page and generated SVG render; no required-code CSP violations. | S1 | PASS (parent accepted 2026-11-04) |
| S7-04 | Referrer and privacy | Monitor requests and `Referer` under strict policy. | No unexpected referrer leakage or third-party requests. | S1 | PASS (parent accepted 2026-11-04) |
| S7-05 | Network behavior | Render with network offline and request logging. | No required network; no unexpected outbound calls. | S1 | PASS (parent accepted 2026-11-04) |
| S7-06 | Secrets and excluded data | Scan tracked source, tarball, fixtures, and logs for credentials/env/backups. | No secrets or excluded material; no auth artifacts. | S0 | PASS (parent accepted 2026-11-04) |
| S7-07 | Extreme inputs | 1 MB seed, huge batch, pathological Unicode, NaN/Infinity options. | Bounded failure or documented handling; no crash/hang. | S1 | PASS (parent accepted 2026-11-04) |
| S7-08 | Resource limits | Run under declared memory/time caps; observe cleanup. | Stays within caps or fails gracefully with a clear error. | S1 | PASS (parent accepted 2026-11-04) |

### Stage 8 — Accessibility and visuals (DeepSeek V4.1 Flash 1017 max)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S8-01 | Automated accessibility | Run axe or equivalent on default and error states. | No serious or critical violations. | S1 | PASS (parent accepted 2026-11-07) |
| S8-02 | Keyboard operation | Operate every control keyboard-only; track focus. | Full operation; visible focus; logical order; no traps. | S1 | PASS (parent accepted 2026-11-07) |
| S8-03 | Labels and roles | Inspect accessible names/roles, including the size selector. | Every control named; label does not absorb option text; roles correct. | S1 | PASS (parent accepted 2026-11-07) |
| S8-04 | Status announcements | Trigger copy, download, render, and error; observe live regions. | Status announced; no duplicate or noisy announcements. | S1 | PASS (parent accepted 2026-11-07) |
| S8-05 | Zoom and reflow | 200% and 400% zoom; narrow reflow. | No loss of content/function; controls reachable. | S1 | PASS (parent accepted 2026-11-07) |
| S8-06 | Mobile and visual inspection | Mobile viewport touch use; capture desktop/mobile screenshots. | Usable targets/layout; screenshots inspected without clipping; not pixel baselines. | S2 | PASS (parent accepted 2026-11-07) |
| S8-07 | Contrast and forced colors | Measure text/control contrast; emulate forced-colors. | Meets agreed contrast; boundaries/focus visible in forced colors. | S1 | PASS (parent accepted 2026-11-07) |
| S8-08 | Reduced motion | Emulate `prefers-reduced-motion`. | No nonessential animation; essential transitions respect setting. | S2 | PASS (parent accepted 2026-11-07) |
| S8-09 | Native Safari | Run the browser suite on macOS Safari, if available. | **BLOCKED** — native Safari/macOS unavailable; Linux WebKit does not substitute. | S1 | BLOCKED (native Safari unavailable) |

### Stage 9 — Performance and resilience (GLM-5.3 Flash high)

All seven rows are REVIEW REQUIRED. Measurements are collected, but no release performance budgets are parent-approved. Retain the Codex site 66 ms/50 ms regression-limit failure, all monitoring exceedances, S9-O1 history-rate-limit errors, and S9-O2 bounded retry observation; none is upgraded to PASS.

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S9-01 | Batch 1 baseline | Measure one render after warmup; record time and memory. | Baseline recorded; no budget until agreed. | S1 | REVIEW REQUIRED |
| S9-02 | Batch 100 | Measure 100 renders across repeated runs. | Baseline recorded; stable; no errors. | S1 | REVIEW REQUIRED |
| S9-03 | Batch 1000 | Measure 1000 renders under declared caps. | Completes; compared with agreed budget; no leak or crash. | S1 | REVIEW REQUIRED |
| S9-04 | Size and tree-shaking | Build one-renderer and all-renderer bundles; inspect unused code. | Size reported with method; unused renderers excluded where supported. | S1 | REVIEW REQUIRED |
| S9-05 | Memory and object URLs | Repeated render/create/revoke cycles; inspect heap and URL counts. | No unbounded growth; URLs revoked; cleanup verified. | S1 | REVIEW REQUIRED |
| S9-06 | Slow CPU/network | Throttle CPU/network; interact during rendering. | UI responsive within agreed budget; no long blocking task beyond budget. | S1 | REVIEW REQUIRED |
| S9-07 | Failure resilience | Force render/asset failures; cancel and retry repeatedly. | Bounded retries; clear errors; no stuck queue or leaked work. | S1 | REVIEW REQUIRED |

### Stage 10 — Independent challenge and negative controls (DeepSeek V4.1 Flash 1017 max)

All five rows accepted by parent review of accumulated independent checks and corrective comparator/integrity evidence. Historical S10-R1 remains 4/5 with evidence-integrity FAIL; new closure evidence does not rewrite that result.

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S10-01 | Harness review | Inspect qualification harness for blind fixtures, weakened assertions, hidden skips, shared state. | No such weaknesses, or findings raised with evidence. | S0 | PASS |
| S10-02 | Negative controls | Inject known-bad build/output/options; run suite. | Suite fails as expected; no false PASS. | S0 | PASS |
| S10-03 | Expected-output tamper | Alter expected digest/output; re-run. | Mismatch detected and recorded. | S0 | PASS |
| S10-04 | Evidence integrity | Cross-check logs/artifacts with commit and tarball hashes. | Traceable and consistent; no orphan or edited evidence. | S0 | PASS |
| S10-05 | Independent repeat | Re-run critical determinism and accessibility checks. | Results reproduce; discrepancies escalated. | S1 | PASS |

### Stage 11 — Parent final integrated suite

Fresh setup and package smoke accepted. Functional components passed across split resource-recovery runs; complete release gate remains unresolved because Stage 9 criteria remain open.

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S11-01 | Fresh final sandbox | Parent creates a new sandbox from the final commit, tracked source only. | Clean install; no excluded files; hashes match. | S0 | PASS |
| S11-02 | Full integrated suite | Run the complete qualification suite. | All required scenarios pass; no hidden skips; zero open S0/S1. | S0 | REVIEW REQUIRED |
| S11-03 | Final tarball smoke | Pack final tarball; install, import, and determinism smoke. | Hash recorded; installs; zero runtime deps; deterministic output. | S0 | PASS |
| S11-04 | Evidence and disposition | Assemble manifest, findings, report; parent review. | Complete traceable evidence; launch actions remain FUTURE. | S1 | REVIEW REQUIRED |

## 2. Evidence record (required per scenario)

| Field | Requirement |
| --- | --- |
| Scenario | Matrix ID and title |
| Revision | Commit SHA; working tree clean |
| Tarball | Actual filename and SHA-256; source-only scenario records N/A |
| Versions | Sandbox ID, OS/image, Node, npm/pnpm/Yarn, browser, model |
| Command | Exact command(s) and result-affecting environment variables |
| Expected / actual | Expectation written before execution; observed result |
| Artifact | Tracked concise report `docs/testing/evidence/S<N>.md` plus ignored raw log path |
| Severity | S0/S1/S2/S3 if failed |
| Approval | Parent reviewer, date, status/disposition; no agent self-approval |

Raw logs: `out/qualification/S<N>/` (ignored). Tracked reports: `docs/testing/evidence/S<N>.md`. Evidence must be retrieved before sandbox deletion. A fixed finding requires a re-run with new evidence.

## 3. Deferred launch scenarios (not counted; not PASS)

| ID | Activity | Status | Rule |
| --- | --- | --- | --- |
| F-01 | Public npm/registry publication | FUTURE | Requires separate launch permission; never PASS prelaunch |
| F-02 | Staging deployment | FUTURE | Separate authorization and evidence |
| F-03 | Production deployment | FUTURE | Separate authorization and evidence |
| F-04 | Upgrade paths from prior versions | FUTURE | No prior qualified release exists |
| F-05 | Custom domain/DNS | FUTURE | Separate authorization |
| F-06 | Hosted CI and release automation | FUTURE | Not exercised in qualification |
