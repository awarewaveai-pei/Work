# Edition Architecture Standard

## Purpose
Editions (e.g. Free/Pro/Enterprise) MUST be a data-driven configuration of one shared codebase, never a forked or duplicated deployment. This document owns the "zero forks" rule; `commercial/PRIVATE_DEPLOYMENT_STANDARD.md` and `commercial/ENTERPRISE_STANDARD.md` derive from it.

## One Codebase, Many Editions
1. There MUST be exactly one codebase (private-deployment instances per `commercial/PRIVATE_DEPLOYMENT_STANDARD.md` run copies of it, not forks of it). An edition MUST be expressed entirely as a combination of entitlements (`commercial/ENTITLEMENT_STANDARD.md`), numeric/behavioral limits, and policy toggles evaluated at runtime — never as a compile-time flag that produces a structurally different binary, nor a maintained branch/fork.
2. A feature or limit that only some editions receive MUST be gated by an entitlement check at the point of use, not by editing out code paths per edition.

## Defining an Edition
3. An edition MUST be declared as data: a named set of entitlement grants, limit values, and policy values, versioned and stored the same way `capabilities/catalog.json`-style catalogs are versioned in this framework's own configurator. Editions MUST be diffable against each other.
4. Renaming or restructuring an edition's grants is a governed change: it MUST follow `engineering/COMPATIBILITY_DEPRECATION_STANDARD.md`'s expand/migrate/contract sequence and `kernel/11_LIFECYCLE_AND_DEPRECATION_CONTRACT.md` if it downgrades functionality already sold to existing customers — this is a deprecation/compatibility concern, not a rule exception.

## Zero Forks — Prohibitions
5. It is PROHIBITED to duplicate a module, service, or code path solely to produce edition-specific behavior. If two editions need meaningfully different logic, the difference MUST be expressed as a strategy/policy object selected by entitlement, not a copy-pasted variant.
6. It is PROHIBITED to hardcode an edition name (e.g. `if plan == "enterprise"`) inside domain or business logic. Logic MUST check the specific entitlement/limit that matters, not the edition label — so a new edition can be introduced without touching that code.

## Edition Transitions
7. Upgrading or downgrading a customer's edition MUST be an atomic entitlement-set transition consistent with `commercial/CUSTOMER_LIFECYCLE.md`; there MUST NOT be a window where old and new entitlement sets are both partially active.
8. Downgrade MUST define, per entitlement/limit, what happens to usage that already exceeds the new lower limit (hard block vs. grace period vs. read-only) — this cannot be left unspecified per edition.

## Verification
9. `make`-style or CI-equivalent verification for a generated system SHOULD include an edition matrix test: instantiate each declared edition and assert only its declared entitlements are active (mirrors this framework's own ALL-YES/ALL-NO selection-matrix testing in `assurance/SELECTION_OUTPUT_CORRECTNESS_STANDARD.md`).
10. Edition definitions MUST be reviewable independently of the code that reads them (`assurance/INDEPENDENT_REVIEW_STANDARD.md` where applicable) — a commercial/product owner should be able to audit what Enterprise actually grants without reading application code.
