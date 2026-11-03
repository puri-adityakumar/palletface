# dither-face decisions

## 2026-11-03 — open-source preview

- dither-face is an independent, open-source sister project of Palletism. It has its own npm package and public website; it requires no Palletism account, service, or backend.
- The first release is a **0.x preview**, with all eight existing styles. Keep MIT licensing and zero runtime dependencies. Document that minor preview releases may change the API or avatar output; pin an exact version for persisted identity.
- Build the package and minimal static landing page/playground together in this repository. Use a dither/ASCII visual direction, not Palletism's paper/editorial design system. Shared fonts are optional.
- Prepare a separate Cloudflare static deployment at `https://ditherface.palletism.art`. This is configuration only; DNS changes and deployment require later approval.
- Ship the framework-independent core with tested vanilla, React, and server-side examples, not maintained framework adapters.
- Use Codex `gpt-6-luna` subagents for bounded implementation tasks. The parent owns integration and final verification. Do not edit the sibling Palletism checkout or migrate its avatars in this work.
- Run the complete verification suite in one ephemeral Blaxel sandbox, including browser checks. Retrieve reports and delete only the dedicated sandbox created for this run. Keep the same checks runnable locally and in CI.
- Work on a local feature branch; local commits are permitted. No pushes, PRs, visibility changes, npm publication, DNS changes, or deployment are authorized.

## Initial implementation contract

- `ditherFace(seed, { style, px, name })` remains the primary API. All existing style slugs and direct renderers remain available.
- Accept any string seed, including empty and Unicode strings. Reject non-string seeds, non-string display names, unknown styles, and sizes that are not positive finite numbers with descriptive errors.
- `name` only selects the initial in letter styles; seed-driven appearance remains independent of the display name.
- Export a `StyleSlug` union. Preserve existing utility exports in the preview, but identify rendering utilities as low-level APIs with a weaker stability commitment.
- No browser DOM, network, random system state, or external font download is required to generate SVG. ASCII SVGs use a system monospace stack and their appearance can vary by font and platform.
- Capture existing output before rendering changes. Preserve existing nonnumeric glyphs and seeded designs where practical; document intentional clip-ID and digit-glyph changes.
- The site imports the actual library, supports URL state, copy/download SVG, copyable usage code, keyboard access, and mobile layouts. Never expose raw seed/name input as HTML.
