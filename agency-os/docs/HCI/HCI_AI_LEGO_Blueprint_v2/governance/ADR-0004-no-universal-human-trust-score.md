# ADR-0004 — No Universal Human Trust Score

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 architecture only; this ADR does not create a production database migration, deploy, or authorize real-person data processing beyond the existing Person-only, synthetic-only state established by ADR-0011/0014/0015/0016.

## Context

`01_SYSTEM_CONSTITUTION.md:130` lists "a single universal human trust score" as one of eight conditions under "Definition of architecture failure" (`01_SYSTEM_CONSTITUTION.md:123-132`). `04_HCI30_PRODUCT_SPEC.md:54` restates this as a product rule — "Never collapse into one universal score." — immediately above seven named Trust Domains (`04_HCI30_PRODUCT_SPEC.md:58-66`: Operational, Competence, Confidentiality, Financial, Strategic, Reputational, Governance/Power). `05_HCI30_INTELLIGENCE_METHODS.md:136` and `:147` independently forbid any method from "directly increase/decrease formal trust scores" or performing "enterprise trust scoring." `ADR_INDEX.md:22` had carried this as `PLANNED`, citing exactly those two files, since the index was created (since updated to `ACCEPTED` in the same batch as this ADR) — until now it had never been written up as a decision record, and unlike ADR-0009/0010/0011 it does not correspond to an `HD-xx` line in the 2026-09-01 Wave 1 decision tranche; it formalizes a principle the constitution already states rather than resolving a tranche gap.

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

## Implementation note (2026-09-05, gates 1-3 landed)

Recorded here rather than by editing the numbered gates above, which remain
the historical decision record.

- **Gate 1** (`scripts/check-no-universal-trust-column.ps1`, wired into
  `test-wave1-local.ps1`): source-level lint, same shape as ADR-0013 gate 5's
  `verify-epistemic-annotation.ps1`. Deliberately not a full SQL parser -
  isolates each `CREATE TABLE`/`ALTER TABLE` statement (start to its next
  `;`, comments stripped first) and scans for `name TYPE-keyword` occurrences
  anywhere in the block, not anchored to line-start, because this schema
  declares several columns per line in its compact `CREATE TABLE` style
  (`subject_records` itself, `0001_wave1_synthetic_up.sql:125-135`). Per-table
  state (has an unconditionally-NOT-NULL `domain` column? which forbidden-
  named columns exist?) is accumulated across every migration file in
  filename order, so a table CREATEd in one migration and given `domain` by
  a LATER migration's `ALTER TABLE` — exactly this ADR's own case — still
  aggregates correctly (though see C1 below for why `subject_records`
  itself must NOT actually win this exemption). Found and fixed one
  self-authored bug before the script ever ran for real: an early version
  double-wrapped the function's return array (`@(Get-...)`) at the call
  sites, which — only when the real result set was legitimately empty —
  produced a phantom one-element result containing an empty nested array
  instead of zero elements; matching the working precedent in
  `verify-epistemic-annotation.ps1` (assign the function's return directly,
  no extra `@()` wrap) fixed it.

  **A second, independent critic review of this script and its two callers**
  (`test-wave1-local.ps1`, `mutation-check-wave1.ps1`) — requested separately
  from the db-expert SQL review below, since a lint script's own regex logic
  is not a database-schema question — found the gate did not actually work
  as shipped, reproducing every bypass against the real script rather than
  arguing from the code:
  - Case-sensitive type matching meant `overall_score NUMERIC` (uppercase)
    matched nothing and passed clean.
  - The forbidden-column scan was gated on the same type-keyword whitelist
    the `domain`-exemption scan uses, so `overall_score decimal(5,2)`,
    `composite_trust double precision`, `universal_trust int`, and
    `trust_score jsonb` all evaded it — none of those types was on the list.
  - The table-name capture did not skip `IF EXISTS`/`ONLY`, so
    `ALTER TABLE IF EXISTS foo ...` captured the literal word `if` as the
    table name — a real form already present in this corpus's own down
    migrations (`0002`/`0003`) — collapsing unrelated tables' exemption
    state into one shared bucket.
  - The self-test's own `compact_table` fixture put `NOT NULL` BEFORE its
    `CHECK(...)`, so a broken paren-depth walk that just stopped at the
    first comma would still see "...NOT NULL CHECK (domain IN ('A'" (which
    still contains the NOT NULL token) and pass — the fixture never
    actually exercised the depth-tracking it claimed to prove, confirmed by
    literally reverting the depth-tracking code and watching the self-test
    stay green.
  - `TRUST-NEG-02` (ADR-0004's own named gate-3 proof) had no mutation
    anywhere in `mutation-check-wave1.ps1` — the one-slot-per-Person shape
    this ADR forbids was never actually installed and shown to turn the
    suite red.

  All fixed: `$colDeclPattern` gained `(?i)`; the forbidden-column scan now
  matches the four names directly as case-insensitive identifiers,
  independent of any type keyword; the table-name regex skips a leading
  `IF (NOT) EXISTS`/`ONLY`; the `compact_table` fixture now puts `NOT NULL`
  after the `CHECK`, and two more fixtures (`uppercase_table`,
  `evading_type_table`) plus an `IF EXISTS`-form fixture pair
  (`if_exists_alpha`/`if_exists_beta`) were added so the self-test's five
  expected violations actually exercise every fixed bug, not just re-assert
  the original two. Independently re-verified beyond the self-test: the
  reviewer's exact seven reproduction cases (uppercase, mixed-case,
  `decimal`, `double precision`, `int`, `jsonb`, and the `IF EXISTS`
  bucket-collapse pair) were re-run against the fixed script from scratch —
  all seven now correctly flagged. A `collapse-trust-domain-to-one-slot`
  mutation was added for `TRUST-NEG-02`, with its expect list taken from an
  actual probe run (not estimated), matching this codebase's own stated
  convention. Real scan against the actual migrations directory, after all
  fixes: zero violations (this migration introduces no forbidden-named
  column).
- **Gates 2-3** (`Projects/internal/hci30/database/migrations/0011_wave1_trust_domain_scope_up.sql`):
  `domain` and a typed evidence self-reference (`evidence_ref_id`/
  `evidence_ref_kind`) added to `hci.subject_records`, both using the same
  scoped/required `CHECK` pair idiom `encryption_key_ref`/`author_class`/
  `claim_state`/`epistemic_label` already use (0007-0010) — never introducing
  a new idiom for a new column. The evidence link reuses the exact composite-
  FK pattern `data_subject_request_targets` already uses to pin a reference's
  kind (`0001_wave1_synthetic_up.sql:180-186`) and `supersedes_id` already
  uses for a same-table self-reference (0005) — a self-referencing FK on
  `hci.subject_records`, not a new mechanism. `(tenant_id, person_id, domain)`
  is enforced by a partial `UNIQUE` index (`WHERE kind='TRUST_DOMAIN'`), not a
  bare `UNIQUE(tenant_id, person_id)` — explicitly the shape the ADR forbids.
  The one pre-existing TRUST_DOMAIN fixture row (`TARGET-KIND-01a`,
  `wave1-negative-tests.sql:137-144`, the only such row in the whole suite)
  was retrofitted with `domain='OPERATIONAL'` and a reference to the
  already-existing tenant-A EVIDENCE row `'...101'`, rather than backfilling
  many rows the way 0007's key-required retrofit did — this schema currently
  has exactly one TRUST_DOMAIN row anywhere.
  Fifteen new assertions: the ADR's own named `TRUST-NEG-01`/`02` (gate 2's
  NULL-domain rejection; gate 3's two-domains-for-one-Person proof, extended
  to a three-domain vector using the retrofitted row plus two new ones) plus
  one assertion per new CHECK/FK/UNIQUE — domain scope/required/enum,
  evidence-ref-id scope/required, evidence-ref-kind scope/required/enum, the
  composite FK's cross-tenant leg (a real tenant-B EVIDENCE row) and typed-pin
  leg (a real tenant-A EVIDENCE row claimed as `evidence_ref_kind='CLAIM'`),
  the partial unique index (a second `OPERATIONAL` row for the same Person),
  and a positive proof that `CLAIM` (not only `EVIDENCE`) is accepted as
  `evidence_ref_kind` — a suite that only ever exercised `EVIDENCE` would not
  actually prove the ADR's own `IN ('EVIDENCE','CLAIM')` text. SQL went green
  first try: **223/223 assertions**, 10 new mutations.

  **db-expert review requested before commit** (unlike several sibling
  migrations that only extend an already-reviewed mechanism, this one
  introduces a self-referencing composite FK and a table-wide lint exemption
  on the ADR's own protected table — new-enough shapes to warrant one) —
  found **1 Critical + 3 Major + 5 Minor/Suggestion**, all fixed before this
  migration ever shipped (it was never applied anywhere, so every fix landed
  in-place, not as a follow-up migration):
  - **C1**: gate 1's lint exempted a table on ANY column literally named
    `domain`, nullable or not. This migration's own `domain` (nullable,
    required only for `kind='TRUST_DOMAIN'` via the scoped-CHECK idiom) then
    exempted `hci.subject_records` from the WHOLE check — `ALTER TABLE
    hci.subject_records ADD COLUMN overall_score numeric;` would have passed
    gate 1 from this migration onward, reproducing the exact failure
    `ADR-0004:17` names, on the very table this ADR protects. Fixed two ways:
    (a) `check-no-universal-trust-column.ps1`'s exemption now requires the
    `domain` column be unconditionally `NOT NULL` — which correctly denies
    the exemption to a shared multi-kind table like `subject_records` while
    still exempting a genuinely domain-dedicated table; (b)
    `TRUST-NO-AGGREGATE-COLUMN-01`, a live `pg_attribute` catalog assertion
    against `hci.subject_records` itself, added as defense-in-depth
    independent of the lint's own text-matching limits.
  - **M1**: this table's only correction mechanism (bitemporal supersession,
    0005, an `AFTER INSERT` trigger) can never fire on a `TRUST_DOMAIN` row —
    `subject_records_trust_domain_unique` is checked before insert and
    rejects the superseding row as a duplicate `(tenant_id, person_id,
    domain)` before the predecessor's `mark_superseded()` ever runs. Fixed by
    making that an explicit, tested Wave 1 exclusion
    (`subject_records_trust_domain_no_supersede`, same pattern 0008 already
    applies to keep `TRUST_DOMAIN` out of `author_class`) rather than a
    silently-unreachable trigger path. Revisit once Wave 5 gives TrustDomain
    an actual value to correct.
  - **M2**: the typed evidence pin keyed only on `(tenant_id, id, kind)` —
    the same tuple `data_subject_request_targets` pins against — which let a
    TrustDomain row for one Person cite evidence about a DIFFERENT Person in
    the same tenant as its backing. Fixed by widening the pin to
    `(tenant_id, person_id, id, kind)` (`subject_records_person_kind_unique`
    + the evidence FK now includes `person_id`), so a TrustDomain's evidence
    must be about the SAME Person, not merely the same tenant.
  - **M3** (class fix, not scoped to this migration): the down-migration
    empty-state guard pattern this file's own `0011_down` copies reads a
    `FORCE ROW LEVEL SECURITY` table (`0001:343-345`). Under a non-superuser
    owner — the real production shape; this test container's owner happens
    to be a superuser, so the gap never surfaced locally — the guard's
    `SELECT` would silently match zero rows instead of erroring, letting a
    down migration destroy populated state with no warning. Fixed by adding
    `SET LOCAL row_security = off;` to `0011_down` AND, since this is a class
    bug not specific to 0011, to `0005`/`0007`/`0008`/`0010`'s down files —
    the same fix 0009 already applied to every `SECURITY DEFINER` function in
    this schema (M4 of that review), here applied to the down-migration `DO`
    blocks that needed it too.
  - **M4**: `TRUST-EVIDENCE-KINDVALUE-01` passed for the wrong reason — it
    claimed `evidence_ref_kind='ASSESSMENT'` while pointing at a REAL
    `EVIDENCE` row, so dropping the enum `CHECK` alone still left the
    composite FK to reject it (`23503`, not the `23514` the assertion
    claims to be testing) — the exact "passes for the wrong reason"
    anti-pattern `wave1-negative-tests.sql` already names for itself. Fixed
    by adding a real tenant-A `ASSESSMENT` fixture row (tenant A previously
    had none alive) and retargeting the test at it, so removing the CHECK
    genuinely lets the FK succeed. Also added `TRUST-EVIDENCE-CHAIN-01`
    (a `TRUST_DOMAIN` row may never chain to another `TRUST_DOMAIN` row as
    its evidence).
  - Minor/Suggestion items also closed: `TRUST-PERSON-CROSSTENANT-01` (N4 —
    every other new typed reference already had a real-other-tenant negative
    test; TrustDomain's own `person_id` leg, via the pre-existing 0001
    `persons` FK, did not) added and kept, but investigated rather than
    given a matching isolated mutation on faith: probing confirmed that
    weakening ONLY the `persons` FK still leaves this exact insert rejected,
    because M2's own widened `subject_records_evidence_ref_fk` requires the
    evidence's Person to match too, and the fixture evidence used
    (tenant-A PERSON-01's row) belongs to neither this test's tenant-B
    Person nor could a same-tenant, same-Person alternative exist without
    also tripping RLS. The assertion documents real, correct, tested
    behavior; it has no dedicated mutation, consistent with roughly a
    quarter of this suite's 229 assertions (positives/setups/already
    doubly-covered cases) that also have none. Also closed: the down
    migration's idempotency guard tightened to check the `domain` column's
    existence first, so a run against a genuinely pre-0011 schema no-ops as
    claimed instead of raising (N3). Two Suggestion-level items (an unused
    referencing-side index; a pre-existing, out-of-scope tenant predicate
    gap in `tombstone_evidence()` from 0007) were left as tracked
    observations, not fixed here — see `TASKS.md`.

  Final tally after all fixes (both the SQL review above and the script
  review above it), re-verified with Docker runs from scratch each time:
  **229/229 assertions**, **115/115 mutations killed** (0 vacuous/weak) —
  see `HCI_WAVE1_NEGATIVE_TEST_SPEC.md` for the run narrative. Every new
  constraint (including the ones the reviews added) reuses an
  already-reviewed idiom rather than inventing one.

## Implementation note (2026-09-06, gates 4-5 landed)

Gates 4-5 are **enforcement infrastructure landing ahead of the Wave 5
deliverable they gate**, not the Intelligence-math roll-up work (P0-04)
itself — the same sequencing gates 1-3 already used against the schema
(`hci.subject_records` had no `domain` column when gates 1-3 landed;
neither a trust-read endpoint nor a method catalog exists yet for gates
4-5). This ADR still does not resolve P0-04's 14-dimension-to-7-domain
roll-up formula; a math team must still define that.

- **Gate 4** (`TRUST-NEG-03`): new
  `Projects/internal/hci30/packages/contracts/validate-trust-domain-response.mjs`
  — same ESM-module-plus-`node --test` pattern as the existing
  `validate-request.mjs` (ADR-0010 gate, request-validation layer). Validates
  a Person-trust read response is shaped `{ domains: [{domain, value,
  evidence_refs}] }`; rejects a bare top-level field matching
  `overall_score|composite_trust|aggregate_trust|universal_trust|trust_score`
  (gate 1's own SQL-column list) **plus `overall_trust`**, which this gate's
  own text (item 4 above) names but the SQL-column list never had reason to
  include — a real discrepancy between the Decision section's five names and
  this gate's own wording, caught by the validator's own self-test failing
  on the first run (`overall_trust` initially passed as an "unknown
  property" instead of a named `TRUST-NEG-03` rejection).
- **Gate 5** (`METHOD-CONTRACT-NEG-01`): new
  `validate-method-contract.mjs`. Validates a method-catalog entry against
  the 12 Method Contract fields (`05_HCI30_INTELLIGENCE_METHODS.md:151-167`,
  including the independently-required `inference_mode` at `:169`); if
  `outputs.domains` names more than one Trust Domain, `decision_weight` must
  be an object keyed exactly to those domains, not a scalar.
- Both gates share one forbidden-name constant and the domain enum
  (`packages/contracts/trust-domains.mjs`) rather than each keeping its own
  copy — `TRUST_DOMAINS` is a verbatim copy of migration 0011's `CHECK
  (domain IN (...))` list, now held in sync by a dedicated Node test
  (`tests/unit/contracts/trust-domains.test.mjs`) that reads the migration
  file's actual constraint text rather than trusting the comment.
- Wired into `test-wave1-local.ps1` alongside the existing Node-level,
  Docker-free checks (request-policy validator, peer-boundary, epistemic
  annotation, gate 1 lint) — these two gates need no database, so they run
  regardless of Docker availability, same reasoning as ARCH-PEER-01.

**Independent critic review** (same rationale as gate 1's own script review:
new JS validation logic, not a database-schema question) found **0
Critical, 2 Major, 3 Minor**, all fixed before commit — the reviewer ran an
actual 40-mutation sweep against scratch copies with `node --test` rather
than reasoning from the code alone, the same non-vacuity method this ADR's
own gate-1/gate-3 history already established:
- **M1**: gate 5's `outputs` field had no key whitelist and no
  forbidden-name check at all — a method could declare
  `outputs.overall_score` (a more direct Decision-bullet-3 violation than
  the scalar `decision_weight` the gate does catch) and pass. Fixed by
  whitelisting `outputs` to `{domains}` and running the shared
  forbidden-name check over its keys.
- **M2**: `trust-domains.mjs`'s "keep in sync" comment was unenforced —
  reviewer mutations adding an 8th domain, deleting one, and renaming one
  all left the 28-test suite green (only `OPERATIONAL`/`FINANCIAL` were
  ever exercised). Fixed by the `trust-domains.test.mjs` migration-text
  cross-check above.
- **M3/M4**: 19 of the two new test files' checks were vacuous by mutation
  (self-test asserted the right error existed via a *different* code path
  than the one actually being tested) — most notably the domain-entry
  unknown-key whitelist (gate 4) and the per-domain-weight finite-number
  check inside the `domains.length > 1` branch (gate 5, i.e. inside
  METHOD-CONTRACT-NEG-01's own guard). Fixed by adding one test per
  previously-unproven branch (27 new tests total across both files: 50
  assertions now pass, up from 28).
- **m1**: a `Number`-boxed `decision_weight` carrying the domain keys as own
  properties (`Object.assign(new Number(0.5), {FINANCIAL, OPERATIONAL})`)
  passed every check and serialized back to a bare scalar — the exact shape
  the gate exists to stop. Fixed by requiring a plain object
  (`Object.getPrototypeOf(weight) === Object.prototype`), not merely
  `typeof === 'object'`.
- **m2**: the `TRUST-NEG-03` rejection was key-order dependent — a response
  combining an unrelated unknown key with `overall_trust` reported the
  unrelated key first, misrouting a CI failure away from the named gate.
  Fixed by running the forbidden-name scan over all keys before the
  whitelist loop.
- Two Minor/tracked items not fixed here (see `TASKS.md`): the negative-test
  spec registration for these two gate ids (documentation-only, closed
  below in the same commit) and the pre-existing gap that
  `mutation-check-wave1.ps1` covers zero Node-level tests (predates this
  work — `CONSENT-NEG-01` has the same gap — non-vacuity here instead comes
  from each test file's own accept/reject pairs, per the established Node-gate
  convention).

Final tally, re-verified end-to-end via `test-wave1-local.ps1` (Docker
available on this machine): **50/50 Node assertions** across the four
contract-test files, full 11-migration SQL suite green, reversibility
intact. Gates 4-5 do not depend on and do not implement the Wave 5 roll-up
formula (P0-04); they exist so the first real trust-read endpoint and the
first real method-catalog entry cannot introduce the forbidden shape
unnoticed, exactly as the "Required implementation gates" section above
specifies.

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
