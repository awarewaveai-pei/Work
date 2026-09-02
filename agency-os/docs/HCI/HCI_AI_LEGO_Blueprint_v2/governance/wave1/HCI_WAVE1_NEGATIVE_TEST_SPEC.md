# HCI Wave 1 Negative-Test Specification

Status: **EXECUTED AND MUTATION-CHECKED (synthetic scope only)**
Date: 2026-09-01
Authority: ADR-0009, ADR-0010, ADR-0011, ADR-0014, ADR-0015, ADR-0016
Scope: Required acceptance tests before the respective runtime gates can close. Test names are stable identifiers, not passing results.

## Tenant adapter isolation

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| TENANT-ADAPTER-NEG-01 | Two portal organizations with distinct live HCI subscriptions and HCI tenant IDs | Tenant A request attempts to read Tenant B resource through the portal adapter | Denied; no resource metadata or existence signal returned |
| TENANT-ADAPTER-NEG-02 | Tenant A supplies Tenant B's `external_tenant_id` during provision/bind | Adapter validates subscription ownership before binding | Denied; no overwrite or reassignment |
| TENANT-ADAPTER-NEG-03 | Product subscription is `NULL`, canceled, or mismatched product key | Launcher/provisioning path handles absent external tenant | Unprovisioned/denied state; never synthesizes a tenant identity |

## Consent-class separation

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| CONSENT-NEG-01 | API/storage request uses bare `consent` | Generic record is rejected | Validation error; no record persists |
| CONSENT-NEG-02 | Tenant authorization exists but no subject lawful-basis record | UI/workflow attempts to claim subject consent | Claim denied; status remains `UNASSESSED` |
| CONSENT-NEG-03 | Source terms exist but no subject lawful-basis record | Workflow attempts to use source permission as consent | Denied; source terms remain source-scoped only |
| CONSENT-NEG-04 | No tenant authorization | Research workflow starts | Denied before collection/processing |

## Person-only subject boundary

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| SUBJECT-NEG-01 | New Evidence/Claim/Assessment/TrustDomain row omits subject type | V1 default is deterministic | Persisted/validated as `PERSON` with existing Person provenance preserved |
| SUBJECT-NEG-02 | Request supplies `subject_type=ORGANIZATION` | V1 does not expose Organization assessment | Rejected before persistence or assessment |
| SUBJECT-NEG-03 | Request supplies a compatibility `subject_id` that conflicts with `person_id` | Stub cannot bypass Person provenance | Rejected |
| SUBJECT-NEG-04 | Existing Person record is read/replayed | Compatibility fields do not alter V1 behavior | Person-scoped result only; no polymorphic fallback |

## Test execution requirements

1. Run against an HCI database/API using a non-superuser tenant role; service-role or owner-only tests do not prove tenant isolation.
2. Use two deterministic fixtures with distinct tenant IDs and correlation IDs; assert both denial and absence of data leakage.
3. Make all listed tests CI-blocking before non-synthetic HCI subject data is admitted.
4. Record database engine/version, migration revision, policy revision, and fixture hash with each test run.

## Current state

An isolated synthetic-only PostgreSQL 15.8 schema, non-owner test role, request
validator, and runner exist at `D:\Work\Projects\internal\hci30\`.

**Execution evidence (2026-09-02).** `scripts/test-wave1-local.ps1` runs green
against real PostgreSQL 15.8 in Docker: 51 assertions recorded, 0 failed, plus a
down/up reversibility pass over a populated schema.

**Non-vacuity evidence.** A green suite is not by itself evidence that a gate is
closed. `scripts/mutation-check-wave1.ps1` deletes each control in turn and
requires the suite to go red on exactly the assertions covering it; all 15
mutations are killed. This exists because the first version of this suite could
not fail: four assertions caught their own failure signal with the same handler
that caught the control's rejection (both SQLSTATE P0001). That defect was
demonstrated, not merely argued - the original suite exits 0 with the
authorization, DSR-lifecycle, append-only, and identity-confirmation triggers
physically dropped from the schema.

Portal-adapter tests (TENANT-ADAPTER-NEG-01..03) remain excluded from this local
skeleton. Passing these tests is a statement about the synthetic schema only. It
is not evidence of legal compliance, production readiness, or permission to
process a real person.
