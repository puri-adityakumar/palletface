# Qualification execution log

## 2026-11-04 — Stage 3 returned; independent tracks permitted

- Stage 3 provisional evidence is retained but not approved: resumed cross-revision results and earlier overlapping processes require a clean full rerun.
- Sandbox active budget was exceeded without escalation. Stop and retrieve on timeout/budget limits; never silently extend or relaunch an uncertain-running command.
- Stage 3 sandbox authorized for deletion after retrieval. Fresh non-resumed recheck required.
- Following the owner's request for parallel work, permit Stage 3 recheck and independent Stage 4 consumers concurrently, each on its own sandbox and separate file ownership. Both use frozen product tarball `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021`. No local test/server workloads. Parent alone updates master dispositions.

## 2026-11-03 — Stage 1 GLM attempt rejected

- Model: `gmicloud/zai-org/GLM-5.3-Flash`, reasoning `high`, through OpenCode.
- Agent returned repetitive PASS claims followed by an acknowledgement that the actual harness had not been written.
- Parent checked: clean Git state, no Stage 1 harness/report/artifacts, and no Blaxel sandboxes present.
- Disposition: **REJECTED / NO QUALIFICATION CREDIT**. All Stage 1 scenarios remain NOT RUN. No product defect is inferred from this agent failure.
- Recovery: reassign Stage 1 to the already approved `gmicloud/deepseek-ai/deepseek-v4.1-flash-1017` at `max`. Stage 2 remains gated on parent approval of real evidence.
- Previous GLM planning attempts also produced no documents; DeepSeek subsequently created the accepted planning documents. Do not automatically retry the failing GLM route for later execution stages without reviewing its suitability.

## 2026-11-03 — Stage 1 DeepSeek evidence reviewed

- Real installed-tarball sandbox run: 469 cases, 3,012 assertions, three failed background-invariance comparisons in S1-06.
- Parent confirmed Q-001 by inspecting source, comparison logic, and raw scenario evidence. Stage FAIL; seven other scenarios passed on the tested revision only.
- Next permitted work is a targeted implementation fix and complete Stage 1 recheck in a new sandbox. No Stage 2 dispatch until this blocker is resolved.

## 2026-11-03 — Stage 1 recheck accepted

- Parent accepted S1-R1 on `104195b`: 8/8 scenarios, 469 cases, 3,012 assertions, no failures; unit suite 117/117. Regression fails the old implementation. Harness/expectation files unchanged.
- Q-001 closed. Retrieved artifact hashes verified locally. Dedicated recheck sandbox authorized for deletion. Stage 2 now authorized in its own fresh sandbox.

## 2026-11-03 — Stage 2 requires focused correction

- Parent verified retrieved artifact hashes but did not accept the provisional full-stage PASS.
- S2-05 raster comparison masks text and clip edges; the raster negative control does not exercise the same masked acceptance rule. Matched-context recheck and explicit coverage/limitations required before advancement.
- No product defect inferred from raster differences alone. Stage 3 remains gated; all original evidence retained.

## 2026-11-03 — Stage 2 recheck accepted

- Parent accepted S2-R1: 8 scenarios, 6,065 cases, 15,270 assertions, no failures. Full-pixel matched-context comparison covers 102 targets across three engines; limits recorded explicitly.
- Retrieved tarball/harness hashes verified. Sandbox authorized for deletion; Stage 3 authorized.
- Stage 3 reassigned to the already approved DeepSeek max route because repeated GLM execution attempts produced no reliable deliverables. No unapproved provider/model substitution.

## 2026-11-03 — Stage 1 Q-001 fix rerun (provisional)

- Fix commit `104195b`: `ascii-letter` consumes one dot decision per grid cell before glyph overlay.
- New dedicated sandbox `dither-face-q-s1-r1-202611031644-d6c686`; source manifest 91 files, tarball SHA-256 `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021`.
- Same unmodified harness and expected-results files; all eight scenarios provisional PASS (469 cases, 3,012 assertions, 0 failures). Complete unit suite 117/117.
- New regression failed the old implementation (8 failed / 48 passed) in a disposable sandbox copy. Historical baseline fixture unchanged; ascii-letter preview migration old/new SHAs recorded.
- This provisional entry predates the parent acceptance recorded above: the parent subsequently accepted S1-R1 and closed Q-001. Stage 1 R1 remains the accepted Stage 1 record; no relabelling.

## 2026-11-03 — Stage 2 executed (provisional)

- Model: DeepSeek V4.1 Flash 1017 through OpenCode; dedicated sandbox `dither-face-q-s2-202611031706-f58c61` (`blaxel/ts-app:latest`, `us-pdx-1`, 4096 MB, default CPU, no volumes).
- Product source unchanged at `e3c5ead`; qualification harness/fixtures committed through `6cc38c2`; tarball `dither-face-0.1.0.tgz` SHA-256 `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` (23,220 bytes), identical to the accepted Stage 1 artifact.
- Final harness: 8/8 provisional PASS, 5,379 cases, 14,830 assertions, 0 failures, 0 integrity failures, 0 NOT RUN. Node 22.23.4/24.22.2 fresh processes, Chromium/Firefox/WebKit raw SVG parity, xmldom 0.9.12 adversarial XML, 82-instance repeated-ID analysis, data-URL/file/HTTP embedding, pairwise/size/name invariance.
- Seven prior attempts in the same dedicated sandbox differed only in harness measurement/API defects (xmldom 0.9 `errorHandler`, capture box/background/font context, text-mask padding); all earlier evidence retained under `out/qualification/S2/run*/`. No source, site, dependency or product-output change was made.
- Raw evidence retrieved (275 final-run files); sandbox left alive pending parent disposition. No push, PR, publish, deploy, DNS, or later stage. Parent disposition **PENDING**; no self-signoff or release claim.

## 2026-11-03 — Stage 2 returned; focused R1 recheck (provisional)

- Parent returned S2 (not approved) for S2-05 measurement only: text/clip-edge exclusions had been widened after raster mismatches and the crafted negative control did not use the same acceptance function. No product defect inferred; original sandbox deleted after evidence retrieval.
- Product source unchanged at `e3c5ead`; harness/fixtures committed through `0016a1e`; tarball still `ed4c359b…` (23,220 bytes).
- New dedicated sandbox `dither-face-q-s2-r1-202611031739-5c3627` (`blaxel/ts-app:latest`, `us-pdx-1`, 4096 MB, platform default CPU, no volumes; 30-minute authorised cap).
- S2-05 now captures each target in the same page, cell, integral screen coordinates and font context, once with all 82 avatars and once with only the other SVG elements removed while wrappers/ancestors stay fixed. Full target pixels are compared with no text/edge mask: 1,130,816 eligible pixels, 0 differing (Chromium 82/82, Firefox 10/10, WebKit 10/10 representatives). Definition analysis: 0 conflicts.
- Same `compareFullPixels` function rejects clip-geometry, gradient-stop, flat-colour, ASCII text-glyph and text-opacity corruptions, plus conflicting-ID pollution; the clean positive control accepts 14,400/14,400 pixels.
- Final harness: 8/8 provisional PASS, 6,065 cases, 15,270 assertions, 0 failures, 0 blocked, 0 integrity failures, 0 NOT RUN. Five harness-only attempts retained; no product source change.
- Evidence retrieved under ignored `out/qualification/S2-R1/`; sandbox left alive pending parent disposition. No push, PR, publish, deploy, DNS, or later stage. Parent disposition **PENDING**; no self-signoff or release claim.

## 2026-11-03/04 — Stage 3 executed (provisional)

- Model: DeepSeek V4.1 Flash 1017 through OpenCode, reassigned after repeated GLM execution failures. Dedicated sandbox `dither-face-q-s3-202611031814-dbe98c` (`blaxel/ts-app:latest`, `us-pdx-1`, 4096 MB, platform default CPU, no volumes).
- Product source unchanged at `a9685b7` (byte-identical product files to `e3c5ead`). Final qualification harness `704309e`; negative-control recheck `28a8a0b`. No `src`, site, package dependency, README, LICENSE or package.json change.
- Real `prepack` ran `clean:dist`, `check` (117/117 unit tests, 13 files), `build` and `build:web`. Two packs were byte-identical: `dither-face-0.1.0.tgz`, 23,220 bytes, 32 files, SHA-256 `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021`. The exact allowlist has only `package.json`, `README.md`, `LICENSE` and 29 `dist/**` `.js`/`.d.ts` files.
- Fresh consumers outside the repository: Node 22.23.4 and 24.22.2 rendered all eight fixed goldens with zero network attempts; npm 11.19.1, pnpm 12.16.1 and Yarn 4.18.1 PnP installed from committed lockfiles, reinstalled offline with unchanged locks, and rendered the same eight hashes. Yarn PnP used `yarn node` and no `node_modules`.
- Strict TypeScript 7.0.2 and 6.0.3 passed NodeNext, Node16 and Bundler valid consumers; all five invalid fixtures produced diagnostics in every combination. Root exports/type paths resolved from the packed declarations; unsupported deep imports were rejected; modern Node `require(esm)` was recorded as observed compatibility, not universal CJS support.
- Zero runtime dependencies confirmed by packed manifest, `npm ls --omit=dev`, pnpm production tree/install and empty Yarn PnP closure; React/React DOM absent; TypeScript dev-only.
- Negative controls all detected: forbidden extra archive entry, injected runtime dependency, export-path typo, invalid TypeScript, and one-byte golden mismatch.
- Final harness: 8/8 provisional PASS, 68 cases, 351 counted assertions, 0 failed, 0 BLOCKED, 0 NOT RUN. Parent disposition **PENDING**; no self-signoff or release claim.
- Harness-only corrections after the first attempt: seconds/milliseconds timeout mismatch, JSON extraction tolerant of npm lifecycle output, dry-run `package/` prefix normalization, unordered installed-tree comparison, pnpm symlink-loop recursive deletion, and S3-04 result reuse. Affected scenarios were re-run in the same sandbox; S3-01/02/03/05/06/08 evidence was carried from same-sandbox runs at `e144c92`, S3-07/S3-04 at `704309e`, controls at `28a8a0b`. Product tarball stayed `ed4c359b…` throughout.
- Sandbox active time exceeded the authorised 30-minute cap while diagnosing harness hangs (approximately 18:14–19:05 UTC); recorded as a process limitation, no 600-second command limit was exceeded. Evidence retrieved; sandbox left alive pending parent disposition. No push, PR, publish, deploy, DNS or later-stage work.
