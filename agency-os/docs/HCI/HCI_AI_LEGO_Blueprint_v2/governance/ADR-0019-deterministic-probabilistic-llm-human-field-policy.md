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
