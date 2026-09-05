# HCI Confidence Spec — partial: method-finding-to-dimension combination

Status: **two decisions of different kinds, both operator-delegated**
(same distinction `HCI_TRUST_DOMAIN_SPEC.md`'s Status section draws, per a
critic review's M7 finding on that spec — kept explicit here from the
start rather than found by review after the fact; a second critic review
of *this* file found the split still needed tightening, below):

1. **(1a) That a real disagreement between methods must be disclosed, not
   silently averaged away** — grounded directly in
   `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:17`'s explicit product rule,
   "Do not average lens disagreement away." This part is textually
   grounded, not an analogy.
   **(1b) That the specific combination formula is a deterministic,
   unweighted mean-of-ranks** — this is the same kind of decision as item 2
   below (a product/engineering judgment, not derivable from `19:17` alone,
   which forbids silent averaging but does not specify what the disclosed
   alternative computation should be), made under the operator's general
   delegation, not under `04_HCI30_PRODUCT_SPEC.md:87`'s narrower "no
   operator sign-off needed" carve-out for the aggregation math (that
   sentence, before this change, licensed the sibling roll-up spec's
   14-to-7 formula specifically — a critic review of that spec (M7)
   already found it does not generalize to every design choice touching
   confidence/trust scores; this spec does not reuse it as blanket
   authority either).
2. **The specific disagreement threshold (a 2-rank spread) and the
   decision to still compute a value even when disagreement is flagged**
   — a product judgment, not derivable purely from source text, made under
   the operator's general delegation for HCI30 architecture decisions
   ("需要決定的事都你決定", 2026-09-06) and `ADR-0004`'s own
   "Decision authority: Operator-delegated" precedent.

Operator may supersede either with a later explicit decision.

Path per `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04 (Mathematical
Specifications): this file is a **partial** closure of the P0-04
`HCI_CONFIDENCE_SPEC` deliverable, covering only method-to-dimension
combination. Still open (not solved here, not silently absorbed):

- **Evidence Confidence, Model Agreement, Method Robustness, Decision
  Confidence** (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:29-32`) — the
  four confidence axes ADR-0032 already names but does not compute.
- **Source-independence wiring into Model Agreement**
  (`06_HCI30_PUBLIC_INTELLIGENCE.md` §Source independence,
  `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Confidence Separation) — two
  models retrieving the same poisoned source must not read as high
  agreement.
- **Model disagreement across dimensions** (the
  `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:19-21` "Reliability: LOW RISK
  / Incentive Alignment: HIGH RISK -> MODEL DISAGREEMENT" example) — a
  reporting-layer concern, distinct from this file's within-one-dimension
  combination, not addressed here.
- **The qualitative-band-to-probability-range mapping** — same open item
  `HCI_TRUST_DOMAIN_SPEC.md` already tracks; this file does not resolve it
  either.
- **Calibration** of the underlying method(s) themselves — out of scope
  entirely until Wave 11 per ADR-0032.

## Context

`HCI_TRUST_DOMAIN_SPEC.md` §Layering names an "already governed" claim a
critic review (2026-09-06 M6) found false: gate 5's `decision_weight` is
keyed by Trust Domain, not by Assessment Dimension, and defines no
combination semantics — so "how do multiple methods' findings about the
same dimension combine" had **no owner**, even though
`rollupTrustDomains`'s own input contract (14 already-resolved dimension
values) implicitly assumes this question is already answered upstream.
This file answers it.

`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:15-17` requires: "A Subject/case
should support independent lenses... Do not average lens disagreement
away." `:15` enumerates 11 named analytical lenses (Evidence, Reliability,
Behaviour, Incentive, Conflict, Power, Network, Culture, Psychology,
Strategy, Self Reflection) — HCI methods are a different, open-ended axis,
not literally one of those 11 (§Combination rule below discloses the same
distinction for evidence_refs ordering). Multiple methods bearing on one
dimension (e.g. a payment-history method and a communication-timeliness
method both scoring `RELIABILITY_FULFILLMENT`) are **not** literally `:15`'s
lenses; this spec extends `:17`'s rule to them **by analogy**, because the
harm — silently averaging a `LOW` and a `HIGH` finding into `MODERATE`
with no trace of the disagreement — is the same harm `:17` names, one layer
down from the cross-dimension example at `:19-21`.

## Combination rule

Given N >= 1 findings about the same Assessment Dimension, each
`{method_id, value: band, evidence_refs}`:

- **N = 1** → `value` is that finding's band. `disagreement = false`
  (nothing to disagree with). `evidence_refs` = that finding's refs.
- **N >= 2** → convert each band to its rank (`VERY_LOW=1 .. VERY_HIGH=5`,
  `packages/intelligence/band-scale.mjs`, shared with
  `rollup-trust-domains.mjs`). `value` = mean of ranks, rounded via the
  same round-half-down tie-break as the domain roll-up (conservative:
  overstating confidence is more harmful than understating it).
  `disagreement = true` when `max(ranks) - min(ranks) >= 2` — i.e. the
  findings span more than one adjacent band (a `LOW`/`MODERATE` pair,
  spread 1, is ordinary measurement variation; a `LOW`/`HIGH` pair or
  wider, spread >= 2, represents materially different conclusions from
  different methods about the same thing). `evidence_refs` = the
  deduplicated union of every contributing finding's refs, **in the input
  array's order** — a genuinely different ordering contract from the
  domain roll-up's `ASSESSMENT_DIMENSIONS`-position order, because methods
  are an open-ended, extensible catalog with no fixed canonical ordering
  the way the 14 dimensions have; this is disclosed explicitly rather than
  silently inherited from the sibling spec.

**A value is still computed even when `disagreement = true`** — this
combination function does not refuse to produce a `value`, because
`rollupTrustDomains` downstream expects one per dimension it receives, and
withholding it would either break that contract or force every caller to
handle an "unknown" dimension value case that no schema currently
represents. `disagreement` is a **required field of this function's own
output** (never optional here, never silently droppable *by this
function*) so a caller reading `combineMethodFindings`'s return value
directly cannot miss it.

**Known seam, disclosed rather than left implicit (critic review,
2026-09-06 C1 — a prior version of this paragraph claimed a
consumer-independent guarantee that does not hold and is falsified by this
file's own worked example below)**: `rollupTrustDomains`'s input contract
(`HCI_TRUST_DOMAIN_SPEC.md` §Aggregation rule) is
`{dimension, value, evidence_refs}` — it has no `disagreement` field, and
`validate-trust-domain-response.mjs`'s `DOMAIN_ENTRY_KEYS` whitelist would
reject one if added without a corresponding gate-4 change. So feeding
`combineMethodFindings`'s output into `rollupTrustDomains` today **silently
drops `disagreement`** at that seam — the exact "papers over a real
disagreement" failure this spec exists to prevent, reappearing one layer
up, for domain-level rather than dimension-level consumers. This is a
genuine open gap, not a solved one: propagating disagreement from the
dimension layer up through the domain layer and gate 4 is deliberately
**not** done in this change (it would mean revising gate 4's already-
shipped, already-reviewed contract a third time, and deciding a further
question — how does a domain roll up a disagreement flag across its own
two dimensions? — that has no answer yet). Tracked as an open item in
`TASKS.md`, owned by whichever future spec resolves domain-level
disagreement propagation.

Worked example: `payment-history: HIGH`, `communication-timeliness: LOW`
for `RELIABILITY_FULFILLMENT` → ranks `[4, 2]`, mean 3, `value = MODERATE`,
spread `= 2`, `disagreement = true`. A caller reading
`combineMethodFindings`'s own return value directly sees the disagreement;
a caller that pipes that dimension value into `rollupTrustDomains` today
does not — the resulting domain-level row shows `MODERATE` with no trace
that two methods actively disagreed, exactly the failure this spec names,
now surfaced one layer higher.

**Method attribution is the caller's responsibility, not this function's
output** (critic review, 2026-09-06 m3): `combineMethodFindings` validates
and deduplicates `method_id` per finding but does not return it —
`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:27`'s expanded-view requirement
("Methods used, Method versions") must be satisfied by whatever caller
holds the original `findings` array, not reconstructed from this
function's `{dimension, value, disagreement, evidence_refs}` return shape.
Disclosed as a deliberate minimal-surface choice, not an oversight: adding
`contributing_methods` here would be scope creep into what a UI/report
layer needs, which is exactly the kind of decision this file leaves open
in favor of `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`'s own reporting
layer.

## Verification

- `packages/intelligence/band-scale.mjs` — extracted from
  `rollup-trust-domains.mjs` when this file needed the same rank/round
  primitive, so the encoding and tie-break exist in exactly one place, not
  copy-pasted a third time.
- `packages/intelligence/combine-method-findings.mjs` — the function
  itself.
- `tests/unit/intelligence/band-scale.test.mjs` — exhaustive 25-combination
  test for the shared primitive (migrated out of
  `rollup-trust-domains.test.mjs`, which now asserts against
  `rollupTrustDomains`'s own behavior rather than the primitive directly).
- `tests/unit/intelligence/combine-method-findings.test.mjs` — disagreement
  threshold boundary cases (spread 0, 1, 2, 3, 4), single-finding
  pass-through, ordering contract, duplicate `method_id` rejection.
- `tests/unit/intelligence/rollup-trust-domains.test.mjs`'s own end-to-end
  test documents (does not fix) the seam above: it does not currently pipe
  `combineMethodFindings` output into `rollupTrustDomains`, so the
  `disagreement`-dropping behavior described above is not yet under
  regression test either — a further open item, not silently assumed
  covered.

## Rollback

Purely additive, pre-code (no real method catalog or trust-read endpoint
consumes this yet): reverting this file and its two modules removes the
mechanism entirely with no data to reconcile. The disagreement threshold
is a single named constant
(`combine-method-findings.mjs`'s `DISAGREEMENT_SPREAD_THRESHOLD`); revising
it is a one-line change plus a re-run of the boundary tests, not a schema
migration.
