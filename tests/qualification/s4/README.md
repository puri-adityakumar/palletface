# Stage 4 fixtures and apps

- `expected-results.json` was written before execution.
- `apps/` contains the four independent consumer projects copied by the harness to
  `/blaxel/s4/qualify/apps/<name>` (outside the uploaded repository).
- `tools/` contains the pinned Playwright tooling project.
- The actual tarball is **not** committed. The harness verifies the approved SHA-256
  `ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021`, uploads it as
  bytes, and installs it from `/blaxel/s4/qualify/fixtures/dither-face-0.1.0.tgz`.
  App dependency specifiers are `file:../../fixtures/dither-face-0.1.0.tgz`, so the
  installed package is a real copy in each app's `node_modules`, never a repository
  alias, workspace or symlink.
- `package-lock.json` files are committed from the Stage 4 sandbox lock bootstrap;
  their SHA-256 values are recorded in `results.json`. The final evidence run uses
  these tracked locks directly with `npm ci` and verifies they stay byte-identical.
  When a lock is absent, the harness can still bootstrap one with
  `npm install --package-lock-only` in the sandbox.
- Raw logs and screenshots are retrieved to ignored `out/qualification/S4/` and are
  not part of the tracked report.
