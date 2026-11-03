# Release Qualification Matrix — dither-face 0.1.0

**Baseline:** `test/release-qualification` at `3ca99d2`. **Execution:** not started.

**Status summary:** 80 scenarios — **79 NOT RUN, 1 BLOCKED, 0 RUNNING, 0 PASS, 0 FAIL**. `S8-09` is BLOCKED because native Safari/macOS is unavailable. Historical 114 unit / 38 browser results from [VERIFICATION.md](../VERIFICATION.md) are **not** qualification rows and are not counted here.

**Severity if failed:** S0 = integrity/security/secrets/determinism/package/false-claim blocker; S1 = required functional, compatibility, accessibility, or agreed-performance blocker; S2/S3 = release owner written acceptance only. No agent may self-approve. Every row requires the evidence fields in section 2, including commit, tarball SHA-256, versions, exact command, expected/actual, artifact, severity, and parent approval.

## 1. Scenarios

### Stage 1 — API and direct rendering (GLM-5.3 Flash high)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S1-01 | ESM entry import | Install actual tarball in empty Node 24 project; import package root; enumerate exports. | Import succeeds; documented named exports exist; no side effects or network. | S1 | NOT RUN |
| S1-02 | All eight renderers direct render | Call each documented renderer with fixed seeds (`alice`, `bob`, `用户`, empty); XML-parse output. | Non-empty well-formed SVG per renderer; documented structure; no throw. | S1 | NOT RUN |
| S1-03 | Default option equivalence | Per renderer compare omitted options, `{}`, and documented explicit defaults byte-for-byte. | Identical output for equivalent defaults. | S1 | NOT RUN |
| S1-04 | Invalid options | Pass null, arrays, wrong primitive types, NaN/Infinity, unknown keys, out-of-range values. | Documented throw or safe fallback; never malformed SVG or partial state. | S1 | NOT RUN |
| S1-05 | Unicode and normalization | Seeds: ASCII, emoji, combining marks, CJK, RTL, whitespace-only, 10k chars; repeat twice. | Deterministic, safely escaped, no crash/hang; normalization matches documentation. | S1 | NOT RUN |
| S1-06 | Initials extraction | Names: Latin, CJK, Arabic, emoji, punctuation, single char, extra spaces; inspect rendered text. | Documented initials/letters; XML-escaped; deterministic. | S1 | NOT RUN |
| S1-07 | Strict TypeScript declarations | Strict consumer imports types/options; `tsc --noEmit` under declared module resolution. | Valid usage compiles; documented invalid usage errors; no missing declarations. | S1 | NOT RUN |
| S1-08 | SVG validity and safe markup | XML-parse every output; scan for `script`, `on*` handlers, `foreignObject`, external URLs. | Well-formed SVG; no executable content or external references. | S0 | NOT RUN |

### Stage 2 — Determinism and embedding (DeepSeek V4.1 Flash 1017 max)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S2-01 | In-process determinism | 100 repeated calls per renderer/seed/options; hash output bytes. | All hashes equal for identical inputs. | S0 | NOT RUN |
| S2-02 | Fresh-process determinism | Three separate Node processes, same inputs; compare SHA-256. | Identical bytes/hashes across processes. | S0 | NOT RUN |
| S2-03 | Cross-engine output | Bundle and run Chromium, Firefox, WebKit, plus Node; compare canonical output. | Canonical output matches; any difference documented and assessed. | S1 | NOT RUN |
| S2-04 | XML and Unicode embedding | XML-parse outputs for Unicode/RTL/emoji/control-character seeds. | Well-formed; invalid XML chars absent; safe escaping. | S1 | NOT RUN |
| S2-05 | Mixed repeated IDs | Render 50 avatars in one HTML document; inspect IDs and URL references. | No duplicate conflicting IDs or cross-avatar references; each renders. | S1 | NOT RUN |
| S2-06 | Inline data URL | Embed SVG as `data:image/svg+xml` in `img`/canvas; monitor requests. | Renders; no external requests; no script execution. | S1 | NOT RUN |
| S2-07 | File and HTTP embedding | Save `.svg`, load via `file://`; serve over localhost HTTP and embed. | Both render; identical structure; no non-local network. | S1 | NOT RUN |
| S2-08 | Pairwise option combinations | Pairwise sample renderer × seed class × options; repeat each twice. | Deterministic valid output for every sampled combination; no unexplained gaps. | S1 | NOT RUN |

### Stage 3 — Packaging and consumers (GLM-5.3 Flash high)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S3-01 | Tarball manifest | `npm pack --dry-run --json`; compare packed file list to declared allowlist. | Only intended dist/license/readme/package files; no source, secrets, maps, or logs. | S0 | NOT RUN |
| S3-02 | Prepack lifecycle | Clean checkout; `npm pack`; record lifecycle output and tarball SHA-256. | `clean:dist`, `check`, `build:web` run; tarball produced; hash recorded. | S1 | NOT RUN |
| S3-03 | Actual tarball install | Empty project `npm install <tarball.tgz>`; no repo alias/symlink; import package. | Install and import succeed from the packed artifact. | S0 | NOT RUN |
| S3-04 | Zero runtime dependencies | Inspect manifest and installed tree with `npm ls --omit=dev`. | No `dependencies`; no runtime packages installed. | S0 | NOT RUN |
| S3-05 | Exports resolution | Import root; attempt documented-unsupported deep paths. | Root resolves; unsupported deep imports fail or match documented behavior. | S1 | NOT RUN |
| S3-06 | Types from tarball | Strict TS consumer resolves package types under Node16 and bundler resolution. | Types resolve; compile succeeds; no missing-declaration warnings. | S1 | NOT RUN |
| S3-07 | npm/pnpm/Yarn consumers | Pinned dummy dependencies and lockfiles; install tarball and run script in all three. | All three install and execute identically. | S1 | NOT RUN |
| S3-08 | Manifest truth | Compare name/version/engines/license/sideEffects/files with repo and packed output. | Values match; no unexpected runtime fields or files. | S1 | NOT RUN |

### Stage 4 — Independent Node/TS/Vite browser use (DeepSeek V4.1 Flash 1017 max)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S4-01 | Plain Node ESM JS | Plain JS project imports tarball and renders all renderers. | Runs; output matches Node golden. | S1 | NOT RUN |
| S4-02 | Strict TypeScript app | Strict TS project compiles and runs against tarball. | Compiles cleanly; runtime output valid. | S1 | NOT RUN |
| S4-03 | Vite vanilla dev | Vite vanilla dev server; real browser loads page. | All tested avatars render; no console errors. | S1 | NOT RUN |
| S4-04 | Vite vanilla production | Production build and preview; real browser. | Renders; no missing assets; parity with dev. | S1 | NOT RUN |
| S4-05 | Vite React dev | Vite React dev server; real browser. | React tree renders avatar; no runtime errors. | S1 | NOT RUN |
| S4-06 | Vite React production | Production build/preview; browser and console check. | Renders; no errors; output matches Node golden. | S1 | NOT RUN |
| S4-07 | Browser/Node parity | Compare browser markup or canvas output to Node golden. | Canonical output matches or differences are documented. | S1 | NOT RUN |

### Stage 5 — Frameworks, SSR, Worker, offline (GLM-5.3 Flash high)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S5-01 | Next.js SSR | Next app renders avatar server-side; inspect returned HTML. | SVG present in SSR HTML; no client-only crash. | S1 | NOT RUN |
| S5-02 | Next production/hydration | Production build/start; browser console and hydration check. | No hydration mismatch/errors; avatar stable after hydration. | S1 | NOT RUN |
| S5-03 | Vue client build | Vue 3 production build; browser render. | Renders; no console errors; output matches golden. | S1 | NOT RUN |
| S5-04 | Svelte client build | Svelte production build; browser render. | Renders; no console errors; output matches golden. | S1 | NOT RUN |
| S5-05 | Web Worker runtime | Worker imports bundle and renders; transfer result to page. | Works without DOM assumptions; deterministic output. | S1 | NOT RUN |
| S5-06 | Plain HTML offline | Plain HTML plus bundled asset via `file://` with network disabled. | Renders fully offline; no failed external requests. | S1 | NOT RUN |
| S5-07 | Framework parity | Hash framework outputs against Node golden canonical form. | Match for tested fixtures or documented engine differences. | S1 | NOT RUN |

### Stage 6 — Playground interaction (DeepSeek V4.1 Flash 1017 max)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S6-01 | URL state restore | Load playground with valid seed/renderer/options parameters. | State restored; output matches requested configuration. | S1 | NOT RUN |
| S6-02 | Back/forward history | Change controls; navigate back and forward repeatedly. | UI and output restore consistently; no stale state. | S1 | NOT RUN |
| S6-03 | Invalid parameters | Unknown renderer, wrong types, out-of-range, empty required values. | Documented fallback; no crash; URL normalized safely. | S1 | NOT RUN |
| S6-04 | Duplicate parameters | Repeated keys in varying order. | Documented precedence applied consistently. | S1 | NOT RUN |
| S6-05 | Malformed/encoded parameters | Malformed percent-encoding, very long values, injection payloads. | No crash/XSS; rejected or safely encoded; bounded work. | S0 | NOT RUN |
| S6-06 | Rapid input | Rapid typing, slider, and renderer switches for 30 seconds. | Debounce/queue stable; final state matches last input; no runaway work. | S1 | NOT RUN |
| S6-07 | Copy and download | Copy snippet and download SVG; compare with displayed avatar. | Output matches displayed bytes; safe; failures explained. | S1 | NOT RUN |
| S6-08 | Executable snippets | Execute generated snippets in a clean project; inspect for injection. | Snippets work or are clearly labelled; no script injection. | S0 | NOT RUN |
| S6-09 | Asset failure | Block font/style/JS chunks in devtools; reload. | Graceful degradation with visible status; no blank page or infinite retry. | S2 | NOT RUN |

### Stage 7 — Security, privacy, and resource abuse (GLM-5.3 Flash high)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S7-01 | SVG injection | Seed/initials/options with `<script>`, `onload`, entities, CDATA breakouts. | Escaped; no executable elements/handlers; valid output. | S0 | NOT RUN |
| S7-02 | UI injection | HTML/attribute payloads in labels and status regions. | Rendered as text; no DOM injection. | S0 | NOT RUN |
| S7-03 | CSP compatibility | Serve with strict CSP (no `unsafe-inline`/`eval`) as documented. | Page and generated SVG render; no required-code CSP violations. | S1 | NOT RUN |
| S7-04 | Referrer and privacy | Monitor requests and `Referer` under strict policy. | No unexpected referrer leakage or third-party requests. | S1 | NOT RUN |
| S7-05 | Network behavior | Render with network offline and request logging. | No required network; no unexpected outbound calls. | S1 | NOT RUN |
| S7-06 | Secrets and excluded data | Scan tracked source, tarball, fixtures, and logs for credentials/env/backups. | No secrets or excluded material; no auth artifacts. | S0 | NOT RUN |
| S7-07 | Extreme inputs | 1 MB seed, huge batch, pathological Unicode, NaN/Infinity options. | Bounded failure or documented handling; no crash/hang. | S1 | NOT RUN |
| S7-08 | Resource limits | Run under declared memory/time caps; observe cleanup. | Stays within caps or fails gracefully with a clear error. | S1 | NOT RUN |

### Stage 8 — Accessibility and visuals (DeepSeek V4.1 Flash 1017 max)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S8-01 | Automated accessibility | Run axe or equivalent on default and error states. | No serious or critical violations. | S1 | NOT RUN |
| S8-02 | Keyboard operation | Operate every control keyboard-only; track focus. | Full operation; visible focus; logical order; no traps. | S1 | NOT RUN |
| S8-03 | Labels and roles | Inspect accessible names/roles, including the size selector. | Every control named; label does not absorb option text; roles correct. | S1 | NOT RUN |
| S8-04 | Status announcements | Trigger copy, download, render, and error; observe live regions. | Status announced; no duplicate or noisy announcements. | S1 | NOT RUN |
| S8-05 | Zoom and reflow | 200% and 400% zoom; narrow reflow. | No loss of content/function; controls reachable. | S1 | NOT RUN |
| S8-06 | Mobile and visual inspection | Mobile viewport touch use; capture desktop/mobile screenshots. | Usable targets/layout; screenshots inspected without clipping; not pixel baselines. | S2 | NOT RUN |
| S8-07 | Contrast and forced colors | Measure text/control contrast; emulate forced-colors. | Meets agreed contrast; boundaries/focus visible in forced colors. | S1 | NOT RUN |
| S8-08 | Reduced motion | Emulate `prefers-reduced-motion`. | No nonessential animation; essential transitions respect setting. | S2 | NOT RUN |
| S8-09 | Native Safari | Run the browser suite on macOS Safari, if available. | **BLOCKED** — native Safari/macOS unavailable; Linux WebKit does not substitute. | S1 | BLOCKED |

### Stage 9 — Performance and resilience (GLM-5.3 Flash high)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S9-01 | Batch 1 baseline | Measure one render after warmup; record time and memory. | Baseline recorded; no budget until agreed. | S1 | NOT RUN |
| S9-02 | Batch 100 | Measure 100 renders across repeated runs. | Baseline recorded; stable; no errors. | S1 | NOT RUN |
| S9-03 | Batch 1000 | Measure 1000 renders under declared caps. | Completes; compared with agreed budget; no leak or crash. | S1 | NOT RUN |
| S9-04 | Size and tree-shaking | Build one-renderer and all-renderer bundles; inspect unused code. | Size reported with method; unused renderers excluded where supported. | S1 | NOT RUN |
| S9-05 | Memory and object URLs | Repeated render/create/revoke cycles; inspect heap and URL counts. | No unbounded growth; URLs revoked; cleanup verified. | S1 | NOT RUN |
| S9-06 | Slow CPU/network | Throttle CPU/network; interact during rendering. | UI responsive within agreed budget; no long blocking task beyond budget. | S1 | NOT RUN |
| S9-07 | Failure resilience | Force render/asset failures; cancel and retry repeatedly. | Bounded retries; clear errors; no stuck queue or leaked work. | S1 | NOT RUN |

### Stage 10 — Independent challenge and negative controls (DeepSeek V4.1 Flash 1017 max)

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S10-01 | Harness review | Inspect qualification harness for blind fixtures, weakened assertions, hidden skips, shared state. | No such weaknesses, or findings raised with evidence. | S0 | NOT RUN |
| S10-02 | Negative controls | Inject known-bad build/output/options; run suite. | Suite fails as expected; no false PASS. | S0 | NOT RUN |
| S10-03 | Expected-output tamper | Alter expected digest/output; re-run. | Mismatch detected and recorded. | S0 | NOT RUN |
| S10-04 | Evidence integrity | Cross-check logs/artifacts with commit and tarball hashes. | Traceable and consistent; no orphan or edited evidence. | S0 | NOT RUN |
| S10-05 | Independent repeat | Re-run critical determinism and accessibility checks. | Results reproduce; discrepancies escalated. | S1 | NOT RUN |

### Stage 11 — Parent final integrated suite

| ID | Scenario | Procedure | Expected | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| S11-01 | Fresh final sandbox | Parent creates a new sandbox from the final commit, tracked source only. | Clean install; no excluded files; hashes match. | S0 | NOT RUN |
| S11-02 | Full integrated suite | Run the complete qualification suite. | All required scenarios pass; no hidden skips; zero open S0/S1. | S0 | NOT RUN |
| S11-03 | Final tarball smoke | Pack final tarball; install, import, and determinism smoke. | Hash recorded; installs; zero runtime deps; deterministic output. | S0 | NOT RUN |
| S11-04 | Evidence and disposition | Assemble manifest, findings, report; parent review. | Complete traceable evidence; launch actions remain FUTURE. | S1 | NOT RUN |

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
