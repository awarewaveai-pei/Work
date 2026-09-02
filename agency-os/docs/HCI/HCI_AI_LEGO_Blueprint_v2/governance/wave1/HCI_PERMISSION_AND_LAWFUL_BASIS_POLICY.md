# HCI Permission and Lawful-Basis Policy

Status: **DESIGN ARTIFACT COMPLETE — legal determination and runtime enforcement remain OPEN**
Date: 2026-09-01
Authority: ADR-0010 (`HD-02=C`)
Scope: A fail-closed product policy. It does not determine a jurisdiction-specific legal basis, controller role, or market availability.

## Non-negotiable separation

HCI must represent the following independently; a record in one class never supplies a value for another class.

| Record class | Answers | Minimum evidence | Cannot be used to assert |
|---|---|---|---|
| Tenant authorization | Is the tenant authorized to open/continue this Case/Engagement? | Tenant, actor, purpose, scope, time, recorded authorization source | Data-subject consent or source permission |
| Data-subject consent / lawful-basis assessment | What documented basis permits this processing in its jurisdiction and purpose? | Subject, jurisdiction/use-case, basis type, evidence/reference, reviewer, effective period, decision state | Tenant authorization or source terms |
| Source terms-of-use | What does this source permit or restrict for collection/use? | Source identity/version, terms reference, permitted purpose, restriction, review time | Data-subject consent or legal basis |

`Consent` is not a standalone entity, API field, display label, or authorization shortcut. A UI must name the class it displays.

## Fail-closed operating rules

1. A Case/Engagement cannot enter an HCI research workflow without a recorded tenant authorization.
2. A source cannot be collected or reused without a source-terms record whose restriction is compatible with the requested purpose.
3. A system must not display or transmit "consent obtained" unless the data-subject record itself contains supporting evidence and an explicitly approved decision state.
4. An absent or unreviewed lawful-basis record is `UNASSESSED`, not consent, permission, or approval.
5. No real-person processing is permitted merely because this document or ADR exists. ADR-0014 resolves HD-03 at decision level, but its runtime gate plus HD-20 and HD-21 remain separate blockers.

## Explicitly deferred legal decisions

- **HD-20** determines the markets/use cases and must precede any jurisdiction-specific applicability statement.
- **HD-21** determines controller/processor roles and must precede customer DPA language.
- **ADR-0014 / HD-03=A** requires a data-subject rights workflow and cannot be substituted by tenant DSAR procedures; its synthetic runtime test gate is verified and mutation-checked (2026-09-02); the real-data admission gate remains closed pending HD-07/20/21.

Until those are resolved, this policy defines product behavior only: record uncertainty, fail closed for real-person processing, and escalate for human/legal review. It makes no legal conclusion or compliance certification.

## Implementation contract

The Wave 1 schema/API must use separate, explicit names (for example `tenant_authorization`, `subject_lawful_basis_record`, and `source_terms_record`) and must not accept a generic `consent` payload. The enforcement and test requirements are in `HCI_WAVE1_DOMAIN_ERD.md` and `HCI_WAVE1_NEGATIVE_TEST_SPEC.md`.

## Runtime-verification gate

`CONSENT-NEG-01` through `CONSENT-NEG-04` in `HCI_WAVE1_NEGATIVE_TEST_SPEC.md` must pass before any workflow that handles non-synthetic HCI subject data is enabled.

## Evidence

- `../ADR-0010-consent-entity-scope.md` — approved three-record decision.
- `../../07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` — HCI ownership and consent boundary.
- `../../11_SECURITY_PRIVACY_GOVERNANCE.md` — pending regulatory, role, and privacy-operations boundaries.
