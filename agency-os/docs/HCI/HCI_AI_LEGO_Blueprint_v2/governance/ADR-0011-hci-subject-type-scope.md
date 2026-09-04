# ADR-0011 — HCI Subject-Type Scope

Status: **ACCEPTED**
Date: 2026-09-01
Decision authority: Operator explicit approval — `HD-00=C`
Scope: HCI AI LEGO Blueprint v2 architecture only; this ADR does not authorize Organization assessment or real-person data processing.

## Context

V2's product identity and current evidence model are Person-centric, while Organization appears as a relationship/domain node without independent Evidence, Assessment, or TrustDomain support. Generalizing every workflow now would add scope before a demonstrated need; locking every row permanently to Person would make a later organization subject expensive to introduce.

## Decision

Adopt **HD-00 option C**: V1 assessment functionality remains **Person-only**. The Wave 1 ERD must reserve a forward-compatible, nullable `subject_type` / `subject_id` shape, with `subject_type` defaulting to `PERSON`. It is a compatibility stub, not permission to assess Organizations.

An Organization remains an attribute or relationship node unless and until a future explicit ADR authorizes independent Organization Evidence, Assessment, and TrustDomain behavior.

## Required implementation gates

The design artifacts are now specified in `wave1/HCI_WAVE1_DOMAIN_ERD.md` and `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`, but runtime implementation gates are **OPEN**. Before Wave 1 ERD freeze, the following must be implemented and reviewed:

1. An ERD/table matrix covering Evidence, Claim, Assessment, and TrustDomain that shows the Person-only functional scope and the nullable forward-compatible subject fields.
2. A database-level constraint or equivalent application invariant that defaults `subject_type` to `PERSON` and blocks non-Person assessment semantics in V1.
3. Positive and negative tests proving Person records remain supported while `ORGANIZATION` cannot become an independently assessable subject without a superseding ADR and accompanying schema/policy change.

## Implementation note (2026-09-05, gates verified already satisfied — VBC check, no new code)

Recorded here rather than by editing the numbered gates above, which remain
the historical decision record.

Checked against the current schema before assuming this gate needed new
work (this project's "verify before conclude" discipline): all three gates
were already satisfied by code that landed with the original Wave 1
HD-03/04/05 slice (2026-09-02), before `ADR-0011` itself was even filed as a
separate ADR (2026-09-01) — the gate and its implementation happened to
arrive in the opposite order from usual, which is presumably why `ADR_INDEX.md`
was never updated to reflect it.

1. **ERD/table matrix** — `wave1/HCI_WAVE1_DOMAIN_ERD.md:10-14,28-29,39`
   already states exactly this: Evidence/Claim/Assessment/TrustDomain unified
   under `hci.subject_records`, Person-only V1 scope, nullable forward-
   compatible `subject_type`/`subject_id` stub fields.
2. **DB-level constraint** —
   `migrations/0001_wave1_synthetic_up.sql:118` (`subject_type text NOT NULL
   DEFAULT 'PERSON' CHECK (subject_type = 'PERSON')`) makes any non-`PERSON`
   value structurally impossible to store, not merely rejected by
   application logic.
3. **Positive/negative tests** — `database/tests/wave1-negative-tests.sql`:
   `SUBJECT-NEG-01a/b` (omitted `subject_type` defaults to `PERSON`,
   positive), `SUBJECT-NEG-02` (`subject_type='ORGANIZATION'` rejected,
   `23514`), `SUBJECT-NEG-03` (a compatibility `subject_id` conflicting with
   `person_id` rejected, `23514`) — all three real-Docker-verified as part of
   the full Wave 1 suite (this exact count has already gone stale once here
   before — see `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` for the current
   assertion/mutation totals rather than a number copied into this file, see
   `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`).

`wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`'s own test table additionally lists
`SUBJECT-NEG-04` ("existing Person record read/replayed, compatibility
fields don't alter behavior") — not implemented, and not required to close
this ADR's own gate 3 text (which asks for Person-support-plus-Organization-
rejection evidence, which the three implemented tests already provide, not
for that specific fourth scenario by ID). `SUBJECT-NEG-04` is a DB-only
schema/constraint question with no read-path/replay logic to exercise yet at
Wave 1 (no application layer exists), so it is left unimplemented rather
than built against nothing.

## Consequences

- V1 does not build Organization assessment, requester-role expansion, or Organization-specific trust domains.
- The subject fields are preparation for a later decision, not an assertion that an Organization subject model already exists.
- Existing Person-keyed provenance remains the active behavior until the Wave 1 schema is implemented and verified.

## Verification and rollback

- Verification recorded here is documentation-only: the approved option is cross-linked to `02_PRODUCT_BOUNDARIES.md`, `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, `governance/ADR_INDEX.md`, and the Wave 1 decision record.
- The ERD, constraint, and tests have not been implemented; their gates remain open.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision. After implementation, rollback must preserve existing Person provenance and use a reviewed schema migration.

## Evidence

- `02_PRODUCT_BOUNDARIES.md` and `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` — HD-00 alternatives and current Person-keyed model.
- `D:\Work\agency-os\reports\decisions\2026-09-01-hci-wave-1-decision-tranche.md` — approval tranche and required artifacts.
