# HCI Evidence Quality Spec — partial: evidence-quality classification

Status: **two decisions of different kinds** (same distinction
`HCI_TRUST_DOMAIN_SPEC.md` and `HCI_CONFIDENCE_SPEC.md`'s Status sections
already draw, per the M7/C1 findings on those specs — a prior version of
*this* file's Status line overstated which category it was in, corrected
here after a critic review):

1. **That evidence quality must be classified per dimension, and that
   "corroborated" must never be claimed from ref count alone** — grounded
   directly in `06_HCI30_PUBLIC_INTELLIGENCE.md:170`, "URL count is not
   independent-source count." Textually grounded, not an analogy.
2. **The specific vocabulary (`SINGLE_SOURCE` / `MULTIPLE_SOURCES`) and the
   1-vs-2-distinct-refs boundary** — a product/naming judgment, made under
   the operator's general delegation for HCI30 architecture decisions,
   the same category as `HCI_CONFIDENCE_SPEC.md`'s disagreement threshold
   and `HCI_RISK_SPEC.md`'s severity rank. `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:82`
   independently names a similar-sounding term, `SINGLE-SOURCE REPORT`,
   for a *different* object (a public Claim, not an Assessment Dimension)
   — this file's `SINGLE_SOURCE` is a deliberately coined term for a
   parallel concept, not a direct reuse, and the identifier-format change
   (hyphen removed, "REPORT" dropped) is a judgment call, not a
   mechanical transcription. `MULTIPLE_SOURCES` has no corpus precedent at
   all; `19:82`'s own stronger term for 2+ sources, `CORROBORATED REPORT`,
   is deliberately **not** reused (see §Rule for why).

Operator may supersede either with a later explicit decision.

Path per `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04 (Mathematical
Specifications): this file is a **partial** closure of the P0-04
`HCI_EVIDENCE_QUALITY_SPEC` deliverable, covering only per-dimension
evidence-quality classification by ref count. Still open (not solved
here, not silently absorbed):

- **Source independence** — `06_HCI30_PUBLIC_INTELLIGENCE.md:170,172-179`
  names the real mechanism this would need (a `source_relationships`
  graph: `cites`/`derived_from`/`original_source`, real schema already in
  `governance/ADR-0026-claim-source-tenant-ownership.md` /
  `database/migrations/0004_wave1_source_provenance_up.sql`). This file's
  `evidence_refs` are opaque strings with no lineage information, so it
  can count *distinct* refs but cannot tell whether two distinct refs
  trace back to one underlying source. That is exactly why `MULTIPLE_SOURCES`
  is used instead of `CORROBORATED` (see §Rule).
- **Contradiction between evidence inputs** — `HCI_CONTRADICTION_SPEC.md`
  — **update, 2026-09-06**: now exists, records its own blocker (the
  shared `evidence_refs` opaque-string shape has no Claim-content field to
  compare) rather than a rule.
- **Time decay of evidence relevance** — `HCI_TIME_DECAY_SPEC.md` —
  **update, 2026-09-06**: same as above, now exists recording its own
  blocker (the schema has the needed timestamps since ADR-0017; the
  shared evidence-ref shape does not carry them through).
- **Source quality grading** (the S1-S6 hierarchy,
  `06_HCI30_PUBLIC_INTELLIGENCE.md:153-166`) — every evidence ref is
  treated as equally weighted here; none are graded.
- **Any threshold beyond the 1-vs-2-distinct-refs boundary** (e.g. "3+
  needed for a VERY_HIGH claim") — a separate, not-yet-made judgment.

## Context

`21_HCI_TOP_TIER_GAP_ANALYSIS.md:58` names "minimum evidence" as one of
several things P0-04 must define. `packages/intelligence/dimension-score.mjs`
already enforces a floor of that requirement — `evidence_refs` must be a
non-empty array (`normalizeDimensionScore`'s own validation, present since
`rollup-trust-domains.mjs`'s original version, commit `9888bd5d7`) — so
"at least one ref" is already a schema-level guarantee. What this file
adds is visibility into *how much more than the floor* a given dimension
actually has, since "at least one" and "well-supported" are not the same
claim.

## Rule

Given the same dimension-score input shape `rollupTrustDomains` and
`detectSeverityFloor` already take (`{dimension, value, evidence_refs}[]`,
validated via `packages/intelligence/dimension-score.mjs`), **every
present dimension** (not only problem cases — see below for why this
differs from the sibling detectors) is classified:

- **1 distinct evidence ref** → `SINGLE_SOURCE`.
- **2 or more distinct evidence refs** → `MULTIPLE_SOURCES` — **not**
  `CORROBORATED`, deliberately: this file has no way to check whether
  those refs trace back to one underlying source
  (`06_HCI30_PUBLIC_INTELLIGENCE.md:170`'s own warning), so claiming
  corroboration would be exactly the false-precision failure this whole
  document family (`ADR-0032`, `HCI_TRUST_DOMAIN_SPEC.md`,
  `HCI_CONFIDENCE_SPEC.md`) keeps finding and fixing. `MULTIPLE_SOURCES`
  is a true, honest statement about **distinct ref count** alone.
- **Distinct, not raw, count**: two findings citing the identical ref
  string count as one source, not two — the realistic case when two
  methods combined by `combineMethodFindings` both cite the same
  underlying page. `rollup-trust-domains.mjs`'s own `evidence_refs` union
  already deduplicates for the same reason
  (`HCI_TRUST_DOMAIN_SPEC.md` §Aggregation rule calls it "the
  deduplicated union"); counting raw array length here would let a
  genuinely single-sourced dimension escape the `SINGLE_SOURCE` label by
  simply repeating one ref.

**Every present dimension is classified, not only exceptional ones** —
this is a deliberate difference from `detectSeverityFloor` (silent unless
a dimension crosses the floor) and `combineMethodFindings`'s `disagreement`
flag (silent unless spread crosses the threshold). Evidence quality is
relevant information for *every* dimension, not an exceptional condition;
staying silent for well-evidenced dimensions would make "this dimension is
absent from the output" ambiguous between "fine" and "wasn't in the input
at all" — the exact ambiguity `detectSeverityFloor`'s own "absence is not
MODERATE-by-default" reasoning warns against, one field over. A dimension
genuinely absent from the *input* is still absent from this function's
output too (there is nothing to classify); the distinction is that a
present-but-well-evidenced dimension gets `MULTIPLE_SOURCES`, not silence.

Output is ordered by `ASSESSMENT_DIMENSIONS` position (same convention
`detect-severity-floor.mjs` and `rollup-trust-domains.mjs` already use),
not input order — pinned and asserted exactly via full-object
`deepEqual`, not a `Set` or sort that would hide an order or field-value
regression.

Worked example: `{RELIABILITY_FULFILLMENT: HIGH (1 ref),
PREDICTABILITY: HIGH (3 refs)}` → both dimensions are reported:
`RELIABILITY_FULFILLMENT` classified `SINGLE_SOURCE`, `PREDICTABILITY`
classified `MULTIPLE_SOURCES`.

## Verification

- `packages/intelligence/classify-evidence-quality.mjs` — the function
  itself. No new shared module was needed: it imports the same
  `dimension-score.mjs` and `assessment-dimensions.mjs` primitives
  `detect-severity-floor.mjs` already does (verified by import statement,
  not assumed).
- `tests/unit/intelligence/classify-evidence-quality.test.mjs` — the
  `SINGLE_SOURCE` vs `MULTIPLE_SOURCES` boundary at exactly 1 vs 2
  *distinct* refs, the duplicate-ref-collapse case, the
  `ASSESSMENT_DIMENSIONS`-order assertion (via full-object `deepEqual`,
  proving the `domain` and `value` fields too, not only which dimensions
  appear), the "absent dimension stays absent" case, and the standard
  input-validation cases shared with the sibling detectors.

## Rollback

Purely additive, pre-code (no real trust-read endpoint or method catalog
consumes this yet): reverting this file and its one new module removes
the mechanism entirely with no data to reconcile. `SINGLE_SOURCE_COUNT`
is a named constant in `classify-evidence-quality.mjs`; revising it is a
one-line change plus a re-run of the boundary tests — this file does not
repeat the "no threshold to mis-revise" claim a prior version of it made,
since (unlike that claim) this constant is real and mutation-tested
(`scripts/mutation-check-node-gates.ps1`'s
`single-source-evidence-shift-threshold` entry).
