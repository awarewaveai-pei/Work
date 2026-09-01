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

> 🔴 **DECISION PENDING (`HD-15`, no urgency — decide when convenient)** — the current operating pattern (Claude/Codex retain routine SSH/root/DB access to the production stack, under this repo's own documented governance rules) is real today and not itself in question. What's unresolved: does this pattern apply unmodified once RESTRICTED HCI Person data lives on the same infrastructure, or does that specific data class warrant a narrower access model? Explicitly flagged as unverified extrapolation, not a settled fact — the present-day pattern is real, but whether it should extend unmodified to this higher-sensitivity data class has not been decided anywhere. No recommendation forced here; revisit once RESTRICTED HCI data is actually about to go live (Wave 4). Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-15.

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

> 🔴 **DECISION PENDING (`HD-12` / `HD-13`)** — two related commitments, not yet operator-ratified. **HD-12**: pull a *minimal* key-rotation and compromise-response runbook into P0 (before Wave 4's Evidence core goes live with real data), even while the full BYOK/envelope-encryption/enterprise key-hierarchy work stays at P1-04? **Recommended: yes** — V1 required field-level encryption for RESTRICTED data starting immediately while deferring key hierarchy, rotation, and compromise-response entirely to P1-04, a direct priority contradiction (encrypting data with no rotation/compromise plan is security theater); the runbook alone is cheap (not new infrastructure). **HD-13**: should Enterprise sales materials referencing BYOK or dedicated-DB be explicitly blocked until P1-04 is actually built and tested? Flagged as a genuine governance/business-integrity question, not purely technical — a sold-vs-actual security posture gap is a decision about what the company is comfortable representing to prospects, not something this review can decide alone. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-12, HD-13, `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-07, `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-08.

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

> 🔴 **DECISION PENDING (`HD-21` / `REG-02`)** — GDPR's actual data subject for HCI-30's sensitive processing is the researched Person, not the paying tenant. Aware Wave's own AI systems (identity resolution, claim extraction, synthesis — `06_HCI30_PUBLIC_INTELLIGENCE.md`) exercise independent processing decisions about that third party, raising a real joint-controller or independent-controller question distinct from the tenant's own evidence/notes. Produce a short Data Protection Roles Memo determining, per processing activity, whether Aware Wave is processor, controller, or joint controller, and reflect the answer in the customer DPA template. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-21.

## Privacy operations sequencing *(new section in V2)*

**Changed in V2**: V1 sequenced DPIA, subprocessor register, and lawful-basis matrix (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P1-01) after real-people processing already begins (Public Intelligence ships Wave 6; founder dogfooding on real people begins Phase 5 — `14_ROADMAP_AND_DEFINITION_OF_DONE.md`). A **one-page** version of these artifacts — not a full compliance department — is required before Wave 6/Phase 5, proportionate to a pre-revenue single-operator team; the full enterprise-grade versions stay at their original P1 position. Full reasoning: `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-03, `HCI30_RESEARCH_REVIEW/REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md` REG-08.

## Regulatory Scope *(new section in V2)*

> 🔴 **DECISION PENDING (`HD-20` / `REG-01`)** — HCI-30's core function (assessing reliability/trust/behavior of a named natural person to inform a consequential decision) matches the EU AI Act's statutory definition of high-risk "profiling" (Article 6(3), Annex III) and plausibly the US FCRA's definition of consumer-reporting-agency-adjacent activity for employment use — neither regime is named anywhere in this document set today. This is a market-strategy decision, not something an architecture review can resolve: will HCI-30 be marketed/sold for EU-linked or US-employment-adjacent use cases? Write a one-page ADR (alongside the other ADRs in `17_REPOSITORY_LAYOUT_AND_PATHS.md`) explicitly deciding and documenting: (a) whether HCI-30 will be marketed/sold for these use cases, (b) whether Aware Wave will restrict such uses contractually for EU tenants until a conformity program exists, (c) that this decision is revisited before `21_HCI_TOP_TIER_GAP_ANALYSIS.md` Wave 9 (Enterprise readiness). Do not build the full conformity-assessment program now — the decision itself is what's needed first. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-20, `HCI30_RESEARCH_REVIEW/REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md`.

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

> 🔴 **DECISION PENDING (`HD-18`)** — add a preventive control (step-up auth, size threshold, delayed-release window) for RESTRICTED-data exports above a threshold, rather than relying on a post-hoc audit alert alone (V1 treated bulk export only as a high-risk audit alert below — an after-the-fact notice, not a control)? **Recommended: yes, for Enterprise-tier exports specifically** — to avoid adding friction to the low-risk majority of usage: exports above a defined size/sensitivity level would require step-up authentication and/or an async delayed-release window with a cancellation/review option. Detective-only controls are appropriate for low-value data; data whose exposure creates third-party legal harm (not just the tenant's own risk) needs prevention designed in, not only observability after the fact — but the specific threshold and friction trade-off is the operator's call. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-18, `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-08.

## Audit

High-value audit event should include: who, what, when, where, before, after, reason, request_id, session_id.

High-risk audit alerts: bulk export (now also preventively controlled, see above), unusual admin reading, permission escalation, mass evidence changes, retention override, audit deletion attempt.

**New in V2**: audit logging (this section) is application-layer; §Admin Principle above adds the DB-session-level audit logging that covers direct database access outside the application role — the two layers together, not either alone, close the admin/insider-access gap.
