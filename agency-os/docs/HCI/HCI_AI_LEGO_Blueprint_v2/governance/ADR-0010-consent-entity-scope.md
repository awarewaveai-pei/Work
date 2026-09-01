# ADR-0010 — Consent Entity Scope

Status: **ACCEPTED**
Date: 2026-09-01
Decision authority: Operator explicit approval — `HD-02=C`
Scope: HCI AI LEGO Blueprint v2 architecture only; this ADR does not establish a legal basis for any real-world processing activity.

## Context

The unqualified word `Consent` could mean three legally and operationally different things: a tenant's authorization to initiate an investigation, a data subject's consent where it is applicable, or permission supplied by a source's terms of use. A single bare field or entity would erase those distinctions and could lead the product to make an unsupported consent claim.

## Decision

Adopt **HD-02 option C**: do not use a bare `Consent` entity. Model and govern three distinct records or fields:

1. **Tenant authorization** — the tenant's authorization to open or continue a Case/Engagement.
2. **Data-subject consent or lawful-basis record** — recorded only when applicable; its legal basis, evidence, jurisdiction, and scope must be explicit.
3. **Source terms-of-use record** — the source-specific permission, restriction, and provenance basis for collection or use.

The three records must not be substituted for one another. In particular, tenant authorization and source terms do not establish data-subject consent.

## Required implementation gates

The design artifacts are now specified in `wave1/HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY.md`, `wave1/HCI_WAVE1_DOMAIN_ERD.md`, and `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`, but runtime implementation gates are **OPEN**. Before Wave 1 schema freeze or any restricted-subject processing, the following must be implemented and reviewed:

1. A consent/authorization/terms data-model artifact with separate names, scopes, lineage, and retention/deletion treatment.
2. A lawful-basis policy identifying when a data-subject consent record is required, prohibited from being inferred, or replaced by another documented lawful basis.
3. Tests or constraints that reject a bare `Consent` record and prevent an application flow from treating tenant authorization or source terms as data-subject consent.

## Consequences

- HCI cannot claim it has a subject's consent unless the dedicated record supports that claim.
- Data-subject rights work remains separately gated by HD-03; this ADR does not defer or replace it.
- All future policy, schema, and API names must preserve the three-way distinction.

## Verification and rollback

- Verification recorded here is documentation-only: the approved option is cross-linked to `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, `governance/ADR_INDEX.md`, and the Wave 1 decision record.
- The required policy, schema constraints, and tests have not been implemented; their gates remain open.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision. After implementation, rollback must be a reviewed data migration that does not relabel historical authorization as consent.

## Evidence

- `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` — HD-02 alternatives and data-model context.
- `D:\Work\agency-os\reports\decisions\2026-09-01-hci-wave-1-decision-tranche.md` — approval tranche and required artifacts.
