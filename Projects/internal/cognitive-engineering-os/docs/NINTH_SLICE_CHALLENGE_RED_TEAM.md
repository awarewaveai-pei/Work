# Ninth Method Atlas slice: `challenge.red_team` -- a sixth structural shape, an explicit authority rule enforced

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema. First slice from the `challenge` family (F12), built with the due-diligence lesson from the eighth slice's own correction applied proactively.

Context: same TASKS.md item as the previous eight slices. Chosen specifically because Atlas §11.23 gives this method the single most consequential governance sentence found in any Tier 1 contract this session built: an explicit, machine-checkable authority-limiting rule, not just a checklist.

## Due diligence applied proactively, not after the fact

The eighth slice's own correction (see `docs/EIGHTH_SLICE_LEARNING_REVERSAL_CRITERIA.md`) established a corrected invariant: grep the full spec root for the underlying CONCEPT, not just this session's own chosen names, before minting a new schema. Applied here before writing a single line: grepped `specs/**`/`methods/**` for "red team"/"redteam"/"challenge artifact" and every schema title for "challenge"/"critique"/"finding"/"dissent". Three files mention Red Team by name (`rigor-level.schema.yaml`'s board-grade dimension list, `gate.schema.yaml`'s `high_risk` catalog `red_team` gate id, `change-plan.schema.yaml`'s review-method enum) -- all three reference it as an opaque checklist item/gate/method name, none defines what a Red Team finding or challenge artifact actually contains. No duplicate found. As a bonus, `docs/architecture/REPOSITORY_ARCHITECTURE.md`'s own proposed `/cognitive/methods/{...}` directory list (L148-149) explicitly names `challenge` (alongside `root_cause`, `strategy`, `causal`, `decision`, `learning` -- every family this session has now built) as an anticipated Method Atlas family, independently confirming this session's family-naming choices align with the repository's own accepted architecture.

## The strongest structural enforcement in this directory

Atlas §11.23's own rule (L1735, verbatim): "Red Team 沒有 final authority，只能輸出 challenge artifact" (Red Team has no final authority; it may only output a challenge artifact). Every other typed-object schema this session built permits additional properties by omission. `red-team-challenge.schema.yaml` is the first to set `additionalProperties: false` -- at both the top level AND per-finding -- specifically because this is the first method whose mother-document text gives an explicit rule about what its output may never represent (a verdict, an approval, a final decision) that a permissive schema would silently allow a caller to smuggle in.

Enforced twice, same belt-and-suspenders discipline every prior slice established: `ai_lego/modules/challenge/red_team.py::assert_no_authority_claim` refuses to construct a record carrying any of a representative blocklist of authority-shaped keys (`approved`, `verdict`, `final_decision`, `authorized`, `decision`, `outcome`) BEFORE the schema ever sees it, and the schema's own `additionalProperties: false` independently refuses a hand-crafted bypass that skips the builder entirely. `ai_lego/apps/cli/run_red_team_slice.py` proves both layers fire for real: it deliberately tampers a copy of a valid record with an `approved: true` key and confirms BOTH the runtime guard and schema validation independently reject it, raising loudly if either layer fails to fire.

## A real toolchain bug caught before it could land

The schema's first draft used a YAML anchor/alias (`&dimension_enum`/`<<: *dimension_enum`) to avoid repeating the 11-value dimension enum twice. `python -c` validation with plain `yaml.safe_load` accepted it fine -- but the spec root's own golden-test runner (`tests/run_golden_tests.py`) uses a stricter YAML loader that does not register a constructor for the merge-key tag, and failed with a real parse error the very first time the actual toolchain ran it. Fixed by writing the enum out literally twice, with a comment explaining why (not silently reverted without explanation). Left in this doc as an honest example of the difference between "my own quick validation script accepted it" and "the real toolchain accepted it" -- exactly the class of gap this codebase's own R0 discipline insists on catching via real execution, not a hand-rolled proxy check.

## What was built

* `methods/contracts/challenge.red_team.contract.yaml` -- new, Atlas §11.23 (L1715-1736) verbatim citation of the 11-item checklist and the authority rule. Registered as `contract-backlog.yaml`'s seventh `tier_1` concrete entry.
* `specs/cognitive/typed-objects/red-team-challenge.schema.yaml` + golden fixtures (spec-root suite 2579 -> 2590).
* `ai_lego/modules/challenge/red_team.py` -- builders, the cross-field dimension-consistency check (a finding's dimension must be one the run actually examined), the authority guard, and three gates.
* `ai_lego/apps/cli/run_red_team_slice.py` -- an end-to-end runnable slice that also actively attempts and confirms the authority-smuggling attack is refused at both layers.
* `tests/unit/test_red_team.py` -- 16 tests: schema conformance (including a legal zero-findings "clean pass" case), the dimension-consistency cross-check, and the two-layer authority-claim proof. Caught and fixed a genuine test-design bug of its own along the way (a finding's dimension didn't match the run's own `dimensions_examined`, correctly refused by the very cross-check the test was trying to exercise).

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py`.

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `python -m ai_lego.apps.cli.run_red_team_slice` | `PASS challenge.red_team: 2 dimensions examined, 1 finding, gates [...], no_final_authority_verified(runtime=True, schema=True)` (passed on the first real run) |
| Unit tests | `python -m unittest tests.unit.test_red_team -v` | 16 passed (after fixing one test-design bug) |
| Spec-root golden suite | `python3 tests/run_golden_tests.py` (from the spec root) | 2590 passed, ALL GOLDEN TESTS PASSED (2579 before this slice) -- caught and fixed a real YAML-anchor incompatibility along the way |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

## Honest limits (not silently completed, not hidden)

* **`recommended_next` is empty.** Atlas §11.24 names a real pairing ("Blue Team → Red Team → Independent Judge"), but neither `challenge.blue_team` nor an "Independent Judge" method has a machine_id or contract anywhere in this spec root (`OQ-REDTEAM-1`).
* **`severity` is free text, not a closed enum.** Atlas gives this method no severity scale anywhere -- inventing one would be presenting a guess as a compiled fact.
* **`cognitive_primitives: [CHALLENGE, INFER, EXPLAIN]` is inferred, not cited** (`OQ-REDTEAM-3`), same honesty class as every other Tier 1 contract's inferred primitives.
* **The dimension-consistency cross-check (a finding's dimension must be examined) is a runtime, not schema, invariant** -- JSON Schema 2020-12 cannot natively express "this array item's value must appear in that sibling array" (`OQ-REDTEAMCHALLENGE-1`).
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough, no AI model/capability call.

## What this measures, honestly

The first slice whose mother-document text gives an explicit governance RULE (not just a procedure), and the first proof that this codebase's typed-object schemas can be tightened all the way to `additionalProperties: false` when a real rule calls for it, without that being the default posture applied indiscriminately everywhere. Combined with the proactive due-diligence this slice applied (checking for duplicates BEFORE writing, not after), this is the strongest evidence yet that a lesson learned mid-session actually changed how the rest of the session's work got done, not just a one-time fix.
