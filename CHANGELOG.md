# Changelog

## Unreleased — 0.x preview preparation

### Added

- Eight deterministic SVG avatar styles, typed API, and browser bundle.
- Minimal static landing page/playground, URL state, SVG copy/download, and usage examples.
- Core/output regression tests, package-consumer checks, example checks, and browser tests.
- CI and manually approved npm-release tooling; no public deployment is performed by these changes.
- API, contributor, security, and release documentation.

### Fixed

- Improved placeholder and control contrast, added visible loading and failure states to the playground, labeled the style gallery, and added error feedback and object URL cleanup for downloads.

### Changed

- Numeric initials have dedicated bitmap glyphs instead of the `?` fallback.
- ASCII field/face definition IDs are explicitly namespaced by style. SVG bytes change, while their seeded design is preserved.
- Public and direct-renderer inputs are validated. Invalid sizes no longer emit malformed SVG dimensions.
- Style names are a TypeScript union for autocomplete and typo checking.
- `ascii-letter` now picks dots for every grid cell before overlaying the initial. Changing `name` keeps the dots outside the glyph in place. This updates the dot pattern for existing `ascii-letter` avatars.

This entry describes release preparation, not an already published npm version. Preview minor versions may change seeded output; use an exact version when identity must remain stable.
