# Thirteenth Method Atlas slice: `architecture.event_storming` -- a second pack member, a real notation over a bare concept list

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema. Second slice from the `architecture` family, a second member tool of Atlas's own F18 "Software Architecture Pack".

Context: same TASKS.md item as the previous twelve slices. Chosen over its immediate neighbor in the mother document, DDD (Atlas §11.35), specifically because of a grounding comparison: DDD gives six bare concept names with no worked pipeline or shape; Event Storming gives a real causal-flow notation ("Domain Event ← Command ← Actor ← Policy ← External System → Aggregate／Read Model") that directly implies an enforceable structural rule.

## Choosing the better-grounded neighbor, not just the next section

Atlas presents DDD and Event Storming back to back, both in F18. Reading both before choosing (rather than defaulting to document order) surfaced a real difference: DDD's own §11.35 lists Ubiquitous Language / Subdomain / Bounded Context / Context Map / Aggregate / Domain Event as named concepts with zero worked example of how they combine into a record; Event Storming's own §11.36 gives an actual arrow-notation flow. Building DDD first would have meant inventing far more structure with far less textual support. This comparison is disclosed directly in the method contract's own description, not silently decided.

## A notation that implies a real invariant, not just a vocabulary

Reading the arrow notation as a causal-flow legend (a Domain Event is caused by a Command, Actor, Policy, or External System; it leads to an Aggregate or Read Model) directly implies a real, enforceable rule: every `domain_event` element in a session must be traceable to at least one causing relationship. An orphan domain event -- one nothing points to -- contradicts the notation's own reading. This is the same class of discipline `causal.dag`'s own acyclicity check already established for a different notation: read the diagram literally, then enforce exactly what it implies, no more and no less. The CLI proves this for real: it attempts to construct a session with an orphan domain event and confirms the guard fires.

## Splitting a bundled notation element, disclosed as interpretation not invention

Atlas's own notation bundles "Aggregate／Read Model" behind a single right-arrow, using a slash purely as compact space-saving notation. This schema splits them into two distinct element types (`aggregate`, `read_model`) rather than one bundled type, on the strength of standard, well-established real-world Event Storming vocabulary (the same class of external-practice grounding the twelfth slice's own `status` field already used) -- disclosed explicitly as an interpretation of a compact notation, not a literal one-to-one Atlas citation.

## Restraint on what the notation does NOT support

Unlike the orphan-event invariant (directly implied by every reading of the arrows), Atlas gives no exhaustive table of which specific element-type pairs may legally relate to each other (may a Policy point directly to a Read Model? Atlas never says). Rather than inventing a full legality table, only the one invariant the notation unambiguously supports is enforced; relationship type-pair legality is left open, disclosed rather than silently either invented or forgotten.

## What was built

* `methods/contracts/architecture.event_storming.contract.yaml` -- new, Atlas §11.36 + F18's own table row. Registered as `contract-backlog.yaml`'s eleventh `tier_1` concrete entry.
* `specs/cognitive/typed-objects/event-storming-session.schema.yaml` + golden fixtures (spec-root suite 2625 -> 2635) -- a 7-value closed element-type enum, free-form causal-flow edges.
* `ai_lego/modules/architecture/event_storming.py` -- builder enforcing three preconditions (non-empty elements, valid element types, relationships reference real elements) plus the orphan-domain-event invariant, and two gates.
* `ai_lego/apps/cli/run_event_storming_slice.py` -- a real order-cancellation process reconstruction exercising all 7 element types and the full causal chain, plus an attack-and-confirm step proving the orphan invariant is real.
* `tests/unit/test_event_storming.py` -- 10 tests, all passing on the first run.

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py`, `modules/architecture/adr.py` (its own sibling within the same family, confirmed untouched).

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `PYTHONIOENCODING=utf-8 python -m ai_lego.apps.cli.run_event_storming_slice` | `PASS architecture.event_storming: elements=7, relationships=6, gates [provenance_required=PASS, no_orphan_domain_events=PASS], orphan_invariant_verified=True` (passed on the first real run) |
| Unit tests | `python -m unittest tests.unit.test_event_storming -v` | 10 passed, first run, no fixes needed |
| Spec-root golden suite | `python3 tests/gen_spec_index.py && python3 tests/run_golden_tests.py` | 2635 passed, ALL GOLDEN TESTS PASSED (2625 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

## Honest limits (not silently completed, not hidden)

* **Relationship type-pair legality is unconstrained** beyond the single orphan-domain-event invariant -- Atlas gives no exhaustive table of which element kinds may legally relate to which others (`OQ-EVENTSTORMING-1`).
* **`relationships[].label` is free text**, not a closed relationship-type enum -- same restraint as above, applied at the schema layer (`OQ-EVENTSTORMINGSESSION-1`).
* **`recommended_next` is empty** -- Atlas's own F18 chain diagram names Event Storming only in the tool table, not the chain itself.
* **`cognitive_primitives: [DECOMPOSE, MAP, RELATE]` is inferred, not cited.**
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough, no AI model/capability call.

## What this measures, honestly

The first proof this session actively compares grounding quality between neighboring, similarly-scoped Atlas sections before choosing which to build -- not defaulting to document order or novelty, but reading both and disclosing the comparison. Also a second confirmation (after `causal.dag`) that a compact notation, read literally, can ground a real enforceable invariant without needing a fuller prose protocol the way `fishbone`/`five_whys` had.
