# HCI Permission Spec — status: honestly OPEN, not written

Status: **deliberately not written**, per `21_HCI_TOP_TIER_GAP_ANALYSIS.md`
P0-04's own path listing this file, `HCI_TRUST_DOMAIN_SPEC.md`'s own
out-of-scope entry ("Permission implications of a given Trust Domain
profile"), and independently corroborated by
`16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md`'s own tracked-decisions table
("Permission model v1 — Still open — `21` P0-01/P0-04"). This file exists
so the promised path resolves to something, and so the exact blocking
question is recorded precisely rather than left as a bare "TODO" — same
"誠實留 OPEN 不造假" (honestly leave OPEN, don't fake it) discipline
`HCI_CONTRADICTION_SPEC.md` and `HCI_TIME_DECAY_SPEC.md` use.

## What this file is supposed to answer

Per `HCI_TRUST_DOMAIN_SPEC.md`'s framing: given a Trust Domain profile (the
7-value vector `rollupTrustDomains` produces, now including
`dimension_disagreement` per `HCI_TRUST_DOMAIN_SPEC.md` §Domain-internal
disagreement), what access/collaboration **permission** follows?

## Why this is not answered here

**Correction (critic review, 2026-09-06): an earlier version of this
section falsely claimed `Permission` has "no defined shape anywhere in the
corpus" and "no enum of permission levels."** That claim was wrong and is
directly falsifiable by grep — caught only after it had already spread
into three other files (`HCI_DECISION_BIAS_CHECK_GATE.md`,
`HCI_TRUST_DOMAIN_SPEC.md`, `21_HCI_TOP_TIER_GAP_ANALYSIS.md`), all
corrected in the same pass as this file. This is the third time this
session a "verify before claiming absence" lapse has been caught by
review rather than by grepping first — see `TASKS.md`'s own
cross-referenced tracking of the pattern. What actually exists:

- **`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:98-100`, §Permission UI,
  defines a full seven-tier named enum**: `P0 Public`, `P1 Internal`,
  `P2 Confidential`, `P3 Financial`, `P4 Strategic`, `P5 Administrative`,
  `P6 Ownership / Governance`.
- **`02_PRODUCT_BOUNDARIES.md:59` defines Permission's semantics and
  placement rule**: "governs *who inside a tenant may see or act on a
  given piece of HCI content* — it is an access-control axis," explicitly
  orthogonal to Data Classification (PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED,
  `11_SECURITY_PRIVACY_GOVERNANCE.md`) — "Keep them as two separate,
  independently-set fields on every governed entity." The corpus even
  names the failure mode of conflating the two axes: "risks producing an
  incorrect authorization model if an implementer treats them as the same
  axis" (`HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-08).

So `Decision` and `Permission` receive **equal treatment** in the corpus —
both fully-enumerated in the same document (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md`
§Decision visualization at `:96` names Decision's six values; §Permission
UI two sections later at `:100` names Permission's seven tiers) — not the
lopsided contrast an earlier version of this paragraph drew.

**A real trap this correction surfaced, worth recording precisely because
it is easy to get wrong**: Collaboration Stage (`04_HCI30_PRODUCT_SPEC.md`
§Collaboration stages, 0-6) and the Permission tier enum (`19:100`, P0-P6)
are both seven-level and share overlapping labels, but their indices do
**not** align — "Confidential" is Stage 4 but `P2`; "Strategic" is Stage 5
but `P4`; only "Governance" happens to coincide at index 6 on both. An
implementation that assumes `permission_tier === collaboration_stage`, or
derives one from the other by name-matching alone, would silently produce
wrong access grants. Neither this file nor `HCI_DECISION_BIAS_CHECK_GATE.md`
makes that assumption (the bias-check gate consumes Collaboration Stage
only, never the Permission tier), but a future implementer connecting the
two must not either.

**What genuinely remains open, now correctly scoped**: the Permission
*tier* enum and its access-control semantics are defined; **the mapping
from a Trust Domain profile to a specific tier is not**, and neither is
the rest of a "granted permission" record's shape beyond the tier itself
(scope? which entity it attaches to? who granted it?). That mapping is a
business/risk-tolerance judgment, not a derivable formula. Every P0-04
spec closed so far (`HCI_TRUST_DOMAIN_SPEC.md`, `HCI_CONFIDENCE_SPEC.md`
partial, `HCI_RISK_SPEC.md` partial, `HCI_EVIDENCE_QUALITY_SPEC.md`
partial) shares one property: each answers a question with a mechanically
derivable, or at minimum consistently disclosable, arithmetic rule
(mean-of-ranks, spread thresholds, distinct-ref counts) — the harder
judgment calls those files made (band-vs-number, the disagreement
thresholds, the source-independence disclaimer) were all *framing*
decisions about how to present already-computed values, not decisions
that manufacture a new real-world consequence. "Which of the seven
already-named tiers should a `HIGH` Financial Trust / `VERY_LOW`
Confidentiality Trust profile receive" is a different kind of question: it
asks how much risk this system's operator is willing to accept in
exchange for what kind of collaboration, at what collaboration stage, for
what tenant's declared lawful purpose
(`governance/wave1/HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY.md`'s existing
tenant-authorization / lawful-basis / source-terms record classes,
`:12-16`, are the closest existing precedent for this kind of judgment,
and that document is itself a policy artifact, not a formula). Inventing
this mapping without an explicit product/legal decision would be exactly
the kind of "AI infers a scoring/decision policy" move `ADR-0004`'s own
Decision section names as out of bounds by analogy — not identical to the
"no universal trust score" prohibition, but the same underlying failure
mode (fabricated, undisclosed judgment presented as mechanical output)
applied to a permission decision instead of a trust score.

**A real, closely related gap was found and closed instead
(`HCI_DECISION_BIAS_CHECK_GATE.md`)**: `04_HCI30_PRODUCT_SPEC.md:138`'s
already-fully-specified requirement that an `EXIT`/`PROCEED_WITH_CONTROLS`
decision at Stage 4+ needs a completed bias-check pass first. That gate
does not touch a Trust Domain profile and does not answer this file's
question — see that document's own §Why this is not Permission — but it
was the one adjacent, well-specified, zero-existing-implementation item
found while investigating this gap, and closing it needed no invented
judgment.

## What would unblock this

An explicit product/operator decision defining, at minimum: (1) a concrete
mapping rule from a 7-domain Trust Domain profile (plus Collaboration
Stage — mindful of the index-mismatch trap above) to one of the seven
**already-named** `19:100` tiers, disclosed with the same rigor
`HCI_TRUST_DOMAIN_SPEC.md`'s own rationale table uses for its dimension→
domain assignments; (2) the rest of a "granted permission" record's shape
beyond the tier itself (what entity does it attach to, who/what granted
it, is it time-bounded); (3) how this interacts with `HCI_RISK_SPEC.md`'s
still-open Risk-to-Permission mapping item (a second, related but distinct
P0-04 gap in that file's own out-of-scope list) — the two should likely be
designed together, not sequentially, since a risk severity floor and a
trust-based permission tier plausibly both feed the same Decision-Output
step. Tracked in `TASKS.md`; not attempted here without that decision.
