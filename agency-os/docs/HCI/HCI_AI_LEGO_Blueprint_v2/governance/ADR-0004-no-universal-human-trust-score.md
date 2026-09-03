# ADR-0004 — No Universal Human Trust Score

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 architecture only; this ADR does not create a production database migration, deploy, or authorize real-person data processing beyond the existing Person-only, synthetic-only state established by ADR-0011/0014/0015/0016.

## Context

`01_SYSTEM_CONSTITUTION.md:130` lists "a single universal human trust score" as one of eight conditions under "Definition of architecture failure" (`01_SYSTEM_CONSTITUTION.md:123-132`). `04_HCI30_PRODUCT_SPEC.md:54` restates this as a product rule — "Never collapse into one universal score." — immediately above seven named Trust Domains (`04_HCI30_PRODUCT_SPEC.md:58-66`: Operational, Competence, Confidentiality, Financial, Strategic, Reputational, Governance/Power). `05_HCI30_INTELLIGENCE_METHODS.md:136` and `:147` independently forbid any method from "directly increase/decrease formal trust scores" or performing "enterprise trust scoring." `ADR_INDEX.md:22` has carried this as `PLANNED`, citing exactly those two files, since the index was created — it has never been written up as a decision record, and unlike ADR-0009/0010/0011 it does not correspond to an `HD-xx` line in the 2026-09-01 Wave 1 decision tranche; it formalizes a principle the constitution already states rather than resolving a tranche gap.

The principle is not yet a control. `01_SYSTEM_CONSTITUTION.md:113-117` (Invariant 8) states directly that a "must" without a corresponding CI-blocking test, DB constraint, or policy gate is "a documented intention, not a guarantee." Two facts make this ADR non-hypothetical:

1. `04_HCI30_PRODUCT_SPEC.md:87` flags an open **SPEC GAP** (not yet a 🔴 decision): the 14 granular analysis dimensions (`04_HCI30_PRODUCT_SPEC.md:70-85`) and the 7 coarse Trust Domains are not stated as the same axis system, and no roll-up formula from one to the other exists yet. That formula is filed under `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04 and is due "before Wave 5 (Intelligence math v1)" — i.e., an implementer will be asked to invent an aggregation formula with no standing rule blocking them from aggregating *across* domains into one number.
2. The schema surface already exists to receive that formula. `governance/wave1/HCI_WAVE1_DOMAIN_ERD.md:14-17` lists `TrustDomain` as one of four Person-scoped subject kinds, and the corresponding synthetic migration already implements it as `hci.subject_records` with `kind IN ('EVIDENCE','CLAIM','ASSESSMENT','TRUST_DOMAIN')` (`D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql:116-126`). That table currently carries no `domain` column and no score/value column at all — it is a bare subject-linkage stub. The schema is silent on the exact question this ADR answers, at the exact layer where the answer must be enforced before Wave 5 adds real columns.

Without a recorded decision and named gates, the two facts above compose into the specific failure Invariant 8 warns about: a math team closing P0-04 could add one `overall_score` column to the `TRUST_DOMAIN`-kind rows, ship it, and no existing test or constraint would catch it — reproducing the exact architecture failure `01_SYSTEM_CONSTITUTION.md:130` already named as unacceptable.

## Decision

Adopt: **TrustDomain data is always domain-scoped and evidence-linked; HCI never computes, stores, transmits, or displays a single scalar "overall trust" value for a Person, in any schema, API response, report, or UI surface.**

Concretely:
- A `TrustDomain` record's identity key is `(tenant_id, person_id, domain)`, not `(tenant_id, person_id)`. `domain` is a required, non-null enum restricted to the seven names in `04_HCI30_PRODUCT_SPEC.md:59-65` (`OPERATIONAL`, `COMPETENCE`, `CONFIDENTIALITY`, `FINANCIAL`, `STRATEGIC`, `REPUTATIONAL`, `GOVERNANCE_POWER`). A Person may have up to seven `TrustDomain` rows and must never be structurally limited to one.
- Every `TrustDomain` row must be evidence-linked: it references at least one `hci.subject_records` row of `kind IN ('EVIDENCE','CLAIM')` via the same typed-FK pattern already used for `data_subject_request_targets` (`0001_wave1_synthetic_up.sql:171-178`). A domain value with no evidence reference is invalid, not merely undocumented.
- No table, view, materialized aggregate, API response field, or UI component may carry a name or semantic equivalent to `overall_score` / `composite_trust` / `aggregate_trust` / `universal_trust` / a bare `trust_score` computed across more than one `domain`. A read path may return the full per-domain vector; it may never reduce that vector to one number as a default or fallback behavior.
- Any future cross-domain summary (e.g., "which domain is weakest") must render as a labeled comparison across the named domains, never as a single derived score standing in for the Person.

**Why the alternatives lose:**

- **Compute a weighted-average overall score for dashboard convenience.** Loses on three independent grounds: it directly reproduces the architecture-failure condition named at `01_SYSTEM_CONSTITUTION.md:130`; the weighting itself would be an unreviewed value judgment invented to close P0-04, which is exactly the "AI may not ... infer [a scoring policy] for decision scoring" boundary Invariant 2 draws (`01_SYSTEM_CONSTITUTION.md:50-55`); and once a "Person X = 62/100 trust" fact is stored, Invariant 6 (historical truth is immutable) means it cannot simply be deleted later if the aggregation method turns out to be wrong — it becomes permanent reputational surface for a stakeholder who, per Invariant 9 (`01_SYSTEM_CONSTITUTION.md:119-121`), did not consent to being scored and may never know the number exists.
- **Ship the aggregate as an internal-only or feature-flagged field.** Loses because Invariant 8 is explicit that an unenforced principle is not a control regardless of who can see the field — a hidden aggregate is still queryable, still exportable, and still available to be silently surfaced by a later feature with no new review, because no gate below would catch it.
- **Chosen option — forbid the shape at the schema and contract layer, keep domains vector-only.** Wins because it makes the forbidden state structurally unrepresentable (no single-row-per-person slot exists to put a score in) rather than relying on a reviewer noticing a bad PR, consistent with Invariant 8's "CI-blocking test, DB-level constraint, or policy-engine gate" standard.

This ADR does not resolve the P0-04 roll-up-formula gap itself; a math team must still define how the 14 dimensions map onto the 7 domains (14-to-7, within-domain). It resolves only the narrower and higher-stakes question of whether the 7 domains may ever be further reduced to 1 — they may not.

## Required implementation gates

TrustDomain has no real columns yet (§Context, fact 2); these gates sequence enforcement so the prohibition lands before, not after, the columns that could violate it.

1. **Wave 1 — schema-name lint, CI-blocking.** New script `scripts/check-no-universal-trust-column.ps1` (does not yet exist) scans every file under `Projects/internal/hci30/database/migrations/*.sql` and fails the run if it finds a column matching `overall_score|composite_trust|aggregate_trust|universal_trust|^trust_score$` on any table unless that table also carries a non-null `domain` column. Wired into `Projects/internal/hci30/scripts/test-wave1-local.ps1` alongside the existing 51-assertion suite (`governance/wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md:46-48`).
2. **Wave 1 ERD extension, before `TRUST_DOMAIN` rows carry a value.** `governance/wave1/HCI_WAVE1_DOMAIN_ERD.md` gains a `domain` column requirement on the `TrustDomain` row (`HCI_WAVE1_DOMAIN_ERD.md:17`) restricted to the seven `04_HCI30_PRODUCT_SPEC.md:59-65` names, plus `UNIQUE (tenant_id, person_id, domain)` — explicitly never `UNIQUE (tenant_id, person_id)` alone, which would force exactly one slot per Person. Test id `TRUST-NEG-01` (new, added to `HCI_WAVE1_NEGATIVE_TEST_SPEC.md`): inserting a `kind='TRUST_DOMAIN'` row with `domain` null is rejected.
3. **Wave 1, same migration.** Test id `TRUST-NEG-02` (new): two `kind='TRUST_DOMAIN'` rows for the same `(tenant_id, person_id)` with two different `domain` values both persist successfully — proving the schema is structurally capable of holding the full vector, not merely one slot that happens to be unfilled.
4. **Wave 5 (Intelligence math v1 — the P0-04 roll-up work named at `04_HCI30_PRODUCT_SPEC.md:87`).** Contract test `TRUST-NEG-03` (new, in `packages/contracts/`, same pattern as `Projects/internal/hci30/packages/contracts/validate-request.mjs`): any Person-trust read response is validated against a schema requiring a `domains: []` array of `{domain, value, evidence_refs}` entries; a response carrying a bare top-level numeric `trust_score` or `overall_trust` field fails validation. CI-blocking before any trust-read endpoint ships.
5. **Wave 5.** Method-catalog registry check `METHOD-CONTRACT-NEG-01` (new): for every method declaring the Method Contract fields at `05_HCI30_INTELLIGENCE_METHODS.md:151-167`, if `outputs` touches more than one `domain`, `decision_weight` must be expressed per-domain, not as a single scalar; a method definition with a cross-domain scalar `decision_weight` fails registry validation and cannot be loaded.

Gates 1–3 are schema-adjacent and can land alongside the existing Wave 1 synthetic skeleton without waiting on P0-04. Gates 4–5 gate the specific Wave 5 deliverable that would otherwise be the first place a universal score could be introduced.

## Consequences

- `hci.subject_records` (or its successor `TrustDomain` table) can never validly hold a single per-Person trust value; every read path returns a vector or a named subset of it.
- The P0-04 roll-up-formula work is now scoped: it may define a 14-dimension-to-7-domain mapping, and it may not define a 7-domain-to-1 reduction. A future team proposing the latter must supersede this ADR, not extend the P0-04 deliverable quietly.
- This ADR does **not** authorize Organization-as-Subject trust scoring (still blocked by ADR-0011 until a superseding ADR), does not authorize processing real, non-synthetic person data (still blocked by the "NOT production-authorized" status on ADR-0014/0015/0016), does not authorize a production database migration or deploy, and makes no legal or regulatory compliance claim.
- Sun Tzu and other classical-strategy or self-reflection methods (`05_HCI30_INTELLIGENCE_METHODS.md:130-147`) remain independently forbidden from touching formal trust scores at all; this ADR does not loosen that — it applies the same "never one number" rule to every domain-analysis method, not only the classical-lens ones already named.

## Verification and rollback

- Verification recorded here is documentation-only: this decision is cross-linked to `01_SYSTEM_CONSTITUTION.md`, `04_HCI30_PRODUCT_SPEC.md`, `05_HCI30_INTELLIGENCE_METHODS.md`, and `governance/ADR_INDEX.md`.
- None of the five gates above are implemented yet. `hci.subject_records` today has no `domain` column and no score column of any kind (`0001_wave1_synthetic_up.sql:116-126`), so the forbidden state is currently unreachable by omission, not by an enforced gate — closing gates 1–3 converts that from an accident of an unfinished schema into an actual control.
- Before implementation: rollback is to supersede this ADR with a new explicit human decision (the operator retains override authority per the delegation stated above).
- After implementation: rollback must not delete or reinterpret existing per-domain rows; a change that reintroduces a cross-domain aggregate requires a superseding ADR plus a reviewed migration, consistent with Invariant 6 (historical truth is immutable).

## Evidence

- `01_SYSTEM_CONSTITUTION.md:113-132` — Invariant 8 (unenforced principle is not a control) and "Definition of architecture failure" naming "a single universal human trust score."
- `04_HCI30_PRODUCT_SPEC.md:52-87` — "Never collapse into one universal score," the seven named Trust Domains, the 14 analysis dimensions, and the P0-04 SPEC GAP (roll-up formula, due before Wave 5).
- `05_HCI30_INTELLIGENCE_METHODS.md:130-167` — per-method trust-score prohibitions and the Method Contract field set.
- `governance/ADR_INDEX.md:22` — this ADR's `PLANNED` entry prior to this record.
- `governance/wave1/HCI_WAVE1_DOMAIN_ERD.md:8-19` — current `TrustDomain` stub definition (Person-scoped, no domain/score columns yet).
- `governance/wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md:1-63` — existing negative-test pattern and execution/mutation-check discipline these new tests must follow.
- `D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql:116-178` — current `hci.subject_records` schema and the typed-FK reference pattern the evidence-link requirement reuses.
- `D:\Work\Projects\internal\hci30\packages\contracts\validate-request.mjs` — existing contract-validation pattern gate 4 extends.
- `governance/ADR-0009-tenant-organization-model-reconciliation.md`, `ADR-0010-consent-entity-scope.md`, `ADR-0011-hci-subject-type-scope.md`, `ADR-0014-data-subject-rights-channel.md`, `ADR-0015-restricted-subject-identity-confirmation.md`, `ADR-0016-mandatory-tenant-rls.md` — reviewed for contradiction; none found. This ADR builds on the Person-only `TrustDomain` stub ADR-0011 already reserved and does not alter tenancy (ADR-0009), consent (ADR-0010), DSR (ADR-0014), identity confirmation (ADR-0015), or RLS (ADR-0016) semantics.
