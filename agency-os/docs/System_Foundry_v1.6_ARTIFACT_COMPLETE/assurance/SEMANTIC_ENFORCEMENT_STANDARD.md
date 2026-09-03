# Semantic Enforcement Standard

A rule is **VERY STRONG** only when its failure can be detected mechanically or is explicitly gated by independent evidence. String-presence checks are not sufficient for cross-reference, risk, authority, lifecycle, release, evidence, or runtime-graph correctness.

Required executable checks:
1. Manifest/file-hash consistency.
2. Version consistency.
3. Runtime DAG and gate reference integrity.
4. Canonical status-code references.
5. Full kernel inheritance with content digest.
6. Deterministic risk classification and authority derivation.
7. Content-addressed evidence integrity.
8. Non-waivable exception rejection.
9. Lifecycle-state evidence requirements.
10. Risk-dependent release approvals and evidence.
11. Adversarial negative tests.
12. Bootstrap E2E.

Any failure blocks Foundry release.
