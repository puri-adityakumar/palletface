# Stage 9 evidence — playground and site performance/resilience

**Execution status:** Final acceptance run **8 PASS, 0 FAIL, 0 BLOCKED — 7 matrix-style scenarios plus 4/4 negative controls, 596 counted assertions, 91/91 derived budget checks passed, 0 failed assertions**. One separate WebKit observation (S9-O1) is recorded and remains parent-owned. Parent disposition: **PENDING**. This report is evidence, not a verdict; it does not approve the stage, the site, the package, or the release.

**Product freeze:** `git diff f1e17d0..HEAD -- src site package.json package-lock.json README.md LICENSE` is **empty**. Stage 9 adds only the site qualification harness, tools lock, expected budgets and this report. No product, site, root dependency, MATRIX, REPORT, PLAN or FINDINGS edit was made. No push, PR, publish, deployment, DNS or next-stage action was performed.

## Expected before acceptance

| Input | SHA-256 / value |
| --- | --- |
| Baseline measurement `baseline/baseline.json` | `a2c382d15fdc80ad01e88f770b849d5effcfc1ef809098c43aa73123124651a9` |
| Derived expectations `tests/qualification/s9-site/expected-results.json` | `23c52a570178b37c941d882c1a202cb084ec691a839445491c688e428c9e4181` |
| Baseline source manifest file | `b16e19f542213dd932addd71774c214a4597ddc4bf40ec56330b3d778fde56f4` (235 files; internal digest `d3da3e4e23869474f9962840df52b9000dcf2834eb4a3c479abedaa346cf27d0`) |
| Acceptance source manifest file | `5e734f759b34debdfa86c1f165a996ce8569a7000e4a59e4939b6b4e7fabf89f` (236 files; internal digest `d2aeca00c8c9f29d3be3e892840aff93eda703b35a9c4192f7f33ef5a2b63a43`) |
| Tools lock `tests/qualification/s9-site/tools/package-lock.json` | `55a85b4fc1c1fdc1e813266e81a7145cb68c92518089d790670b21e29cc7fdba` |
| Harness `scripts/testing/perf-site.mjs` | `7b97cd2a05cc98c180a2e96f119908411d9aad6de3a8102bb518aafd35201dca` |
| Product base | `f1e17d08878c4ca2278aaeb7aba2d2fdbb7ae3df` |
| Baseline source commit | `7163744` (final baseline harness; product source unchanged from `f1e17d0`). Most baseline parts were measured at `c053af0`; the only later harness change removed an unused favicon-attempt metric, and the affected `resilience-extra` part plus the final merge were rerun at `7163744`. |
| Acceptance source commit | `d7f701c` (harness + expected budgets; product source unchanged from `f1e17d0`) |
| Tarball | **N/A** — this site track uses the actual tracked site source; no consumer API comparison was required. |

Budgets were **measured first** in the baseline run, written into `expected-results.json`, and only then applied in the acceptance run. The file's baseline hash and git history show the order. No numeric pass limit was invented: every budget is derived from the baseline by the formulas in “Budget derivation” below.

## Environment and artifact

| Field | Value |
| --- | --- |
| Sandbox | **`dither-face-q-s9-site-20261107-1501-86ceaf`** (new; left **DEPLOYED pending parent disposition**) |
| Image / region / memory | `blaxel/ts-app:latest`, `us-pdx-1`, 4096 MB, platform default CPU (no override), **no volumes** |
| CPU / machine | Intel(R) Xeon(R) Processor, **2 vCPU**, `os.availableParallelism() = 2` |
| OS / kernel | Linux x86_64, Debian-family Blaxel image, kernel `6.12.114` |
| Node / npm | `v24.22.2` / `11.19.1` |
| Browser tool | Playwright `1.64.1`; Chromium `156.0.8078.4`; Firefox `157.0`; WebKit `27.2` (Playwright **Linux** build, not native macOS Safari) |
| Mobile | Chromium Pixel 7 emulation (390 px class, touch, device scale) |
| Server | `scripts/serve-site.mjs` on loopback `127.0.0.1:4173`; no external network used for the measured page |
| Active budget | **1,095 s (18 min 15 s) used of 1,800 s** from sandbox create to evidence retrieval; each synchronous part bounded well below the 300 s command cap |
| Evidence tar | `205a626bc66c8c3a95d7472ca0edd195d9a999434c1398c58b78d4d8d5bddb4a`, 860,827 bytes, 203 files |

All builds, servers, browsers and tests ran inside the sandbox. Local work was limited to Blaxel orchestration, manifest generation, budget derivation and report assembly; no local browser/test/server run was used as evidence. The sandbox was created at `2026-11-07T15:01:29.893Z`; evidence was retrieved at `2026-11-07T15:19:44.588Z`. The attempted sandbox `dither-face-q-s9-site-20261107-1457-d456a6` was created earlier but its monolithic first baseline command hit a gateway 502 at ~47 s and the sandbox became `TERMINATED`; no evidence from it is used. The final run used short synchronous named parts after that failure.

## Results (agent-observed, provisional)

| ID | Scenario | Expected | Actual | Assertions | Budget checks | Failed |
| --- | --- | --- | --- | ---: | ---: | ---: |
| S9-01 | Batch 1 baseline, initial load, script/render timing | PASS | **PASS** | 193 | included | 0 |
| S9-02 | Batch 100 | PASS | **PASS** | 64 | included | 0 |
| S9-03 | Batch 1000 | PASS | **PASS** | 40 | included | 0 |
| S9-04 | Size and tree-shaking | PASS | **PASS** | 5 | included | 0 |
| S9-05 | Memory, object URLs, clipboard churn | PASS | **PASS** (S9-O1 observation) | 174 | included | 0 |
| S9-06 | Slow CPU and network | PASS | **PASS** | 15 | included | 0 |
| S9-07 | Failure and reload resilience | PASS | **PASS** | 95 | included | 0 |
| S9-NC | Negative controls (4) | PASS | **PASS** | 10 | not applicable | 0 |
| **Totals** | | | **8 PASS / 0 FAIL / 0 BLOCKED** | **596** | **91/91 PASS** | **0** |

No scenario was skipped. No assertion was weakened after seeing results. The WebKit history-rate-limit observation is recorded separately in S9-O1 and is not counted as a memory/URL failure.

## S9-01 — initial load, script execution and one-render baseline

Five cold context loads per engine; one render after 8 warmups then 60 measured single renders per engine. Times are milliseconds. “App ready” is the site's `data-app-ready` mutation timestamp, not a synthetic `load` event.

| Engine | App-ready p50 / p95 / max | FCP p95 | LCP p95 | Load p95 | Script p95 | Task p95 | Transfer bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chromium | 29.8 / **39.6** / 39.6 | 52 | 52 | 47.8 | **8.57** | **58.26** | 22,471 |
| Firefox | 42 / **131** / 131 | 160 | 160 | 156 | n/a (no CDP) | n/a | 22,940 |
| WebKit | 86 / **116** / 116 | 97 | 161 | 140 | n/a (no CDP) | n/a | 22,471 |
| Mobile Chromium | 28.3 / **31.9** / 31.9 | 52 | 52 | 43.4 | **7.79** | **50.8** | 22,471 |

Firefox's extra 469 transfer bytes are its own `favicon.svg` request; Chromium and WebKit did not request it on these loads.

Single-render timings (pure library string generation / actual preview DOM replacement plus forced layout):

| Engine | Pure p50 / p95 / max | DOM p50 / p95 / max | 60 samples |
| --- | --- | --- | ---: |
| Chromium | 0.1 / **0.2** / 0.4 | 0.9 / **1.7** / 2.7 | 60 |
| Firefox | 0 / **0** / 1 | 2 / **4** / 7 | 60 |
| WebKit | 0 / **1** / 1 | 2 / **4** / 7 | 60 |
| Mobile Chromium | 0 / **0.2** / 3.5 | 0.9 / **1.5** / 2.2 | 60 |

Firefox and WebKit expose a 1 ms clock in this Playwright build, so their pure-render p95 rounds to 0–1 ms. The non-zero maxima and the batch totals are reported rather than pretending finer resolution. Chromium's 0.2 ms pure p95 and 1.7 ms DOM p95 are the useful desktop baseline.

## S9-02 — batch 100

Five measured rounds of 100 avatars per engine, built from the production library bundle and inserted into the real site CSS gallery container. Times are milliseconds for the whole 100-avatar gallery.

| Engine | Total p50 / p95 / max | Per-avatar p95 | Long-task max | Budget (total p95) |
| --- | --- | --- | ---: | ---: |
| Chromium | 88.7 / **120.2** / 120.2 | 1.20 | 0 ms | 246 ms |
| Firefox | 151 / **183** / 183 | 1.83 | 0 ms | 376 ms |
| WebKit | 146 / **176** / 176 | 1.76 | 0 ms | 424 ms |
| Mobile Chromium | 94.3 / **100.1** / 100.1 | 1.00 | 0 ms | 236 ms |

All rounds produced exactly 100 SVG nodes and positive SVG bytes; no page errors.

## S9-03 — batch 1000

Three measured rounds of 1000 avatars per engine, same method.

| Engine | Total p50 / p95 / max | Per-avatar p95 | Long-task max | Budget (total p95) |
| --- | --- | --- | ---: | ---: |
| Chromium | 930 / **976.2** / 976.2 | 0.98 | 0 ms | 2,598 ms |
| Firefox | 1,784 / **2,099** / 2,099 | 2.10 | 0 ms | 4,390 ms |
| WebKit | 1,995 / **2,145** / 2,145 | 2.15 | 0 ms | 4,418 ms |
| Mobile Chromium | 943.8 / **1,070.6** / 1,070.6 | 1.07 | 0 ms | 2,046 ms |

No round crashed, hung, or exceeded the long-task recording threshold (50 ms). The 1000-avatar gallery is a declared synthetic stress, not a claim that a real page should render 1000 avatars at once.

## S9-04 — size and tree-shaking

The actual site build is `npm run build:site` (esbuild, minified ESM). Compressed sizes are deterministic build-artifact gzip (level 9) and Brotli (quality 11), measured in the sandbox; they are **not** HTTP transfer sizes because the loopback server does not compress.

| Artifact | Raw bytes | Gzip bytes | Brotli bytes | Budget (gzip) | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| `assets/app.js` | 14,243 | **5,711** | 5,057 | 5,711 | `6b46f8b1…` |
| `site.css` | 6,273 | **1,976** | 1,653 | 1,976 | `d3330f25…` |
| `bootstrap.js` | 1,055 | 543 | 398 | — | `5f3052b7…` |
| `index.html` | 6,575 | 2,697 | 2,058 | — | `373a2d25…` |
| Whole `dist-site` (9 files) | 29,483 | **11,864** | 9,959 | 11,864 | bundle manifest `656a8e5e…` |
| Library IIFE `dist/dither-face.js` | 20,207 | **5,901** | 5,287 | 5,901 | — |

Tree-shaking (esbuild, minified ESM, one direct renderer versus all eight through `ditherFace`/`STYLES`):

| Bundle | Raw bytes | Gzip bytes | Brotli bytes | Renderer slugs present |
| --- | ---: | ---: | ---: | --- |
| One renderer (`pixelSprite`) | 1,862 | **1,080** | 990 | `pixel-sprite` only |
| All eight renderers | 10,851 | **4,354** | 3,880 | all eight |

All seven other slugs (`pixel-letter`, `dither-orb`, `pixel-landscape`, `ascii-letter`, `ascii-field`, `ascii-face`, `pixelify-letter`) are absent from the one-renderer bundle. The one-renderer gzip size is 24.8% of the all-renderer gzip size and 18.9% of the site app.js gzip size; the site bundle is 5,711 B gzip because the playground intentionally exposes all eight styles.

SVG source size over 96 samples (8 styles × 4 sizes 48/80/128/192 × 3 seeds): min **760 B**, p50 **11,604 B**, p95 **22,642 B**, max **22,998 B** (`ascii-field`, 128 px, seed `dither-face`); gzip max **1,327 B**, Brotli max **818 B**. SVG source is not a fixed size: ASCII field/face and larger sizes dominate.

## S9-05 — memory, heap, object URLs, clipboard and stale work

**Chromium CDP heap** (`Runtime.getHeapUsage`, forced GC before each reading). Three independent sessions, each with 1,000 sustained seed/name/style/size changes, then 500 rapid changes, then 10 real object-URL download cycles, then 100 forced clipboard failures.

| Session | Start used heap | Δ sustained | Δ rapid | Δ downloads | Δ clipboard | Listener Δ | Pending timers | Active URLs | Stale mutations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,454,388 B | **498,872 B** | **515,680 B** | **836,508 B** | **7,984 B** | 0 | 0 | 0 | 0 |
| 2 | 1,454,400 B | **500,012 B** | **516,760 B** | **835,680 B** | **8,796 B** | 0 | 0 | 0 | 0 |
| 3 | 1,454,496 B | **498,040 B** | **516,524 B** | **835,728 B** | **8,796 B** | 0 | 0 | 0 | 0 |
| Derived budget | — | 2,097,152 B | 2,097,152 B | 2,097,152 B | 2,097,152 B | 0 | 0 | 0 | — |

The session-to-session spread is small (sustained 498.0–500.0 KB, rapid 515.7–516.8 KB, downloads 835.7–836.5 KB), so the ~0.5 MB / ~0.84 MB retained deltas are stable one-time costs of the render/container and download path, not monotonic growth. The 2 MiB budget is the baseline-derived regression limit, not a claim that zero bytes is attainable.

**Object URL / download cycles** (all four browser configurations): 10/10 cycles completed; 10 object URLs created; 10 revoked; 0 active; 0 pending revoke timers; downloaded bytes exactly equal the displayed `#svg-source`; status `SVG downloaded.` after each run. A forced `URL.createObjectURL` throw produced `Download unavailable. Use Copy SVG or the manual copy panel instead.` with no page error and the gallery still rendered.

**Clipboard failure loops** (all four): 100/100 injected failures; 100 clicks; manual panel open; `#manual-copy` focused and holding the expected SVG/usage/link text; status `Clipboard unavailable. Copy the selected text below.`; listener delta 0; pending timers 0; a subsequent render cleared the status and closed the panel. No stale event work was observed after the final state: 0 preview mutations in the 600 ms observation window, final source and preview matched the last requested seed/style/size/name on every engine.

**S9-O1 — WebKit browser-history rate limit (observation, not waived):** in the 1,000-change rapid burst, WebKit 27.2 produced **905** page errors of the form `SecurityError: Attempt to use history.replaceState() more than 100 times per 10 seconds`. Chromium, Firefox and mobile Chromium produced **0**. The site calls `history.replaceState` on every render (`site/main.ts`), so a synthetic burst above WebKit's 100/10 s limit hits this. The final rendered source/preview still matched, and memory, listener, timer, object-URL and stale checks all passed; the errors are a browser rate-limit consequence, but they are real console errors. This report does **not** waive them. If the parent requires zero console errors under this synthetic burst, S9-05 should be reclassified FAIL; a product-side throttling/fallback change is out of this track's no-product-change scope.

**Coverage limitation:** heap is Chromium-only. Firefox and WebKit in this Playwright build do not expose an equivalent heap API; they are measured for render, object URL, clipboard, load and failure behaviour but no heap claim is made for them.

## S9-06 — throttled CPU and network

Chromium CDP network emulation: **400 ms latency, 500 kbps down, 500 kbps up, `cellular3g`**. CPU emulation: **4× slowdown**. Three runs each.

| Mode | Metric | p50 | p95 | Max | Budget |
| --- | --- | ---: | ---: | ---: | ---: |
| Slow 3G | App ready | 1,249.9 ms | **1,251.6 ms** | 1,251.6 ms | 2,503 ms |
| Slow 3G | LCP | 1,124 ms | **1,128 ms** | 1,128 ms | 2,272 ms |
| Slow 3G | Load event | 1,257.9 ms | **1,261 ms** | 1,261 ms | — |
| Slow 3G | Long-task max | 0 ms | 0 ms | **0 ms** | 50 ms |
| CPU 4× | 50 interactions | 597.8 ms | **732.3 ms** | 732.3 ms | 1,281 ms |
| CPU 4× | App ready | 64.5 ms | 94.3 ms | 94.3 ms | — |
| CPU 4× | Long-task max | 104 ms | **131 ms** | 131 ms | 212 ms |

No long task exceeded its measured budget. The CPU 4× long tasks are expected from the synthetic 50-change burst; the unthrottled Chromium sustained long-task max was 94 ms (budget 156 ms). Network throttling was applied only at load; after load the page made no required network requests.

## S9-07 — failure and reload resilience

| Case | Result |
| --- | --- |
| `assets/app.js` blocked | **1 attempt** Chromium/WebKit/mobile, **2 attempts** Firefox (one bounded browser retry); no attempt after a 2.5 s wait; status `The interactive playground could not start. Its script may be blocked, unavailable, or have failed while loading…`; gallery 0; preview 0; 7 controls disabled; documentation readable; no page errors |
| `site.css` blocked (Chromium) | App ready; gallery 8; preview 1; status clear; 1 attempt; unstyled but functional |
| `bootstrap.js` blocked (Chromium) | App ready; gallery 8; preview 1; status clear; 1 attempt |
| `favicon.svg` blocked (Chromium) | Not requested (0 attempts); app ready; no effect |
| Synthetic boot throw | Status failure text; app-ready absent; gallery 0; 7 controls disabled; exactly one bounded page error |
| `URL.createObjectURL` throw | `Download unavailable. Use Copy SVG or the manual copy panel instead.`; gallery 8; preview 1; no page error |
| Offline after load (all engines) | App ready; gallery 8; preview 1; status clear; download still works; 0 page errors; 0 failed requests |
| Repeated reload (Chromium, 20×) | 20 app.js requests, **1.0 per reload**; reload p50 40 ms, p95 63 ms, max 64 ms; heap +2,036 B; 0 page errors; final status clear; final gallery 8 |

The Firefox two-attempt result is a bounded duplicate request, not an infinite retry: the count did not grow after the wait, and no other engine retried. It is recorded as S9-O2 for parent awareness, not as a failure of the no-infinite-retry criterion.

## S9-NC — negative controls

| Control | Bad input | Detector result | Clean/positive result |
| --- | --- | --- | --- |
| NC1 leaked object URL | 2 created, 1 revoked, 1 active | **leak detected** | clean 2/2, 0 active not flagged |
| NC2 stale render | preview replaced with another SVG while source stayed old | **stale detected** | clean source/preview not flagged |
| NC3 unbounded queue | synthetic 100-item pending queue vs 1-item bounded queue | **unbounded detected; bounded not flagged** | product pending timers 0 |
| NC4 budget comparator | 101 > 100; 100 = 100; 99 < 100; missing budget | **over → FAIL, missing → BLOCKED** | equal/within → PASS |

All four controls were detected. No control was converted into a product failure or waived.

## Budget derivation and pass/fail discipline

`scripts/testing/perf-site-budget.mjs` read the first baseline only and wrote `expected-results.json` before the acceptance run. The exact formulas:

- **Time:** `ceil(max(2 × baseline p95, 1.25 × baseline max))` milliseconds.
- **Long task:** `ceil(2 × baseline maximum)`, with the browser's 50 ms long-task threshold as the floor when the baseline saw none.
- **Memory:** `ceil_to_MiB(max(0, baseline maximum delta) + 3 × baseline range + 1 MiB measurement floor)`. The 1 MiB floor is a GC/measurement quantization floor, not a hidden pass allowance; the three baseline sessions are the noise source.
- **Size:** baseline maximum bytes for a deterministic build at the same commit; acceptance must not exceed it.
- **Counts:** baseline maximum; exact behavioural counts are also asserted independently by the harness.

Baseline sample sizes: 5 cold loads per engine; 60 single renders per engine; 5 rounds of 100; 3 rounds of 1000; 3 independent memory sessions; 3 network and 3 CPU throttle runs; 20 reloads. The acceptance run repeated the same measurements. **91 budget checks passed, 0 failed.** Key examples: Chromium app-ready budget 97 ms vs actual 39.6 ms; Firefox app-ready 296 vs 131; WebKit app-ready 208 vs 116; mobile 82 vs 31.9; Chromium batch-1000 total 2,598 vs 976.2 ms; memory 2,097,152 vs 836,508 B worst delta; sustained Chromium 4,982 vs 2,461.5 ms; throttle network 2,503 vs 1,251.6 ms; CPU interactions 1,281 vs 732.3 ms; CPU long task 212 vs 131 ms; reload p95 124 vs 63 ms; site app.js gzip exact 5,711 B; CSS gzip 1,976 B; total gzip 11,864 B; one-renderer gzip 1,080 B; max SVG 22,998 B.

## Findings and observations

| ID | Severity candidate | Observation | Disposition |
| --- | --- | --- | --- |
| S9-O1 | S2 (browser console error/UX; reclassify if zero-error is required) | WebKit 27.2 produced 905 `SecurityError` entries for `history.replaceState` >100/10 s during the 1,000-event synthetic rapid burst; Chromium/Firefox/mobile 0. Final state, memory, URL and listener checks pass. | **OPEN — parent decision required.** Not fixed (no product changes). |
| S9-O2 | S2/S3 observation | Firefox attempts `assets/app.js` twice when the first request is blocked; one bounded retry, no post-wait growth. | Recorded; no infinite retry. Parent may accept or request a browser-specific note. |
| S9-O3 | Measurement limitation | Firefox/WebKit 1 ms clock gives 0–1 ms single-render p95; maxima and batch metrics are reported. | No product claim from sub-millisecond p95. |
| S9-O4 | Coverage limitation | Heap only Chromium; CPU/network throttling and long-task API only Chromium; mobile is Chromium emulation. | Explicitly not claimed for Firefox/WebKit/native mobile. |
| S9-O5 | Method note | The loopback server does not gzip/Brotli; compressed sizes are build-artifact measurements, not transfer sizes. | Transfer bytes reported separately (22,471 B / 22,940 B with Firefox favicon). |
| S9-O6 | Coverage limitation | WebKit is Playwright Linux WebKit 27.2, not native macOS Safari. | No native-Safari claim. |

No open S0/S1 product defect was observed in this track. S9-O1 is the only reproducible browser-console anomaly; it is reported, not hidden.

## Exact commands

Local orchestration (outside the sandbox source; Blaxel SDK `@blaxel/core`; authentication never printed):

```sh
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs create
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs upload-baseline
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs prepare-baseline
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs build-baseline
# 27 named parts, e.g. chromium-s01 … webkit-s07, sizes, memory-1/2/3, throttle,
# resilience-extra, negative-controls
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs part-baseline chromium-s05
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs merge-baseline
node scripts/testing/perf-site-budget.mjs \
  --baseline out/qualification/S9-SITE/attempts/20261107-1501-86ceaf/baseline.json \
  --out tests/qualification/s9-site/expected-results.json \
  --commit 716374484e205e4f73abf41915dcd6369d379b93 \
  --sandbox dither-face-q-s9-site-20261107-1501-86ceaf \
  --run-id 20261107-1501-86ceaf
# expected-results.json committed before acceptance
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs upload-acceptance
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs prepare-acceptance
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs build-acceptance
# same 27 named parts under part-acceptance
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs merge-test
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs cleanup
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs finalize
node /private/var/folders/gl/pg31flg15z35rkg4c5wppmzh0000gn/T/opencode/dither-face-s9-site/phase.mjs retrieve
```

In-sandbox harness phases (one synchronous process per part):

```sh
node scripts/testing/perf-site.mjs \
  --repo /blaxel/s9-site/20261107-1501-86ceaf/repo \
  --out /blaxel/s9-site/20261107-1501-86ceaf/out/qualification/S9-SITE/baseline \
  --work /blaxel/s9-site/20261107-1501-86ceaf/work/baseline \
  --fixtures /blaxel/s9-site/20261107-1501-86ceaf/fixtures \
  --tools-lock /blaxel/s9-site/20261107-1501-86ceaf/repo/tests/qualification/s9-site/tools/package-lock.json \
  --source-manifest /blaxel/s9-site/20261107-1501-86ceaf/source-manifest.json \
  --commit 716374484e205e4f73abf41915dcd6369d379b93 \
  --sandbox dither-face-q-s9-site-20261107-1501-86ceaf \
  --image blaxel/ts-app:latest --region us-pdx-1 --memory 4096 \
  --active-budget 1800 --command-timeout 600 \
  --pw-browsers /blaxel/s9-site/20261107-1501-86ceaf/pw-browsers \
  --source-manifest-sha b16e19f542213dd932addd71774c214a4597ddc4bf40ec56330b3d778fde56f4 \
  --tools-lock-sha 55a85b4fc1c1fdc1e813266e81a7145cb68c92518089d790670b21e29cc7fdba \
  --phase prepare   # then build; then part --part <name>; then merge-baseline
```

Acceptance used the same command shape with `--out .../acceptance`, `--commit d7f701c`, `--source-manifest-sha 5e734f…`, `--phase merge-test`, `--expected .../expected-results.json`, and `--expected-sha 23c52a570178b37c941d882c1a202cb084ec691a839445491c688e428c9e4181`.

## Raw evidence

Retrieved before handback; ignored in this worktree under `out/qualification/S9-SITE/attempts/20261107-1501-86ceaf/` and copied to the parent review location:

- Worktree attempt: `out/qualification/S9-SITE/attempts/20261107-1501-86ceaf/`
- Parent attempt: `/Users/aditya/Projects/dither-face/out/qualification/S9-SITE/attempts/20261107-1501-86ceaf/`
- `baseline/baseline.json` SHA-256 `a2c382d15fdc80ad01e88f770b849d5effcfc1ef809098c43aa73123124651a9`
- `acceptance/results.json` SHA-256 `4cf4af8eba07b3154fe1b49d95433f74660c550bcc4a0f6b1750f672fb499c28`
- `acceptance/summary.json` SHA-256 `87e27f93f465b17e42f6310c0c6bca99a74b7e2b325e6d57464846e29433977e`
- `acceptance/negative-controls.json` SHA-256 `3ec1b660a4bcf9944cc97492fdceb406565100aa482a260252f231ce2bc611d1`
- `acceptance/bundle.json` SHA-256 `69e946a5819705bf28d1342d52cce41e1a95983115218bea564931ad3da28c1f`
- `acceptance/environment.json` SHA-256 `70fb7215639d3933af9f7629040a81efd92d534cdc49ee8da2d9522ae91cc33f`
- `source-manifest-baseline.json` / `source-manifest-acceptance.json` (file hashes above)
- `SHA256SUMS` — 209 per-file hashes for the retrieved tree
- `evidence.tar.gz` SHA-256 `205a626bc66c8c3a95d7472ca0edd195d9a999434c1398c58b78d4d8d5bddb4a`; 860,827 bytes; 203 retrieved files
- `logs/`, `markers/`, `baseline/parts/`, `acceptance/parts/`, `baseline-summary.json`, `summary.json`, `bundle.json`, `environment.json`, `sandbox-create.json`, `sandbox-final.json`, `retrieval.json`, `report-data.json`

`report-data.json` is a local convenience extraction of the acceptance result; the authoritative raw files are `baseline/baseline.json`, `acceptance/results.json` and the part JSON files.

## Attempts and sandboxes

| Attempt | Source / harness | Sandbox | Result |
| --- | --- | --- | --- |
| 1 `20261107-1457-d456a6` | created at `201933d`; failed baseline used `ca4a450` / initial monolithic harness | `dither-face-q-s9-site-20261107-1457-d456a6` | Created, prepared and built. A monolithic baseline `process.exec` ran ~47 s, hit a gateway 502 and the sandbox became `TERMINATED`; no evidence retrieved or used. Superseded by a short-part design. |
| **2 `20261107-1501-86ceaf`** | baseline `7163744`, acceptance `d7f701c` | **`dither-face-q-s9-site-20261107-1501-86ceaf`** | **Final: 8 PASS / 0 FAIL / 0 BLOCKED, 596 assertions, 91/91 budget checks, S9-O1 WebKit observation; left DEPLOYED pending parent disposition.** |

No PASS was carried from attempt 1. No product/source/site change accompanied either attempt. The final sandbox is the one above.

## Limitations

- Heap is **Chromium CDP only**; Firefox/WebKit heap and GC behaviour are not claimed.
- Long-task timing and CPU/network throttling are **Chromium CDP only**; Firefox/WebKit get load/render timing but no long-task claim.
- Mobile is **Chromium Pixel 7 emulation**, not physical hardware; no real touch keyboard, thermal, or radio behaviour is claimed.
- WebKit is Playwright's **Linux WebKit 27.2**, not native macOS Safari; this report makes no native-Safari claim.
- The site server is loopback and uncompressed; compressed sizes are build artifacts, not wire bytes. Transfer bytes are reported separately.
- The 1/100/1000 gallery is a synthetic same-origin benchmark using the production library bundle and real site CSS; it is not a user journey or an SEO/real-user metric.
- WebKit `history.replaceState` rate-limit errors are a real reproducibility observation under the declared synthetic burst; normal human input was not separately rate-calibrated. S9-O1 remains parent-owned.
- Firefox's two app.js attempts when blocked are bounded, but the precise browser reason (module retry vs duplicate request) was not instrumented beyond request counting.
- No screen-reader, native browser, production-CDN or real mobile network claim is made.

## Disposition

**Parent review — PENDING.** Agent-observed result is **8 provisional PASS, 0 FAIL, 0 BLOCKED, 596 assertions, 91/91 budget checks, 0 failed assertions**, with **S9-O1** (WebKit history rate limit, 905 errors, S2 candidate) explicitly open and **S9-O2** (Firefox one bounded blocked-asset retry) recorded. The sandbox `dither-face-q-s9-site-20261107-1501-86ceaf` is left **DEPLOYED** pending parent disposition; raw evidence is retrieved and copied. No stage advancement, release, push, PR, deployment or self-approval is claimed.
