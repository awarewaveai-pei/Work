# 04 — HCI-30 Product Specification

## Product mission

HCI-30 is a decision-support platform for understanding a Subject (Person; see `02_PRODUCT_BOUNDARIES.md` for the pending decision on Organization-as-Subject), relationships, incentives, trust, risk, and safe collaboration.

It must not market itself as:
- a lie detector
- a psychiatric diagnostic tool
- a "good person / bad person" classifier
- a guaranteed prediction engine
- an autonomous employment or credit decision engine

## Core principle

```text
Evidence
→ Pattern
→ Confidence
→ Risk
→ Permission
→ Decision
→ Outcome
→ Recalibration
```

Not:

```text
Person
→ Impression
→ Judgment
```

## Primary outputs

HCI should answer:

1. What do we know?
2. What is inferred?
3. What remains unknown?
4. How reliable are the sources?
5. What repeated behavior patterns exist?
6. In which trust domains is the Subject stronger or weaker?
7. How aligned are incentives?
8. What is the collaboration risk?
9. What permissions are currently justified?
10. What next validation should be performed?
11. What would change the conclusion?
12. What is the rollback/exit plan if wrong?

## Trust domains

Never collapse into one universal score.

Recommended domains:

```text
Operational Trust
Competence Trust
Confidentiality Trust
Financial Trust
Strategic Trust
Reputational Trust
Governance / Power Trust
```

## Core analysis dimensions

At minimum:

1. Integrity consistency
2. Reliability / fulfillment
3. Competence
4. Communication quality
5. Boundary respect
6. Reciprocity / fairness
7. Conflict repair
8. Power behavior
9. Incentive alignment
10. Risk externalization
11. Information governance
12. Learning/adaptability
13. Context stability
14. Predictability

> ✅ **RESOLVED (2026-09-06)** — the roll-up formula from these 14 dimensions to the 7 Trust Domains above is now specified: `Projects/internal/hci30/docs/intelligence/HCI_TRUST_DOMAIN_SPEC.md` (a strict 2-dimensions-per-domain partition, mean-of-ranks aggregation, round-half-down tie-break; qualitative bands only, per `ADR-0032`, never a bare number). This closes only the roll-up-formula sub-item of `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-04 (Mathematical Specifications) — the other six P0-04 specs (evidence quality, confidence, risk, permission, contradiction, time decay) remain open. Full original-gap reasoning: `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md`.

## Relationship lifecycle

```text
NEW
OBSERVING
LIMITED
ACTIVE
TRUSTED
STRATEGIC
RESTRICTED
PAUSED
EXITING
CLOSED
```

No arbitrary jump from NEW to STRATEGIC.

## Collaboration stages

```text
Stage 0 — Public interaction
Stage 1 — Low-risk test
Stage 2 — Limited collaboration
Stage 3 — Material collaboration
Stage 4 — Confidential collaboration
Stage 5 — Strategic partnership
Stage 6 — Governance partnership
```

## Decision output

Use:

```text
PROCEED
PROCEED_WITH_CONTROLS
LIMIT_ACCESS
PAUSE
REVIEW_REQUIRED
EXIT
```

Never use:

```text
GOOD_PERSON
BAD_PERSON
```

**New in V2 — bias-check is a blocking precondition, not optional report content**: finalizing an `EXIT` or `PROCEED_WITH_CONTROLS` decision on a Stage 4+ (Confidential/Strategic/Governance) collaboration **requires** a completed analyst-bias-check pass (`05_HCI30_INTELLIGENCE_METHODS.md` §Cognitive Bias Defense) as a precondition, not an optional field a report "may expose." V1 documented a thorough bias-defense framework and never actually required it to run before a high-impact decision — a system that documents a control this thoroughly and never gates on it has built a warning label, not a seatbelt (`HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-16). This gate applies only at Stage 4+ specifically, to avoid over-processing low-stakes Stage 0-3 decisions.

## Unknowns as first-class data

An unknown must be stored explicitly.

Example:

> We have never observed this Subject handling a severe financial dispute.

Unknowns must drive next-validation recommendations.

## Cooperation safety principle

The system is not considered mature unless it can answer:

> If all current assessments are wrong, what protects us?

Possible controls:
- escrow
- milestone payments
- dual approval
- limited API permissions
- contract clauses
- audit rights
- insurance
- data segregation
- credential rotation
- exit procedure

**New in V2 — this is a recorded entity, not only report prose**: a `Control` / `Mitigation` domain object (see `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Core Entities) tracks which of the above controls are actually in place for a given Collaboration, when they were applied, and by whom — turning the Cooperation Safety Principle into an auditable record rather than a report-writing convention. This directly serves the brand promise in `15_BRAND_AND_GO_TO_MARKET_PRINCIPLES.md` ("shows... how to collaborate safely even when uncertain") by making it structurally checkable (`HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-09).
