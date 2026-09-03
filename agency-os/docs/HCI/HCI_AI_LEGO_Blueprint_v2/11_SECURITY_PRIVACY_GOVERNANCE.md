# 11 — Security, Privacy & Governance

## Security model

Use defense in depth:

```text
Edge
↓
Identity
↓
API Gateway
↓
Policy Engine
↓
Tenant Context
↓
Application Authorization
↓
Database RLS
↓
Encryption
↓
Audit
```

## Authentication

MFA, short-lived sessions, strong service-account separation, enterprise SSO, SCIM where applicable.

## Authorization

RBAC, ABAC, least privilege, need-to-know, just-in-time admin access.

## Admin principle

Administrative authority does not automatically imply content access.

**Changed in V2 — this is now a technical control, not only a stated principle**: on the verified single-box infrastructure baseline, direct Postgres/superuser access bypasses RLS and the application layer entirely — a live, present-tense gap given the currently solo-operator-plus-AI-agents operating reality, not a future-hire hypothetical. Mandatory query-level audit logging (e.g. `pgaudit` or equivalent) for any DB session not originating from the application's service role, with alerting on RESTRICTED-table reads outside normal app patterns, is required from Wave 2 (reusing the audit schema already planned there — see `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md` Wave 2). A minimal `BREAK_GLASS_ACCESS.md` (time-bound elevation + mandatory justification + audit event) is pulled forward to Wave 2 as well — the full enterprise break-glass tooling stays at its original P1 position (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P1-07), but a *minimal* version cannot wait that long, since RESTRICTED data exists from Phase 2 onward. Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-07, `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-04.

> ✅ **RESOLVED (`HD-15`, 2026-09-02) — ADR-0025**: the standing-credential pattern does NOT extend to the HCI production instance. Synthetic/dev HCI stays fully open to agents. No agent holds a standing credential to HCI production DB, host, or key material. The only path is the Wave 2 break-glass procedure, extended to distinguish `actor_class=agent` from `human`. Reserved-name convention, CI credential-absence scan, and break-glass agent clause are open implementation gates. See `governance/ADR-0025-ai-agent-credentials-for-restricted-data.md`.

## Data classification

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

HCI person-analysis data defaults to `RESTRICTED`. See `02_PRODUCT_BOUNDARIES.md` §Core Domain Objects for how this axis is distinct from (not the same as) the `Permission` access-control axis.

## Encryption

In transit, at rest, field-level for highly sensitive notes/evidence, KMS/secret manager, no production secrets in repository.

> ✅ **RESOLVED (`HD-12` / `HD-13`, 2026-09-02) — ADR-0022 / ADR-0023**: **HD-12 = yes** — a minimal `KEY_ROTATION_AND_COMPROMISE.md` runbook and a DEK→KEK→master key hierarchy land in Wave 2, before any real data, drilled before Wave 4 opens; full BYOK/HSM stays P1. **HD-13 = yes** — no sales/marketing/trust-center material may state or imply BYOK, customer-managed keys, or dedicated database until the capability has a passing acceptance test recorded against its ADR, enforced by a claims register + CI grep gate, not disclosure prose. Runbook/schema/drill gates (HD-12) and claims-register/CI-gate (HD-13) are open. See `governance/ADR-0022-minimal-key-rotation-and-compromise-runbook.md`, `governance/ADR-0023-block-byok-dedicated-db-sales-claims.md`.

## Tenant isolation

Every tenant-owned table must contain `tenant_id NOT NULL`.

> **RESOLVED (`HD-05=A`, ADR-0016)** — every tenant-owned table requires `tenant_id NOT NULL`, forced database RLS, and a CI-blocking cross-tenant read/write test under a non-owner, non-superuser role. The local synthetic skeleton demonstrates the required shape; production deployment and portal integration remain open.

Isolation tier (shared RLS vs. dedicated DB) is a formal `Entitlement` mapped by edition, not an ad hoc option — see `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md`.

## Protected data restrictions

Formal scoring should not use irrelevant protected/sensitive traits such as: race, religion, sexual orientation, health conditions, private sex life, political affiliation, similar sensitive categories.

AI must not infer these from face, voice, name, or communications for HCI decisions.

## Employment / HR boundary

HCI may support decision-making, but must not become an autonomous engine for: Hire, Fire, Promotion, Compensation.

High-impact employment use requires: human review, explainable evidence, local policy/jurisdiction check, protected-attribute exclusion, decision logging.

**New note in V2**: this use case, and HCI's general profiling function, plausibly intersects with the US Fair Credit Reporting Act (consumer-reporting-agency-adjacent activity) and the EU AI Act's high-risk profiling classification. See §Regulatory Scope below.

## Customer data ownership

Customer data belongs to the customer subject to contract and applicable law.

Default: no cross-tenant person reputation database, no training on enterprise evidence without explicit lawful authorization, no resale of customer evidence, no hidden public reputation score.

## Data Subject Rights *(new section in V2 — see `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Data Subject Rights for the domain entity)*

The customer's own DSAR/deletion rights (below, §Trust & Safety and standard privacy-ops artifacts) are a **separate, narrower** concern from the researched Person's rights. `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P1-01's privacy deliverables (`DSAR_RUNBOOK.md`, `DELETION_RUNBOOK.md`) are scoped to the tenant's own account data; they do not by themselves satisfy ADR-0014's data-subject rights process for the third party being profiled.

### Data Protection Roles *(new sub-section in V2)*

> ✅ **RESOLVED (`HD-21` / `REG-02`, 2026-09-02) — ADR-0030**: Aware Wave is a data PROCESSOR for tenant-directed research, and a data CONTROLLER for two activities it determines itself — operating the Public Intelligence pipeline, and operating the `DataSubjectRequest` channel. Every processing activity carries a recorded role; the customer DPA template reflects processor for tenant-directed work and discloses controller for the other two. Data Protection Roles Memo, `controller_role` schema column, and DPA template are open implementation gates — this is a design determination pending qualified-counsel review before any real-person processing. See `governance/ADR-0030-controller-processor-determination.md`.

## Privacy operations sequencing *(new section in V2)*

**Changed in V2**: V1 sequenced DPIA, subprocessor register, and lawful-basis matrix (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P1-01) after real-people processing already begins (Public Intelligence ships Wave 6; founder dogfooding on real people begins Phase 5 — `14_ROADMAP_AND_DEFINITION_OF_DONE.md`). A **one-page** version of these artifacts — not a full compliance department — is required before Wave 6/Phase 5, proportionate to a pre-revenue single-operator team; the full enterprise-grade versions stay at their original P1 position. Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-03, `HCI30_RESEARCH_REVIEW/REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md` REG-08.

## Regulatory Scope *(new section in V2)*

> ✅ **RESOLVED (`HD-20` / `REG-01`, 2026-09-02) — ADR-0012**: conservative scope — V1 explicitly EXCLUDES (a) tenants/Subjects in the EU/EEA/UK, and (b) any employment/credit/housing/insurance or other consumer-reporting-adjacent (FCRA) use. Enforced by jurisdiction fields on Tenant/Case, a purpose-attestation gate at Case creation, and a DB CHECK rejecting excluded purposes. Entering those markets requires a compliance program and a superseding ADR. This is a scope decision, not legal advice. Jurisdiction fields and purpose-attestation gate are open implementation gates. See `governance/ADR-0012-regulatory-market-scope.md`.

## Threat modeling *(new section in V2)*

Two hardening requirements added, both blocking-before-ship for the Public Intelligence pipeline (`06_HCI30_PUBLIC_INTELLIGENCE.md`):

1. **Prompt injection defense** — untrusted retrieved web content must never be concatenated directly into a prompt carrying system instructions. See `06_HCI30_PUBLIC_INTELLIGENCE.md` §Content Isolation & Authenticity Check.
2. **Network isolation for the fetch step** — the outbound URL fetch is not currently isolated from the rest of the shared single-box infrastructure; on this specific verified baseline (not a generic cloud VPC with default segmentation), an SSRF-capable fetch job can reach internal container endpoints. See `06_HCI30_PUBLIC_INTELLIGENCE.md`'s 🔴 `HD-19` for the specific unresolved question (Trigger.dev reuse vs. dedicated isolated runner).

Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-04, SEC-05.

## Investigation footprint *(new section in V2)*

A LINDDUN "detectability" concern specific to OSINT-style products: HCI's research activity against a Subject should not itself be detectable by that Subject (e.g. via unusual traffic patterns to their own properties, or third-party analytics revealing repeat visits from a research tool). This was entirely unaddressed in V1's otherwise-thorough threat category list. Add to the Wave 6 threat model (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-08). Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-13.

## Purpose limitation *(new section in V2)*

See `06_HCI30_PUBLIC_INTELLIGENCE.md` §Research Modes for the purpose-attestation and Continuous-Monitoring tier restriction added to close the covert-surveillance risk of the HCI Personal + Continuous Monitoring combination. Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-09.

## Severe-evidence dual control *(new section in V2)*

Severe negative evidence (allegations, legal matters, governance concerns with high downstream decision weight) requires a maker-checker (dual-control) review before contributing to a formal Assessment — a proportionate insider-threat control matching this document's mandate to actively hunt for underestimated risk, without over-building process for low-stakes evidence. Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-16.

## Trust & safety

Explicitly prohibit: covert mass citizen scoring, illegal surveillance, hacked/private account access, purchase/use of clearly illicit leaked data, protected-trait scoring, fully autonomous irreversible human decisions.

## Bulk export

> ✅ **RESOLVED (`HD-18`, 2026-09-02) — ADR-0028**: yes. Exports of RESTRICTED data above a per-tier row threshold require step-up authentication, a delayed-release window with cancellation, and an immutable audit event recorded before the artifact becomes downloadable. Threshold is per-edition configuration data, not code. Exports at or below threshold keep the existing audit-only path. Threshold policy, export-release schema, and enforcement/delayed-release/audit tests are open implementation gates. See `governance/ADR-0028-bulk-export-prevention-control.md`.

## Audit

High-value audit event should include: who, what, when, where, before, after, reason, request_id, session_id.

High-risk audit alerts: bulk export (now also preventively controlled, see above), unusual admin reading, permission escalation, mass evidence changes, retention override, audit deletion attempt.

**New in V2**: audit logging (this section) is application-layer; §Admin Principle above adds the DB-session-level audit logging that covers direct database access outside the application role — the two layers together, not either alone, close the admin/insider-access gap.
