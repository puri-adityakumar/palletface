# Preview roadmap

## Public launch gate

- Review the library API, intentional output changes, and regression fixtures.
- Verify the full suite on a clean Linux environment, including real-package consumers and three browser engines.
- Review the minimal site on desktop and mobile and confirm public copy does not overpromise determinism or uniqueness.
- Verify repository visibility and package-name ownership at launch time.
- Configure protected npm publication and separately approve the Cloudflare domain/deployment.
- Publish a preview release, verify independent installation, then announce it through the project and Palletism channels.

## After feedback

- Revisit supported runtime/browser versions and any cross-engine visual differences.
- Stabilize the high-level API and output policy before 1.0.
- Consider adapters, custom palettes, or export formats only when there is a clear use case. Keep the core small.
- Evaluate a Palletism integration separately: it currently has its own orb renderer with different seed handling. Do not silently change existing users' avatars.

This is direction, not a delivery schedule or a commitment to add every requested feature.
