# HCI Trust Domain Spec — 14-dimension-to-7-domain roll-up formula

Status: **two decisions of different kinds, both operator-delegated, kept
explicit rather than blurred together** (critic review, 2026-09-06 M7,
which found the original version of this header conflated them):

1. **The 14→7 aggregation formula itself** (§Roll-up formula, §Aggregation
   rule) — `04_HCI30_PRODUCT_SPEC.md` said, before this change resolved the
   SPEC GAP it named (see `git log -p -- 04_HCI30_PRODUCT_SPEC.md`), that
   this is "a mathematical-specification question — not a value trade-off —
   no operator sign-off needed, an implementer needs to derive the
   formula." That sentence licenses *this* decision specifically.
2. **The score-scale choice (bands, not numbers) and the seven domains'
   working definitions** (§Score semantics, the rationale table's
   "Rationale" column) — these are **not** covered by the sentence above,
   which is scoped to the aggregation math only. They are product/definition
   judgments, made under the operator's separate, general delegation for
   HCI30 architecture decisions ("需要決定的事都你決定", 2026-09-06) and
   `ADR-0004`'s own "Decision authority: Operator-delegated" precedent —
   not because `04:87` says no sign-off is needed for them.

Operator may supersede either with a later explicit decision.

Path per `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04 (Mathematical
Specifications): this file closes the **Trust-Domain-to-Assessment-Dimension
roll-up formula** sub-deliverable only. P0-04 names six other sibling specs
(`HCI_EVIDENCE_QUALITY_SPEC.md`, `HCI_CONFIDENCE_SPEC.md`, `HCI_RISK_SPEC.md`,
`HCI_PERMISSION_SPEC.md`, `HCI_CONTRADICTION_SPEC.md`,
`HCI_TIME_DECAY_SPEC.md`) that this document does **not** write — see
§Explicitly out of scope.

## Context

`04_HCI30_PRODUCT_SPEC.md:87` (before this change; see git history) named
the gap this closes: the 14 granular, observation-facing "Core analysis
dimensions" (`04:68-85`) and the 7 coarse, decision-facing "Trust domains"
(`04:52-66`) were never declared to be the same axis system, and no
aggregation function existed. `ADR-0004` gates 4-5
(`governance/ADR-0004-no-universal-human-trust-score.md`) already enforce
the *shape* constraint this formula must produce (a per-domain vector, never
a single scalar) but deliberately left the formula itself unwritten — "This
ADR does not resolve the P0-04 roll-up-formula gap itself." Note that the
seven domains' meanings (`04:59-65`) are otherwise defined nowhere in the
corpus except as a bare list — this spec's rationale table (below) is the
first place any of them is given an operational definition, which is why it
is called out above as the second, separately-authorized kind of decision.

**A related design choice made while writing this spec, not a mandated
correction**: `ADR-0032`
(`governance/ADR-0032-personality-and-behavioral-method-disposition.md`,
ACCEPTED) ratifies that "qualitative bands are the only confidence surface
until Wave 11 delivers calibration evidence" for four named axes — Evidence
Confidence, Model Agreement, Method Robustness, and Decision Confidence
(`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:29-32`) — each a *second-order*
judgment of how sure HCI is about a finding. A Trust-Domain `value` is a
*first-order* substantive assessment, not itself a probability statement, so
ADR-0032's own enumerated scope does not literally require this. This spec
nonetheless **extends ADR-0032's band convention here by analogy**: the
harm ADR-0032 guards against — a number reading as a calibrated measurement
before any calibration evidence exists — applies with at least equal force
to a per-domain trust value, given `ADR-0004`'s own rejected-alternative
text names exactly this shape ("once a 'Person X = 62/100 trust' fact is
stored... it becomes permanent reputational surface"). **This extension is
new and, in one respect, stricter than ADR-0032 itself**: ADR-0032 keeps a
calibration escape hatch (a nullable raw-percentage field gated on a
required `calibration_evidence_ref`); this spec provides no such hatch for
Trust-Domain values — bands only, unconditionally, until a future revision
adds one. That is a deliberate V1 simplification (no consumer exists yet to
need the hatch), not an oversight, and is recorded here so it reads as a
decision rather than an accident.

**Design change applied to already-shipped code as a result**: gate 4's
validator (`packages/contracts/validate-trust-domain-response.mjs`)
originally required `value` to be a finite number, written before this
by-analogy extension was decided. Changed in the same commit that adds this
spec — see that file's own commit history. No consumer of gate 4 existed
yet (no real trust-read endpoint), so this change has zero migration cost,
the
cheapest point at which to catch it.

## Score semantics

Every Assessment Dimension (14) and every Trust Domain (7) value is
expressed on the same 5-point ordinal qualitative scale, per ADR-0032:

```text
VERY_LOW | LOW | MODERATE | HIGH | VERY_HIGH
```

Each band maps to a defined probability/strength range exactly as
`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md` §Confidence display already
specifies for confidence (ICD 203 convention) — this spec reuses that same
five-band scale rather than defining a second one, since both are
pre-calibration derived judgments with the same fabricated-precision risk.

An internal numeric rank (`VERY_LOW=1 .. VERY_HIGH=5`) may be used inside
the roll-up computation (§Aggregation rule) but **must never be the value
surfaced** in a response, report, contract, or UI — this generalizes
ADR-0032's "reserve numeric percentages for after the algorithm is
calibrated" rule from confidence display to Trust-Domain/Dimension display,
since neither has calibration evidence at Wave 1-5.

A dimension or domain with **zero evidence-linked inputs is never assigned
a band** — not even the middle one — because defaulting to `MODERATE` would
silently misrepresent "we know nothing" as "we observed an average result,"
exactly the failure `04_HCI30_PRODUCT_SPEC.md` §Unknowns as first-class data
forbids ("An unknown must be stored explicitly"). Concretely: a Trust Domain
with no evidence for either of its assigned dimensions (§Roll-up formula)
simply does not appear as a row — `hci.subject_records`'s own schema
already makes this the only representable state, since every `TRUST_DOMAIN`
row requires a non-null `evidence_ref_id`/`evidence_ref_kind`
(`0011_wave1_trust_domain_scope_up.sql:112-122`); there is no schema slot to
put a valueless row into in the first place. Gate 4 already accepts an
empty `domains: []` vector (`TRUST-NEG-03` self-test, "accepts an empty
domains vector") — no new mechanism is needed for the fully-unknown case.

## Layering: this spec vs. gate 5's `decision_weight` — and an open gap between them

Multiple HCI methods may each produce a finding about the same Assessment
Dimension (e.g. a payment-history method and a communication-timeliness
method both bearing on "Reliability / fulfillment"). Combining *those*
per-method findings into one dimension-level band is a separate concern
from this spec's job (combining 14 already-resolved dimension values into 7
domain values) — but **it is not, as an earlier version of this section
claimed, already governed by `ADR-0004` gate 5's `decision_weight` field**
(critic review, 2026-09-06 M6). Checked directly:
`packages/contracts/validate-method-contract.mjs` validates only that
`decision_weight` is a finite number (single-domain) or a plain object
keyed by domain names (multi-domain) — it defines no combination semantics
at all, and it is keyed by **Trust Domain**, not by Assessment Dimension, so
it cannot structurally express "how do method A's and method B's findings
about the Reliability/fulfillment *dimension* combine." That question has
**no owner yet**. This spec's own input — "the already-resolved 14
dimension-level values" — therefore rests on a mechanism that does not
exist. `HCI_CONFIDENCE_SPEC.md` (not yet written, P0-04) is the right place
to define it; until it does, a real implementation feeding this spec's
`rollupTrustDomains` needs its own (undocumented, ad hoc) answer to
cross-method-per-dimension combination, which is exactly the "two
implementers reinvent the same gap differently" failure P0-04 exists to
prevent. Tracked in `TASKS.md`, not solved here or silently assumed away.

## Roll-up formula (14 → 7)

**Design choice: a strict partition, not a weighted many-to-many matrix.**
Each of the 14 dimensions maps to exactly one primary domain (2 dimensions
per domain, since 14 = 7 × 2), rather than a 14×7 weighted-contribution
matrix. Reasons, in order of importance:

1. **Smaller, more auditable judgment.** A full weighted matrix requires
   justifying 98 numeric cells; a partition requires justifying 14
   categorical assignments — each independently checkable against the
   dimension's and domain's plain-English meaning, with no numeric tuning
   surface that could later be adjusted to smuggle in different behavior
   (the same "structurally unrepresentable, not merely undocumented"
   philosophy `ADR-0004` gates 1-3 already use for the schema layer,
   applied here to the assignment layer).
2. **Trivial determinism.** P0-04's own "Expected result" is "independent
   implementations given the same inputs produce equivalent outputs." A
   fixed partition with a fully-specified tie-break rule (below) has zero
   free parameters; two independent implementations of it cannot disagree.
3. **No dimension is double-counted or silently dropped.** Every one of the
   14 dimensions has exactly one home; every one of the 7 domains has
   exactly two contributing dimensions. This is checked mechanically by
   `tests/unit/intelligence/assessment-dimensions.test.mjs`, not merely
   asserted here.

This is a V1 partition, explicitly revisable — each assignment below is the
**primary** aggregation link only; a plausible secondary domain is noted for
transparency but does not affect the score (recording a dimension's
secondary relevance without scoring it twice avoids exactly the kind of
undeclared double-weighting that would reintroduce a numeric-tuning
surface).

| Domain | Assigned dimensions (primary) | Rationale | Plausible secondary domain (not scored) |
|---|---|---|---|
| **Operational Trust** | Reliability/fulfillment; Predictability | Can they be relied on to execute day-to-day commitments as agreed, consistently? | Strategic (long-run predictability) |
| **Competence Trust** | Competence; Learning/adaptability | Do they have — and keep developing — the skill/capability they claim? | — |
| **Confidentiality Trust** | Information governance; Boundary respect | Can sensitive information and agreed-upon access limits be trusted with them? | Governance/Power (boundary-as-power) |
| **Financial Trust** | Incentive alignment; Risk externalization | Are their financial/material incentives aligned, and do they avoid pushing risk onto counterparties? | Strategic (aligned goals) |
| **Strategic Trust** | Reciprocity/fairness; Context stability | Is this a mutually-beneficial relationship that holds up as circumstances change? | Financial (fair dealing) |
| **Reputational Trust** | Integrity consistency; Communication quality | Is their character and self-representation consistent and defensible to outside observers? | Operational (day-to-day communication) |
| **Governance/Power Trust** | Power behavior; Conflict repair | Do they exercise authority and resolve conflict through legitimate, accountable process? | — |

Full 14-dimension inventory with `04_HCI30_PRODUCT_SPEC.md` line references:
Integrity consistency (`:72`), Reliability/fulfillment (`:73`), Competence
(`:74`), Communication quality (`:75`), Boundary respect (`:76`),
Reciprocity/fairness (`:77`), Conflict repair (`:78`), Power behavior
(`:79`), Incentive alignment (`:80`), Risk externalization (`:81`),
Information governance (`:82`), Learning/adaptability (`:83`), Context
stability (`:84`), Predictability (`:85`).

### Machine-checked partition (SSOT for the table above)

The prose table above is for humans; the block below is what
`tests/unit/intelligence/assessment-dimensions.test.mjs` actually parses and
compares against `packages/intelligence/assessment-dimensions.mjs`'s
`DIMENSION_TO_DOMAIN` export, so the two cannot silently drift apart (critic
review, 2026-09-06 M1 — the prose table and the code had no binding test;
a swapped assignment passed the full suite). Editing the partition means
editing **both** the table above and this block, in the same change.

```text
RELIABILITY_FULFILLMENT -> OPERATIONAL
PREDICTABILITY -> OPERATIONAL
COMPETENCE -> COMPETENCE
LEARNING_ADAPTABILITY -> COMPETENCE
INFORMATION_GOVERNANCE -> CONFIDENTIALITY
BOUNDARY_RESPECT -> CONFIDENTIALITY
INCENTIVE_ALIGNMENT -> FINANCIAL
RISK_EXTERNALIZATION -> FINANCIAL
RECIPROCITY_FAIRNESS -> STRATEGIC
CONTEXT_STABILITY -> STRATEGIC
INTEGRITY_CONSISTENCY -> REPUTATIONAL
COMMUNICATION_QUALITY -> REPUTATIONAL
POWER_BEHAVIOR -> GOVERNANCE_POWER
CONFLICT_REPAIR -> GOVERNANCE_POWER
```

## Aggregation rule

Given the (0, 1, or 2) dimension values available for a domain's two
assigned dimensions, each of which carries at least one evidence reference,
enforced at the function boundary
(`packages/intelligence/rollup-trust-domains.mjs`'s own input validation,
not a schema constraint — no `AssessmentDimension` table exists yet despite
`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:24` naming it as a core
entity; that schema-level guarantee is owed to P0-01, not this spec):

- **0 of 2 present** → the domain does not appear in the output at all (no
  row, no band — see §Score semantics).
- **1 of 2 present** → the domain's value is exactly that one dimension's
  band. `coverage = PARTIAL`. `evidence_refs` = that dimension's evidence
  refs, in the order supplied.
- **2 of 2 present** → convert each band to its rank (`VERY_LOW=1 ..
  VERY_HIGH=5`), take the arithmetic mean of the two ranks, and round to
  the nearest integer rank. **Tie-break: round a `.5` mean DOWN, never up**
  — consistent with this system's existing conservative bias (e.g. the
  cognitive-bias-defense gate, `ADR-0004`'s own preference for the
  structurally-safer alternative at every choice point) — overstating trust
  is more harmful than understating it. `coverage = FULL`. `evidence_refs`
  = the deduplicated union of both dimensions' evidence refs, **ordered by
  each dimension's position in `ASSESSMENT_DIMENSIONS`, not by input order**
  (`RELIABILITY_FULFILLMENT` before `PREDICTABILITY` for Operational, etc.
  — see the machine-checked list above for every domain's pair order). This
  ordering is normative, not incidental — pinned so two independent
  implementations given the same input cannot disagree merely by iterating
  a `Map`/`Set` differently (critic review, 2026-09-06 M3, which found the
  first version of this spec left the order unstated while two of its own
  test cases already disagreed on it).

**The rank encoding (`VERY_LOW=1 .. VERY_HIGH=5`) is normative for this
aggregation; it is not a claim that the five bands are equally spaced on
whatever probability scale a future display mapping gives them** (critic
review, 2026-09-06 M5). `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04 still owes a
qualitative-band-to-probability-range mapping (§Explicitly out of scope,
below) — ICD 203's seven canonical terms have unequal widths, and even a
5-band collapse of them would not be evenly spaced. Whatever that mapping
turns out to be, it is a **display-only** concern: this spec's mean-of-ranks
arithmetic uses the 1-5 integer encoding above and must not be re-derived
from a probability midpoint once that mapping exists, or two
"conformant" implementations (one using ranks, one using probability
midpoints) would silently disagree on some inputs.

Worked example: `Reliability/fulfillment = HIGH (4)`,
`Predictability = MODERATE (3)` → mean = 3.5 → round-half-down → `3` →
`Operational Trust = MODERATE`, `coverage = FULL`.

This is a pure function of its inputs — no model calls, no hidden state, no
`Date.now()`/`Math.random()` — so determinism (P0-04's "Expected result")
holds by construction; `tests/unit/intelligence/rollup-trust-domains.test.mjs`
exhaustively checks all 25 rank-pair combinations rather than sampling a
few.

## Explicitly out of scope (forward references to their own P0-04 specs)

This spec deliberately does not define, and a future implementer must not
silently invent inline here:

- **Source independence** across a single dimension's evidence inputs →
  `HCI_EVIDENCE_QUALITY_SPEC.md` (not yet written).
- **Contradiction** between evidence inputs (two sources disagreeing about
  the same dimension) → `HCI_CONTRADICTION_SPEC.md` (not yet written) — a
  separate P0-04 sibling from evidence quality, not folded into it.
- **Time decay** of evidence relevance before it feeds a dimension →
  `HCI_TIME_DECAY_SPEC.md` (not yet written).
- **Model disagreement / calibration**, and **cross-method combination
  within one dimension** (multiple methods bearing on the same Assessment
  Dimension), of the method(s) that produce a dimension's own band in the
  first place → `HCI_CONFIDENCE_SPEC.md` (not yet written). See §Layering
  above — this is a genuinely unowned gap today, not one gate 5 already
  closes.
- **The qualitative-band-to-probability-range mapping** (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`
  §Confidence display asks for one but does not define it;
  `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04 names it explicitly) →
  `HCI_CONFIDENCE_SPEC.md` (not yet written). §Aggregation rule above
  already notes this spec's rank encoding must not be re-derived from
  whatever that mapping turns out to be.
- **Risk severity exceptions** (a single severe finding overriding an
  otherwise-favorable average) → `HCI_RISK_SPEC.md` (not yet written). This
  spec's mean-of-two-ranks rule has no severity override; a domain fed one
  `VERY_HIGH` and one `VERY_LOW` dimension rolls up to `MODERATE`
  (rank 3) under this spec alone, which may be the wrong answer for a
  genuinely severe finding — that judgment belongs to the risk spec, not
  smuggled into this aggregation rule.
- **Permission implications** of a given Trust Domain profile →
  `HCI_PERMISSION_SPEC.md` (not yet written).

Each of the above is tracked as an open item in `TASKS.md` rather than
solved here, so the gap stays honestly visible instead of quietly absorbed
into this file's scope.

## Verification

- `packages/intelligence/assessment-dimensions.mjs` — the 14 dimension
  constants and the `DIMENSION_TO_DOMAIN` partition map.
- `packages/intelligence/rollup-trust-domains.mjs` — the pure aggregation
  function.
- `tests/unit/intelligence/assessment-dimensions.test.mjs` — proves the
  partition covers all 14 dimensions exactly once across all 7 domains (no
  gap, no double-assignment).
- `tests/unit/intelligence/rollup-trust-domains.test.mjs` — exhaustive
  25-combination rank-pair test, `PARTIAL`/`FULL` coverage tests, the
  0-of-2 omission case, and an end-to-end composition test proving the
  roll-up's own output always passes gate 4's
  `validateTrustDomainResponse` unchanged.

## Rollback

Purely additive, pre-code (no real trust-read endpoint or method catalog
consumes this yet): reverting this spec and its two new modules removes the
formula entirely with no migration and no data to reconcile. A future
change to the partition table or the tie-break rule requires updating
`assessment-dimensions.mjs`'s `DIMENSION_TO_DOMAIN` map and re-running the
exhaustive test above, not a schema migration.
