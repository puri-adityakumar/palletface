# Qualification execution log

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

## 2026-11-03 — Stage 1 Q-001 fix rerun (provisional)

- Fix commit `104195b`: `ascii-letter` consumes one dot decision per grid cell before glyph overlay.
- New dedicated sandbox `dither-face-q-s1-r1-202611031644-d6c686`; source manifest 91 files, tarball SHA-256 `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021`.
- Same unmodified harness and expected-results files; all eight scenarios provisional PASS (469 cases, 3,012 assertions, 0 failures). Complete unit suite 117/117.
- New regression failed the old implementation (8 failed / 48 passed) in a disposable sandbox copy. Historical baseline fixture unchanged; ascii-letter preview migration old/new SHAs recorded.
- Parent review **PENDING**; Q-001 remains open; sandbox left alive; no Stage 2 dispatch.
