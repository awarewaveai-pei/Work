# ADR-0024 — Multi-Region / Data-Residency Infrastructure Trigger Condition

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: The build/no-build trigger for real multi-region infrastructure and the wording of residency-related external claims for HCI-30 only; this ADR provisions no region, writes no enforcement code, and authorizes no customer-facing residency guarantee.

## Context

`12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:54` specifies nullable tenant-settings columns (`home_region`, `allowed_regions`, `data_residency_policy`, `backup_region`, `ai_processing_regions`) but leaves the build trigger for real enforcement as an unratified 🔴 `DECISION PENDING` block at `:56`, citing `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-14 (`:94-97`). `HCI30_RESEARCH_REVIEW/13_ARCHITECTURE_OPTIONS_MATRIX.md` §3c (`:60-66`) compares three options and recommends combining Option 1 (single-region, honestly documented) with the schema-stub half of Option 2, rejecting Option 3 (actual multi-region infra Day-1) as "wildly disproportionate cost for a solo operator with zero enterprise customers today" (`:65`). The same file's NOW/NEXT/FUTURE table (`:77`, `:82`) already names the FUTURE trigger in prose — "when a signed contract has a residency clause the current EU-only box cannot satisfy" — for both DB tenancy and Region/residency rows, but nothing in the repository enforces that prose. `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:45` independently confirms "zero schema, API, or migration mechanics in the repository today" for Tier B–D, calling deferral correct on the current single-OVH-box, solo-operator baseline (`01_SYSTEM_CONSTITUTION.md` anti-overengineering discipline, referenced at `08:45`).

This is the same shape of gap `ADR-0023-block-byok-dedicated-db-sales-claims.md` already closed for BYOK/customer-managed-key/dedicated-DB claims: a correct prose precondition with no machine check behind it. `ADR-0023`'s own Decision section explicitly carves out HD-14 as undecided ("does not decide … HD-14 (residency trigger)"); this ADR is that follow-on decision, and it reuses ADR-0023's not-yet-built claims-register/CI-gate/mutation-check mechanism rather than standing up a second one — building a parallel gate here would repeat the exact "parallel-reinvention risk" `13_ARCHITECTURE_OPTIONS_MATRIX.md:§5` (`:86` heading) warns against.

## Decision

**HD-14 = yes.** The explicit, named, sole trigger for building real multi-region/data-residency infrastructure (Tier C/D per `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:47`, i.e. dedicated app+DB in a second region) is a **signed Enterprise/Group contract containing a data-residency clause**, recorded in an auditable trigger record (Gate 3 below). Until that record exists:

- The five tenant-settings columns named in `12:54` remain **nullable schema stubs only** — present in the schema, not read by any routing, storage-placement, or access-control decision.
- Every customer-facing statement (sales, marketing, `trust.aware-wave.com`, procurement material) must say residency enforcement is not built, using the same `nonclaim:` mechanism `ADR-0023` already defines, never silence.

This adopts `13_ARCHITECTURE_OPTIONS_MATRIX.md:66`'s recommendation as a ratified engineering rule rather than a suggestion:

- **Option 1 alone (no stub) loses**: it saves nothing today and forces a schema migration on the tenant-settings table the first time a real residency contract lands — `13:65` prices that as "a painful migration later" against a nullable column's near-zero present cost.
- **Option 3 (actual multi-region Day-1) loses**: `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md` and `13_ARCHITECTURE_OPTIONS_MATRIX.md:65` agree there are zero enterprise customers today and one physical box; a second region multiplies deploy, backup/DR, and observability surface (`13:76-81`) for a need that does not yet exist, the exact pattern `08:45` and `01_SYSTEM_CONSTITUTION.md` name as premature infrastructure.
- **The current "implicit phase-ordering" (HD-14's own status quo) loses**: prose ("when a signed contract has a residency clause…") is not enforceable — nothing stops an implementer from either (a) starting real multi-region provisioning speculatively, reproducing Option 3's cost, or (b) a claim surface asserting residency enforcement before it exists, reproducing the exact SEC-08 failure `ADR-0023` was written to close. Naming the trigger and giving it a machine-checkable record removes both failure modes without adding infrastructure.

This ADR does not decide HD-12 (rotation runbook), HD-13 (already decided by `ADR-0023`), HD-20 (regulatory market scope), or the identity/tenancy-principal open item in `ADR-0016`. It does not authorize processing real-person data, provisioning a second region, deploying multi-region infrastructure to production, or making any GDPR/data-protection legal representation about residency.

The five residency columns attach to the Tenant record, not to Workspace, Organization, or Project — per `ADR-0009`'s `HD-01=A` platform hierarchy, Tenant is the outermost billing/legal/deployment entity, and a data-residency clause is a Tenant-level contractual fact. An Organization-attribute node under a Workspace (`ADR-0009`, `ADR-0011`) inherits its Tenant's residency posture; it does not carry an independent one.

## Required implementation gates

Runtime gates are **OPEN**. Each gate names the artifact and the test that must fail before it exists.

1. **Schema-stub-only constraint — Wave 1.** The tenant-settings migration that adds `home_region`, `allowed_regions`, `data_residency_policy`, `backup_region`, `ai_processing_regions` (`Projects/internal/hci30/database/` per the ADR-0016 skeleton) must add them **nullable, with no `NOT NULL`, no `CHECK`, and no trigger function referencing any of the five columns**. Test `RESIDENCY-SCHEMA-01`: introspects `information_schema.columns` for nullability and `information_schema.triggers`/`pg_trigger` for any trigger touching these columns; a non-null constraint or an attached trigger fails the test. This is the negative of `ADR-0016`'s RLS gate — it proves the columns are inert, not enforced.
2. **Claims-register rows, reusing `ADR-0023` gates 1–3 — Wave 0, same commit as `ADR-0023`'s register.** Add to `D:\Work\agency-os\docs\trust\CLAIMS_REGISTER.md` (not yet created — confirmed absent 2026-09-02): `CLM-RESIDENCY-01` (gated terms: "data residency guarantee", "region-locked", "guaranteed EU-only storage", "residency enforcement", "GDPR data residency"), `status=BLOCKED`. No new CI workflow: `ADR-0023`'s `hci-claims-gate.yml` and `check-claims-register.ps1` already scan every row's `gated_terms`; this gate is satisfied the moment the row exists and `CLAIM-GATE-01`/`-02` (from `ADR-0023`) fire against it. Building a second gate script here would violate the zero-rework principle `13_ARCHITECTURE_OPTIONS_MATRIX.md §5` names.
3. **Residency trigger record — Wave 0 (gate), flips at Wave 9 or first real Enterprise/Group contract, whichever is later.** `D:\Work\agency-os\docs\trust\RESIDENCY_TRIGGER_RECORD.md`, absent by default, with required fields when created: `contract_id`, `signed_date`, `residency_clause_ref` (contract section/quote), `legal_reviewed_by`, `tenant_id`. CI check `scripts/check-residency-trigger.ps1` (new, `Wave 0`) scans any diff touching infra-as-code paths (`lobster-factory/infra/**`, `*.tf`, `docker-compose*.yml` region/host additions) or residency-enforcement code paths (a new `lib/residency/**` or equivalent routing/storage-placement module) for evidence of a second-region target (a distinct datacenter/region identifier not equal to the current EU box's). Test `RESIDENCY-INFRA-GATE-01`: such a diff with `RESIDENCY_TRIGGER_RECORD.md` absent or missing a required field → CI fails. Test `RESIDENCY-INFRA-GATE-02`: same diff with a fully populated record → CI passes. Mutation check `RESIDENCY-INFRA-GATE-03` (same pattern as `ADR-0023` gate 3, `Projects/internal/hci30/README.md:11`): delete the region-keyword list, delete the required-field check, delete the path list in turn — each mutation must turn gate 1 red; a mutation that stays green means the check is not real.
4. **Row flip to `EVIDENCED`/gate close — first real trigger.** `CLM-RESIDENCY-01` flips only when `RESIDENCY_TRIGGER_RECORD.md` is populated and reviewed, mirroring `ADR-0023` gate 5's `ACCEPTANCE VERIFIED` state; the flip is a reviewed commit re-running `ADR-0023`'s `CLAIM-REG-01`.

## Consequences

- Zero new infrastructure and zero new customer commitment result from this ADR by itself; it only names the trigger and wires it to `ADR-0023`'s enforcement mechanism.
- `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:56`'s 🔴 `DECISION PENDING` block and `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-14 should be marked resolved and cross-reference this ADR rather than restate the question.
- Any future proposal to provision a second region or ship residency-enforcement code without a populated `RESIDENCY_TRIGGER_RECORD.md` is a gate failure, not a judgment call at implementation time.
- This ADR does not modify ADR-0009/0010/0011/0014/0015/0016/0023; it consumes `ADR-0023`'s claims-register/CI-gate/mutation-check apparatus and adds one trigger-record artifact and one infra/code-path CI check specific to residency.

## Verification and rollback

- Verification recorded here is documentation-only: the decision, alternatives, and gate/test identifiers are cross-linked to `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md` §Data residency, `13_ARCHITECTURE_OPTIONS_MATRIX.md` §3c, `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-14, and `ADR_INDEX.md`. `D:\Work\agency-os\docs\trust\CLAIMS_REGISTER.md`, `RESIDENCY_TRIGGER_RECORD.md`, and `scripts/check-residency-trigger.ps1` do not yet exist (checked 2026-09-02); gates 1–4 are open.
- Rollback before implementation: supersede with a later explicit operator decision. Rollback after implementation: the trigger-record requirement may only be removed by a superseding ADR; flipping `CLM-RESIDENCY-01` back to `BLOCKED` is always permitted without one (it only makes the claim more conservative) and must re-run `CLAIM-REG-01`.
- No data, schema migration to production, or region provisioning is authorized by this ADR, so no infrastructure rollback path applies yet.

## Evidence

- `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:94-97` — HD-14 question, recommendation, source (D D-13).
- `HCI_AI_LEGO_Blueprint_v2/12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:44-56` — Tenant Isolation Tiers A–D, the five residency columns, and the 🔴 DECISION PENDING block this ADR resolves.
- `HCI30_RESEARCH_REVIEW/13_ARCHITECTURE_OPTIONS_MATRIX.md:60-66` — §3c three-option comparison and recommendation adopted here; `:76-83` — NOW/NEXT/FUTURE table naming the same trigger in prose for DB tenancy and Region/residency; `:86` — §5 parallel-reinvention finding motivating gate reuse.
- `HCI_AI_LEGO_Blueprint_v2/08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:36-47` — Enterprise/Group/Private tier routing, confirmed-deferred commercial-tier mechanics, anti-overengineering rationale.
- `governance/ADR-0023-block-byok-dedicated-db-sales-claims.md` (full) — claims-register/CI-gate/mutation-check mechanism this ADR extends; its Decision section's explicit HD-14 carve-out.
- `governance/ADR-0016-mandatory-tenant-rls.md` — synthetic-gate pattern and open tenancy-principal item this ADR does not touch.
- `governance/ADR_INDEX.md` — lifecycle states (`PLANNED`/`ACCEPTED`/gate states) this ADR's register entry must follow.
