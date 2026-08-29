> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/04_HCI30_PRODUCT_SPEC.md. See 00_README.md in this folder for why.

# 04 — HCI-30 Product Specification

## Product mission

HCI-30 is a decision-support platform for understanding people, relationships, incentives, trust, risk, and safe collaboration.

It must not market itself as:
- a lie detector
- a psychiatric diagnostic tool
- a “good person / bad person” classifier
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
6. In which trust domains is the person stronger or weaker?
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

## Unknowns as first-class data

An unknown must be stored explicitly.

Example:

> We have never observed this person handling a severe financial dispute.

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
