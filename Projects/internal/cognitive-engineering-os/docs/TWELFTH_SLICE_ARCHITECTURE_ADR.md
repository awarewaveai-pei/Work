# Twelfth Method Atlas slice: `architecture.adr` -- the first structured-document shape, and the first field sourced from real practice rather than Atlas

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema. First slice from the `architecture` family, one member tool of Atlas's own F18 "Software Architecture Pack".

Context: same TASKS.md item as the previous eleven slices. Chosen because Architecture Decision Records already govern this repository's own real operations (`docs/architecture/decisions/ADR_INDEX.md`) -- a rare chance to ground a Method Atlas slice in genuine, already-in-use practice rather than a purely synthetic Atlas exercise, and because Atlas gives this method an unusually complete, doubly-cited 11-section template.

## Building one tool from a pack, not the pack

Atlas's own F18 is explicitly a 10-tool table (C4, DDD, Event Storming, ADR, ATAM, Quality Attribute Scenario, Architecture Fitness Functions, Strangler Fig, Architecture Trade-off Matrix, Dependency Mapping) sharing one long recommended chain. This session's own TASKS.md already flagged packs (F18/F19/F20) as "a different scale than a single method, to be evaluated separately" -- a caution that could have blocked this slice entirely if misread as "don't touch pack families." It doesn't: ADR has its own individually-addressable protocol, cited TWICE independently of the pack framing -- §11.37's own dedicated section (a full 11-section template) and F18's own table row (a compact 7-stage summary that agrees with the fuller template on substance). Building exactly this one member tool, not the pack's full chain, is the same scoping discipline every prior slice already applied to its own `recommended_next` (no slice has ever built an entire chain end-to-end in one sitting).

## The first field sourced from real practice, disclosed as such

Every prior slice's fields trace to an Atlas citation, sometimes cited, sometimes structurally-necessary-but-not-literally-named, sometimes inferred -- but always grounded in the mother document. This slice's `status` field (proposed/accepted/superseded/deprecated) breaks that pattern for the first time: Atlas's own §11.37 template names no such field. It was added anyway because a status-less ADR record cannot answer real ADR practice's most basic question ("is this decision still in force?") -- the same question this repository's own `ADR_INDEX.md` already answers for every real decision it tracks. Rather than quietly presenting this as if Atlas specified it, the method contract's own `compilation_decisions` names it explicitly as the first field in this session's history justified by real operating practice rather than a mother-document citation.

## A document template, not a computation -- the first typed object of this shape

Every prior slice was either genuine compute (Pareto, AHP, MCDA, Monte Carlo), a forbidden-authority-guarded checklist (Red Team, extended by MCDA/Monte Carlo's own certainty-claim guards), a graph, a monitoring rule, or a classification. This is the first structured DOCUMENT: eleven free-text sections following a fixed order, no algorithm, no graph, no forbidden claim to guard against (Atlas's own §22.3 table simply has no ADR row). The CLI (`run_adr_slice.py`) is correspondingly the simplest this session has built: no compute layer to hand-verify, no attack-and-confirm step, just a real-shaped record (the same class of decision this repository's own real ADR-008 already made: native fulfillment vs. a WooCommerce plugin) validated end to end.

## A real encoding scare that turned out not to be a bug

The CLI's first run printed visibly garbled Chinese text in the terminal. Rather than assuming the data was corrupted, the actual bytes were checked directly -- both the source `.py` file and the runtime-generated JSON result file, read as raw bytes rather than trusted through a `print()` round-trip. Both contained correct, valid UTF-8 (`\xe8\xa8\x82\xe5\x96\xae...` = 訂單...). Re-running with `PYTHONIOENCODING=utf-8` forced produced clean terminal output, confirming the corruption was a Windows console codepage display artifact in this session's own terminal, not a data-integrity bug in this codebase -- the exact "verify via raw bytes, not a lossy terminal round-trip" discipline this repository's own CJK-encoding-trap lessons already teach, applied here in real time rather than assumed away.

## What was built

* `methods/contracts/architecture.adr.contract.yaml` -- new, Atlas §11.37 + F18's own table row, two independent citations. Registered as `contract-backlog.yaml`'s tenth `tier_1` concrete entry.
* `specs/cognitive/typed-objects/architecture-decision-record.schema.yaml` + golden fixtures (spec-root suite 2615 -> 2625). Twelve required fields: eleven Atlas-cited template sections plus `status`.
* `ai_lego/modules/architecture/adr.py` -- the simplest builder this session has written: no compute layer, no forbidden-authority guard, just precondition validation (status enum, at least 1 alternative considered) and two gates.
* `ai_lego/apps/cli/run_adr_slice.py` -- a real-shaped ADR, all eleven template sections filled with genuine content.
* `tests/unit/test_adr.py` -- 10 tests, all passing on the first run.

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py` (already carried `DECISION` in its valid-epistemic-type set -- the second typed object this session uses a previously-reserved-but-unused epistemic_type for, after Monte Carlo's own first use of `SIMULATED_RESULT`).

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `PYTHONIOENCODING=utf-8 python -m ai_lego.apps.cli.run_adr_slice` | `PASS architecture.adr: title='POD 訂單履約走 native 架構，不走 WooCommerce 外掛', status=accepted, alternatives_considered=2, gates [provenance_required=PASS, alternatives_considered_required=PASS]` (passed on the first real run; raw-byte inspection confirmed correct UTF-8 on disk before the encoding investigation above) |
| Unit tests | `python -m unittest tests.unit.test_adr -v` | 10 passed, first run, no fixes needed |
| Spec-root golden suite | `python3 tests/gen_spec_index.py && python3 tests/run_golden_tests.py` | 2625 passed, ALL GOLDEN TESTS PASSED (2615 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

## Honest limits (not silently completed, not hidden)

* **`alternatives_considered` is an array of free-text strings**, not a richer `{alternative, reason_rejected}` shape -- Atlas's own template gives this section zero internal structure (`OQ-ADR-1`).
* **`recommended_next` is empty** -- F18's own chain places ADR between a Threat Model step and a Rehearsal step, neither of which has a machine_id anywhere in this spec root (`OQ-ADR-2`).
* **`method-inventory.yaml` carries no row at all for ADR**, not even an "uncataloged" one -- a bigger registry gap than any prior slice's own source method had (`OQ-ADR-3`).
* **No `superseded_by` cross-reference or transition guard** on the `status` field -- a bare enum is the complete, honest v1.
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough, no AI model/capability call.

## What this measures, honestly

The first proof this session's rigor extends past computation and checklist-style methods to a plain structured document, without loosening standards -- the field-sourced-from-real-practice disclosure and the raw-byte encoding verification are both examples of applying the same "don't assume, check" discipline to a category of slice (a document template) that might otherwise feel too simple to need it.
