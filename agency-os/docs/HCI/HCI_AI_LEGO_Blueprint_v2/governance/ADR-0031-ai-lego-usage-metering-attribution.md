# ADR-0031 — AI LEGO Usage Metering / Entitlement Attribution

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI × AI LEGO Integration Contract billing-attribution clause only; this ADR does not select a payment provider, build an entitlement engine, authorize cross-product database access, or authorize production deployment or real-person data processing.

## Context

`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:23-39` (§Request package) lists `tenant_context` as a bare, undefined-content field, with an in-place forward annotation already reading "now cryptographically verified, see §Usage Metering below" (`:29`) — the document text anticipates this decision without yet ratifying it. `:126-128` (§Usage Metering) carries a `🔴 DECISION PENDING (HD-22)` block recommending "yes": meter each Cognitive OS execution against the invoking HCI tenant's own verified Cognitive OS subscription, not a trusted-by-convention string.

`08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md` §AI LEGO usage metering — new clause required states the domain/DB separation between HCI and AI LEGO is clean, but nothing specifies how an HCI tenant's calls into Cognitive OS get billed back to that tenant, and names the confirmed precedent (`02_PRODUCT_BOUNDARIES.md` `HD-01`) that underspecified seams get filled by reusing the nearest existing mechanism regardless of product boundary — here, the portal's `organizations`/`organization_product_subscriptions` billing substrate becoming a de facto shared coupling point by default.

`HCI30_RESEARCH_REVIEW/11_ENTERPRISE_COMMERCIAL_REVIEW.md:130-149` (G-04) is the underlying finding: "can be priced and sold separately" requires knowing whose invoice a cross-product call lands on, and the existing domain-DB-separation architecture tests (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:27-28`) neither catch nor can catch a billing-layer coupling, because it is a billing question, not a schema question. `22_OPEN_HUMAN_DECISIONS.md:133-136` (HD-22) records the same recommendation as cheap-now, one-paragraph, forecloses-a-leak-later.

A real, shipped substrate already exists for the "nearest existing mechanism" risk to land in: `D:\Work\lobster-factory\packages\db\migrations\0062_organization_product_subscriptions.sql:78-83` defines `organization_product_subscriptions(organization_id, product_key CHECK IN ('cognitive','hci'), status CHECK IN ('trial','active','past_due','canceled'), external_tenant_id uuid NULL)`, writable only by `service_role` (`:44-47` comment block), with `external_tenant_id` explicitly documented (`:22-24`) as "Seam to each product's own Tenant record (Cognitive OS ADR-003 domain object #23)... NULL = not yet provisioned." This table is the correct issuing-side source of truth for a `product_key='cognitive'` entitlement; it must not become a query target the Cognitive OS adapter reaches into directly.

`governance/ADR-0002-no-cross-product-database-access.md` (ACCEPTED, same delegation) already forecloses exactly that shortcut: "No product may read or write another product's database, schema, or tables," rejecting a read replica or reporting view as "a live schema dependency... wearing a read-only disguise" and `postgres_fdw`/`dblink` as granting "network-level DB reachability between products by construction." Any entitlement-verification design here must satisfy ADR-0002 by construction, not by convention. `governance/ADR-0009-tenant-organization-model-reconciliation.md` fixes the tenant identity `organization_id`/`external_tenant_id` ultimately resolves to (`HD-01=A`), but its own adapter-mapping and cross-tenant-negative-test gates remain `OPEN` — this ADR's issuing-side gate is therefore sequenced to depend on ADR-0009's mapping artifact, not to duplicate or presuppose it.

`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:67-72` (Wave 3 — Contract-first API/events) is where the request-package schema becomes real code; `:115-122` (Wave 8 — Commercial control-plane integration) states "the *contract clause* should already be written in Wave 0/3; this Wave is where real cross-product billing goes live"; `:135-139` (Wave 10 — Optional AI LEGO integration) is where the adapter that dispatches the request package actually ships.

## Decision

Adopt **HD-22, "yes"** (recommended option, G-04 Alternative B): add a binding clause to `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` — every Cognitive OS execution invoked on behalf of an HCI tenant must carry a **signed, cryptographically verified `entitlement_ref`** naming that tenant's own `product_key='cognitive'` subscription, and every accepted execution is metered against it. `entitlement_ref` replaces the bare `tenant_context` string in the request package as the field the adapter and Cognitive OS actually trust; `tenant_context` may remain as descriptive metadata but confers no entitlement by itself.

Verification is signature/expiry/`product_key`/tenant-match checking against a control-plane-published public key — never a direct query, join, view, or `postgres_fdw` reach into `organization_product_subscriptions` or any other cross-product table. This keeps the decision inside ADR-0002's boundary: the control plane (sole `service_role` writer of `organization_product_subscriptions`) is the only party that reads that table to *mint* a token; Cognitive OS only ever *verifies* a signature it did not issue.

**Why this option over the alternatives:**
- **Leave `tenant_context` unspecified until Wave 8 (G-04 Alternative A)** loses because the contract document already forward-references this resolution (`10:29`) and the master plan itself schedules only the clause-writing, not the enforcement, for Wave 0/3 (`22:121`) — deferring the one-paragraph clause gains nothing and leaves the doc internally inconsistent (a "now cryptographically verified" annotation pointing at a still-`🔴 DECISION PENDING` section) until Wave 8, which is exactly the load-bearing-by-accident pattern `15_RISK_REGISTER.md:50` warns becomes true "automatically the first time a provisioning API is built."
- **Verify entitlement by direct cross-product DB read of `organization_product_subscriptions` (the "nearest existing mechanism" default G-04 predicts)** loses on ADR-0002 grounds stated above: it is the read-replica/reporting-view pattern ADR-0002 names and rejects, not a new option this ADR is free to choose.
- **AI LEGO calls included free in any HCI paid tier, no metering (G-04 Alternative C)** loses because it forecloses AI LEGO's independent monetization by default rather than by a deliberate business decision, contradicting the separately-sellable-peer-products premise `ADR-0001` and `ADR-0005` already ratify; nothing in this pack states an intent to bundle pricing.

This decision does not authorize: selecting a payment provider (`08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md` §Payment provider remains open); building the full Product/Plan/Feature/Entitlement/Limit engine (`08` §Tier growth path gap 2 — correctly deferred, no real Enterprise prospect yet); Tier B/C/D isolation migration; production deployment of Wave 8 or Wave 10; or processing real (non-synthetic) person data.

## Required implementation gates

Design artifacts do not yet exist for this decision; all gates are **OPEN**.

1. **Contract-schema gate — Wave 3.** `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Request package amended to define `entitlement_ref` (`subscription_ref`, `product_key: 'cognitive'`, `issued_at`, `expires_at`, `signature`) as a required field, and §Usage Metering's `🔴 DECISION PENDING (HD-22)` marker closed to reference this ADR. `packages\contracts\` encodes it as non-nullable in the request-package OpenAPI/JSON schema (`22:69-72`). Test id `CONTRACT-ENTITLEMENT-REQUIRED-01`: a schema-validation test rejecting any request package missing `entitlement_ref` or carrying `tenant_context` alone.
2. **Issuing-side gate — Wave 8, depends on ADR-0009's adapter-mapping artifact landing first.** A control-plane endpoint mints `entitlement_ref` signed with the control plane's private key, only when the resolved organization has an `organization_product_subscriptions` row with `product_key='cognitive'` and `status IN ('trial','active')`. Test id `ENTITLEMENT-ISSUE-STATUS-GATE-01`: proves minting is refused for `status IN ('past_due','canceled')` or a missing row.
3. **Verifying-side gate — Wave 10.** The `integrations\cognitive-os\` adapter's request mapper refuses to dispatch (`POST /cognitive/v1/workflows/execute`) any request package whose `entitlement_ref` fails signature, expiry, or `product_key` verification, with zero database query against `organization_product_subscriptions` or any AI-LEGO-side table. Test id `COGOS-ENTITLEMENT-REJECT-01`: contract test asserting missing/expired/wrong-`product_key`/bad-signature `entitlement_ref` is rejected pre-dispatch, with an assertion (mirroring ADR-0002 gate 1's pattern) that no `postgres_fdw`/`dblink`/foreign-server object exists in either product's schema to satisfy it.
4. **Metering-ledger gate — Wave 8.** Every accepted `cognitive.run.completed` event persists the verified `entitlement_ref`'s `subscription_ref` alongside `execution_run_id` in a control-plane-owned usage ledger (not a cross-product join). Test id `ENTITLEMENT-RUN-LEDGER-01`: proves no completed run event is recorded without a corresponding ledger row carrying the verified `entitlement_ref`.

CI: gates land in their named Wave's existing test job; no separate workflow file is authorized by this ADR.

## Consequences

- The request package's `entitlement_ref` becomes the sole source of billing attribution; `tenant_context` alone no longer authorizes a metered Cognitive OS execution.
- An HCI tenant without an active `product_key='cognitive'` subscription gets a clean, auditable rejection at dispatch (gate 3), not free/unmetered usage riding on another tenant's plan.
- AI LEGO's independent monetization is preserved by construction; the two products' domain-DB independence (ADR-0002) is not weakened to achieve billing attribution — verification is signature-based, never a cross-product read.
- This ADR does not resolve `HD-01`'s real tenant-identity mapping beyond what ADR-0009 already scoped (gate 2 is blocked on that mapping artifact), does not pick a payment provider, and does not build the Tier B/C/D entitlement engine `08` correctly defers.
- A future change to the verification mechanism or metering scope requires a superseding ADR.

## Verification and rollback

- Verification recorded here is documentation-only: every cited line was read on 2026-09-02. None of the four gates' artifacts exist yet; the contract-clause text itself (gate 1) has not been written into `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`.
- Before implementation, rollback is to supersede this ADR with a new explicit decision (the operator retains override authority per the delegation this ADR was written under).
- After implementation, rollback must be a reviewed contract-version bump (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Compatibility) with a fail-closed deployment on incompatibility; it must not silently downgrade `entitlement_ref` back to an unverified `tenant_context` string, and must not add a cross-product database read to simplify verification.

## Evidence

- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:23-39,126-128` — Request package field list and forward annotation; §Usage Metering DECISION PENDING block.
- `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md` §AI LEGO usage metering — new clause required.
- `HCI30_RESEARCH_REVIEW/11_ENTERPRISE_COMMERCIAL_REVIEW.md:130-149` (G-04) — full disposition, alternatives, and 30-year-consequence reasoning.
- `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:133-136` (HD-22) — decision-ready framing.
- `HCI30_RESEARCH_REVIEW/15_RISK_REGISTER.md:50` — load-bearing-by-accident likelihood if left unspecified.
- `D:\Work\lobster-factory\packages\db\migrations\0062_organization_product_subscriptions.sql:16-47,78-83` — the real, shipped `organization_product_subscriptions` schema, `service_role`-only writes, and `external_tenant_id` seam documentation.
- `governance\ADR-0002-no-cross-product-database-access.md` — the cross-product-DB-access boundary this ADR's verification design must satisfy.
- `governance\ADR-0009-tenant-organization-model-reconciliation.md` — tenant identity resolution this ADR's issuing-side gate depends on.
- `governance\ADR-0001-hci-and-cognitive-os-are-peer-products.md`, `governance\ADR-0005-hci-ai-lego-integration-is-optional.md` — separately-sellable peer-product premise Alternative C would have foreclosed.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:67-72,115-122,135-139` — Wave 3, Wave 8, Wave 10 placement.
