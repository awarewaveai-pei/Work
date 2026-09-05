# HCI Risk Spec — partial: severity-floor detection

Status: **operator-delegated product judgment, not math** (same category
as `HCI_TRUST_DOMAIN_SPEC.md`'s domain-definition rationale and
`HCI_CONFIDENCE_SPEC.md`'s disagreement threshold — not
`04_HCI30_PRODUCT_SPEC.md:87`'s narrower "no operator sign-off needed"
carve-out, which was scoped, before this session's changes to that file
(see `git log -p -- 04_HCI30_PRODUCT_SPEC.md`), to the 14-to-7 aggregation
formula specifically, not to every decision touching Trust Domains). The
specific severity threshold below (`VERY_LOW`, i.e. rank 1 or below) is
named explicitly so it can be revised without re-deriving the mechanism.
Operator may supersede with a later explicit decision.

Path per `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04 (Mathematical
Specifications): this file is a **partial** closure of the P0-04
`HCI_RISK_SPEC` deliverable, covering only severity-floor detection within
the 14 Assessment Dimension inputs `HCI_TRUST_DOMAIN_SPEC.md`'s roll-up
consumes. Still open (not solved here, not silently absorbed):

- **The `RiskEvent` domain entity** (`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:26`
  in the current V2 blueprint; a `risk_events` table exists under this name
  in the V1 blueprint, `HCI_AI_LEGO_Blueprint_v1/07...:160` — V2's own
  table list was not re-checked line-by-line here) — a real, persisted,
  lifecycle-bearing object this file does not create. This file is a pure
  function operating on already-resolved dimension values, not a schema or
  a workflow.
- **Risk-to-Permission mapping** — `HCI_PERMISSION_SPEC.md` (not yet
  written).
- **Collaboration-stage-aware severity** (whether a `VERY_LOW` matters more
  at Stage 4+ than Stage 0-1, `04_HCI30_PRODUCT_SPEC.md` §Collaboration
  stages) — not addressed; this file's detection is stage-agnostic.
- **Everything else P0-04 files under HCI_RISK_SPEC** beyond severity
  floors (e.g. risk aggregation across multiple Cases/Engagements over
  time) — out of scope.

## Context

`HCI_TRUST_DOMAIN_SPEC.md` §Explicitly out of scope named this gap when it
shipped: "a domain fed one `VERY_HIGH` and one `VERY_LOW` dimension rolls
up to `MODERATE` under this spec alone, which may be the wrong answer for
a genuinely severe finding... that judgment belongs to the risk spec, not
smuggled into this aggregation rule." `TASKS.md` deferred deciding it until
either a real trust-read endpoint existed or this file was written —
this file.

**Design choice: a parallel signal, not a change to the Trust Domain
average.** Two ways to fix "a severe finding gets averaged away" were
considered:

- **(Rejected) Override the domain `value`** — e.g. force a domain to
  `VERY_LOW` whenever any contributing dimension is `VERY_LOW`. Loses on
  the same grounds `HCI_TRUST_DOMAIN_SPEC.md` already used to reject a
  weighted many-to-many matrix: it reintroduces exactly the kind of
  ad hoc, undisclosed value-shaping the mean-of-ranks formula was built to
  avoid, and it would be a second change to gate 4's contract to
  accommodate an aggregation-formula tweak rather than a genuinely new
  kind of information (gate 4 has changed once for this reason so far —
  `9888bd5d7`'s ADR-0032 band correction). `HCI_CONFIDENCE_SPEC.md`'s own
  C1 finding (critic review, 2026-09-06) did not itself recommend leaving
  gate 4 alone — it found a false safety claim ("disagreement is never
  silently droppable") that the spec's own worked example disproved; not
  touching gate 4 without a real consumer forcing the decision was this
  author's chosen fix for that finding, and is applied here as the same
  chosen restraint, not as something the finding itself mandated.
- **(Chosen) A separate, parallel severity-alert function.** Same
  philosophy `combineMethodFindings`'s `disagreement` flag already
  established: don't corrupt the honest average, add a companion signal
  next to it. `detectSeverityFloor` takes the same 14-dimension input
  `rollupTrustDomains` does and returns which dimensions (and which
  domain each belongs to) crossed the severity floor — entirely
  independent of what the domain-level average says. A report can show
  "Operational Trust: MODERATE" and, from this function's output
  separately, "Predictability: VERY_LOW (see evidence)" side by side,
  which is the actual fix — visibility, not distortion of the average.

This also means `detectSeverityFloor` is **not wired into
`rollupTrustDomains` or gate 4** in this change. Composing severity alerts
into the trust-read response shape is a real, open design question (does
an alert live inside its domain's entry, alongside it at the top level, or
in a wholly separate response?) with no real consumer to force an answer
yet — disclosed as open rather than guessed at, the same restraint
`HCI_CONFIDENCE_SPEC.md`'s C1 fix applied to its own `disagreement`
propagation gap.

## Severity floor rule

Given the same 14-already-resolved-dimension-value input `rollupTrustDomains`
takes (`{dimension, value, evidence_refs}[]`, validated via
`packages/intelligence/dimension-score.mjs`, shared with the roll-up
function — a third consumer of that validation shape):

- A dimension crosses the severity floor when its `value` is `VERY_LOW`
  (rank 1) — the worst representable band, not `LOW`. `LOW` is a
  legitimately weak-but-not-alarming signal; conflating it with `VERY_LOW`
  would make the floor fire too often to be useful as an attention signal,
  the same reasoning `HCI_CONFIDENCE_SPEC.md`'s disagreement threshold
  used to distinguish ordinary variation (spread 1) from a real
  divergence (spread 2+).
- For every dimension crossing the floor, the output names: the dimension,
  the Trust Domain it belongs to (via `DIMENSION_TO_DOMAIN`), its evidence
  refs, and every *other* dimension assigned to the same domain
  (`siblings`, an array — not a single field — so this does not silently
  break if the partition is ever widened beyond 2 dimensions per domain),
  each with its own value if present in the input or `null` if absent.
  This is what lets a report say "yes, the domain average looks fine, and
  here specifically is why that is misleading": without a sibling's value,
  a reader cannot tell whether the severity floor was already visible in a
  low domain average or genuinely hidden by it.
- No finding at all → an empty array. A dimension absent from the input
  (no evidence) is not a severity floor crossing — absence is not the
  same claim as "observed and it was bad" (same "unknowns are not
  MODERATE-by-default" reasoning `HCI_TRUST_DOMAIN_SPEC.md` §Score
  semantics already uses, applied here to "absence is not a floor
  crossing" rather than "absence is not MODERATE").

Worked example: `{RELIABILITY_FULFILLMENT: VERY_HIGH, PREDICTABILITY:
VERY_LOW}` for Operational Trust → `rollupTrustDomains` reports
`Operational Trust = MODERATE` (mean of ranks 5 and 1, rounded).
`detectSeverityFloor` separately reports one alert:
`{dimension: PREDICTABILITY, domain: OPERATIONAL, value: VERY_LOW,
siblings: [{dimension: RELIABILITY_FULFILLMENT, value: VERY_HIGH}],
evidence_refs: [...]}`. A reader sees both: the domain looks moderate, and
exactly why that number is thinner than it looks.

## Verification

- `packages/intelligence/dimension-score.mjs` — the shared
  `{dimension, value, evidence_refs}` validator, extracted here on its
  third real consumer (`rollupTrustDomains`, now this file).
- `packages/intelligence/detect-severity-floor.mjs` — the function itself.
- `tests/unit/intelligence/dimension-score.test.mjs` — the shared
  validator's own tests, migrated out of `rollup-trust-domains.test.mjs`'s
  implicit coverage.
- `tests/unit/intelligence/detect-severity-floor.test.mjs` — the boundary
  between `VERY_LOW` (fires) and `LOW` (does not), the sibling-dimension
  lookup for both present and absent siblings, the empty-input and
  no-alerts cases, and duplicate/invalid-input rejection.

## Rollback

Purely additive, pre-code (no real trust-read endpoint or method catalog
consumes this yet): reverting this file and its two new modules removes
the mechanism entirely with no data to reconcile. The severity threshold
is a single named constant
(`detect-severity-floor.mjs`'s `SEVERITY_FLOOR_RANK`); revising it is a
one-line change plus a re-run of the boundary test, not a schema migration.
