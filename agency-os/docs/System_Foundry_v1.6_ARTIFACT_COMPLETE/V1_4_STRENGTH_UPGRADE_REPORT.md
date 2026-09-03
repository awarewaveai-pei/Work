# System Foundry v1.4 Strength Upgrade Report

Status: VERIFIED. This report records the v1.3 audit findings that were converted into executable v1.4 controls.

## 1. Runtime gate drift eliminated
Evidence: `runtime/stage-gates.yaml:1-5` declares v1.4 fail-closed canonical gates; `runtime/orchestration.yaml:1-6` binds the DAG to that gate registry; `runtime/orchestration.yaml:8-30` shows G0/G1/G2/G3 references aligned to the canonical IDs. `scripts/validate_semantics.py:11-29` rejects unknown gate, profile-gate, or status references.

Command: `python scripts/validate_semantics.py`
Expected result: `SEMANTIC VALIDATION: PASS`.
Rollback: restore the prior runtime files and manifest together; partial rollback is forbidden because it would reintroduce cross-reference drift.

## 2. Complete subagent inheritance is content-addressed
Evidence: `runtime/agent-roles.yaml:3-8` references the canonical kernel registry and pins its digest. `registries/kernel.yaml:4-58` enumerates every kernel file with SHA-256 and a combined kernel digest. `scripts/validate_semantics.py:34-50` recomputes hashes/digest and checks agent-contract version alignment.

Command: `python scripts/validate_semantics.py`
Expected result: kernel inheritance and digest validation pass; any changed/missing kernel file fails closed.

## 3. Evidence is revision- and content-addressed
Evidence: `schemas/evidence-finding.schema.json:30-38` requires repository revision metadata; `schemas/evidence-finding.schema.json:49-77` requires exact line range, blob SHA-256, selected-content SHA-256 and proof statement. `scripts/semantic.py:41-64` rejects path traversal, reverse ranges, missing files, stale blob hashes and stale selected-content hashes.

Command: `python -m unittest discover -s tests -v`
Expected result: `test_content_addressed_evidence` passes and invalid evidence is rejected by the adversarial suite.

## 4. Risk and authority cannot be self-declared downward
Evidence: `schemas/risk-classification.schema.json:8-9` makes dimensions and computed tier mandatory; `scripts/semantic.py:17-27` computes risk as the maximum canonical dimension and rejects contradictory tiers. `schemas/authority-grant.schema.json:7-16` requires risk, required authority, granted authority and approval evidence; `scripts/semantic.py:29-39` derives the minimum authority and rejects insufficient grants.

Command: `python scripts/run_adversarial_contract_tests.py`
Expected result: `ADVERSARIAL CONTRACT TESTS: PASS`, meaning deliberate risk/authority downgrade attempts were rejected.

## 5. Human high-impact actions fail closed
Evidence: `schemas/human-action-control.schema.json:60-105` requires CRITICAL actions to use A4, confirmation, dual control and audit; IRREVERSIBLE actions require confirmation and audit. `scripts/semantic.py:66-72` enforces the same rule semantically.

Command: `python scripts/validate_contract_fixtures.py && python scripts/run_adversarial_contract_tests.py`
Expected result: both PASS and bypass fixtures fail validation.

## 6. Exceptions cannot become permanent patches
Evidence: `schemas/exception.schema.json:7-22` requires start/expiry, compensating controls, monitoring, evidence, removal task, permanent target fix and rollback. `scripts/semantic.py:74-80` rejects missing controls, non-waivable rules and invalid expiry order.

Command: `python scripts/run_adversarial_contract_tests.py`
Expected result: non-waivable exception attempts are rejected.

## 7. Lifecycle retirement requires proof
Evidence: `schemas/lifecycle-record.schema.json:99-149` applies state-dependent evidence; RETIRED requires consumer evidence, migration, communication, removal criteria, retention decision and rollback. `scripts/semantic.py:82-90` enforces the same semantic requirements.

Command: `python scripts/validate_contract_fixtures.py && python scripts/run_adversarial_contract_tests.py`
Expected result: retirement without evidence fails.

## 8. Release is an evidence-backed state transition
Evidence: `schemas/release-evidence.schema.json:7-22` requires source/artifact identity, tests, rollback thresholds, observability, deployment strategy, SBOM/provenance and post-release checks. `schemas/release-evidence.schema.json:117-153` requires at least one approval for R3/R4 and two for R4. `scripts/semantic.py:92-98` adds semantic completeness and approval enforcement.

Command: `python scripts/validate_contract_fixtures.py && python scripts/run_adversarial_contract_tests.py`
Expected result: R4 release without required approvals is rejected.

## 9. Machine-readable engineering reviews expanded
Evidence: the package now includes `schemas/database-architecture.schema.json`, `schemas/security-review.schema.json`, `schemas/sre-plan.schema.json`, `schemas/observability-plan.schema.json`, `schemas/migration-plan.schema.json`, `schemas/restore-evidence.schema.json`, `schemas/test-strategy.schema.json`, `schemas/source-of-truth-map.schema.json`, and `schemas/dependency-map.schema.json`. These files are included and hash-locked by `manifest.json` and parsed by the Foundry validation suite.

Command: `python scripts/validate_foundry.py`
Expected result: all JSON contracts parse as Draft 2020-12 and mandatory machine contracts exist.

## 10. Project control plane can evolve for 30 years
Evidence: `bootstrap/PROJECT_SYSTEM_OF_RECORD_STANDARD.md:3-24` defines `.foundry/`, `foundry-lock.json`, `control-plane-version.json`, `artifact-index.json`, migration history, handoffs and verification. Schema version changes are fail-closed until an explicit migration record exists.

Command: `python scripts/test_bootstrap_e2e.py`
Expected result: `BOOTSTRAP E2E: PASS` and the generated project contains the versioned control plane.

## 11. Repository bootstrap is executable, not prose-only
Evidence: `scripts/foundry_new.py:7-18` validates the project name, refuses an existing target, and creates bounded repository/control-plane directories. `scripts/foundry_new.py:20-30` pins Foundry/kernel identity and creates project control-plane artifacts. `scripts/test_bootstrap_e2e.py` verifies the generated repository.

Command: `python scripts/foundry_new.py demo-system --out /tmp --profile standard --archetype web_application`
Expected result: `/tmp/demo-system` is created with source/test/infra/docs and `.foundry/` control-plane structure; an existing target is refused.
Rollback: delete only the newly created target directory before any external side effect.

## 12. False-green CI path removed
Evidence: `tests/test_validate_foundry.py:11-59` contains real `unittest.TestCase` methods covering validator, manifest, semantics, adversarial tests, contract fixtures, bootstrap E2E, deterministic risk, content-addressed evidence, DAG references, kernel inheritance and version drift. `.github/workflows/foundry-validation.yml:15-30` runs version, semantic, core, contract fixture, adversarial, bootstrap, unit-test and manifest/hash gates.

Command: `python -m unittest discover -s tests -v`
Expected result: 12 tests execute; zero-test discovery is not accepted as PASS.

## 13. Foundry self-integrity is hash-locked
Evidence: `scripts/validate_manifest.py:7-19` compares actual package inventory to the manifest and verifies SHA-256 for every non-manifest file. `.github/workflows/foundry-validation.yml:11-12` pins CI actions by full commit SHA instead of mutable major tags.

Command: `python scripts/validate_manifest.py`
Expected result: `MANIFEST VALIDATION: PASS`; any unregistered, missing or modified file fails.

## Final acceptance command

```bash
make verify
```

Expected results, all mandatory:
- `VERSION VALIDATION: PASS`
- `FOUNDRY VALIDATION: PASS`
- `SEMANTIC VALIDATION: PASS`
- `CONTRACT FIXTURE VALIDATION: PASS`
- `ADVERSARIAL CONTRACT TESTS: PASS`
- `BOOTSTRAP E2E: PASS`
- 12 unit tests executed, `OK`
- `MANIFEST VALIDATION: PASS`

Any failure blocks release of the Foundry package.
