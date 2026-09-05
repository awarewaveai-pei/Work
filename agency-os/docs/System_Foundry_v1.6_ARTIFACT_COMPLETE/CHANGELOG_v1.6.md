# Changelog v1.6 — ARTIFACT_COMPLETE

## Added
- Complete 10-artifact planning/assurance package for every selected LEGO module.
- Full 73-section generated System Blueprint with explicit `ACTIVE` / `NOT_APPLICABLE` applicability.
- Generated selection traceability, generation coverage, and content-hashed artifact manifest.
- `custom` extension module so user-added requirements cannot be silently ignored or guessed into technology.
- `kernel/14_ARTIFACT_GENERATION_AND_SELECTION_CORRECTNESS.md`.
- `assurance/SELECTION_OUTPUT_CORRECTNESS_STANDARD.md`.
- `generation/module-obligations.json` and `generation/blueprint-map.json`.
- Static artifact generation validator and multi-angle selection matrix.
- Golden ALL-NO / ALL-YES selection fixtures.
- 12 new business-domain modules distilled from an operator-supplied global commerce blueprint, each with full capability/question/rule/obligation coverage: `marketplace_ops`, `b2b`, `subscription_commerce`, `loyalty`, `reviews`, `cross_border`, `oms`, `demand_planning`, `affiliate`, `pos`, `warranty`, `cdp` (+43 capabilities, +43 questions).

## Fixed
- A capability can no longer remain simultaneously `DEFERRED` and `CURRENT`; current closure wins deterministically.
- Generated module folders are no longer empty shells.
- Unselected module leakage is now explicitly validated.
- Configurator generation response reports artifact/blueprint coverage.
- Top-level operating model gate names were aligned with canonical G0-G13 runtime IDs.
- Documented blocking status codes were added to the canonical status registry.

## Assurance
Release requires ALL-NO, ALL-YES, all 208 single-question cases, exhaustive pairwise interactions, 1,000 randomized configurations, all module reachability/materialization, blueprint applicability, conflict fail-closed behavior, artifact hash verification, E2E, adversarial tests, unit tests, semantic validation, and manifest integrity.
