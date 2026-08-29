# 08 — HCI-30 Commercial Edition Architecture

## Product editions

Recommended:

```text
HCI Personal
HCI Professional
HCI Team
HCI Enterprise
HCI Group
HCI Private
```

**Clarification (new in V2)**: these tiers describe **account size and feature surface** (seats, collaboration, API access). They are a separate axis from the Subject-type / Requester-role question in `02_PRODUCT_BOUNDARIES.md` (pending `HD-00`) — an Enterprise-tier account and a Personal-tier account can both, in principle, want to research either a Person or (pending that decision) an Organization, for different relationship goals. Do not conflate "how big is the paying account" with "what kind of analysis they need."

## Personal

- single user
- private vault
- person/relationship/evidence
- analysis
- export
- encryption
- optional local-first mode

## Professional

Adds: multiple projects, advanced analysis, custom templates, API, automation.

## Team

Adds: workspaces, collaboration, RBAC.

## Enterprise / Group / Private

See `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md` §Tenant Isolation Tiers for the technical isolation model each of these commercially requires, and `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P1/P2 for the enterprise-readiness work gating them.

## Tier growth path — verified, not assumed

**Changed in V2**: V1 asserted a Personal→Group growth path without tracing whether the schema/isolation-model/billing-hook design actually supports it end-to-end. Independent review traced a concrete account through the tiers against the actual specified schema and found the *domain-level* separation between HCI and AI LEGO is genuinely strong, but the *growth path itself* has two concrete gaps:

1. **No isolation-tier upgrade migration procedure.** Moving an account from Tier A (shared DB + RLS) to Tier B/C/D (dedicated DB/app/region) as it grows from Team to Enterprise has no defined migration mechanics — this is the one commercial-tier claim with real irreversibility and customer-trust exposure if botched (a mid-migration data loss or leak for a real Enterprise customer). Needs a documented, tested migration runbook before the first real Tier-upgrade customer, not before every tier ships. Full reasoning: `HCI30_RESEARCH_REVIEW/11_ENTERPRISE_COMMERCIAL_REVIEW.md` G-03.
2. **Commercial-edition architecture and multi-tenancy tiers have zero schema, API, or migration mechanics in the repository today.** This is **correctly deferred**, not a defect: building Tier B/C/D isolation, entitlement engines, and offline licensing before any real HCI/Cognitive OS customer exists would be exactly the kind of premature infrastructure the anti-overengineering discipline in `01_SYSTEM_CONSTITUTION.md` warns against, on a single-OVH-box, solo-operator baseline. Revisit when a real Enterprise prospect is in-pipeline, not before. Full reasoning: `HCI30_RESEARCH_REVIEW/11_ENTERPRISE_COMMERCIAL_REVIEW.md` G-02 (DEFER).

**KEEP, confirmed**: the decision that shared-DB-plus-RLS (not dedicated-DB-per-tenant) is correct for the Personal/Professional/Team majority was implicitly right in V1 but never stated or justified anywhere — now formalized in `11_SECURITY_PRIVACY_GOVERNANCE.md` §Tenant Isolation and `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md`. Full reasoning: `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-12.

## Group / M&A tier — explicitly deferred, not designed

**Correctly out of scope for now**: `14_ROADMAP_AND_DEFINITION_OF_DONE.md` Phase 9 (Group/conglomerate) lists multi-organization hierarchy, delegated admin, and legal entity isolation as future work — Tenant Merge/Split and Organization Transfer mechanics have zero design anywhere in this document set and should stay as an aspirational placeholder rather than receiving real design effort now. Group/M&A customers are, realistically, years away from this product's current stage; building for them now is premature relative to the anti-overengineering discipline. Full reasoning: `HCI30_RESEARCH_REVIEW/11_ENTERPRISE_COMMERCIAL_REVIEW.md` G-05 (DEFER).

## AI LEGO usage metering — new clause required

The domain/DB separation between HCI and AI LEGO is clean (`02_PRODUCT_BOUNDARIES.md`), but nothing in V1 specified how an HCI tenant's calls into Cognitive OS get billed back to that tenant, or whether Cognitive OS trusts HCI's `tenant_context` unchecked. Given the confirmed precedent that underspecified areas in this system tend to get filled by reusing the nearest existing mechanism regardless of product boundary (see `02_PRODUCT_BOUNDARIES.md` `HD-01`'s Tenant-reconciliation finding), the likely default outcome without an explicit clause is that the shared portal billing substrate becomes a de facto shared coupling point between the two products — undermining the otherwise-strong domain-independence finding at the billing layer specifically. See `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Usage Metering for the required clause. Full reasoning: `HCI30_RESEARCH_REVIEW/11_ENTERPRISE_COMMERCIAL_REVIEW.md` G-04.

## Payment provider *(new note in V2)*

No document in this specification names a payment provider. This is an open question, not a decided vendor-neutral abstraction — flag before wiring real billing. See `HCI30_RESEARCH_REVIEW/18_30_YEAR_REPLACEMENT_ANALYSIS.md` §Payment provider.
