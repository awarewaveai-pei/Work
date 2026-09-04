# ADR-0012 — Regulatory Market Scope

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: V1 market/use-case boundary for HCI-30 (`HD-20`) only. This ADR is a product scoping decision with a machine-enforced gate; it is not a DPIA, an EU AI Act conformity assessment, an FCRA compliance certification, or legal advice, and it does not itself authorize real-person data processing (that remains gated by ADR-0014/0015/0016) or production deployment.

## Context

`11_SECURITY_PRIVACY_GOVERNANCE.md:76-80` ("Employment / HR boundary") already lets HCI support Hire/Fire/Promotion/Compensation decisions with human review, and its own V2 note flags that this "plausibly intersects with the US Fair Credit Reporting Act ... and the EU AI Act's high-risk profiling classification" without naming either regime anywhere else in the 24-file set. `11_SECURITY_PRIVACY_GOVERNANCE.md:102` records this as 🔴 `DECISION PENDING (HD-20 / REG-01)`, and `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:124-127` states it plainly: "will HCI-30 be marketed/sold for EU-linked or US-employment-adjacent use cases? ... this is a market-strategy decision no reviewer can make."

Two independent reviewers converge on the same structural gap from different regimes. `REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md:74-87` (REG-01) shows HCI-30's own product spec — "analyse or predict aspects concerning ... reliability, behaviour" of a named person — is a verbatim match for the EU AI Act's Article 4(4)/Article 6(3) definition of "profiling," which loses its narrow-task exemption automatically and becomes Annex III high-risk with no escape hatch; the Employment/HR boundary independently triggers Annex III point 4. `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md:76-89` (SEC-01) shows the same product used for a US employment decision plausibly makes Aware Wave a consumer-reporting-agency-like service under FCRA, with subject-notice, dispute, and adverse-action obligations nowhere addressed. Both mark `Requires human decision: YES` (07:95).

There is no product exposure to retrofit around yet. `wave1/HCI_WAVE1_DOMAIN_ERD.md:24,32` recorded, at drafting time, that Case/Engagement itself was still conditional on unresolved `HD-10` — since decided by `ADR-0020` (same batch) as `hci.cases`, though not yet a built table; the closest *currently existing* anchor is `hci.tenants` (`id, slug` — no `jurisdiction` column, `migrations/0001_wave1_synthetic_up.sql:71`) and `hci.tenant_authorizations` (`id, tenant_id, status, expires_at` — no `purpose` column, `:76-78`), both still synthetic-only per `ADR-0016-mandatory-tenant-rls.md:3`. `wave1/HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY.md` already documents `purpose` as a required Tenant-authorization field and states outright: "`HD-20` determines the markets/use cases and must precede any jurisdiction-specific applicability statement." This ADR is that precedent decision.

## Decision

**V1 excludes (a) tenants or Subjects located in the EU/EEA/UK, and (b) employment, credit, housing, insurance, or other consumer-reporting-adjacent (FCRA-adjacent) purposes**, enforced technically — not contractually — via a `jurisdiction` field on `hci.tenants`, a `purpose` allow-list field on `hci.tenant_authorizations` (the current pre-Case authorization surface), and a database `CHECK`/trigger pair rejecting the excluded values at write time. Entering either excluded class requires a compliance program and a superseding ADR.

This is SEC-01's **Alternative A** ("exclude via ToS + technical warnings," `07:85`) generalized to also close REG-01's EU AI Act finding, and it matches both REG-01's own **Recommended** action ("write a one-page ADR now ... do not build the full conformity-assessment program now," `REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md:86`) and `11_SECURITY_PRIVACY_GOVERNANCE.md:102`'s framing verbatim: "Do not build the full conformity-assessment program now — the decision itself is what's needed first."

Why the other options lose, in engineering terms:

- **Build the full FCRA/EU AI Act conformity program now** (SEC-01 Alternative B, `07:86`) — there is no production database, no paying tenant, and no built Case/Engagement aggregate to attach subject-notice or Article 26(6) logging to (`HD-10` decided by `ADR-0020`, same batch, but `hci.cases` is not yet built). A multi-month legal-engineering program has nothing real to be built against yet; both reviewers independently call this disproportionate before Phase 2/Wave 1 stability.
- **Ship without addressing it, rely on customer contracts** (SEC-01 Alternative C, `07:87`) — explicitly rejected in the source evidence: "not recommended — contractual risk-shifting does not eliminate Aware Wave's own exposure as a data controller/processor." This is the option this ADR closes off.
- **State the restriction in prose only** — fails the same way `ADR-0023-block-byok-dedicated-db-sales-claims.md` already named for a sibling problem: "prose is not a control ... nothing in the repository detects" a violation. A scoping sentence with no `CHECK` constraint is indistinguishable from no decision at all the first time a tenant record is created by hand.
- **Chosen — technical exclusion via allow-list/deny-list constraints**: costs two columns, two `CHECK`s, and one trigger; is CI-testable exactly like the existing `H1001`–`H1007` gates in `migrations/0001_wave1_synthetic_up.sql:25-31`; and is reversible by a superseding ADR the moment the operator decides to pursue either market, per REG-01's own staged reasoning.

This decision does **not** authorize: processing real-person data (still gated by ADR-0014/ADR-0015/ADR-0016 and `HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY.md`'s fail-closed rules); production deployment; or any representation to a customer or regulator that HCI-30 is EU AI Act- or FCRA-conformant. It is a scoping and admission-control decision, not a legal opinion.

## Required implementation gates

Runtime gates are **OPEN**. Each names its artifact, test, and Wave.

1. **`hci.tenants.jurisdiction` — Wave 1.** `ALTER TABLE hci.tenants ADD COLUMN jurisdiction text NOT NULL DEFAULT 'US' CHECK (jurisdiction !~* '^(EU|EEA|GB|AT|BE|BG|HR|CY|CZ|DK|EE|FI|FR|DE|GR|HU|IE|IT|LV|LT|LU|MT|NL|PL|PT|RO|SK|SI|ES|SE|IS|LI|NO)$')` in a successor to `migrations/0001_wave1_synthetic_up.sql`. Tests `REG-NEG-01`/`02`/`03` (insert with `jurisdiction='DE'`/`'FR'`/`'GB'` each rejected) added to `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`.
2. **`hci.tenant_authorizations.purpose` — Wave 1.** `purpose text NOT NULL CHECK (purpose IN ('vendor_risk_assessment','fraud_investigation','personal_safety','journalism_research','general_due_diligence', ...))` — an explicit allow-list that omits `employment_screening`, `credit_decisioning`, `housing_tenant_screening`, `insurance_underwriting`, and any other consumer-reporting-adjacent value. Tests `REG-NEG-04..07` (each excluded purpose rejected), `REG-NEG-08` (an allow-listed purpose accepted). Anchored on `tenant_authorizations`, not `Case`, because `hci.cases` is not yet built even though `HD-10` is now decided (`ADR-0020`, same batch; `wave1/HCI_WAVE1_DOMAIN_ERD.md:24` recorded the pre-decision state) — when `ADR-0020`'s gate 1 lands `hci.cases` as real schema, this gate must be re-anchored onto the Case/Engagement aggregate in the same migration, not left orphaned here.
3. **`H1012` trigger — Wave 1.** New domain error code `H1012` ("excluded jurisdiction or purpose") — corrected from an original `H1008` allocation that collided with `ADR-0017` gate 2's `mark_superseded()` code (this ADR and `ADR-0017` independently computed "next free after H1007" without seeing each other; `H1008` stays ADR-0017's, `H1009`/`H1010`/`H1011` stay ADR-0018/ADR-0020's per their own reconciliation note at `ADR-0020:59`). Added to the registry at `migrations/0001_wave1_synthetic_up.sql:25-31`, on a trigger extending the existing `research_workflows_require_active_authorization` pattern (`migrations/0001_wave1_synthetic_up.sql:101-114`) so `hci.research_workflows` INSERT re-checks the joined `tenant.jurisdiction` and `tenant_authorization.purpose` at workflow-start — defense-in-depth against a bulk-insert path bypassing gates 1-2.
4. **Mutation coverage — Wave 1, same commit.** `scripts/mutation-check-wave1.ps1` gains three mutations (drop the `jurisdiction` `CHECK`, drop the `purpose` `CHECK`, drop the `H1012` trigger); each must turn the corresponding `REG-NEG-*` test red, extending the existing 15/15-mutation requirement in `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` ("Non-vacuity evidence").
5. **Continuous Monitoring purpose reuse — Wave 6.** The already-planned "purpose-attestation gate for Continuous Monitoring mode" (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:99`; `06_HCI30_PUBLIC_INTELLIGENCE.md:263`) must read its allow-list from gate 2's `hci.tenant_authorizations.purpose` `CHECK`, not a second, independently-maintained list. Test `CONTMON-PURPOSE-01`, CI-blocking before Wave 6 ships.
6. **Market-expansion lock — Wave 9.** Loosening or removing the gate-1/gate-2 `CHECK` constraints to admit an EU/EEA/UK jurisdiction or an excluded purpose requires a superseding ADR that also lands the conformity/FCRA program items named in REG-01 and SEC-01 Alternative B; this mirrors the existing precondition at `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:131` ("confirm the `HD-20` regulatory-scope decision before pursuing EU/regulated-industry Enterprise deals"). Editing either `CHECK` in place without a superseding ADR is the specific failure this ADR exists to block.
7. **Index registration — done.** `governance/ADR_INDEX.md:30` listed ADR-0012 as `PLANNED` at drafting time, topic "Regulatory market scope," source `11_SECURITY_PRIVACY_GOVERNANCE.md (HD-20)`; the index has since been updated in the same batch to `ACCEPTED` with a `SPECIFIED — RUNTIME OPEN` gate-state row for items 1-6.

## Implementation note (2026-09-05, gates 1-4 landed)

Recorded here rather than by editing the numbered gates above, which remain
the historical decision record.

- **Gate 1 tightened, not loosened.** The deny-list regex as literally
  written above (`GB` but not `UK`; no `CH`; no `EL`) shipped with a real gap:
  `'UK'` is the more common free-text spelling of the United Kingdom, `CH`
  (Switzerland, EFTA, revFADP in force since 2023-09-01) was omitted despite
  this ADR's own context citing "EU/EEA/UK" scope, and `EL` is the EU's own
  nomenclature for Greece alongside `GR`. A 2026-09-05 db-expert review of
  the implementing migration caught this before merge. `migrations/0003_wave1_regulatory_market_scope_up.sql`
  implements the corrected list (`EU, EEA, GB, UK, CH` plus all 27 EU members
  including both `GR` and `EL`, plus `IS, LI, NO`), normalized via
  `upper(btrim(jurisdiction)) NOT IN (...)` rather than the regex form above
  (case- and whitespace-insensitive by construction, and line-by-line
  diffable against ISO-3166 rather than parsed out of an alternation). This
  is a **tightening** of the deny-list (closing gaps, not opening any), so
  gate 6's "loosening requires a superseding ADR" restriction does not apply;
  it is recorded here as a correction to this ADR's own text rather than
  silently diverging from it.
- **Gate 2 re-anchored onto `hci.cases.purpose`**, exactly as gate 2's own
  text instructed once `hci.cases` landed (`ADR-0020`, `migrations/0002_wave1_case_aggregate_up.sql`,
  2026-09-05) — not a second, parallel `purpose` column on
  `tenant_authorizations`. The five named allow-list values are implemented
  verbatim; the ADR's own "..." was not expanded with invented values.
- **Gate 3 (the `H1012` trigger) was not implemented.** Under the as-built,
  Case-anchored design, gates 1 and 2 are plain `CHECK` constraints on
  `hci.tenants` and `hci.cases` respectively. A `CHECK` constraint is
  validated unconditionally on every write to its own table — there is no
  insert path, including one made as the table owner, that bypasses it — so
  there is nothing left for a defense-in-depth trigger on
  `hci.research_workflows` to catch that the `CHECK` constraints have not
  already caught at the moment the referenced tenant/case row was created.
  This claim is not merely argued: `REG-NEG-09` proves the `CHECK` binds even
  an owner-privilege (grant-bypassing) connection, and `REG-NEG-10a`/`10b`
  prove the specific "bulk-insert path" gate 3 was originally written to
  defend against — a `research_workflows` row cannot be admitted against an
  excluded-jurisdiction tenant, because gate 1 already stopped that tenant
  from ever being created. `H1012` remains reserved in the migration's error
  registry comment but is never raised by any trigger.
- **Gate 4 shipped two mutations, not three** (`drop-jurisdiction-check`,
  `drop-purpose-allowlist-check` in `scripts/mutation-check-wave1.ps1`) —
  there is no `H1012` trigger to drop, per the gate 3 disposition above.
- **Actual test IDs**: `REG-NEG-01/02/03` (jurisdiction, as gate 1 named),
  `REG-NEG-04..08` (purpose, as gate 2 named), plus `REG-NEG-09` (gate 2
  owner-bypass proof), `REG-NEG-10a/10b` (gate 1 bulk-insert-path proof),
  `REG-NEG-11/12` (jurisdiction `'UK'` and lowercase `'de'` — added during
  the same review that found the deny-list gap). `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`
  and `governance/ADR_INDEX.md` carry the executed-and-verified evidence
  (84→88 assertions, 26→28 mutations across this ADR's two migration
  revisions, both real-Docker-verified).

## Consequences

- V1 has one machine-checked jurisdiction boundary and one machine-checked purpose boundary; a tenant or authorization cannot silently enter either excluded class through the ordinary write path once gates 1-4 land.
- Any future EU/FCRA-adjacent sales or trust-center claim is false until gate 6 lands; if such a claim surface is ever drafted, it should route through `ADR-0023`'s claims-register/CI-grep pattern rather than a new mechanism.
- `HD-21` (controller/processor role for the researched Person, decided by `ADR-0030`) and `HD-06`/`HD-07` (bitemporal scope, erasure mechanism, decided by `ADR-0017`/`ADR-0018`) are separately decided ADRs, all same batch, all gates still `OPEN`; this ADR narrows *who and what* may be processed at all, it does not answer *how* lawfully-in-scope processing must be handled — those other three ADRs do.
- A later decision to enter either excluded market or use case requires a new HCI change proposal and an explicit superseding ADR, not a schema edit.

## Verification and rollback

- Verification recorded here is documentation-only: the decision and its evidence are cross-linked to `11_SECURITY_PRIVACY_GOVERNANCE.md` §Regulatory Scope and §Employment / HR boundary, `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` `HD-20`, and `governance/ADR_INDEX.md`.
- Checked 2026-09-02 against `D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql`: no `jurisdiction` column exists on `hci.tenants`, no `purpose` column exists on `hci.tenant_authorizations`, and no `H1012` code is registered. All six runtime gates above are open; nothing in this ADR has been implemented.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision. After implementation, rollback (loosening or removing a `CHECK`/trigger to admit a previously excluded jurisdiction or purpose) requires a superseding ADR and a reviewed migration; it must not be done by editing the constraint in place without one.

## Evidence

- `11_SECURITY_PRIVACY_GOVERNANCE.md:76-80,94,102` — Employment/HR boundary, FCRA/AI Act note; the HD-21 and HD-20 blocks at those lines are now ✅ RESOLVED (`ADR-0030`, this ADR respectively), not pending.
- `06_HCI30_PUBLIC_INTELLIGENCE.md:263` — existing Wave 6 purpose-attestation requirement for Continuous Monitoring mode.
- `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:124-127` — HD-20 question, options, and source citations.
- `HCI30_RESEARCH_REVIEW/REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md:15-25,74-92` — REG-01 EU AI Act Article 6(3)/Annex III analysis, Recommended action, Why.
- `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md:76-95` — SEC-01 FCRA gap, Alternatives A/B/C, Requires human decision: YES.
- `HCI_AI_LEGO_Blueprint_v2/governance/wave1/HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY.md` — TenantAuthorization `purpose` field spec; explicit HD-20/HD-21 deferral note.
- `HCI_AI_LEGO_Blueprint_v2/governance/wave1/HCI_WAVE1_DOMAIN_ERD.md:24,32,47` — Case/Engagement's drafting-time conditional status on then-unresolved HD-10 (now decided, `ADR-0020`); jurisdiction-specific decisions HD-06/07/20/21 (now all decided, `ADR-0017`/`0018`/this ADR/`ADR-0030`, gates still open).
- `HCI_AI_LEGO_Blueprint_v2/governance/wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` — existing test-ID and mutation-check pattern this ADR's gates extend.
- `D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql:25-31,71,76-78,101-114` — `H1001`-`H1007` error registry, `hci.tenants`/`hci.tenant_authorizations` current columns, `research_workflows_require_active_authorization` trigger this ADR's gate 3 extends.
- `HCI_AI_LEGO_Blueprint_v2/22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:35,99,131` — Wave 0 open-item note; Wave 6 Continuous-Monitoring purpose gate; Wave 9 blocking precondition this ADR confirms.
- `HCI_AI_LEGO_Blueprint_v2/governance/ADR_INDEX.md:30` — ADR-0012's register row, updated to `ACCEPTED` in the same batch this ADR was filed under.
- `HCI_AI_LEGO_Blueprint_v2/governance/ADR-0009-tenant-organization-model-reconciliation.md`, `ADR-0010`, `ADR-0011`, `ADR-0014`, `ADR-0015`, `ADR-0016` — reviewed; not contradicted by this decision.
- `HCI_AI_LEGO_Blueprint_v2/governance/ADR-0023-block-byok-dedicated-db-sales-claims.md` — same delegated-authority precedent (2026-09-02) and the "prose is not a control" reasoning this ADR reuses.
