# ADR-0019 — Deterministic / Probabilistic / LLM-Assisted / Human-Only Field Policy

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 architecture only; ratifies the field/transition author-class enumeration and requires its runtime enforcement design — this ADR does not itself implement a schema, migration, or production behavior, and does not authorize real-person data processing.

## Context

`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:101-118` carried an unresolved `🔴 DECISION PENDING (HD-08)` block at drafting time (this ADR resolves it, and that section is now ✅ RESOLVED with a direct citation back here): without an explicit, ratified, field-by-field policy, individual implementers will each make ad hoc calls about which fields an LLM may set directly — "exactly what `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md`'s own closing line warns against" (quoted at `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:101`). `22_OPEN_HUMAN_DECISIONS.md:59-64` (HD-08) records the same open question and recommends adopting Reviewer E's enumeration while reusing AI LEGO's existing A0-A4/R0-R4 gating machinery rather than inventing a parallel one.

`09_AI_INTELLIGENCE_REVIEW.md:171-190` (finding C5) documents that no field-level classification exists anywhere in the 24 V1 blueprint documents — only general principles (`01_SYSTEM_CONSTITUTION.md` Invariant 2, `11_SECURITY_PRIVACY_GOVERNANCE.md`'s employment boundary) — and rates this High confidence, `requires_human_decision: YES`.

`12_RED_TEAM_FAILURE_ANALYSIS.md:267-286` (RT-09) identifies a specific compounding failure this policy must close: a hallucinated claim generated during a nominally-LOW-risk request can enter the evidence base unreviewed, because only newly-added evidence is checked against a case's *current* risk tier, not the tier its accumulated evidence eventually supports. `12_RED_TEAM_FAILURE_ANALYSIS.md:494` and the cross-check synthesis at `12_RED_TEAM_FAILURE_ANALYSIS.md:513-520` confirm zero of the three independent B/C/D reviews — including the Security/Privacy reviewer, whose KEEP list was empty — proposed any mechanism that mitigates RT-09; it "stands unmitigated" against the strongest available cross-check.

AI LEGO already has an ACCEPTED, machine-readable R0-R4 risk-tier ladder (`specs/execution/risk-tier.schema.yaml`, `decided_by: docs/adr/ADR-004-...`, `status: ACTIVE`) whose R3/R4 tiers already `triggers_mandatory_gates: true` against `policies/ai-execution/mandatory-gates.yaml#/grounded_rules`. `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:97` independently states that inventing a second, competing risk ladder at this integration boundary is the "contract vacuum" pattern AI LEGO's own cross-review already flags as a top risk category (filename/ID/label drift breaking replay).

## Decision

**RATIFY**, verbatim, the field/transition author-class enumeration published at `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:103-116`:

```text
MUST be deterministic:       identity MATCH_CONFIRMED for RESTRICTED subjects (see 06),
                              evidence admission-state transitions, retention/deletion
                              enforcement, protected-attribute filtering, all locked-
                              record writes
MAY be probabilistic:        source-quality grading, confidence scores (kept separate
                              per 19)
MAY be LLM-assisted +
  human-review flag:         synthesis, hypothesis generation, AI LEGO cognitive-
                              method outputs
MUST NEVER be LLM alone:     final PROCEED/PAUSE/EXIT decision, any employment-adjacent
                              output, UNKNOWN/HYPOTHESIS -> SOURCE_FACT promotion, any
                              locked-record write
```

**Additionally**, per the "Additional gate requirement (new in V2)" at `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:99` and RT-09's recommendation (`12_RED_TEAM_FAILURE_ANALYSIS.md:279`): every AI-generated claim requires a human spot-check before it may be admitted as an Assessment Candidate, **regardless of the case's current risk tier** (including R0); and any LOW-tier-cleared claim already admitted must be re-audited when its case's risk tier is later elevated.

**Mechanism**: this policy is a machine-readable table of `field_id/transition -> allowed_author_class`, keyed against AI LEGO's existing R0-R4 tier condition (`risk-tier.schema.yaml#/mandatory_gate_injection_trigger`), not a new parallel gate engine — enforced by a DB trigger or equivalent application policy check, with one test per policy row.

Alternatives rejected:
- **Invent an HCI-only gating vocabulary** instead of reusing AI LEGO's R0-R4/`mandatory-gates.yaml` — rejected because it recreates the exact two-ladder "contract vacuum" AI LEGO's own cross-review already flags as a top drift risk at this boundary (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:97`); reuse is cheaper and already ACCEPTED (ADR-004, `risk-tier.schema.yaml`).
- **Leave the policy as prose only** (the V1 status quo) — rejected because it is the specific failure `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md`'s own closing line and C5 (`09_AI_INTELLIGENCE_REVIEW.md:177`) warn against: each implementer guesses, producing inconsistent safety behavior across modules built at different times.
- **Review admission only at the case's current risk tier** (i.e., skip the human-spot-check-at-admission requirement) — rejected because this is exactly the RT-09 compounding-hallucination failure mode, independently uncontradicted by all three cross-check reviewers (`12_RED_TEAM_FAILURE_ANALYSIS.md:513-520`).

This ratification does not authorize real-person data processing, production deployment, or treating any field not explicitly enumerated below as pre-classified — an unenumerated field defaults to `HUMAN_ONLY` until this ADR is amended by a superseding change proposal (`HCI_CHANGE_PROPOSAL_TEMPLATE.md`), not silently assigned by an implementer.

## Required implementation gates

Runtime implementation gates are **OPEN**. Before Wave 1 schema freeze or any restricted-subject processing, all of the following must be implemented and reviewed:

1. A machine-readable policy artifact `wave1/HCI_FIELD_AUTHOR_CLASS_POLICY.md` (a table: `field_id | transition | allowed_author_class | rationale`) enumerating at minimum every item named in the Decision block above, each mapped to exactly one `author_class` enum value — `DETERMINISTIC`, `PROBABILISTIC`, `LLM_ASSISTED_HUMAN_REVIEW_REQUIRED`, `HUMAN_ONLY` — and cross-referencing AI LEGO's `risk-tier.schema.yaml#/mandatory_gate_injection_trigger` as the shared tier condition rather than redefining one. The `identity MATCH_CONFIRMED` row must point to ADR-0015's existing synthetic verification-record mechanism, not re-specify it.
2. An `author_class` `NOT NULL` column with a `CHECK` constraint on the Evidence, Claim, Assessment, and Decision tables (the four insert-only tables already committed to `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:130`'s `BEFORE UPDATE/DELETE`-trigger immutability pattern), plus a `BEFORE INSERT` trigger `enforce_field_author_class()` that rejects any write whose recorded `author_class` does not match gate 1's policy-table lookup for that `field_id`/transition.
3. An `assessment_candidate_admission` gate: a `NOT NULL human_spotcheck_status` column (`PENDING|APPROVED|REJECTED`) on Claim, with a trigger blocking any transition to `ASSESSMENT_CANDIDATE` state unless `human_spotcheck_status = 'APPROVED'` — evaluated independent of the linked Case's `risk_tier` value. Required negative test `NEG-HD08-01`: admitting an `R0`-tier Claim with `human_spotcheck_status = 'PENDING'` must be rejected by the database, not only by application code.
4. A `risk_tier` elevation re-audit gate on Case: a trigger that, on any `risk_tier` update to a higher tier, sets `reaudit_required = true` on every linked Claim admitted under the prior tier without a spot-check meeting the new tier's `mandatory-gates.yaml` rule set, and a Decision-table constraint that rejects recording a `PROCEED`/`PROCEED_WITH_CONTROLS`/`EXIT` decision (`04_HCI30_PRODUCT_SPEC.md:123-124`) while any linked Claim carries `reaudit_required = true`. Required negative test `NEG-HD08-02`: recording a Decision while a flagged Claim is unresolved must be rejected.
5. Negative tests proving the `MUST NEVER be LLM alone` bucket cannot be satisfied by an LLM acting alone: `NEG-HD08-03` — a Decision row requires a human principal reference and is rejected without one; `NEG-HD08-04` — an `UNKNOWN`/`HYPOTHESIS` → `SOURCE_FACT` epistemic-label promotion is rejected unless it carries a human verifier reference, reusing `epistemic-label.schema.yaml:37-63`'s already-schema-validated `promotion_redline` (forbids `UNKNOWN -> SOURCE_FACT` direct promotion) documented at `09_AI_INTELLIGENCE_REVIEW.md:64,94` rather than building a new one.

All five land at **Wave 1** (schema freeze), alongside ADR-0009/0010/0011/0015/0016's own open gates, on the same synthetic-first path ADR-0014/0015/0016 already used (`D:\Work\Projects\internal\hci30\database\`) before any non-synthetic data is admitted.

## Implementation note (2026-09-05, all Wave 1 gates landed - gates 2, 3, 4, and both halves of gate 5)

Recorded here rather than editing the numbered gates above, which remain the
historical decision record.

**Migration number.** The real migration is
`0008_wave1_field_author_class_policy_up.sql`, extending 0001-0007.

**Three new concepts, none backfilled from an existing blueprint spec.**
Gates 3, 4, and 5 (human-principal half) each assume a concept absent from
the v2 blueprint prior to this ADR - confirmed by a targeted search before
writing any code: a Claim state machine with an `ASSESSMENT_CANDIDATE` value
(gate 3), a Decision-to-Claim linking relationship (gate 4), and a
human-user/analyst entity (gate 5). What was built is the smallest shape
each gate's own text actually requires - `claim_state`/`human_spotcheck_status`
on `hci.subject_records`, `hci.decision_claims` (a plain tenant-scoped
junction table), `hci.principals` (`id, tenant_id, display_name`, full CRUD
unlike this schema's append-only tables) - each flagged in
`wave1/HCI_FIELD_AUTHOR_CLASS_POLICY.md` as provisional, open to being
superseded once a future ADR specifies these concepts in full.

**Gate 5's epistemic-label half (`NEG-HD08-04`, `UNKNOWN`/`HYPOTHESIS` ->
`SOURCE_FACT` promotion redline) is explicitly NOT built.** Unlike the three
concepts above, an epistemic-label lifecycle is broad and referenced by other
not-yet-read chapters of this blueprint; a narrow version now risks a shape
that has to be torn out later. Left honestly OPEN rather than built shallow.

**Gates 2-4, 5(human-principal) - DONE**, real-Docker-verified:
`test-wave1-local.ps1` green at **176/176** assertions,
`mutation-check-wave1.ps1` green at **78/78** mutations killed, on both the
forward path and the narrow-rollback path (`0008_down`, run manually twice -
once alone against a populated 0001-0008 schema, once followed by a clean
re-application of `0008_up` - the harness's own reversibility pass only
exercises the whole-schema `0001_down`).

**db-expert review requested and acted on** - unlike the "reuse a proven
pattern" gates elsewhere in this Wave (which skip review by this session's
own established criterion), this migration introduces three genuinely new
schema concepts, so a full review was warranted and run. It found three
Critical and five Major findings, all fixed in this same migration before
merge:

- **C1** - gate 3's `claim_state`/`human_spotcheck_status` state machine had
  no downstream consumer: a `DRAFT`, never-spot-checked Claim could be linked
  to a Decision without ever passing gate 3's own admission check. Fixed by
  making `hci.enforce_decision_reaudit_gate()` require
  `claim_state='ASSESSMENT_CANDIDATE' AND human_spotcheck_status='APPROVED'`
  before any link is admitted (`H1016`, new).
- **C2** - `reaudit_required` reset to `false` on an ordinary correcting
  INSERT (`supersedes_id` pointing at an already-flagged Claim), defeating
  gate 4 with two ordinary app-role statements. Fixed in
  `hci.enforce_claim_state_admission()`: a superseding row now inherits its
  predecessor's `reaudit_required` instead of defaulting `false`.
- **C3** - the elevate-then-link ordering was guarded (`NEG-HD08-02`); the
  reverse, link-then-elevate ordering was not, in either the sequential or
  concurrent case. Fixed with two changes: `hci.flag_claims_on_risk_elevation()`
  now rejects (`H1017`, new) a `risk_tier` elevation that would retroactively
  flag a Claim already linked to a `PROCEED`/`PROCEED_WITH_CONTROLS`/`EXIT`
  Decision (an append-only link cannot be withdrawn, so the elevation itself
  is the only thing that can still be stopped); and
  `hci.enforce_decision_reaudit_gate()` now takes `SELECT ... FOR SHARE` on
  the Claim row so the two triggers cannot both read a stale value under
  concurrency.
- **M1** - `flag_claims_on_risk_elevation()`'s hardcoded tier-rank array
  failed open (silently flagged nothing) on an unrecognized `risk_tier`
  value. Fixed to `RAISE` (`H1018`, new - reserved/unraisable today, same
  disposition as `H1012`, since `hci.cases.risk_tier`'s own CHECK currently
  admits only R0-R4).
- **M2** - `hci.decision_claims`'s INSERT grant was table-level, making
  `created_at` the one append-only ledger timestamp in this schema the
  audited party could choose. Narrowed to a column list excluding it.
- **M3** - the risk-tier cascade could retroactively flag an already-
  superseded or tombstoned Claim, a closed ledger entry under ADR-0017's
  bitemporal design. Fixed by excluding `system_superseded_at IS NOT NULL`/
  `tombstoned_at IS NOT NULL` rows from the cascade's UPDATE.
- **M5** - the down-migration's guard was wrong in both directions: too
  narrow (`reaudit_required IS TRUE` only, missing the general case of any
  EVIDENCE/CLAIM/ASSESSMENT row with real data in the dropped columns, which
  the narrower check would have let be silently destroyed and left the
  schema unable to re-apply `0008` up) and its stated reason was factually
  wrong (`DROP COLUMN` does not "orphan" a row, it destroys the value
  outright). Fixed to check `hci.subject_records WHERE kind <> 'TRUST_DOMAIN'`
  generally, with a corrected message.
- **Self-inflicted regression found while fixing C3, fixed in the same
  pass**: adding `FOR SHARE` made `hci.enforce_decision_reaudit_gate()`
  require UPDATE privilege on `hci.subject_records`, which the application
  role never has (append-only by design) - every real app-role link attempt
  would have 42501'd, and nothing in the suite caught it because every
  existing decision_claims test ran under the owner role (a superuser,
  which bypasses the privilege check). Fixed by making the function
  `SECURITY DEFINER` (matching `flag_claims_on_risk_elevation()`'s own
  posture), and closed the coverage gap that hid it with a genuine app-role
  positive test (`DECISION-CLAIMS-INSERT-01`) plus a regression-guard
  mutation (`regress-decision-reaudit-gate-to-invoker`).

**Hardening pass, migration `0009_wave1_adr0019_hardening_up.sql` (same
day).** The review's remaining Major/minor/suggestion findings were first
tracked in `TASKS.md`, then closed in their own migration rather than by
amending the already-pushed 0008 (this schema's convention: shipped
migrations are immutable, follow-ups get a new number):

- **M7** - `human_spotcheck_status='APPROVED'` was a self-asserted string.
  New `spotcheck_principal_id` on `hci.subject_records`, tenant-composite FK
  to `hci.principals`, required whenever the status is `APPROVED`, forbidden
  on non-CLAIM rows - the same shape as `hci.decisions.principal_id`. Six
  existing `APPROVED` rows retrofitted.
- **M6** - the four `_current` views and `_as_of()` functions had picked up
  neither ADR-0018's `encryption_key_ref`/`tombstoned_at` nor this ADR's
  columns; both migrations' worth of parity closed at once. Real execution
  found that the reverse direction cannot use `CREATE OR REPLACE VIEW`
  (PostgreSQL never lets it remove a column, `42P16`) - the down path drops
  and recreates the views and re-issues their SELECT grant.
- **M4** - every SECURITY DEFINER function in `hci` (all five, not only the
  two the review named) now carries `row_security = off` as function
  config: under FORCE ROW LEVEL SECURITY with a non-superuser owner a
  definer's lookup would otherwise resolve `hci.current_tenant_id()` to
  NULL and silently match zero rows (fail-open); with the parameter set it
  raises instead (fail-closed). A no-op under today's superuser test owner.
  Asserted generically over `pg_proc` (`DEFINER-RLS-FAILCLOSED-01`), no
  hardcoded list. The zero-row case in the cascade is deliberately not a
  `ROW_COUNT` error - once the RLS-silent path errors, zero rows can only
  mean "no Claims".
- **M8** - cross-tenant and typed-pin tests for both composite FKs 0008
  built, plus mutations weakening each to single-column. Real execution
  corrected the design: for a cross-tenant or non-CLAIM `claim_id` the
  BEFORE INSERT gate trigger rejects (`H1016`) before the FK is ever
  evaluated, so the claim-side FK is defense in depth behind the trigger
  and is proven owner-run with the trigger stripped (`-FK` pair), while
  the app-role `-GATE` pair proves the outer layer.
- **m2** - direct assertions and mutations for 0008's six paired CHECK
  constraints; **m4** - `PRINCIPAL-DELETE-RI-01` proves the FK's NO ACTION
  barrier (whose mutation had to drop *both* FKs into `principals`, since
  M7 added a second one - the same two-independent-FKs coupling already
  documented for `subject_records`); **suggestions** - `search_path`
  pinned on the eleven remaining functions (asserted generically,
  `FUNCTION-SEARCHPATH-01`) and RI-lookup indexes for both principals FKs.
- Harness lesson worth keeping: `CREATE OR REPLACE FUNCTION` replaces a
  function's config wholesale, so body-rewriting mutations now re-pin
  `search_path` and (definers only - on an invoker fired by the app role,
  `row_security=off` turns the role's own filtered lookup into a hard
  error, found as six collateral hits) `row_security`.

Tally after 0009: **194/194 assertions, 93/93 mutations killed**; `0009_down`
verified alone, verified idempotent on a second run, re-applied cleanly,
and correctly refused against a populated schema. Still open at that point:
gate 5's epistemic-label half, and 0008's own down-migration idempotency
(m3) - left as-is because 0008 is shipped, and 0009's down was written
idempotent from the start instead.

**Gate 5, epistemic-label half, migration `0010_wave1_epistemic_label_up.sql`
(same day).** Closes `NEG-HD08-04`, the last OPEN item under this ADR.

**What upstream actually provides, verified before writing any code (a
targeted research pass, not assumed).** ADR-0019's own text says to reuse
"epistemic-label.schema.yaml:37-63's already-schema-validated
promotion_redline". That file lives in the sibling cognitive-os product's
spec tree (not cited here by path - this migration's own header explains
why: `Projects/internal/hci30`'s source tree must not carry a direct
reference into that product outside `integrations/cognitive-os/`, per
ARCH-PEER-01/ADR-0001, and the peer-boundary Node test caught exactly this
when the path was first written into the migration's own comment). Reading
it found: an 11-value `epistemic_type` enum (`SOURCE_FACT, EVIDENCE,
ASSUMPTION, HYPOTHESIS, AI_INFERENCE, AI_SUGGESTION, HUMAN_OPINION,
CALCULATED_RESULT, SIMULATED_RESULT, UNKNOWN, DECISION`), not merely the
three values (`UNKNOWN`/`HYPOTHESIS`/`SOURCE_FACT`) ADR-0019's own text
names; a `promotion_redline` block that is structured DOCUMENTATION
(`forbidden_transition`/`legal_paths`/`each_legal_path_must_record`), not a
JSON-Schema validator keyword - nothing upstream mechanically enforces it;
and no verifier field or type named anywhere. ADR-0013 (shared kernel,
ACCEPTED the same batch) then scopes what Wave 1 may take from this: the
11-value enum only - not `authorship_state`, not `locked`, not the
composite provenance record - and its own gate 5
(`WAVE1-EPISTEMIC-ANNOTATION-01`) requires every Wave 1 classification
column to carry an inline `ADR-0013` citation marking the value set
provisional pending ADR-0013's own gate 3 (Wave 3 lossless-mapping test).
That citation script (`scripts/verify-epistemic-annotation.ps1`) did not
exist before this round - ADR-0013 specified it but nothing had built it -
so it was built here as part of landing this migration correctly, wired
into `test-wave1-local.ps1`, self-tests itself (an unannotated synthetic
column must be flagged, an annotated one and a bare column reference must
not) before checking real migrations, and found one genuine pre-existing
gap: `hci.cases.risk_tier` (migration 0002, matches the script's own
`risk_tier` trigger word) had never carried the citation - annotated in
place (comment only, no schema change).

**Design decisions this migration had to make, none handed down by any
ADR** (documented in the migration's own header, not repeated here):
`epistemic_label` is CLAIM-scoped (the best-evidenced target - no document
pins it wider); a CLAIM born unlabelled defaults to `UNKNOWN` (the
least-trusted state is the only safe default); a superseding row with no
label inherits its predecessor's label AND verifier together (never a
silent demotion - the same reasoning gate 4's `reaudit_required`
inheritance already established); "human verifier" is
`epistemic_verifier_principal_id`, a tenant-composite FK to
`hci.principals` reused from this ADR's own gate 5 human-principal half and
0009's spot-check binding; every `SOURCE_FACT` row requires a verifier by
CHECK, not only on a promotion - otherwise a Claim simply BORN as
`SOURCE_FACT` with no predecessor bypasses a promotion-only rule entirely,
the exact "no downstream consumer" bypass class 0008's C1/C2 review
findings were about; `authorship_state`, `locked`, and any demotion rule
are explicitly NOT modelled (ADR-0013 reserves the first two, no ADR
authorizes them as columns yet).

First real run found one real cross-cutting bug outside SQL entirely: the
migration's header comment citing the sibling product's file path tripped
`ARCH-PEER-01` (the Node architecture test), fixed by describing the
mechanism without the literal path. SQL itself: **208/208 assertions,
101/101 mutations killed**, first try on both. Mutation-check then found
two real gaps in the two 0009-era mutations that target the same trigger
function this migration also rewrote (`weaken-claim-state-admission-gate`,
`remove-supersede-reaudit-inheritance`): their literals had not been
updated to include 0010's epistemic default/inherit logic, so applying
either now collaterally stripped epistemic defaulting from every CLAIM
insert - up to 18 unrelated assertions at once - fixed by re-syncing both
literals to the function's current full body (the same "body-rewriting
mutations must mirror the current function" discipline 0009 already
established, now shown to need re-checking every time that function
changes again). A third finding: `CHECK-REAUDIT-DEFAULT-01` (0009, run with
user triggers disabled to reach the CHECK) went `VACUOUS` once triggers
also stopped defaulting `epistemic_label` - the row failed
`subject_records_epistemic_required` regardless of whether the
reaudit-specific CHECK existed, masking which constraint actually fired
behind the same `23514` SQLSTATE - fixed by supplying `epistemic_label`
explicitly so only the one CHECK under test can be the reason it fails.
Narrow-rollback (`0010_down` alone against an unpopulated schema, a second
run proving idempotency, a clean `0010_up` re-application, and refusal
against a populated schema) passed on the first attempt.

No db-expert review was requested for this gate: it extends an
already-reviewed mechanism (the same BEFORE INSERT trigger, the same
composite-FK-to-principals pattern, the same inherit-across-supersession
shape) rather than inventing a new one, matching this session's own
established criterion for when review is and is not warranted.

**All five ADR-0019 gates are now DONE.** Final tally across migrations
0008-0010: **208/208 assertions, 101/101 mutations killed**.

## Consequences

- `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-05 and every downstream HCI intelligence/public-intelligence/decision-flow chapter that already assumes this enumeration is adopted policy (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:118`) now has a ratified source to cite instead of an open decision.
- HCI does not gain a second, HCI-only risk/gating vocabulary; every enforcement point must resolve through AI LEGO's existing R0-R4 `mandatory-gates.yaml` machinery.
- This ADR does not itself resolve HD-06 (bitemporal scope, `ADR-0017`) or HD-07 (crypto-shred erasure, `ADR-0018`) — both decided elsewhere, same batch, gates still open; the Evidence/Claim/Assessment/Decision tables named in gate 2 are subject to those ADRs' schemas once built.
- This ADR does not authorize Organization-subject assessment (ADR-0011 governs that boundary) and does not weaken ADR-0015's identity-confirmation gate or ADR-0016's tenant RLS gate; it references and reuses both rather than superseding either.
- Until gates 1-5 are implemented, this ADR is a ratified architecture decision, not an operative control — the same "principles ahead of enforcement" gap `12_RED_TEAM_FAILURE_ANALYSIS.md:519` identifies as V1's systemic defect applies to this policy too until its gates close.

## Verification and rollback

- Verification recorded here is documentation-only: the ratified enumeration is cross-linked to `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Cross-model gate by risk, `09_AI_INTELLIGENCE_REVIEW.md` C5, `12_RED_TEAM_FAILURE_ANALYSIS.md` RT-09, and `22_OPEN_HUMAN_DECISIONS.md` HD-08.
- The required policy artifact, schema constraints, triggers, and five negative tests have not been implemented; their gates remain **OPEN**. No production deployment, real-person data admission, or legal claim of compliance may rely on this ADR alone.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision. After implementation, rollback must be a reviewed migration that does not silently reclassify an already-recorded `author_class` value; any reclassification is itself a new lineage event, not an overwrite (consistent with `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:130`'s correction pattern).
- Decision authority for this ADR is the operator's 2026-09-02 full delegation to Claude for the HCI system; the operator retains the right to supersede this decision at any time with a later explicit decision, which controls over this ADR from the date it is recorded.

## Evidence

- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:95-118` — Cross-model gate by risk, the additional gate requirement, and the HD-08 decision-pending block being ratified.
- `09_AI_INTELLIGENCE_REVIEW.md:171-190` — finding C5, the enumeration source and its High-confidence/`requires_human_decision: YES` rating.
- `12_RED_TEAM_FAILURE_ANALYSIS.md:267-286,464-520` — RT-09 and the cross-check synthesis confirming it stands unmitigated by any independent reviewer.
- `22_OPEN_HUMAN_DECISIONS.md:59-64` — HD-08 question, rationale, and recommendation.
- `specs/execution/risk-tier.schema.yaml` (`D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\specs\execution\risk-tier.schema.yaml`) — the ACCEPTED R0-R4 machinery this policy reuses rather than duplicates.
- `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:130` — the existing insert-only/immutable-write trigger pattern gate 2 extends.
- `governance/ADR-0011-hci-subject-type-scope.md`, `governance/ADR-0014-data-subject-rights-channel.md`, `governance/ADR-0015-restricted-subject-identity-confirmation.md`, `governance/ADR-0016-mandatory-tenant-rls.md` — adjacent ACCEPTED ADRs this decision references and does not contradict.
