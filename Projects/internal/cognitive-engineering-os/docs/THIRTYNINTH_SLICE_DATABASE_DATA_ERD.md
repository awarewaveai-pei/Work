# Thirty-ninth Method Atlas slice: `database_data.erd`

Status: **LANDED (2026-09-05)**. FIFTH slice from the `database_data` family (F21), after `database_data.backup_restore_drill` (twenty-fifth), `database_data.data_lineage` (twenty-eighth), `database_data.reconciliation` (twenty-ninth), and `database_data.expand_contract_migration` (thirtieth). First `database_data` member built since F19's `devops_sre` family completed (13/13) in the immediately prior slice.

## What was built

Atlas gives this method **two** citations: the F21 tool table's ERD row (L899: "entities→keys→relationships→constraints") AND a dedicated §11.47 實體關係圖 section (L2294-2306: purpose "建模 entity、attribute、primary/foreign key、cardinality"; benefits "建立 DB schema 的共同語言" and "可作為 migration 與 data contract 的起點"). The first draft's own claim that only one citation existed, and that no dedicated section existed, was **false** -- caught by the critic round (see below).

Four real referential-integrity invariants make this record a genuine **model**, not a bag of independently-valid parts: every entity has at least one `is_primary_key: true` attribute ("keys"); every relationship's own `from_entity`/`to_entity` names a real entity; every relationship's own `foreign_key_attributes[]` entries (an **array**, supporting composite foreign keys) ALL name real attributes of that relationship's own `from_entity`; and a supplied `migration_ref` carries `database_data.expand_contract_migration`'s own id prefix (`ECMIG-`), resolving §11.47's own explicit "起點" (starting-point) benefit for migration.

This record models a **physical/logical relational schema** (foreign-key-bearing), not a conceptual Chen-style ER diagram -- a scope decision the first draft made implicitly but never stated, now explicit.

* `methods/contracts/database_data.erd.contract.yaml`, `specs/cognitive/typed-objects/erd-record.schema.yaml` (spec-root suite 2803 -> 2806).
* `ai_lego/modules/database_data/erd.py` -- builder + 2 gates (`provenance_required` + `erd_integrity`; no genuine-compute gate, same class as `devops_sre.rto_rpo`/`game_day` -- no arithmetic here), ten shared predicates.
* `ai_lego/apps/cli/run_erd_slice.py` -- a real two-entity model citing a migration, a real junction-entity model with a genuine composite foreign key (shipments -> order_items via two columns, one relationship entry), two-layer attack-and-confirm.
* `tests/unit/test_erd.py` -- 81 tests, including a self-referencing relationship, a composite primary key AND a composite foreign key referencing it, same-attribute-name-across-different-entities (legal), foreign-key-attribute-on-the-wrong-side, a two-dangling-relationship sorted-evidence test, `migration_ref` present/absent/malformed, and `all_gates_pass`'s own FAIL direction.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module.

## Critic round: `fail` on the first draft's own central citation claim -- corrected to a genuinely stronger design

A `critic` subagent review (mutation testing, a 79,716-case enumeration oracle, and an independent argument about the cardinality-taxonomy design itself) returned **fail**. The runtime/gate/schema layer was already solid (25/27 mutations killed, zero enumeration mismatches), but the citation layer was not:

1. **Critical, fixed** -- the contract claimed "exactly ONE citation" and "no dedicated §11.x section exists". Both **false**: Atlas §11.47 (L2294-2306) is a real, dedicated ERD section the first draft's own narrower grep missed. This was load-bearing: §11.47 explicitly names `cardinality` as its own modeling target (the first draft's own compilation_decision had wrongly premised "Atlas names no cardinality vocabulary" as if cardinality itself were unmentioned), and it gives a real 推薦搭配 chain to migration and data-contract methods that the first draft's own `recommended_next: []` silently dropped.
2. **Major, fixed** -- composite foreign keys were inexpressible (`foreign_key_attribute` was a single string) while composite primary keys were explicitly blessed -- the schema legalized the cause and could not represent the effect. Changed `foreign_key_attribute` to `foreign_key_attributes` (a non-empty array), with the gate now checking every entry against `from_entity`'s own attributes.
3. **Major, fixed** -- the `many_to_many` justification claimed "every real ERD notation (Chen, Crow's Foot, UML)" requires a junction entity for M:N. **False**: all three notations draw conceptual M:N directly; the junction table is a physical-mapping artifact, not a notation rule. Narrowed the claim to "every real relational **schema**" and made the physical-vs-conceptual scope an explicit, disclosed compilation decision.
4. **Major, fixed** -- following from #3, the record's own scope (a physical schema, FK-bearing) was never stated, making the two-value cardinality enum read as an ERD-theory claim rather than a scope decision. Added the compilation decision directly.
5. **Major, fixed** -- due diligence never grepped for generic graph vocabulary ("node"/"edge"), missing the closest real structural analogue in this session's own spec root: `specs/cognitive/typed-objects/dependency-map.schema.yaml` (a graph of named nodes with typed, runtime-validated edges -- the identical cross-reference discipline this record also uses). Added, along with `causal-dag-analysis.schema.yaml` and `evidence-graph.schema.yaml`'s own `entity_node` (that schema's own due diligence had already disclosed "Entity Relationship Diagram" as a non-hit for its own purposes -- confirmed distinct).
6. **Minor, fixed** -- the builder's own docstring claimed it "REBUILDS every nested object", but `provenance` is stored by reference (the family-wide convention every module in this package follows) -- narrowed the claim.
7. **Minor, fixed** -- an extra key on an *entity* (not an attribute) was refused by the live code but untested at both the builder and gate layers -- added.
8. **Minor, fixed** -- the schema's own top-level `required` list was untested (every prior test mutated a field's *value*, never deleted a required key outright) -- added.
9. **Minor, disclosed not fixed** -- two relationship entries with the identical `(from_entity, to_entity, foreign_key_attributes)` triple but contradictory `cardinality` both pass every gate; `cardinality` is an unverified caller assertion with no field (e.g. a `is_unique` flag) to cross-check it against. Filed as `OQ-ERD-5`, with a test proving the current (accepted) behavior is deliberate, not an oversight.

The critic's own independent argument on the cardinality design: the **conclusion** (two values, from `from_entity`'s own perspective) is correct and loses no real modeling power (`one_to_many(A→B)` is losslessly the same relationship as `many_to_one(B→A)`) -- but only once the physical-schema scope decision above makes the premise explicit.

## Due diligence

Broad from the start, extended after the critic round: "ERD/entity relationship/entity_relationship", "primary_key/foreign_key/cardinality", "entities→keys", "node/edge". Neighbours confirmed distinct: `SEARCH_CONTENT_DOMAIN_MODEL.md`'s own NLP-sense "entity"; Master Plan L2591's own Graph Store concept; `repository-contract.schema.yaml`'s own fixed `storage_tier`; `dependency-map.schema.yaml`'s own service/vendor/data dependency graph; `causal-dag-analysis.schema.yaml`'s own acyclic causal graph; `evidence-graph.schema.yaml`'s own `entity_node` (a mentioned real-world entity inside an evidence graph, not a database schema entity).

## Evidence

CLI: `PASS database_data.erd: 2 entities, 1 relationships, 1 constraints, migration_ref=ECMIG-2026-09-05-001, gates [provenance_required=PASS, erd_integrity=PASS], invariant_verified(construction=True, gate=True)`. 81 unit tests passed (63 first draft -> 81 after the critic-fix round). Golden suite 2806 (2803 before this slice -- unchanged count since the rework was additive to an already-registered schema, not a fresh one). Full product-root regression: 1280 -> 1298 OK after the fix round, zero regressions.

## Honest limits

No method-inventory.yaml machine_id row (`OQ-ERD-1`). No structured field for relationship optionality (nullable FK) (`OQ-ERD-2`). No soft link to a future `database_data.normalization` (`OQ-ERD-3`) or `database_data.data_contract` (`OQ-ERD-4`) slice. `relationships[]` is not deduplicated; `cardinality` is an unverified caller assertion (`OQ-ERD-5`). This record's own scope is a physical/logical relational schema only -- a pre-physicalization conceptual model (relationships with no FK column yet) cannot be recorded as-is (`OQ-ERD-6`). `constraints[]` is free text, no parsing or cross-validation against entities/attributes. Entity/attribute name matching is case-sensitive exact string. Own id prefix, `version` type, and top-level key set are schema-layer only / unconstrained -- the same family convention prior slices disclosed.
