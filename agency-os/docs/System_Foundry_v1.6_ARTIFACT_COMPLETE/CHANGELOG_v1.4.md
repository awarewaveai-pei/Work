# Changelog v1.4 — Semantic Strong

v1.4 converts high-value Foundry rules from prose-only guidance into executable semantic law.

## Structural corrections
- Corrected runtime gate drift and profile gate references.
- Replaced partial subagent kernel lists with a canonical content-hashed kernel registry.
- Replaced agent version pin `1.1.0` with v1.4 kernel version + digest inheritance.
- Centralized status codes and non-waivable rules.

## Executable enforcement
- Deterministic risk computation and authority derivation.
- Content-addressed repository evidence with revision, blob hash, content hash, and line-range validation.
- Lifecycle, release, exception, and human-action semantic validators.
- Runtime DAG/cross-reference validation.
- Manifest content hashes and version consistency validation.
- Adversarial negative contract tests.
- Executable repository bootstrap with E2E test.

## 30-year control plane
- Versioned `.foundry/` control plane with lock file and migration history.
- Added machine contracts for DB, security, SRE, observability, migration, restore, testing, source-of-truth and dependency mapping.
