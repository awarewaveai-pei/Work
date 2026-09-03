# Release Engineering Standard

A release is an evidence-backed state transition, not a build artifact.

Required: immutable version, source commit, dependency lock state, SBOM/provenance where applicable, change set, risk tier, approvals, test bundle, migration plan, rollback plan, observability plan, deployment strategy, release notes, and post-release verification.

Progressive delivery (canary/ring/blue-green) SHOULD be used when blast radius justifies it. Rollback decision thresholds MUST be defined before deployment.
