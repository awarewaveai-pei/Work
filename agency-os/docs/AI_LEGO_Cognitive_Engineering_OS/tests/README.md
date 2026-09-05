# AI-LEGO Wave 8 Golden Test Suite

Resolves `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md` §3 Build Order:
"Wave 8 tests/ 全目錄（對 Wave 1-7 的每個 schema 寫 golden test）".

Run everything with:

```bash
python3 tests/run_golden_tests.py
```

## What this suite checks

`tests/run_golden_tests.py` runs the check families listed in its own module
docstring (the SSOT for the current set — 2b/2c method+capability contract
conformance and 5 search-content pack were added after this README's
original four):

1. **Schema conformance** — every `tests/contracts/**/*.fixtures.yaml` file
   drives positive (must validate) and negative (must fail validation)
   instance checks against one of the 55 `specs/`/`policies/ai-execution/`
   files that declare a `$schema`.
2. **Recipe instance conformance** — the 3 `recipes/validated/*.recipe.yaml`
   files (data instances, not schemas) validate against
   `specs/cognitive/recipe.schema.yaml`.
3. **Registry invariants** — `methods/registry/method-inventory.yaml` and
   `contract-backlog.yaml` are free-form Phase-0-migrated registries with no
   external governing schema; the runner instead checks the specific
   structural claims those files' own headers make about themselves.
4. **Cross-file `$ref` resolution smoke test** — every `ai-lego://` URI
   used as a real `$ref` value anywhere under `specs/`, `policies/`,
   `methods/registry/`, `recipes/validated/` resolves to a real file and
   (if it carries a `#/...` fragment) a real node within that file.
7. **Typed-object schema `examples:` vs. real gates**
   (`tests/typed_object_example_gates_check.py`) — every example on every
   `specs/cognitive/typed-objects/*.schema.yaml` file is validated against
   its own schema, and, for the schemas whose producing
   `ai_lego/modules/**/*.py` module exposes a matching `evaluate_*_gates`/
   `all_gates_pass` pair, also run through that real gate function — not
   just checked for shape.

## Fixture file contract (for check family 1)

One fixture file per `(schema file, target_ref)` pair. Most schema files
need exactly one; a handful that define more than one named instance shape
(see the target_ref map below) need one fixture file per shape. Path
convention: mirror the schema's path under `tests/contracts/`, replacing
`.schema.yaml`/`.yaml` with `.fixtures.yaml` (add a `.<shape>` infix before
`.fixtures.yaml` when a file needs more than one target — see
`method-resolution`, `status-codes` and `capability-resolution` below for
the three real cases).

```yaml
schema_id: "ai-lego://specs/execution/gate.schema.yaml"
target_ref: "#/gate_result"     # JSON pointer fragment to validate instances against; "" if the schema validates at its own document root (see target_ref map below)
description: >
  One or two sentences: what this fixture is exercising and why (e.g. "the
  NOT_APPLICABLE-requires-rationale constraint, EC §69 L2293").
valid:
  - name: minimal_pass
    instance: {gate_id: "security", status: "PASS"}
  - name: not_applicable_with_rationale
    instance: {gate_id: "security", status: "NOT_APPLICABLE", rationale: "N/A for this task type"}
invalid:
  - name: not_applicable_without_rationale
    instance: {gate_id: "security", status: "NOT_APPLICABLE"}
    reason: "NOT_APPLICABLE requires rationale per EC §69 L2293 constraint"
  - name: bad_status_enum
    instance: {gate_id: "security", status: "MAYBE"}
    reason: "status must be one of PASS/FAIL/BLOCKED/NOT_APPLICABLE"
```

Rules:

- At least 1 `valid` case and at least 1 `invalid` case are required (the
  runner hard-fails a fixture file with either list empty).
- Every `invalid` case needs a `reason` string naming which specific
  constraint the instance breaks (a bare "wrong" is not acceptable — cite
  the field/rule).
- Write REAL adversarial cases that exercise the schema's actual
  constraints (`required`, `enum`, `pattern`, `const`, cross-field rules
  spelled out in the file's own `constraints:` list, and especially any
  `allOf`/`contains`/`minContains`/`maxContains` coverage-guard block —
  those are exactly the shape this session has twice found genuinely
  bypassable, see `authority.yaml`'s MAJ-2 fix and
  `deprecation-pipeline.schema.yaml`'s `uniqueItems`-alone-insufficient
  comment). A fixture whose only invalid case is "empty object" is not
  exercising anything real and will be rejected on review.
- Read the target schema file **in full** before writing its fixture —
  do not guess field names/enums/patterns from the filename or from another
  file's fixture.
- Do not modify any file outside `tests/`.

## target_ref map (precomputed 2026-08-29 — do not re-derive, just use)

Files not listed validate at their own document root (`target_ref: ""`) —
either because `type`/`required`/`properties` sit directly at the file's
root, or because the file already carries a root-level `$ref` into a named
sub-schema (see `specs/execution/risk-tier.schema.yaml`'s
`$ref: "#/risk_tier"` for the canonical example of the latter).

| File | target_ref |
|---|---|
| `specs/artifact/cas-path.schema.yaml` | `#/definitions/cas_path` |
| `specs/cognitive/lens.schema.yaml` | `#/lens` |
| `specs/cognitive/primitive.schema.yaml` | `#/primitive` |
| `specs/execution/blast-radius-chain.schema.yaml` | `#/chain_instance` |
| `specs/execution/data-deletion.schema.yaml` | `#/deletion_request` |
| `specs/execution/deprecation-pipeline.schema.yaml` | `#/deprecation_record` |
| `specs/execution/execution-state-machine.schema.yaml` | `#/state_transition_event` (added 2026-08-30; `audit.schema.yaml`, added the same day, validates at its own document root and is intentionally NOT listed here — see the "Files not listed" note above) |
| `specs/execution/gate.schema.yaml` | `#/gate_result` |
| `specs/execution/method-resolution.schema.yaml` | TWO fixtures needed: `#/method_resolution_request` and `#/method_resolution_result` |
| `specs/execution/capability-resolution.schema.yaml` | THREE fixtures needed: `#/capability_resolution_request`, `#/capability_resolution_result` and `#/plan_executability` (added 2026-09-04, ADR-023 §Consequences 3) |
| `specs/execution/status-codes.schema.yaml` | THREE fixtures needed: `#/reference_vocabulary/legal_side_states/schema`, `#/reference_vocabulary/final_status/schema` and `#/reference_vocabulary/emittable_reason_codes/schema` (the third added 2026-09-04 with the CAPABILITY_RESOLUTION_BLOCKED registration) |
| `specs/jurisdiction/availability.schema.yaml` | `#/capability_availability` |
| `specs/jurisdiction/pack.schema.yaml` | `#/jurisdiction_pack` |
| `specs/security/key-vault-lifecycle.schema.yaml` | pick 2 of `#/definitions/{key_record,key_destruction_record,vault_restore_event,rollback_scenario,hmac_signing_key_policy,key_use}` — at minimum cover `key_record` and `key_destruction_record` (the crypto-shred erasure mechanism this file exists for) |
| `policies/ai-execution/release-policy.yaml` | `#/release_gate_requirement` |

## Governance golden scenarios (`tests/governance/ai-execution/`)

EC §94 (Test Paths) names 12 subdirectories under
`tests/governance/ai-execution/` (document-resolution, state-machine,
authority, risk, gate-injection, rollback, scope, prompt-injection,
secrets, jurisdiction, replay, handoff), and EC §141 (Contract Compliance
Tests) additionally requires a `golden/` subdirectory whose cases verify
state transitions / required documents / gate injection / authority /
rollback / final status / handoff together. No execution runtime exists yet
in this repo (Phase 3 is a spec-only phase) — these cannot be genuine
behavioral/integration tests against a running engine. They are instead
GOLDEN SCENARIO fixtures: worked example instances (conforming to the
already-built `specs/execution/*.schema.yaml` files) that show what a
correct outcome looks like for that governance concern, structurally
validated the same way as check family 1 above. This scope decision and its
honest limitation are recorded in the WORKLOG entry for this Wave, not
silently presented as if a real runtime were being exercised.
