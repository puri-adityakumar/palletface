# Changelog

## Unreleased — 0.x preview preparation

### Added

- Eight deterministic SVG avatar styles, typed API, and browser bundle.
- Minimal static landing page/playground, URL state, and SVG copy/download.
- Core/output regression tests, package-consumer checks, and browser tests.
- CI and manually approved npm-release tooling; no public deployment is performed by these changes.
- API, contributor, security, and release documentation.

### Fixed

- Site-only Q-002/Q-003 correction: placeholder and control-boundary contrast now meet WCAG AA, the playground exposes a static loading/failure status and stays disabled until a successful render, the gallery is a named group, and download failures get bounded status feedback with object-URL cleanup. Library output and the published package tarball are unchanged.

### Changed

- Numeric initials have dedicated bitmap glyphs instead of the `?` fallback.
- ASCII field/face definition IDs are explicitly namespaced by style. SVG bytes change, while their seeded design is preserved.
- Public and direct-renderer inputs are validated. Invalid sizes no longer emit malformed SVG dimensions.
- Style names are a TypeScript union for autocomplete and typo checking.
- `ascii-letter` now consumes exactly one dot decision per grid cell before overlaying the initial, so changing `name` no longer shifts dots outside the glyph (Q-001). Seeded background/character/dot/accent choices, glyph shape, IDs, and all other styles are unchanged; existing `ascii-letter` dot patterns change once as an approved migration.

This entry describes release preparation, not an already published npm version. Preview minor versions may change seeded output; use an exact version when identity must remain stable.
