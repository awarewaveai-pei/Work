# System Foundry v1.6 ARTIFACT_COMPLETE

System Foundry is a reusable engineering kernel, semantic assurance runtime, binary product configurator, capability compiler, and LEGO artifact generator for new systems and existing-system transformation.

## Start — categorized `要 / 不要`

```bash
python scripts/serve_configurator.py --output-root ./generated
```

Open `http://127.0.0.1:8765`.

The user answers only legitimate product/business choices with `要 / 不要` and may add free-text requirements. Backup, restore verification, security, testing, observability, rollback, evidence, supply-chain integrity and other production baselines are locked Foundry guarantees and are not optional questions.

## What Submit does

```text
Binary answers + custom requirements
        -> immutable answer snapshot
        -> locked production baseline
        -> deterministic question rules
        -> capability dependency fixed-point closure
        -> derived/deferred conflict normalization
        -> exact LEGO module projection
        -> full 73-section blueprint applicability
        -> complete 10-artifact package per selected module
        -> staging validation / no-unselected-module leakage
        -> generated artifact SHA-256 manifest
        -> atomic commit
```

Generator output is technology-neutral until architecture convergence. It generates complete planning/assurance contracts and exact module paths; it does not invent a framework/provider from checkboxes.

## Selection correctness guarantees

`make verify` proves:

- 222/222 questionnaire questions have deterministic YES rules.
- 261/261 standard capabilities are reachable in the ALL-YES configuration.
- 48 standard LEGO modules are produced by ALL-YES; a 49th `custom` extension module is activated only when the user adds custom requirements.
- ALL-NO produces only the locked `core` module.
- All 222 questions are tested individually.
- All 24,531 question pairs are attempted; compatible pairs compile and explicit contradictory pairs fail closed.
- 1,000 deterministic randomized configurations are tested.
- Every generation module is proven reachable and materialized.
- Every selected module receives 10 mandatory artifacts; unselected module paths/documents are absent.
- Every project gets all 73 controlled blueprint sections marked `ACTIVE` or `NOT_APPLICABLE`.
- Generated files are content-hashed in `.foundry/resolution/artifact-manifest.json`.

## Generated project control plane

```text
.foundry/
  foundry-lock.json
  intake/answers.json
  resolution/foundry-plan.json
  resolution/selection-traceability.json
  resolution/artifact-manifest.json
  verification/generation-coverage.json
```

Selected modules receive:

```text
docs/modules/<module>/
  00_REQUIREMENTS.md
  01_ARCHITECTURE.md
  02_CONTRACTS.md
  03_SECURITY.md
  04_DATA_AND_MIGRATION.md
  05_TEST_STRATEGY.md
  06_OBSERVABILITY_AND_SRE.md
  07_ROLLBACK_AND_RECOVERY.md
  08_IMPLEMENTATION_BACKLOG.md
  MODULE_MANIFEST.json
```

The complete controlled blueprint is in `docs/blueprint/`, with the entry point `docs/SYSTEM_BLUEPRINT.md`.

## CLI

```bash
python scripts/foundry_resolve.py input.json --out foundry-plan.json
python scripts/foundry_generate.py --input input.json --out ./generated
```

## Release assurance

```bash
make verify
```

Every command must report PASS. Any semantic, selection, generation, hash, E2E, adversarial or manifest failure blocks Foundry release.
