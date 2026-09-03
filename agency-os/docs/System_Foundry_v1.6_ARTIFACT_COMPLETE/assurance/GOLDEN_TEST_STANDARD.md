# Golden / Contract Test Standard

Every machine-readable Foundry schema, policy and cross-file invariant MUST have positive and adversarial negative fixtures.

Minimum families:
1. schema conformance
2. policy decision fixtures
3. cross-file reference resolution
4. lifecycle/state-transition legality
5. authority/risk/gate scenarios
6. rollback and recovery scenarios
7. handoff completeness
8. backwards-compatibility/deprecation scenarios
9. supply-chain/release evidence scenarios

A negative fixture MUST name the exact rule it violates. An empty-object-only negative test is insufficient for nontrivial schemas.
