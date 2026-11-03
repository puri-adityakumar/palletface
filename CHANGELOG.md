# Changelog

## Unreleased — 0.x preview preparation

### Added

- Eight deterministic SVG avatar styles, typed API, and browser bundle.
- Minimal static landing page/playground, URL state, SVG copy/download, and usage examples.
- Core/output regression tests, package-consumer checks, example checks, and browser tests.
- CI and manually approved npm-release tooling; no public deployment is performed by these changes.
- API, contributor, security, and release documentation.

### Changed

- Numeric initials have dedicated bitmap glyphs instead of the `?` fallback.
- ASCII field/face definition IDs are explicitly namespaced by style. SVG bytes change, while their seeded design is preserved.
- Public and direct-renderer inputs are validated. Invalid sizes no longer emit malformed SVG dimensions.
- Style names are a TypeScript union for autocomplete and typo checking.

This entry describes release preparation, not an already published npm version. Preview minor versions may change seeded output; use an exact version when identity must remain stable.
