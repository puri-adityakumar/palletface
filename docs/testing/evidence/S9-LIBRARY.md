# Stage 9 evidence — library/performance track

**Execution status:** Final clean sandbox run **152 cases, 1,060 assertions, 0 failed assertions**. Track statuses: **S9-01/02/03/06 BASELINE**, **S9-04 PASS (functional size/tree-shaking only)**, **S9-05 FUNCTIONAL PASS + BASELINE**, **S9-07 PASS (functional resilience only)**, negative controls PASS. Parent disposition: **PENDING**. This report is evidence, not a verdict; it does not approve itself, any scenario, or a release. No stage was advanced and no master dispositions were edited.

**Product freeze:** `git diff --stat f1e17d0..b357e18 -- src site package.json package-lock.json` is empty. The run commit adds only `scripts/testing/perf-s9-*` and `tests/qualification/s9-library/**`; this report is added at the following evidence commit. No product or site code was modified. No push, PR, publish, deployment, DNS or next-stage action was performed.

## Expected before run

`tests/qualification/s9-library/expected-results.json` was written before execution and records expected track statuses, method, pinned tools, predeclared monitoring limits, and the no-invented-budget rule. It was hash-pinned at upload.

| Input | SHA-256 |
| --- | --- |
| `tests/qualification/s9-library/expected-results.json` | `6f2032afd9d2e1ac54fddf98dca6b4084a443a5dee851dad8fe1ccf7f25b013b` |
| `tests/qualification/s9-library/tools/package-lock.json` (esbuild 0.28.2, Playwright 1.64.1) | `4aa836da83f2fa75732ce3804528debaab5ba1f3de312a1763f0d3bc62863666` |
| `tests/qualification/s9-library/fixtures/golden.json` (byte-identical to S3/S2 accepted golden) | `7f8a2c7090d85338f3d35e83c344a2adc38bad86353af154a6e86d29db91ae1a` |
| `tests/qualification/s9-library/fixtures/altered-golden.json` (negative control) | `48cf24c77bb9c87a9a1479eaec1428d40980ca1743e20cfb11e5ff428fe26a06` |
| `tests/qualification/s9-library/fixtures/slow-work.mjs` (negative control) | `783c98afe5860ba6a82a47503e96d04d428102771ed325386f911af31c963d86` |
| `scripts/testing/perf-s9-bench.mjs` | `29a3e2edadc44fd7820921d6ec03b10f7b2714c46b842f5905ddab3ab803ac95` |
| `scripts/testing/perf-s9-cancel.mjs` | `ab316cf86601d14b2876738c17ed488e836b98bcce44c81f25b6aaa8b88eb0c1` |
| `scripts/testing/perf-s9-import.mjs` | `0c15cd49d8a0d009e0ada081cb27ce73f126011fbbfd4cf61859767853cdb976` |
| `scripts/testing/perf-s9-lib.mjs` | `97af6d756c165c58c8cb1380461530f1164f1330d3d1d5fb1bdec36f4ce8be14` |
| `scripts/testing/perf-s9-library.mjs` | `89dc5a96c4cf7e3921811e6993199a000cf6050163486c35e9c32f89115ebbc0` |
| `scripts/testing/perf-s9-oom.mjs` | `c7eabaad5720bb108b03a7b17172c4129e62bc34e0ecb7e601627bdeabd3e7da` |
| `scripts/testing/perf-s9-playground.mjs` | `5bb7afd2181438a92cac45f68753d6ddf0c944ebbfacf5eab80f7b5908db780d` |
| `scripts/testing/perf-s9-soak.mjs` | `233b164460cc7c0c6ef61b3073808225b19131bca3ef8184d0dccde47f9234c4` |
| Tracked source manifest, 243 files | `69763a1f7b1e366461fa07420f15546515de7566eb339dcd3e3704f14d757f99` |
| Parent-frozen actual tarball `dither-face-0.1.0.tgz` | `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021` (23,220 bytes) |

Expected track statuses written before execution: S9-01/02/03 BASELINE; S9-04 PASS for functional size/tree-shaking assertions; S9-05 PASS+BASELINE; S9-06 BASELINE; S9-07 PASS for functional resilience; negative controls PASS. No expected status was converted into a release budget.

**No agreed numeric performance budget exists.** Predeclared monitoring limits (not release budgets) were: interaction ready ≤15,000 ms, single long task ≤750 ms, p95 long task ≤400 ms, 20 rapid inputs ≤5,000 ms, final settle ≤2,000 ms; Node soak heap growth ≤16 MiB and RSS growth ≤64 MiB; browser heap growth ≤8 MiB; retry ≤5,000 ms; worker termination ≤2,000 ms. Actual values and any exceedance are reported below; no PASS is inferred from a limit this track invented.

## Environment and artifact

| Field | Actual value |
| --- | --- |
| Final sandbox | **`dither-face-q-s9-library-20261107-1510-9e6408`** (new; **left DEPLOYED pending parent disposition**) |
| Image / region / memory | `blaxel/ts-app:latest`, `us-pdx-1`, 4096 MB, no volumes |
| CPU visible to guest | 2 vCPU, `Intel(R) Xeon(R) Processor`, 2 threads/core, 1 core/socket |
| OS / kernel | Debian GNU/Linux 12 (bookworm), Linux `(none)` 6.12.114 x86_64 |
| Node 24 / npm | `v24.22.2` / `11.19.1` |
| Node 22 / npm | `v22.23.4` / `10.9.9` (official `node-v22.23.4-linux-x64.tar.gz`; archive SHA-256 pinned and checked) |
| esbuild | `0.28.2` |
| Playwright / Chromium | Playwright `1.64.1`; Chromium `156.0.8078.4` (Playwright Linux build; not native Safari) |
| Source | `b357e1815fd185d98ecca130005f5c42faced50f`; product freeze base `f1e17d08878c4ca2278aaeb7aba2d2fdbb7ae3df`; 243 tracked files; manifest `69763a1f…` |
| Actual tarball | `dither-face-0.1.0.tgz`, 23,220 bytes, `ed4c359b…`; 32 unpacked package files, 76,196 bytes |
| Source build vs packed dist | both 29 files, 65,975 bytes, aggregate `1ad4f361d506a8e9619e87c21205e653e86ecb82180209d5ddf7dc08bbf5d15f`; 0 mismatches |
| Upload boundary | Tracked source only; no `.git`, `.env`, auth material, backups or `node_modules` uploaded |
| Active budget | **70 s** used of the 1,800 s cap; longest single phase 25.8 s (prepare); commands bounded at 600 s |
| Evidence tar | `evidence.tar.gz`, 708,249 bytes, `861a7870871e742b1409b9d44dc6992c6c14d5f7939dbd59ee4978bbd2d1c217` |

All builds, library runs, browser interaction and measurements ran only inside the sandbox. No local tests or servers were run; local work was limited to orchestration, file editing, retrieval verification and evidence hashing.

## Single final-run timeline (UTC 2026-11-07)

| Time | Phase | Actual result |
| --- | --- | --- |
| 15:11:03.1–15:11:03.8 | Create | `DEPLOYED`, `us-pdx-1`, 4096 MB, no volumes |
| 15:11:03.8–15:11:10.5 | Upload + verify | 243 files, source digest `69763a1f…`, tarball `ed4c359b…`, expected/tools hashes all verified |
| 15:11:10.5–15:11:36.2 | Prepare | `npm ci`, build, build:web, build:site, tools install, Chromium install, Node 22 download; exit 0 |
| 15:11:36.2–15:11:40.8 | Library | golden/parity/exports/bundles/soak/cancellation/OOM/controls; exit 0 |
| 15:11:40.8–15:11:46.7 | Bench Node 24 | 48 cells; exit 0 |
| 15:11:46.7–15:11:52.8 | Bench Node 22 | 48 cells; exit 0 |
| 15:11:52.8–15:12:07.9 | Playground | throttled load, rapid input, URL lifecycle, failure/retry, asset abort/recovery; exit 0 |
| 15:12:07.9–15:12:09.0 | Finalize | aggregate, cross-parity, manifest; exit 0 |
| 15:12:09.0–15:12:12.9 | Retrieve | 301 tar entries, 708,249 bytes, hash verified and extracted |

## Results (agent-observed track statuses)

| ID | Expected track status | Actual track status | Cases | Assertions | Failed assertions | Key evidence |
| --- | --- | --- | ---: | ---: | ---: | --- |
| S9-01 | BASELINE | **BASELINE** | 40 | 304 | 0 | Batch 1 after 30 warmups, all 8 styles × 4 matrices, fixed golden match, no crash. No agreed budget. |
| S9-02 | BASELINE | **BASELINE** | 40 | 304 | 0 | Batch 100 × 5 samples × all 8 styles × 4 matrices; deterministic digests; no crash. No agreed budget. |
| S9-03 | BASELINE | **BASELINE** | 40 | 304 | 0 | Batch 1000 × 2 samples × all 8 styles × 4 matrices; 96 cells total, no crash; memory recorded. No agreed budget. |
| S9-04 | PASS | **PASS (functional only)** | 3 | 15 | 0 | Tarball/dist/bundle sizes reported; root one-renderer import tree-shaken; direct one-renderer excludes seven styles; IIFE renders golden. No size budget claimed. |
| S9-05 | PASS+BASELINE | **FUNCTIONAL PASS + BASELINE** | 4 | 18 | 0 | 10,000/5,000 Node URL create-revoke cycles and 20 browser downloads all revoked; detector catches 3 deliberately unrevoked URLs. Heap stable; Node 24 RSS growth 85.02 MiB exceeded the predeclared 64 MiB monitoring limit, so numeric growth remains parent-owned. |
| S9-06 | BASELINE | **BASELINE** | 2 | 27 | 0 | 6× CPU + throttled network; ready 759 ms; 20 rapid inputs 689 ms; final bytes exact. p95 long task 690 ms exceeded the predeclared 400 ms monitoring limit; no agreed responsiveness budget. |
| S9-07 | PASS | **PASS (functional only)** | 5 | 38 | 0 | 5 forced download failures + successful retries; aborted app.js fallback and reload recovery; Worker termination 1.37 ms and retry 41.4 ms. Fatal OOM explicitly not caught. |
| NEGATIVE | PASS | **PASS** | 1 | 5 | 0 | Altered golden rejected; 250 ms slow fixture rejected under 25 ms cap; unrevoked URL detector caught 3 leaks; clean positives accepted. |
| PREPARE | prerequisite | **completed** | 17 | 45 | 0 | Manifest, tarball, source-vs-packed dist, consumer install/smoke, tools, Node 22, Chromium and source verification. |
| **Totals** | | | **152** | **1,060** | **0** | 24 finalize cross-parity cases included; 0 harness errors, 0 hidden skips. |

These are track statuses, not matrix PASS dispositions. S9-01/02/03 and S9-06 remain baseline evidence for a parent budget decision.

## S9-01/02/03 — measured batch baseline

Method: every matrix cell was a fresh Node process, 30 warmup renders, then 10 measured single renders (batch 1), 5 measured 100-render samples, or 2 measured 1000-render samples. Each cell also rendered the fixed `preview-output`/`7even`/80 px input and matched the parent-accepted golden digest. Seeds for measured loops were a fixed sequence shared by all four matrices, so aggregate output digests must agree. `performance.now()` measured wall time; `process.cpuUsage()` measured user+system CPU; `Buffer.byteLength` measured SVG bytes; `process.memoryUsage()` measured RSS/heap.

**Cross-matrix parity:** 24 style/batch groups × 4 matrix cells = 96 cells. Every group had exactly one distinct aggregate digest. 24/24 parity cases and 96/96 cell digest checks passed. All fixed golden hashes matched.

| Node / package | Batch | Per-render median across 8 styles | Style range | CPU per render median | SVG bytes/render range | RSS after max | Heap used after max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Node 24 / tarball | 1 | 0.1037 ms | 0.0589–0.1795 ms | 0.1035 ms | 768–22,996 B | 55.65 MiB | 5.36 MiB |
| Node 24 / tarball | 100 | 0.0491 ms | 0.0053–0.1033 ms | 0.0660 ms | 766.15–22,639.2 B | 65.50 MiB | 7.22 MiB |
| Node 24 / tarball | 1000 | 0.0421 ms | 0.0057–0.0784 ms | 0.0520 ms | 766.03–22,639.85 B | 73.93 MiB | 16.72 MiB |
| Node 24 / source | 1 | 0.1035 ms | 0.0607–0.1774 ms | 0.1033 ms | 768–22,996 B | 56.23 MiB | 5.35 MiB |
| Node 24 / source | 100 | 0.0485 ms | 0.0060–0.0971 ms | 0.0607 ms | 766.15–22,639.2 B | 65.32 MiB | 7.26 MiB |
| Node 24 / source | 1000 | 0.0403 ms | 0.0049–0.0836 ms | 0.0495 ms | 766.03–22,639.85 B | 74.17 MiB | 15.71 MiB |
| Node 22 / tarball | 1 | 0.1273 ms | 0.0624–0.2020 ms | 0.1273 ms | 768–22,996 B | 59.36 MiB | 4.81 MiB |
| Node 22 / tarball | 100 | 0.0548 ms | 0.0061–0.1134 ms | 0.0821 ms | 766.15–22,639.2 B | 62.91 MiB | 7.55 MiB |
| Node 22 / tarball | 1000 | 0.0468 ms | 0.0069–0.0813 ms | 0.0583 ms | 766.03–22,639.85 B | 71.27 MiB | 13.30 MiB |
| Node 22 / source | 1 | 0.1242 ms | 0.0578–0.2065 ms | 0.1238 ms | 768–22,996 B | 58.86 MiB | 4.81 MiB |
| Node 22 / source | 100 | 0.0580 ms | 0.0059–0.0880 ms | 0.0773 ms | 766.15–22,639.2 B | 62.97 MiB | 7.55 MiB |
| Node 22 / source | 1000 | 0.0464 ms | 0.0050–0.0839 ms | 0.0579 ms | 766.03–22,639.85 B | 72.32 MiB | 14.46 MiB |

Per-style batch-1000 detail (Node 24, actual tarball; the other three matrices are in `bench-summary.json`):

| Style | Per-render median | CPU per render | SVG bytes | RSS after | Heap used after |
| --- | ---: | ---: | ---: | ---: | ---: |
| pixel-sprite | 0.0121 ms | 0.0184 ms | 2,805.4 B | 61.7 MiB | 6.22 MiB |
| pixel-letter | 0.0357 ms | 0.0480 ms | 11,599.9 B | 68.1 MiB | 7.88 MiB |
| dither-orb | 0.0675 ms | 0.0727 ms | 22,639.8 B | 69.5 MiB | 6.23 MiB |
| pixel-landscape | 0.0531 ms | 0.0571 ms | 14,511.0 B | 64.3 MiB | 8.26 MiB |
| ascii-letter | 0.0281 ms | 0.0368 ms | 7,109.9 B | 64.2 MiB | 6.83 MiB |
| ascii-field | 0.0784 ms | 0.0892 ms | 22,447.8 B | 73.9 MiB | 16.72 MiB |
| ascii-face | 0.0057 ms | 0.0083 ms | 766.0 B | 56.0 MiB | 5.28 MiB |
| pixelify-letter | 0.0484 ms | 0.0561 ms | 15,509.8 B | 67.5 MiB | 8.06 MiB |

Interpretation limits: these are one 2-vCPU sandbox class, single-process microbenchmarks with output hashing/byte counting inside the measured loop. They are not throughput-under-concurrency or production-host claims. RSS/heap after a sample are not steady-state leak measurements; the separate soak below is the bounded-memory observation.

## S9-04 — size and tree-shaking

Package and product output:

| Artifact | Raw bytes | gzip (level 9) | Brotli (quality 11) |
| --- | ---: | ---: | ---: |
| Actual tarball (`dither-face-0.1.0.tgz`) | 23,220 | n/a (already gzip) | n/a |
| Unpacked package tree (32 files) | 76,196 | n/a | n/a |
| Packed/compiled `dist` (29 files) | 65,975 | n/a | n/a |
| Product ESM `dist/index.js` | 4,085 | 1,444 | 1,228 |
| Product IIFE `dist/dither-face.js` | 20,207 | 5,901 | 5,287 |
| esbuild ESM all-renderer bundle | 17,921 | 5,374 | 4,799 |
| esbuild ESM all-renderer, minified | 10,869 | 4,355 | 3,886 |
| esbuild ESM root `pixelSprite` only | 3,258 | 1,509 | 1,369 |
| esbuild ESM root `pixelSprite` only, minified | 1,880 | 1,090 | 992 |
| esbuild ESM direct `dist/styles/pixel-sprite.js` | 3,262 | 1,510 | 1,366 |
| esbuild ESM direct one, minified | 1,882 | 1,091 | 992 |
| esbuild IIFE one-renderer diagnostic | 3,473 | 1,535 | 1,387 |
| esbuild IIFE one-renderer, minified | 1,897 | 1,101 | 997 |

- esbuild `0.28.2`, target `es2022`, bundle, metafile. Unminified sizes are used for tree-shaking comparison; minified values are supplementary transfer-size information.
- The all-renderer ESM metafile includes all eight style modules with nonzero `bytesInOutput`. The root `pixelSprite` bundle includes only `pixel-sprite` (3,258 bytes vs 17,921 all-renderer, about 82% smaller). A direct file import (diagnostic; not a supported package export) is essentially the same one-renderer size (3,262 bytes). Unused renderer code is therefore excluded when the consumer imports only `pixelSprite`, and the public root import is tree-shakeable by esbuild in this configuration.
- Product IIFE evaluated in a `node:vm` context exposed `DitherFace.ditherFace` and matched the golden `pixel-sprite` hash exactly.
- Exported API inventory: **27 runtime exports**, exactly the reviewed `tests/qualification/s3/expected-exports.json` list. Cold import medians over 5 fresh processes: root 6.251 ms, 51.57 MiB RSS, 5.549 MiB heap, 27 exports; direct one-style module 2.238 ms, 50.42 MiB RSS, 5.221 MiB heap, 1 export. Import timing is the dynamic-import interval in an already-started Node process, not full process startup.
- Package install: empty consumer installed the actual tarball; installed tree contains only the local `dither-face@0.1.0` package (32 files), no external runtime packages. Node 24 and Node 22 consumer smokes both produced the exact eight golden hashes and the same 27 exports.

## S9-05 — memory and object URLs

### Node soak

`--expose-gc`; all eight styles round-robin; fixed golden hashes checked before and after; Blob URLs created and immediately revoked.

| Runtime | Renders | URL cycles | Invalid SVG | Fixed hashes | URLs created/revoked/live | Heap growth | RSS growth | Peak heap / RSS |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: |
| Node 24 | 50,000 | 10,000 | 0 | match | 10,000 / 10,000 / **0** | **+0.41 MiB** | **+85.02 MiB** | 5.44 / 138.60 MiB |
| Node 22 | 20,000 | 5,000 | 0 | match | 5,000 / 5,000 / **0** | **+0.44 MiB** | **+38.68 MiB** | 4.96 / 95.72 MiB |

Node 24 windows: heap stayed 5.04–5.44 MiB and RSS 53.6→100.8 MiB through 50,000 renders, then the 10,000 URL cycles brought the final RSS checkpoint to 138.6 MiB. Node 22 heap stayed 4.52–4.96 MiB and RSS 57.0→91.4 MiB through 20,000 renders, final 95.7 MiB after 5,000 URL cycles. **The Node 24 RSS growth (85.02 MiB) exceeded the predeclared 64 MiB monitoring limit; the Node 24 heap growth was within 16 MiB.** Heap is stable across the render windows; the RSS movement is reported as observed allocator/URL-cycle behavior, not proven unbounded growth. No release growth budget is agreed.

### Browser object URLs

The same wrapper-count detector was used for clean positives and the negative control.

| Check | Actual |
| --- | --- |
| Playground Download clicks | 20 clicks; 20 created, 20 revoked, **0 live**; heap 1,379,988→1,416,196 bytes (**+36,208 B**) after CDP GC |
| Consumer create/revoke cycles | 5,000 cycles; 5,000 created, 5,000 revoked, **0 live**; 1,051 ms; heap +68,704 B |
| Deliberately unrevoked control | 3 created, 0 revoked, **3 live**; detector `leaked: true`; then revoked to 0 |
| Limits | Browser heap observations were within the predeclared 8 MiB monitoring limit; no release budget agreed |

## S9-06 — slow CPU/network playground interaction

Actual Playwright Chromium Linux 156.0.8078.4; CDP CPU throttling **6×**; network emulation **150 ms latency, 200,000 B/s download, 93,750 B/s upload, cellular3g**. Single-engine evidence only.

| Measurement | Actual | Predeclared monitoring limit | Result |
| --- | ---: | ---: | --- |
| Time to playground ready | 759.4 ms | 15,000 ms | within |
| Navigation DOMContentLoaded / load | 589.1 / 644.3 ms | n/a | measured |
| Resources | CSS 219.6 ms / 6,573 B; bootstrap 189.8 ms / 1,355 B; app.js 271.9 ms / 14,543 B | n/a | measured |
| 20 rapid seed input events, total | 689.3 ms (min 28.6, median 34.1, p95/max 47.4 ms) | 5,000 ms | within |
| Style switch range (8 styles) | 5.3–31.1 ms | n/a | measured |
| Size switch range (48/80/128/192) | 7.2–22.7 ms | n/a | measured |
| Final state settle after last input | 5.2 ms | 2,000 ms | within |
| Long tasks observed (5 entries) | max 690 ms; p95 690 ms; sum 1,075 ms | max 750 ms; p95 400 ms | max within; **p95 exceeded** |
| Final SVG exact bytes | SHA-256 `44024aff6d8c4a890c0054d57d51c693f7824008e278fc68e9eab3501c5580cd`; exact Node bytes | exact match | pass (functional) |
| Final URL state | `?seed=s9-final&style=pixelify-letter&size=192&name=Throttled+Ada` | captured | pass |
| Page/console errors | 0 / 0 | none | pass |

The p95 long-task monitoring limit was exceeded; the maximum single long task did not exceed its predeclared limit. **No agreed responsiveness budget exists, so S9-06 is BASELINE, not PASS.** Functional correctness (all styles, all sizes, final exact bytes, no crash) passed.

## S9-07 — failure resilience and cancellation

| Probe | Actual |
| --- | --- |
| Forced `URL.createObjectURL` failure ×5 | Fixed status `Download unavailable. Use Copy SVG or the manual copy panel instead.` each time; no uncaught page errors; URL failure path left no live URL |
| Manual retry ×5 after restoring the API | `SVG downloaded.` each time; 1,105–1,108 ms per cycle, within the predeclared 5,000 ms retry limit; final URL count 5,025 created / 5,025 revoked / 0 live |
| Aborted `/assets/app.js` load | Exact static failure message shown; `data-state=failed`; 7 interactive controls disabled; gallery 0; documentation 1,234 characters; body text 2,436 characters; 1 app.js request in the 1,000 ms no-auto-retry window; no infinite retry |
| Explicit reload after unblocking | Ready in 75 ms; gallery 8; disabled 0; status empty; 2 total app.js requests (failed + recovery) |
| Consumer Worker cancellation | Long worker had already rendered golden (`5414be3e…`); terminated in **1.37 ms** (limit 2,000 ms); fresh worker retry matched golden and completed in **41.4 ms** (limit 5,000 ms); 2 residual sockets, no worker handles |
| Fatal low-heap probe | Node 24 with `--max-old-space-size=32` exited with `SIGABRT` and V8 `Reached heap limit … JavaScript heap out of memory`; **the library does not catch or gracefully recover from fatal OOM** and no such claim is made |
| Process cleanup | Finalize port 4173 check: `port4173=closed`; image has no `ps`, so a post-run `/proc` scan was used: no `chrome`, `playwright`, `serve-site`, `http.server` or matching `node` process lines |

## Negative controls

| Control | Detection | Clean positive |
| --- | --- | --- |
| Altered golden (pixel-sprite expected digest changed) | Rejected by the same golden comparator; mismatch reported for `pixel-sprite` | Actual tarball/source output accepted the unaltered golden |
| Intentionally unrevoked object URLs | Detector reported 3 live / `leaked: true` | 20 site downloads and 5,000 consumer cycles reported 0 live |
| Known slow work (250.12 ms) under a 25 ms cap | Rejected (`ok=false`) | 1.07 ms work accepted under the same cap |
| Clean positives | All golden, import, IIFE, URL and fast-work positives passed through the same checks | — |

## Exact commands

Local orchestration (outside the sandbox; authentication never printed):

```sh
cd /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-blaxel-s9-library
node phase.mjs all
```

In-sandbox phases, each a synchronous `process.exec` with `waitForCompletion: true`, 600 s cap, and a unique start/end marker:

```sh
node scripts/testing/perf-s9-library.mjs --config /blaxel/s9-library/20261107-1510-9e6408/s9-library-config.json --phase prepare
node scripts/testing/perf-s9-library.mjs --config /blaxel/s9-library/20261107-1510-9e6408/s9-library-config.json --phase library
node scripts/testing/perf-s9-library.mjs --config /blaxel/s9-library/20261107-1510-9e6408/s9-library-config.json --phase bench --node-filter node24
node scripts/testing/perf-s9-library.mjs --config /blaxel/s9-library/20261107-1510-9e6408/s9-library-config.json --phase bench --node-filter node22
node scripts/testing/perf-s9-library.mjs --config /blaxel/s9-library/20261107-1510-9e6408/s9-library-config.json --phase playground
node scripts/testing/perf-s9-library.mjs --config /blaxel/s9-library/20261107-1510-9e6408/s9-library-config.json --phase finalize
```

Key child commands inside the prepare phase:

```sh
npm ci --no-audit --no-fund
npm run build
npm run build:web
npm run build:site
cd tests/qualification/s9-library/tools && npm ci --no-audit --no-fund --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH=/blaxel/s9-library/20261107-1510-9e6408/work/pw-browsers npx playwright install --with-deps chromium
```

The measured child commands were `perf-s9-bench.mjs` (fresh Node process per style/batch/matrix), `perf-s9-soak.mjs --expose-gc`, `perf-s9-cancel.mjs`, `perf-s9-oom.mjs --max-old-space-size=32`, and the Playwright harness. Full stdout/stderr and exit codes are under `logs/commands/` and `logs/`; phase markers are `markers/<phase>.start.json` / `<phase>.end.json`.

## Raw evidence

Retrieved before handback; ignored in this worktree and copied to the parent review location:

- Worktree attempt: `out/qualification/S9-LIBRARY/attempts/20261107-1510-9e6408/`
- Parent attempt: `/Users/aditya/Projects/dither-face/out/qualification/S9-LIBRARY/attempts/20261107-1510-9e6408/`
- `evidence.tar.gz`: 708,249 bytes, SHA-256 `861a7870871e742b1409b9d44dc6992c6c14d5f7939dbd59ee4978bbd2d1c217`; 301 tar entries
- `retrieved-manifest.json`: 300 files, 4,085,270 bytes, aggregate SHA-256 `f23170080953f05e4495f53223207d199a864c8776d483f8c99a7e4c42898eee`
- `summary.json` SHA-256 `416ef9bc4ddb1d4fd3ba2a9bd0dc604e56e6b652b945573414328d73f2c1bc9c`
- `manifest.json` (in-sandbox, 260 files / 3,307,778 bytes) SHA-256 `cd5e3cc9dc354dd87bb8d307f25761c4c343fce669818aad4b9620bf2d709324`
- `bench-summary.json` SHA-256 `aa4b75f178bc9b5bdbf132e010541a64188f766018c9c3d2d21643b077546830`
- Screenshots: `s9-throttled-final.png` 259,063 bytes `af977706de2b27f80847669b8dfa3a271e8ab71a1b237195b03d3f46c2ed0756`; `s9-asset-failure.png` 195,087 bytes `621832c73afb6055c23f62808e226e36fa8961b9e96a201ad3ee8e482481354c` (inspected; final playground state fits, fallback message visible, no clipping observed; not pixel baselines)
- `postrun/process-check.json`: `/proc` scan found no matching browser/server/Node process lines; port check recorded `port4173=closed`
- `markers/` and `logs/orchestrator/` from the retrieve archive; `run-summary.json`, `timeline` data inside it; `finalize/finalize.json`, `prepare/prepare.json`, `library/library.json`, `playground/playground.json`, raw `bench-*/raw/`

## Attempts and sandboxes

| Attempt | Source / harness | Sandbox | Result |
| --- | --- | --- | --- |
| 1 `20261107-1505-1970ed` | `8bc566f` / `0b7f8dd…` expected | `dither-face-q-s9-library-20261107-1505-1970ed` | Prepare/source checks and Node 24 work ran, but Node 22 failed because the image has no `xz`, Playwright launched from the wrong browser path, and bundle inclusion was counted from `metafile.inputs` rather than output `bytesInOutput`. Evidence retrieved; sandbox **deleted**. |
| 2 `20261107-1508-44687a` | `3a58f5f` / `6f2032a…` expected | `dither-face-q-s9-library-20261107-1508-44687a` | All measured work ran, but the in-sandbox finalize phase was omitted by the local driver and phase markers collided under `all`; bundle inclusion still used the flawed metafile field. Evidence retrieved; sandbox **deleted**. |
| 3 `20261107-1510-9e6408` | **`b357e18` / `6f2032a…` expected** | **`dither-face-q-s9-library-20261107-1510-9e6408`** | **Final: 152 cases, 1,060 assertions, 0 failed; unique phase markers; all summaries/manifests written; left DEPLOYED pending parent disposition.** |

A pre-existing empty sandbox named `dither-face-q-s9-library-20261107-1503-4c91a7` was found containing no Stage 9 files; it was confirmed empty and deleted. A second empty sandbox named `dither-face-q-s9-library-20261107-1512-98f6bd` (created 15:11:37 with 0 files) was also confirmed to contain no evidence and deleted after the final run; it was never used. No PASS was carried from any earlier attempt. The only final evidence is the 1510 run above.

## Limitations

- **No agreed performance budget exists.** S9-01/02/03 and S9-06 are baseline measurements; no PASS is claimed from an invented threshold. The predeclared monitoring limits are test instrumentation only.
- **Two monitoring thresholds were exceeded:** Node 24 soak RSS growth 85.02 MiB vs the predeclared 64 MiB monitoring limit, and throttled p95 long task 690 ms vs the predeclared 400 ms monitoring limit. These are reported for parent decision, not hidden or converted into a release result. The Node 24 heap growth, Node 22 growth, browser heap growth, readiness, rapid-input and retry limits were within their predeclared limits.
- Absolute timings come from one 2-vCPU Intel Xeon sandbox class and are not portable performance promises. The benchmark is single-process and includes output hashing/byte counting.
- Throttled interaction used one pinned Linux Chromium build only. No Firefox/WebKit performance, physical mobile device, native Safari/macOS, screen reader, real network, or production deployment was exercised.
- Runtime coverage is Node 24.22.2 and Node 22.23.4 only.
- Fatal V8 OOM is not caught; the low-heap probe shows a process-level `SIGABRT` and V8 fatal diagnostic. The library has no OOM handler and no claim is made that it does.
- Memory observations are bounded application-level windows (50,000/20,000 renders, 10,000/5,000 URL cycles, 20 browser downloads, 5,000 browser consumer cycles), not proof of absence of all leaks or engine-level resource exhaustion. RSS is allocator-sensitive; heap was stable while RSS moved.
- The image lacks `ps`; the process-cleanup conclusion uses the finalize port check and a post-run `/proc` scan. No matching process lines were found.
- Screenshots were inspected for layout/fallback visibility only; they are not pixel baselines and no visual-regression score is claimed.

## Disposition

**Parent review — PENDING.** Agent-observed result: **152 cases, 1,060 assertions, 0 failed assertions; S9-01/02/03/06 BASELINE, S9-04 functional PASS, S9-05 functional cleanup PASS + growth BASELINE, S9-07 functional PASS, negative controls PASS.** The parent must decide: (a) whether to accept the measured baselines as the Stage 9 reference, (b) any actual release budget for render time, RSS growth and throttled responsiveness, and (c) the disposition of the two predeclared monitoring-limit exceedances and the fatal-OOM limitation. This report does not self-approve, does not update MATRIX/PLAN/REPORT/FINDINGS/EXECUTION-LOG, and does not advance any stage. The final sandbox `dither-face-q-s9-library-20261107-1510-9e6408` is left **DEPLOYED** for review; no release, push, PR, publish, deployment or DNS action was taken.
