# HCI Field/Transition Author-Class Policy

Status: **DESIGN ARTIFACT COMPLETE (gate 1) — runtime enforcement (gates 2-5, both halves) real-Docker-verified and db-expert-reviewed (2026-09-05: gate 2-4/0008 found 3 Critical + 5 Major, fixed; remaining M4/M6/M7/M8/m2/m4 + suggestions closed same day in migration 0009; gate 5's epistemic-label half landed same day in migration 0010, `NEG-HD08-04` closed — see ADR-0019's own "Implementation note" for the full account). All five gates DONE.**
Date: 2026-09-05
Authority: ADR-0019 (`HD-08`)
Scope: A machine-readable enumeration of which author class (human, deterministic code, probabilistic model, or LLM-with-human-review) may produce or transition each named field/state at Wave 1. It does not itself grant real-person processing authority, and it does not invent a second risk-tier ladder — the tier condition column below cites AI LEGO's existing `risk-tier.schema.yaml#/mandatory_gate_injection_trigger` rather than redefining one.

## Author-class enum

Exactly four values. An unenumerated field/transition defaults to `HUMAN_ONLY` until this document is amended by a superseding change proposal — never silently assigned by an implementer (ADR-0019 Decision, final paragraph).

| Value | Meaning |
|---|---|
| `DETERMINISTIC` | Produced by non-probabilistic application code; the same input always yields the same output. |
| `PROBABILISTIC` | Produced by a scoring/statistical process whose output is a confidence value, not an assertion of fact. |
| `LLM_ASSISTED_HUMAN_REVIEW_REQUIRED` | An LLM may draft the content, but a human review step is mandatory before the record is usable for its stated purpose. |
| `HUMAN_ONLY` | A human is the sole author; no LLM or model output may substitute for or pre-fill this field. |

## Policy table

| `field_id` / transition | Allowed `author_class` | Tier condition | Rationale |
|---|---|---|---|
| Identity `MATCH_CONFIRMED` (RESTRICTED subjects) | `DETERMINISTIC` | All tiers | Reuses ADR-0015's existing synthetic verification-record mechanism (`hci.require_identity_verification()`, `migrations/0001_wave1_synthetic_up.sql:219-245`) unchanged — this row does not re-specify it, it cites it. |
| Evidence admission (`hci.subject_records`, `kind='EVIDENCE'`) | `DETERMINISTIC` | All tiers | ADR-0019 Decision block: "evidence admission-state transitions" MUST be deterministic. |
| Retention/deletion enforcement (`hci.tombstone_evidence()`, ADR-0018) | `DETERMINISTIC` | All tiers | ADR-0019 Decision block: "retention/deletion enforcement" MUST be deterministic. Already true by construction — the function takes no author-supplied classification input at all. |
| Protected-attribute filtering | `DETERMINISTIC` | All tiers | ADR-0019 Decision block; no Wave 1 schema surface yet (no protected-attribute column exists to filter) — cited for completeness, not independently enforced by a Wave 1 trigger. |
| Locked-record writes (any table in the append-only/no-delete pattern, `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:130`) | `DETERMINISTIC` | All tiers | ADR-0019 Decision block: "all locked-record writes" MUST be deterministic. Already true by construction — `hci.reject_update_delete()`/`hci.mark_superseded()`/`hci.tombstone_evidence()` take no author-class input; the trigger layer itself is the deterministic author. |
| Claim admission (`hci.subject_records`, `kind='CLAIM'`) | `LLM_ASSISTED_HUMAN_REVIEW_REQUIRED` or `HUMAN_ONLY` | All tiers, **regardless of tier** for the human-spot-check requirement specifically (ADR-0019 "Additionally" paragraph) | ADR-0019 Decision block: "synthesis, hypothesis generation" MAY be LLM-assisted + human-review flag. A Claim is exactly this — a synthesized hypothesis about a Subject, not an assertion of fact. |
| Assessment admission (`hci.subject_records`, `kind='ASSESSMENT'`) | `PROBABILISTIC`, `LLM_ASSISTED_HUMAN_REVIEW_REQUIRED`, or `HUMAN_ONLY` | All tiers | ADR-0019 Decision block covers both "source-quality grading, confidence scores" (PROBABILISTIC) and "AI LEGO cognitive-method outputs" (LLM_ASSISTED) under this kind; `DETERMINISTIC` is deliberately excluded — an Assessment is by nature a judgment, not a deterministic computation. |
| Final Decision (`hci.decisions`) | `HUMAN_ONLY` | All tiers | ADR-0019 Decision block: "MUST NEVER be LLM alone: final PROCEED/PAUSE/EXIT decision." `HUMAN_ONLY` is the only enum value consistent with "never LLM alone" for the row that carries legal/product consequence — enforced structurally via the human-principal reference requirement (gate 5), not merely by an `author_class` label an inserter could set incorrectly. |
| `UNKNOWN`/`HYPOTHESIS` → `SOURCE_FACT` epistemic-label promotion | `HUMAN_ONLY` | All tiers | ADR-0019 Decision block: "any employment-adjacent output, UNKNOWN/HYPOTHESIS -> SOURCE_FACT promotion" MUST NEVER be LLM alone. **Enforced 2026-09-05** — `epistemic_label`/`epistemic_verifier_principal_id` on `hci.subject_records` (migration `0010_wave1_epistemic_label_up.sql`), `H1019` raised on a direct promotion with no named human verifier; see ADR-0019's own "Implementation note". |

## Gate cross-reference

- **Gate 1** (this document): DONE.
- **Gate 2** (`author_class` column + CHECK + `hci.enforce_field_author_class()` trigger on `hci.subject_records`/`hci.decisions`): DONE, `migrations/0008_wave1_field_author_class_policy_up.sql`. Enforced against `kind` as the Wave-1 proxy for "field_id/transition" — the schema has no finer-grained field-level tracking yet (real payload columns are Wave 4), so this is a row-level approximation of the policy table above, not the fully granular per-field enforcement gate 2's text ultimately anticipates once Wave 4 payload columns exist.
- **Gate 3** (`human_spotcheck_status` + `ASSESSMENT_CANDIDATE` claim-state gate, `NEG-HD08-01`): DONE. `claim_state` is a new, deliberately minimal two-value state (`DRAFT`/`ASSESSMENT_CANDIDATE`) introduced by this migration — no Claim state machine existed anywhere in the blueprint before this ADR (confirmed by research before implementation); this is the smallest state shape gate 3 itself requires, not a claim to have specified the Claim lifecycle in full.
- **Gate 4** (`reaudit_required` re-audit gate + Decision constraint, `NEG-HD08-02`): DONE. `hci.decision_claims` is a new, minimal junction table introduced by this migration for the same reason — no Decision-Claim linking relationship existed anywhere in the blueprint before this ADR.
- **Gate 5**, human-principal half (`NEG-HD08-03`): DONE. `hci.principals` is a new, minimal table (id, tenant_id, display_name) — no human-user/analyst/reviewer entity existed anywhere in the blueprint before this ADR; `hci.decisions.principal_id` is `NOT NULL`, FK-scoped to the same tenant.
- **Gate 5**, epistemic-label half (`NEG-HD08-04`): **DONE, 2026-09-05** (migration `0010_wave1_epistemic_label_up.sql`). Value set is the ADR-0013 shared kernel's full 11-value `epistemic_type` enum (not only the three ADR-0019 names), annotated per ADR-0013 gate 5 as provisional pending that ADR's own gate 3 (Wave 3 lossless-mapping test) — the fuller explainability/confidence-decomposition lifecycle those not-yet-read chapters may eventually specify is still open to superseding this, but the redline itself (the one thing ADR-0019 actually requires) is no longer OPEN. See ADR-0019's own "Implementation note".

## Explicitly deferred legal/product decisions

- This document ratifies an internal author-class policy; it does not authorize real-person data processing, Organization-subject assessment (ADR-0011 governs that boundary), or any claim of legal compliance.
- `claim_state`, `hci.principals`, `hci.decision_claims`, and `epistemic_label`/`epistemic_verifier_principal_id` are new specification surface this ADR's implementation introduced, not backfilled from an existing blueprint concept (confirmed by a targeted search across `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, `04_HCI30_PRODUCT_SPEC.md`, and the `HCI30_RESEARCH_REVIEW/` set before implementation began). They are deliberately minimal and explicitly open to being superseded by a future ADR that defines the full Claim lifecycle, human-principal/identity model, Decision-evidence linkage, or fuller epistemic-label lifecycle (explainability/confidence decomposition) in more detail — this document does not claim to be that specification.
