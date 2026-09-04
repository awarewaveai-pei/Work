# Unit Economics Standard

## Purpose
Define what must be measurable to know whether the product is profitable per unit (per seat, per tenant, per usage-unit) — without this, pricing and packaging decisions elsewhere in this framework's commercial layer are guesswork.

## Cost Attribution
1. Every cost category material to the product's economics (compute, storage, third-party AI/API costs, human support cost, observability/tooling overhead) MUST be attributable to a unit of analysis (per customer, per tenant, per plan) — costs that can only be seen in aggregate MUST be flagged as a gap, not silently ignored.
2. Cost attribution MUST reuse the same usage event log that feeds `commercial/ENTITLEMENT_STANDARD.md` limit enforcement and `commercial/BILLING_ARCHITECTURE.md` invoicing — a system MUST NOT maintain a third, independent usage counter purely for internal cost accounting.

## Gross Margin per Segment
3. Gross margin (revenue minus directly attributable COGS) MUST be computable per customer segment (e.g. per plan/edition, per operating model in `commercial/OPERATING_MODEL_STANDARD.md`) on a defined cadence, not only at whole-company aggregate level.
4. A segment or individual account operating at structurally negative gross margin for a sustained, defined period MUST trigger a documented review trigger (pricing change, cost optimization, or deliberate accepted-loss-leader decision) — it MUST NOT go unnoticed because only blended margin is tracked.

## AI/Compute Cost Discipline
5. Where the product includes AI-driven or otherwise variable-cost capabilities, cost-per-unit-of-use for those capabilities MUST be tracked separately from fixed infrastructure cost, since these costs typically scale with usage in a way flat infrastructure costs don't.

## Review Triggers
6. Unit economics MUST be reviewed whenever: a new edition/entitlement bundle is introduced, a major cost driver's pricing changes (vendor price increase), or gross margin drifts outside a documented acceptable band. These are the concrete, checkable review triggers — not "review economics periodically."

## Evidence, Not Assertion
7. Unit economics figures MUST be reproducible from the underlying event/cost data at a stated point in time (consistent with this framework's Evidence Law) — a unit economics claim with no recomputable source data MUST be labeled ASSUMED, not presented as VERIFIED.
