# Productization Standard

## Purpose
Define the criteria an internal capability must meet before it is marked "generally available" as a sellable product surface — closing the gap between "the engineering works" and "this is safe to sell."

## Product Boundary
1. Every sellable capability MUST have an explicit, documented product boundary: what it does, what it explicitly does not do (non-goals), and which buyer/user segment it targets. A capability without a stated non-goal set is not yet productized.
2. The product boundary MUST be traceable back to the domain model it's built on (`engineering/DOMAIN_ARCHITECTURE_STANDARD.md`) so product-level claims don't drift from what the system actually guarantees.

## Buyer, User, and Value
3. Productization MUST distinguish buyer (who decides/pays) from user (who operates it day to day) where they differ, and MUST state the value proposition to each separately — a capability that only articulates value to one of the two is incompletely productized for enterprise/team contexts.

## Readiness Criteria Before GA
4. A capability MUST NOT be marked generally available until it has: an entitlement definition (`commercial/ENTITLEMENT_STANDARD.md`), a support runbook, a defined SLA or explicit "best-effort" statement, and pricing/packaging decided under `commercial/EDITION_ARCHITECTURE.md`. Missing any of these means the capability is beta/preview at most.
5. Preview/beta capabilities MUST be labeled as such to the buyer and MUST NOT be billed at full-product pricing while still lacking GA readiness criteria.

## Supportability
6. A capability MUST NOT ship to GA without a documented path for support staff to diagnose common failures without engineering escalation for every single ticket — an unsupportable feature is not yet a product.

## Sunset
7. Productization is reversible: a GA capability being deprecated MUST follow `engineering/COMPATIBILITY_DEPRECATION_STANDARD.md`'s deprecation sequence, including customer notice, not simply disappear from the next release.
