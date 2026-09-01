# HCI Wave 1 Subject and Permission ERD Addendum

Status: **DESIGN ARTIFACT COMPLETE — synthetic local schema skeleton created; Docker REALTEST open**
Date: 2026-09-01
Authority: ADR-0010 (`HD-02=C`), ADR-0011 (`HD-00=C`), ADR-0014 (`HD-03=A`), ADR-0015 (`HD-04=A`), and ADR-0016 (`HD-05=A`)
Scope: The minimum table/constraint matrix needed for the approved subject and permission decisions. It is not a migration, DDL, or final complete HCI ERD.

## Subject compatibility matrix

V1 functional assessment is Person-only. Existing Person provenance remains the active subject reference; the two added subject fields are forward-compatible stubs.

| Domain record | Active V1 subject behavior | Required forward-compatible fields | V1 constraint requirement |
|---|---|---|---|
| Evidence | `person_id` identifies the assessed Person | nullable `subject_type` default `PERSON`; nullable `subject_id` | reject any non-`PERSON` assessment semantics; if `subject_id` is populated, it must agree with the Person reference |
| Claim | Person-scoped claim | same two fields | same Person-only rule |
| Assessment | Person-scoped assessment | same two fields | same Person-only rule |
| TrustDomain | Person-scoped trust context | same two fields | same Person-only rule |

The later addition of `ORGANIZATION` requires a superseding ADR plus its own Evidence, Assessment, TrustDomain, RLS, retention, and negative-test design. A nullable column is not an approved polymorphic subject model.

## Permission-model relationships

```text
HCI Tenant ──< TenantAuthorization >── Case/Engagement (when HD-10 is resolved)
Person ──< SubjectLawfulBasisRecord
Source ──< SourceTermsRecord

Evidence / Claim / Assessment / TrustDomain
  └── Person subject reference + reserved subject_type / subject_id stub
```

`Case/Engagement` is deliberately conditional because HD-10 remains unresolved. ADR-0010 does not approve a Case aggregate; the authorization record must be associated with the approved workflow aggregate when that decision is made.

## Required constraint semantics

The eventual migration must implement these as DB constraints, policy-engine rules, or both, then prove them with executable tests:

1. Default newly written V1 subject records to `PERSON`; reject `ORGANIZATION` and any unknown subject type.
2. Preserve the existing Person reference as the authoritative V1 subject linkage; a populated compatibility `subject_id` must not disagree with it.
3. Reject a generic `consent` field/entity/API payload. Accept only the three explicitly named record classes in the policy.
4. Require a tenant authorization reference before a research workflow can begin, while leaving its final aggregate relationship conditional on HD-10.
5. Do not treat a source-terms record or tenant authorization as a subject lawful-basis record.

## Out of scope

- Production PostgreSQL migration, data backfill, RLS deployment, portal integration, or application API.
- Choice of jurisdiction-specific lawful basis, controller role, bitemporal scope, or erasure mechanism; those decisions remain under HD-06/07/20/21.

## Runtime-verification gate

The executable coverage is defined by `HCI_WAVE1_NEGATIVE_TEST_SPEC.md` and the isolated synthetic-only runner at `D:\Work\Projects\internal\hci30\`. Docker-backed execution evidence is still required before any runtime gate may close.

## Evidence

- `../../07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` — existing Person-keyed provenance and domain boundaries.
- `../ADR-0010-consent-entity-scope.md` and `../ADR-0011-hci-subject-type-scope.md` — approved decisions.
