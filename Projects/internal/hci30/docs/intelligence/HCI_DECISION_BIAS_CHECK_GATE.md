# HCI Decision bias-check blocking gate

Status: **not a P0-04 Mathematical Specification, and not
`HCI_PERMISSION_SPEC.md`** (see `HCI_PERMISSION_SPEC.md` for that
file's own honestly-open status). This document and
`packages/intelligence/bias-check-gate.mjs` implement
`04_HCI30_PRODUCT_SPEC.md:138` — the trigger condition (which
Stage/decision combination gates) is a literal transcription of an
already-decided rule, explicitly marked "Requires human decision: NO" in
its own origin record (`HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md`
RT-16); the one real interpretive choice made here — "completed" means
every check was answered, not that every answer is YES — is disclosed
where it is made, §Rule below, not glossed over here. Zero prior
implementation existed anywhere in this codebase; found while
investigating `HCI_PERMISSION_SPEC.md` (Decision Output and Permission are
adjacent concepts in the corpus, but this gate does not consume a Trust
Domain profile at all — see §Why this is not Permission, below).

## Context

`04_HCI30_PRODUCT_SPEC.md:138` ("New in V2 — bias-check is a blocking
precondition, not optional report content"): finalizing an `EXIT` or
`PROCEED_WITH_CONTROLS` decision on a Stage 4+ (Confidential/Strategic/
Governance) collaboration **requires** a completed analyst-bias-check pass
as a precondition. The same paragraph names the failure this closes: "V1
documented a thorough bias-defense framework and never actually required
it to run before a high-impact decision — a system that documents a
control this thoroughly and never gates on it has built a warning label,
not a seatbelt" (citing `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md`
RT-16).

Before this change, nothing in `Projects/internal/hci30/` implemented or
tested this rule — no gate ID, no validator, no test (a grep for `bias`
across `.mjs`/`.sql`/`.ps1` files in that tree found only an unrelated
"down-bias" comment in `band-scale.mjs` and an unrelated migration
comment). A separate grep for `BIAS-CHECK` across the spec corpus
(`agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/`) also returned zero hits —
confirming no gate ID had been assigned yet either, though that grep
alone does not speak to whether hci30 itself had an implementation.

The four checks themselves are already fully specified,
`05_HCI30_INTELLIGENCE_METHODS.md:99-106` ("Changed in V2 — quantification
removed, and this is now a blocking gate, not optional content"): binary
process-discipline checks replacing V1's fabricated-precision ordinal bias
ratings (`Confirmation bias: MEDIUM`):

```text
Counter-search performed: YES/NO
Contradictory evidence actively sought: YES/NO
Evidence diversity reviewed: YES/NO
Single-source reliance flagged: YES/NO
```

`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:74-76` cross-references both of
the above sections and adds nothing new — the same rule described from the
reporting-UI side.

## Why this is not Permission

**Correction (critic review, 2026-09-06)**: an earlier version of this
section claimed `Permission`'s fields, including any enum of permission
levels, "are undefined anywhere in the corpus" — false, and caught only
after spreading from `HCI_PERMISSION_SPEC.md` into this file and two
others (see that file's own correction note for the full detail).
`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:100` defines a full seven-tier
enum (`P0 Public` .. `P6 Ownership / Governance`); `02_PRODUCT_BOUNDARIES.md:59`
defines its access-control semantics. What is genuinely undefined, and
what `HCI_PERMISSION_SPEC.md` records as its real blocker, is the mapping
from a Trust Domain profile to one of those seven already-named tiers —
a business/risk-tolerance judgment this codebase has no basis to invent
(see `HCI_PERMISSION_SPEC.md` for the full corrected reasoning, including
a real Stage-vs-tier index-mismatch trap this correction surfaced).

This gate takes neither a Trust Domain profile nor any Permission value as
input. Its two inputs are `collaborationStage` (an already-defined 0-6
enum, `04_HCI30_PRODUCT_SPEC.md` §Collaboration stages) and `decision` (an
already-defined 6-value enum, §Decision output) — both pre-existing,
fully-specified corpus concepts with no invented mapping in between. It
answers a narrower, structurally different question: not "what permission
should this trust profile receive," but "has a required process step been
completed before finalizing an already-chosen decision." The two concepts
sit next to each other in the corpus (Decision Output's own precondition
gate, described in the same section that separately gestures at Permission
implications elsewhere in P0-04) but are not the same question, and this
file does not answer P0-04's.

## Rule

Two independent conditions, both derived directly from already-specified
enums, no new judgment:

1. **`requiresBiasCheck(collaborationStage, decision)`** — `true` only when
   `collaborationStage >= 4` (Confidential/Strategic/Governance) **and**
   `decision` is `EXIT` or `PROCEED_WITH_CONTROLS`. Every other
   stage/decision combination is `false`, including Stage 4+ for the other
   four decisions (`PROCEED`, `LIMIT_ACCESS`, `PAUSE`, `REVIEW_REQUIRED`) —
   `04:138`'s trigger names exactly these two decisions, not "any decision
   at Stage 4+."
2. **`isBiasCheckComplete(biasCheck)`** — `true` only when all four
   `BIAS_CHECK_FIELDS` are present as real booleans. **"Complete" does not
   mean "all YES"**: a bias check that honestly reports `counter_search_performed:
   false` is a completed check surfacing a real gap — exactly what this
   control exists to catch. Requiring all-`true` would reward a
   rubber-stamp pass over an honest one, defeating the purpose `04:138`'s
   own "a warning label, not a seatbelt" framing names. `null`/`undefined` are
   treated as "incomplete," not a type error — a caller finalizing a
   Stage 0-3 decision legitimately has no `biasCheck` to pass at all.

**`assertBiasCheckGate(collaborationStage, decision, biasCheck)`** combines
both: throws `BIAS-CHECK-GATE-01` only when the gate applies **and** the
check is incomplete. It never outputs, chooses, or overrides a decision —
the decision is assumed already chosen by whatever calls this; the gate
only validates one precondition for finalizing it. Same "gate, not
decision-maker" shape `ADR-0004` gates 4-5 and
`packages/intelligence/detect-severity-floor.mjs`'s parallel-signal
pattern already use elsewhere in this package, applied here to a
process-precondition rather than a trust-value pattern.

## Verification

- `packages/intelligence/bias-check-gate.mjs` — the three functions plus
  `DECISION_OUTPUTS` (6 values) and `BIAS_CHECK_FIELDS` (4 values), both
  exported as frozen arrays, `DECISION_OUTPUTS` in `04`'s order and
  `BIAS_CHECK_FIELDS` in `05`'s order (the two constants come from two
  different source documents, not one).
- `tests/unit/intelligence/bias-check-gate.test.mjs` — 19 tests: the
  Stage/decision trigger matrix (including the explicitly-forbidden
  `GOOD_PERSON`/`BAD_PERSON` shape rejected as an invalid decision, and
  Stage 4+ non-gated decisions correctly not triggering the gate),
  completeness semantics (an all-`false` check is still complete; a
  missing field, a non-boolean value, and `null`/`undefined` are each
  distinguished), the combined gate (silent pass when inapplicable
  even with no `biasCheck` at all, silent pass when applicable and
  complete regardless of individual answers, and the exact thrown message
  for both the missing- and incomplete-check cases), and a drift test
  proving `DECISION_OUTPUTS` matches migration 0005's `outcome` CHECK
  constraint verbatim and in order (critic review, 2026-09-06 M5 — this is
  a second, independent copy of the same six values with no prior drift
  protection, same class of check `tests/unit/contracts/trust-domains.test.mjs`
  already runs against migration 0011 for `TRUST_DOMAINS`).
- `scripts/mutation-check-node-gates.ps1` — 6 mutations (lowering the
  minimum gated stage to 0, adding `PROCEED` to the gated-decision set,
  treating an incomplete check as complete, dropping the
  `null`/`undefined` short-circuit, dropping the invalid-decision check
  entirely — critic review, 2026-09-06 m8, which found no existing
  mutation proved that check load-bearing — and corrupting one
  `DECISION_OUTPUTS` value), each proven to flip a specific test red.
- Wired into `scripts/test-wave1-local.ps1` alongside every other
  Node-level intelligence-package test (this same pass also found and
  fixed a pre-existing gap: `tests/unit/intelligence/evidence-refs.test.mjs`,
  added 2026-09-06 earlier the same day, had never been wired into this
  runner at all).

## Reconciliation with `0005_wave1_bitemporal_history_up.sql`

That migration's own comment (`:214-217`) explicitly defers "full Decision
workflow semantics (a bias-check precondition, requester binding beyond
`case_id`, etc.)" to "whichever ADR resolves HD-19/HD-21, not this one;
not built here." This does not contradict that deferral: `0005` deferred
the *table/trigger-layer* semantics for `hci.decisions` (a schema-level
enforcement question, needing an ADR); this file ships a *zero-consumer
pure-function validator* with no schema change and no `hci.decisions`
column added or altered. The two can coexist — this gate does not
presuppose or foreclose whatever HD-19/HD-21 eventually decides at the
schema layer, and `hci.decisions` itself is untouched by this change.

## Rollback

Purely additive, no schema, no consumer yet (no real decision-finalization
endpoint exists): reverting this file and its test/mutation entries
removes the gate entirely with nothing to reconcile. A future decision
endpoint that calls `assertBiasCheckGate` before persisting a `Decision`
row is the natural integration point once one exists.
