# Security

Please report suspected vulnerabilities privately to **contact@palletism.art**, using a subject beginning with `dither-face security`. Include the affected version, reproduction, and likely impact. Do not include real secrets or personal information. If private GitHub vulnerability reporting is enabled, you may use that instead.

This is a small, maintained-in-best-effort preview project with no response-time SLA. Security fixes target the current preview release; older versions may require an upgrade.

The library's seed hashing is not cryptography. It does not guarantee unique avatars, anonymize input, or authenticate users. Low-level SVG utilities accept trusted fragments/colors/IDs and are not general-purpose sanitizers.
