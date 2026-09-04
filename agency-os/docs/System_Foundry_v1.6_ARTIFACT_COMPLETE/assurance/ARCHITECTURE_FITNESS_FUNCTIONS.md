# Architecture Fitness Functions Standard

An architectural characteristic that is only checked at design time will drift; a fitness function makes it a continuously, automatically re-checked property.

Required rule families: dependency-direction rules (e.g. domain code must not import infrastructure code), schema/contract rules (generated artifacts match their declared schema — this framework's own `scripts/validate_*.py` chain is a live example), security rules (no plaintext secret patterns, no disallowed dependency licenses), and drift-detection rules (declared inventory matches actual filesystem/registry state, as `scripts/validate_manifest.py` does for this package).

Every fitness function MUST run in CI, not only locally. A fitness function that would fail MUST NOT be silently skipped or have its threshold quietly loosened to make the build pass — loosening a fitness function is itself a governed change requiring the same review as the rule it weakens.
