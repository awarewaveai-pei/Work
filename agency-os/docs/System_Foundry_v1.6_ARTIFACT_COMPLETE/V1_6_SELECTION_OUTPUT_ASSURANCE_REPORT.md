# System Foundry v1.6 — Selection / Output Assurance Report

## Scope
This release closes the v1.5 gap where capability selection was complete but generated module directories were mostly empty shells. v1.6 proves 100% coverage of the defined question/rule/capability/module/blueprint inventory, plus exhaustive pairwise interactions and randomized higher-order combinations. It does not claim literal enumeration of all `2^208` theoretical answer vectors; correctness beyond the exhaustive component/pair matrix is enforced by deterministic invariants and randomized property checks.

## VERIFIED findings and fixes

### F-001 — Selected modules were not complete artifacts
Evidence: the v1.6 mandatory package is defined in `kernel/14_ARTIFACT_GENERATION_AND_SELECTION_CORRECTNESS.md:7-16`. Generator roles are fixed in `scripts/foundry_generate.py:7-10`; complete module materialization occurs in `scripts/foundry_generate.py:101-118`.

Fix: every selected module now gets requirements, architecture, contracts, security, data/migration, tests, observability/SRE, rollback/recovery, implementation backlog and `MODULE_MANIFEST.json`.

Validation: staging rejects missing artifacts at `scripts/foundry_generate.py:206-224`.

Rollback: generation happens in an isolated staging directory and is deleted on failure; atomic commit is at `scripts/foundry_generate.py:232-275`.

Expected result: a selected LEGO is never an empty shell.

### F-002 — Unselected module leakage required explicit proof
Evidence: exact absence checks for every unselected module document/path are implemented in `scripts/foundry_generate.py:214-218` and independently rechecked in `scripts/test_selection_matrix.py:80-98`.

Fix: output must be an exact projection of the canonical plan.

Expected result: no unnecessary architecture or implementation surface is generated.

### F-003 — Deferred and current capability states could conflict
Evidence: rule/dependency fixed-point resolution is `scripts/configurator_engine.py:74-92`; current closure now removes any overlapping deferred state at `scripts/configurator_engine.py:93-94`.

Fix: CURRENT deterministically wins over DEFERRED when another selected/derived dependency makes the capability necessary now.

Expected result: no capability can be simultaneously “build now” and “future only.”

### F-004 — Custom requirements could be preserved without a generated work surface
Evidence: custom requirements receive stable IDs and `ARCHITECTURE_REVIEW_REQUIRED` at `scripts/configurator_engine.py:106-110`; they activate a dedicated `custom` module at `scripts/configurator_engine.py:111-113`. The module is declared at `generation/module-manifests.json:379-386`.

Fix: `+新增其他需求` can no longer disappear into notes. It creates an explicit review extension while still refusing to guess technology.

Expected result: custom requirements are retained, visible, actionable and fail-safe.

### F-005 — Blueprint completeness needed positive and negative applicability proof
Evidence: applicability is deterministic at `scripts/foundry_generate.py:38-41`; all controlled sections are emitted ACTIVE or NOT_APPLICABLE at `scripts/foundry_generate.py:140-211`. Staging requires exactly 73 blueprint documents at `scripts/foundry_generate.py:226`.

Fix: no blueprint section is silently omitted.

Expected result: absence means verified N/A, not forgotten work.

### F-006 — Generated output needed content integrity
Evidence: per-file SHA-256 artifact inventory is built at `scripts/foundry_generate.py:232-236` and written before atomic commit at `scripts/foundry_generate.py:277`.

Expected result: generated project artifacts are tamper/drift detectable.

## Multi-angle reverse validation

### ALL-NO golden
Evidence: `tests/fixtures/selection/all_no.json:3-24` locks the 18 Foundry baseline capabilities and core-only module result.

Expected result: choosing no optional product capability does not remove production engineering baseline and does not generate feature modules.

### ALL-YES golden
Evidence: `tests/fixtures/selection/all_yes.json:3-251` locks all 247 current capabilities; `tests/fixtures/selection/all_yes.json:252-297` locks all 44 standard selectable modules. The all-YES assertion is implemented in `scripts/test_selection_matrix.py:127-132`.

Expected result: every defined standard capability and standard LEGO module is reachable; all 73 blueprint sections become ACTIVE.

### Every question individually
Evidence: `scripts/test_selection_matrix.py:133-139` independently activates every one of the 209 questions with minimum prerequisites and verifies its declared required/deferred effect.

Expected result: no dead or miswired question.

### Exhaustive pairwise interactions
Evidence: `scripts/test_selection_matrix.py:150-160` traverses every pair of 209 questions. Current release result: 21,730 compatible pairs pass and 6 contradictory pairs fail closed, totaling all 21,736 pairs.

Expected result: two-feature interactions cannot silently change module projection or violate plan invariants.

### Explicit conflict rules
Evidence: every conflict rule is intentionally constructed and required to fail with the canonical conflict code at `scripts/test_selection_matrix.py:161-169`.

Expected result: contradictions are rejected rather than patched around.

### Randomized higher-order combinations
Evidence: 1,000 deterministic randomized configurations are generated at `scripts/test_selection_matrix.py:143-157`, including repeat compilation with reversed answer ordering to prove deterministic output.

Expected result: higher-order interaction defects have an additional property-based detection layer.

### Exact generation / no leakage
Evidence: ALL-NO and ALL-YES are physically generated and verified at `scripts/test_selection_matrix.py:158-163`; every module is proven reachable and physically generated at `scripts/test_selection_matrix.py:164-183`.

Expected result: plan correctness and filesystem/document correctness agree bidirectionally.

### Browser/API path
Evidence: real local HTTP server startup, token retrieval, POST `/api/generate`, and generated module/artifact assertions are implemented in `scripts/test_configurator_http_e2e.py:10-35`.

Expected result: the real “勾選 -> 送出 -> 生成” transport path works, not only direct Python calls.

## Static inventory closure
Evidence: module obligations must exactly equal generation modules at `scripts/validate_artifact_generation.py:8-13`; every capability must be present in its module activation map at `scripts/validate_artifact_generation.py:14-22`; all 73 templates must be covered by the blueprint map at `scripts/validate_artifact_generation.py:23-27`; all 209 questions must have exactly one question rule at `scripts/validate_artifact_generation.py:28-30`.

## Release commands

```bash
python scripts/validate_versions.py
python scripts/validate_foundry.py
python scripts/validate_semantics.py
python scripts/validate_configurator.py
python scripts/validate_artifact_generation.py
python scripts/validate_contract_fixtures.py
python scripts/run_adversarial_contract_tests.py
python scripts/test_bootstrap_e2e.py
python scripts/test_configurator_e2e.py
python scripts/test_configurator_http_e2e.py
python scripts/test_selection_matrix.py
python -m unittest discover -s tests -v
python scripts/validate_manifest.py
python scripts/validate_doc_numbers.py
```

Or:

```bash
make verify
```

Expected result: every step PASS; any failure blocks release.
