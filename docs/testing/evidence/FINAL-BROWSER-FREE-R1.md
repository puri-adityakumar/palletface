# Final browser qualification under 4096 MB — 2026-11-09

**Parent disposition — ACCEPTED 2026-11-09 as final browser component evidence.** Lifecycle changes serialize execution without dropping S6/S8 cases; scoped S7 explicitly omits 07/08. Retrieved artifact-copy index SHA verified as `da753f66…`. All reported component results accepted on unchanged product. Combined with FINAL-20261109's core/package passes, functional integration is verified across split runs. Full release gate remains REVIEW REQUIRED because S9 criteria are unresolved. Original agent account follows as execution history; no overall Stage 11/release PASS.

**Result: the approved browser suites completed on frozen commit `86909b6`. No Stage 11 PASS is claimed. `DISPOSITIONS.md` remains authoritative; S9 remains REVIEW REQUIRED and native Safari and speech remain BLOCKED.**

## Run identity and integrity

| Item | Observed value |
| --- | --- |
| Qualification source | `86909b6a57ec702e06d33413efd21ce2b0a8fd91` on `t3/finish-browser-verification` |
| Harness change | Cherry-pick of `5cf5bca`; only `scripts/testing/browser-lifecycle.mjs`, `s6-qualify.mjs`, `s7-qualify.mjs` and `s8-qualify.mjs` changed (serialized lazy browser lifetimes; S7 `--scope browser-final`) |
| Product freeze | `f1e17d08878c4ca2278aaeb7aba2d2fdbb7ae3df`; `src`, site, root package/lock, README and LICENSE diff from freeze empty |
| Tracked-source archive | 2,693,120 bytes; SHA-256 `db8452c31b1d483e77747371984cd662abb5e9d6623d3e7a290f89d73c941189` |
| Source manifest | 266 files; sorted-path digest `a6724f31b6441da594ec3880c91b1c6caf29b7227eeb3554b83fdd6041d0d7f9`; JSON SHA-256 `e8a71200f9eb42a45f10eff95dbd174478e88994db58efbde94bc44600608392` |
| Frozen tarball | `dither-face-0.1.0.tgz`, 23,220 bytes, SHA-256 `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021`; matches the approved artifact |
| Sandbox | `dither-q-browser-free-86909b`; `blaxel/ts-app:latest`, `us-pdx-1`, 4096 MB, platform-default CPU, no volumes, 30-minute TTL, 600-second command timeout |
| Runtime | Linux 6.12.114; Node `v24.22.2`; npm `11.19.1`; Playwright `1.64.1`; Chromium `156.0.8078.4`, Firefox `157.0`, WebKit `27.2` |

The first preflight exited 127 because `python3` was not yet available; the corrected preflight exited 0 and verified the source archive, manifest and tarball hashes. No test ran in the failed preflight. All suites used one shared Playwright cache and one active browser engine at a time.

## Results

| Component | Actual result |
| --- | --- |
| Root Playwright, `--workers 1` | 76 tests: **74 passed, 2 skipped, 0 failed** (the two explicit clipboard-permission cases), 56.5 s |
| S6 | **9/9 PASS**; 90/90 cases; 1,141 assertions; 0 failures; **3/3** negative controls detected; all 11 integrity checks true (statuses, case counts, expected-results/golden hashes, tarball, lockfile, source manifest, no fatal) |
| S8 | **8 PASS, 1 BLOCKED, 0 FAIL**; 64 cases; 407 assertions; 0 failures; **4/4** controls detected. S8-09 native Safari BLOCKED. Bundle manifest `656a8e5e34e71383437d1995c8b0b2cff728fc839e91743b3cba03209b3a6629` |
| S7 scoped (`browser-final`) | S7-01…06: **6/6 PASS**; 34 cases; 2,538 assertions; 0 failures; **5/5** controls detected. S7-07/08 extreme/OOM stress not run by design |

S8's Q-002 cross-stage status is `FIXED_PENDING_PARENT_REVIEW`; the Q-002 disposition remains parent-owned and is not self-closed. Every phase process returned exit 0; no exit 137 or OOM kill occurred.

## Resources, retrieval and cleanup

`MemTotal` was 4,033,428 kB. `MemAvailable` was about 3.61 GiB before the suites and 1.28 GiB after S7; disk free was 901 MB after S7 (2.2 GB used). `cgroup memory.current` and `memory.events` were unavailable, so cgroup-level peaks could not be recorded.

Retrieved archives: `out` 8,416,906 bytes, SHA-256 `b5669e7fc0affe57d0861ace2dcbd5168251f7979806faf191bf505428fd025a`, 231 entries; repo artifacts 5,547,027 bytes, SHA-256 `b5967b6a07af5d99a74332cd16cb2295732208863f6d9fa7958d42ec1b539b85`, 36 entries. Raw evidence and orchestration records remain in the artifact tree. The tree was copied to `/Users/aditya/Projects/dither-face/out/qualification/FINAL-BROWSER-FREE-R1/`: 310 files, 35,880,531 bytes; copy index SHA-256 `da753f660bd05df61632abd9a51ff97d4cd8a4a6c07766f3c268669b84ca9cff`. The sandbox was deleted and confirmed `TERMINATED` and absent from the workspace list; only the three pre-existing sandboxes remain.

## Limitations and open items

- S9 remains REVIEW REQUIRED. The recorded Codex site 66 ms/50 ms regression-limit failure, Node 24 RSS and throttled p95 monitoring exceedances, and S9-O1's 905 WebKit `history.replaceState` rate-limit errors remain open. No release performance budget is approved and S9-O1 is not waived.
- S8-09 native Safari is BLOCKED: no macOS Safari exists in the Linux sandbox. Playwright WebKit is supplementary only and is not a Safari substitute. Actual screen-reader speech is untested.
- Mobile checks are emulated; S8 zoom/reflow evidence does not establish native page zoom.
- S7 extreme/OOM stress (S7-07/08) was intentionally not run under the 4096 MB scope.
- No Stage 11 PASS or release recommendation is claimed; parent dispositions are unchanged.

## Boundaries

No product source, site source, dependency, lockfile, README, LICENSE, master testing record, or other agent file was changed. No push, PR, registry, deployment, DNS, or publication action was taken.
