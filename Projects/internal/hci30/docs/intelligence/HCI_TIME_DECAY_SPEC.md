# HCI Time Decay Spec — status: honestly OPEN, not written

Status: **deliberately not written**, per `21_HCI_TOP_TIER_GAP_ANALYSIS.md`
P0-04's own path listing this file and `HCI_TRUST_DOMAIN_SPEC.md`'s own
out-of-scope entry ("Time decay of evidence relevance before it feeds a
dimension"). This file exists so the promised path resolves to something,
and so the exact blocking question is recorded precisely.

## What this file is supposed to answer

Old evidence should carry less weight than recent evidence when it feeds a
dimension's value — e.g. a payment-reliability finding from three years
ago should not count identically to one from last month. Nothing in this
codebase currently reduces a dimension's confidence or value based on the
age of its supporting evidence.

## Why this is not answered here (and why it is a different kind of gap
than it first appears)

**The database schema already has exactly the timestamps this would need
— the intelligence package's shared shape does not carry them.**
`0005_wave1_bitemporal_history_up.sql` (ADR-0017, already shipped) added
`valid_from`, `valid_to`, `system_recorded_at`, and `system_superseded_at`
to `hci.subject_records` — a real, tested, bitemporal foundation exists at
the row level. **That same migration, however, explicitly defers Decision
workflow semantics — "a bias-check precondition, requester binding beyond
`case_id`, etc." — to "whichever ADR resolves HD-19/HD-21, not this one;
not built here" (`0005_wave1_bitemporal_history_up.sql:214-217`).** This
spec's blocker is a different, narrower one: not the row-level bitemporal
timestamps themselves (those exist), but the fact that every function in
`packages/intelligence/` operates on `evidence_refs: string[]`
(`packages/intelligence/evidence-refs.mjs`) — opaque reference strings
with no timestamp attached, by the same deliberate design
`HCI_CONTRADICTION_SPEC.md` names for its own blocker. So this is not "no
timestamp exists anywhere in the system" (it does); it is "the shared
input contract five already-shipped pure functions depend on cannot see
it." Widening `evidence_refs` from `string[]` to something like
`{ ref: string, as_of: string }[]` is a real, disclosed, blast-radius-bearing
decision — every existing consumer (`normalizeDimensionScore`,
`combineMethodFindings`, `rollupTrustDomains`, `detectSeverityFloor`,
`classifyEvidenceQuality`) assume the plain-string shape; their five test
files (`dimension-score.test.mjs` 15 + `combine-method-findings.test.mjs` 19
+ `rollup-trust-domains.test.mjs` 19 + `detect-severity-floor.test.mjs` 14
+ `classify-evidence-quality.test.mjs` 16 = 83 tests, counted directly
rather than estimated) would all need review, not necessarily all rewrite,
since a widened shape changes what every fixture in those files
constructs. And
`classify-evidence-quality.mjs`'s own distinct-source count
(`new Set(entry.evidence_refs).size`) would need re-deriving for a shape
where two entries can share a `ref` but differ in `as_of`.

**Even with a timestamp available, the actual decay function is an
undecided parameter, not a derivable one.** Unlike the specs closed so
far — where the hard part was choosing *how to disclose* an
already-determined arithmetic result (bands vs. numbers, spread
thresholds) — time decay requires choosing the arithmetic itself: what
half-life or cutoff makes evidence "stale" for a given Assessment
Dimension (a reliability signal and a competence signal plausibly decay at
different rates), whether decay is linear, exponential, or a hard cutoff,
and whether it degrades the dimension's *value* (pulling stale evidence's
band toward the middle), its *confidence* (a form of coverage reduction
adjacent to `HCI_EVIDENCE_QUALITY_SPEC.md`'s classification), or both.
None of these parameters exist anywhere in the corpus. Picking one now,
without a real consumer or product decision forcing the choice, would be
inventing a numeric-tuning surface of exactly the kind this package's own
design philosophy has repeatedly rejected elsewhere (`HCI_TRUST_DOMAIN_SPEC.md`
§Roll-up formula's explicit rejection of "a weighted many-to-many matrix"
for the same underlying reason: an unreviewed value judgment dressed as
math).

## What would unblock this

Two separable decisions, likely needed in this order: (1) whether and how
to widen the shared `evidence_refs` shape to carry a timestamp (a schema
decision with real migration cost across the five existing consumers —
should be made once, deliberately, not as a side effect of this spec
alone); (2) an explicit decay-function choice (half-life/cutoff, per-
dimension or uniform, value-vs-confidence-vs-both) backed by an actual
product/calibration rationale, the same rigor `HCI_TRUST_DOMAIN_SPEC.md`'s
own rationale table gives its dimension→domain assignments. Tracked in
`TASKS.md`; not attempted here without both decisions.
