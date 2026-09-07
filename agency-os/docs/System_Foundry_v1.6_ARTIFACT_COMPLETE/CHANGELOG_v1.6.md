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
- 19 new business-domain modules distilled from an operator-supplied global commerce blueprint, each with full capability/question/rule/obligation coverage: `marketplace_ops`, `b2b`, `subscription_commerce`, `loyalty`, `reviews`, `cross_border`, `oms`, `demand_planning`, `affiliate`, `pos`, `warranty`, `cdp`, `returns`, `promotions`, `risk`, `shipping`, `plm_quality`, `merchandising`, `inventory_ops` (+62 capabilities, +61 questions -- `shipping` was the first module in this list where the two deltas diverge, adding one derivation-only capability, `DER-CARRIER-ADAPTER`, with no question of its own; `plm_quality`, `merchandising`, and `inventory_ops` each keep a 1:1 capability/question delta again, +4/+4, +2/+2, and +2/+2 respectively).
- Deterministic (non-LLM) blueprint-content extraction: `generation/blueprint-doc-mapping.json` (40 business modules -> Commerce OS blueprint doc(s), 11 modules intentionally unmapped -- 7 platform-shape + 4 with no matching doc), `scripts/extract_blueprint_content.py` extracts Domain Objects/Service Contract/Events/Permissions/Data Rules/LEGO Test/DoD verbatim into `generation/blueprint-architecture-content.json` (42 docs, 38 with matched sections). `foundry_generate.py` writes `docs/modules/<mid>/BLUEPRINT_ARCHITECTURE.md` per selected mapped module with non-empty content only (no file, no placeholder, otherwise) -- real architecture content scoped to selection, on top of the existing generic 10-artifact governance package.

## Fixed
- A capability can no longer remain simultaneously `DEFERRED` and `CURRENT`; current closure wins deterministically.
- Generated module folders are no longer empty shells.
- Unselected module leakage is now explicitly validated.
- Configurator generation response reports artifact/blueprint coverage.
- Top-level operating model gate names were aligned with canonical G0-G13 runtime IDs.
- Documented blocking status codes were added to the canonical status registry.

## Assurance
Release requires ALL-NO, ALL-YES, all 261 single-question cases, exhaustive pairwise interactions, 1,000 randomized configurations, all module reachability/materialization, blueprint applicability, conflict fail-closed behavior, artifact hash verification, E2E, adversarial tests, unit tests, semantic validation, and manifest integrity.
