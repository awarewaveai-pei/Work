# Artifact Generation and Selection Correctness Contract

Version: 1.6.0

## Non-negotiable invariants

1. A selected LEGO module MUST materialize a complete module contract package: requirements, architecture boundary, contracts, security, data/migration, tests, observability/SRE, rollback/recovery, implementation backlog, and machine-readable manifest.
2. An unselected module MUST NOT materialize implementation paths or module contract documents.
3. Every user question MUST map exactly once to a deterministic YES rule. Engineering baselines are never user-disableable.
4. Capability dependency resolution MUST reach a fixed point. Deferred-only capabilities MUST NOT leak into current generation.
5. Every generated project MUST include a complete controlled System Blueprint. Inapplicable sections are explicit `NOT_APPLICABLE`, never silently omitted.
6. `ALL YES` MUST activate every reachable capability, every generation module, and every blueprint section. `ALL NO` MUST generate only the locked core baseline.
7. Selection correctness MUST be tested from multiple directions: all-NO, all-YES, every single question, exhaustive pairwise interactions, randomized mixed selections, every module, conflicts, deferred capabilities, and output hash integrity.
8. Generator output MUST be created in staging, validated for exact selection/no-leakage, content-hashed, and atomically committed. Existing targets are never overwritten.
9. Generated planning documents MUST distinguish verified configuration facts from unresolved implementation decisions. No technology/provider choice is invented from checkbox input.
10. New capabilities/modules/questions cannot enter the Foundry release unless the selection matrix and artifact coverage tests prove complete reachability and generation behavior.
