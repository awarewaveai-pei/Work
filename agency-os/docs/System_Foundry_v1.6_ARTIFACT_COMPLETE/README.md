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
        -> complete 2-artifact package per selected module
        -> staging validation / no-unselected-module leakage
        -> generated artifact SHA-256 manifest
        -> atomic commit
```

Generator output is technology-neutral until architecture convergence. It generates complete planning/assurance contracts and exact module paths; it does not invent a framework/provider from checkboxes.

## Selection correctness guarantees

`make verify` proves:

- 275/275 questionnaire questions have deterministic YES rules.
- 315/315 standard capabilities are reachable in the ALL-YES configuration.
- 61 standard LEGO modules are produced by ALL-YES; a 62nd `custom` extension module is activated only when the user adds custom requirements.
- ALL-NO produces only the locked `core` module.
- All 275 questions are tested individually.
- All 37,675 question pairs are attempted; compatible pairs compile and explicit contradictory pairs fail closed.
- 1,000 deterministic randomized configurations are tested.
- Every generation module is proven reachable and materialized.
- Every selected module receives 2 mandatory artifacts (`docs/modules/<module>/MODULE_MANIFEST.json` + the executable card `cards/<module>.md`); unselected module paths/documents are absent.
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

Selected modules receive (card = per-capability acceptance from `capabilities/catalog.json`, `TODO` where none is defined; gap count: `python scripts/report_acceptance_gap.py`):

```text
cards/<module>.md           Decision / Files / Acceptance / 突變 / Rollback
docs/modules/<module>/
  MODULE_MANIFEST.json      invariants / security / test / operational / recovery obligations
  BLUEPRINT_ARCHITECTURE.md only when the module has mapped blueprint content
```

Every project also gets a supervisor page (v1.7 V17-3; same format as the AwareWave supervisors, kit copied byte-for-byte from `scripts/supervisor-kit`):

```text
supervisor/data.mjs         STEPS = one per module in dependency layers (from capability requires; a cycle shares a layer), RULES = 18 foundation, OPEN = tech stack + one provider per DER-*-ADAPTER
supervisor/{build,check}.mjs  node supervisor/build.mjs && node supervisor/check.mjs; check fails when foundry-plan.json modules/foundation and data.mjs disagree
supervisor/kit/             shared layout and common gates
```

`PLAN.md` at the project root is the one-page entry: selected modules, the 73-row blueprint applicability table (ACTIVE or NOT_APPLICABLE with the reason) and the delivery registration JSON. Section text is not generated; the templates define each section. v1.7 V17-1 removed `docs/blueprint/` and module docs 00-07, which only restated `MODULE_MANIFEST.json`.

## AwareWave catalog and sample

Run `node ../../../scripts/sync-foundry-catalog.mjs` after changing the product registry; `make verify` checks catalog drift.
`make regenerate-samples` (part of `make verify`) rebuilds `generated/sample-all-no`, `generated/sample-all-yes` and `generated/sample-commerce-os` (from `bootstrap/sample-commerce-intake.json`, new active questions defaulting to NO) from the current questionnaire; the intake fails closed on an unknown or inactive selected question. `PLAN.md` ends in a source-backed delivery registration; missing declarations remain TODO.

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
