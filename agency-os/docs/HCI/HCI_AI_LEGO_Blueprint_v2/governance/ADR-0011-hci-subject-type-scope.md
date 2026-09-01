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
