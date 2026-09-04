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

## Implementation note (2026-09-05, partially landed)

Recorded here rather than by editing the numbered gates above, which remain
the historical decision record.

- **Gate 1 (data-model artifact) was already satisfied**, and had been since
  the original Wave 1 HD-03/04/05 slice landed (2026-09-02) — before this
  ADR was itself filed as a separate document. `hci.tenant_authorizations`,
  `hci.subject_lawful_basis_records`, and `hci.source_terms_records`
  (`migrations/0001_wave1_synthetic_up.sql:85-88`) are three separately
  named tables with distinct field shapes, exactly the non-substitutable
  three-record model this ADR requires — not discovered until a 2026-09-05
  VBC check, the same class of finding as `ADR-0011`'s.
- **Gate 3's `CONSENT-NEG-01`** (a bare `consent` payload is rejected) is
  satisfied at the request-validation layer, not SQL — there is no
  `consent` table to insert into; the invariant is about rejecting a
  malformed API request shape before it reaches SQL. Proven by
  `tests/unit/contracts/validate-request.test.mjs`'s `'rejects bare
  consent'` case, run in the same suite as the SQL tests by
  `scripts/test-wave1-local.ps1`.
- **`hci.subject_lawful_basis_records` and `hci.source_terms_records`
  themselves had zero fixtures or tests until 2026-09-05** — the same
  situation `hci.sources` was in before `ADR-0026`'s pass gave it coverage.
  `CONSENT-RLS-01`/`CONSENT-RLS-02` now prove both tables are real,
  populated, and tenant-isolated (real-Docker-verified, part of the
  104/104-assertion, 39/39-mutation Wave 1 suite — see
  `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`).
- **`CONSENT-NEG-02`/`CONSENT-NEG-03`** (proving an application flow cannot
  treat tenant authorization or source terms *as* data-subject consent) are
  **not implemented**. Proving that requires an actual claim-admission
  workflow to exercise — none exists yet at Wave 1 schema stage. Left
  `OPEN`, the same disposition as `ADR-0005` gate 2 and `ADR-0026` gate 3,
  not faked against a workflow that does not exist.
- **Gate 2** (the lawful-basis policy identifying when a consent record is
  required/prohibited/replaced) remains satisfied at the design-artifact
  level only (`wave1/HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY.md`, already
  marked "DESIGN ARTIFACT COMPLETE") — its runtime enforcement is the same
  not-yet-existing application layer `CONSENT-NEG-02/03` are blocked on.

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
