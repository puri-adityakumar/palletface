# S9-SITE — playground and site performance qualification

This directory supports the independent Stage 9 site/playground track. It does
not change product source and it is not evidence until the sandbox run has been
retrieved and reported.

## Files

- `tools/package.json`, `tools/package-lock.json` — pinned Playwright 1.64.1
  browser tooling. The harness installs these tools inside the sandbox.
- `expected-results.json` — created **after** the first baseline run and
  **before** the acceptance run. It records the derived numeric budgets and
  the baseline hash. It is intentionally absent until the baseline exists.

## Sandbox-only method

`scripts/testing/perf-site.mjs` runs one phase per synchronous process:

1. `prepare` — verify the tracked-source manifest and pinned tool lock, install
   Playwright Chromium/Firefox/WebKit, record machine/CPU/memory/browser data.
2. `build` — `npm ci`, TypeScript build, production web bundle, actual site
   build; record raw/gzip/brotli sizes and hashes.
3. `baseline` — measure initial load, single renders, 1/100/1000 avatar gallery
   renders, sustained and rapid interactions, object-URL and clipboard churn,
   throttled CPU/network, blocked assets, offline-after-load, repeated reloads,
   and negative controls. No budgets are applied.
4. `test` — repeat the same measurements and compare them with the budgets in
   `expected-results.json`; fail any exceeded budget or behavioural assertion.

`scripts/testing/perf-site-budget.mjs` is a local, non-browser derivation step:
it reads the retrieved baseline JSON and writes the budgets. The formulas are
recorded in the generated document and in the final evidence report.

## Local restrictions

No local browser, local server or local test run is evidence. The only local
work is orchestration (Blaxel SDK upload/execute/retrieve), manifest and budget
derivation, and report assembly.
