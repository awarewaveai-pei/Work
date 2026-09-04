# Customer Lifecycle Standard

## Purpose
Define the canonical account/subscription lifecycle so every other commercial standard (billing, entitlement, exit) references one shared state machine instead of inventing local, divergent states.

## Canonical States
1. The canonical lifecycle states MUST be a closed, named set — for example: `trial`, `active`, `past_due`, `grace`, `suspended`, `canceled`, `deleted`. A generated system MUST publish its actual state set in a registry analogous to the status-code registry in `governance/STATUS_CODE_STANDARD.md`; free-text lifecycle strings are prohibited.
2. Every state MUST have a documented meaning covering: what functionality is available, whether billing is active, and whether the state is customer-visible.

## Allowed Transitions
3. Transitions MUST be defined as an explicit allowed-transition table (from-state -> to-state -> trigger). A transition absent from the table MUST be rejected, not silently permitted because the underlying code path happened to allow it.
4. Terminal states (for example `deleted`) MUST NOT have outbound transitions except the documented win-back exception in `commercial/CUSTOMER_EXIT_STANDARD.md`.

## Transition Triggers and Authority
5. Each transition MUST declare its trigger class: customer self-service action, billing-system-driven (for example payment failure), staff-initiated, or scheduled/automated (for example trial expiry). Staff-initiated transitions MUST carry authority evidence per `governance/AUTHORITY_MODEL.md`.
6. Automated transitions (trial expiry, dunning-driven suspension) MUST be deterministic and reproducible from stored state and time, not dependent on an operator remembering to run a script.

## Side Effects Per Transition
7. Every transition MUST declare its side effects across three fixed dimensions: entitlement change (`commercial/ENTITLEMENT_STANDARD.md`), customer notification, and grace-period start/end. A transition definition missing any of the three dimensions is incomplete.
8. Side effects MUST be applied atomically with the state transition, or via a defined compensating recovery path when they cannot be committed together. There MUST NOT be a state where lifecycle says `suspended` but entitlements still say `active`.

## Grace Periods
9. Any state representing "at risk but not yet cut off" (for example `past_due`, `grace`) MUST have a documented maximum duration and a documented terminal transition if unresolved. Indefinite grace is prohibited.

## Consistency With Billing and Entitlement
10. `CUSTOMER_LIFECYCLE` is the canonical state authority. `commercial/BILLING_ARCHITECTURE.md` and `commercial/ENTITLEMENT_STANDARD.md` MUST derive behavior from lifecycle-state transitions, not maintain a second, potentially divergent notion of "is this customer active."
11. Group- or tenant-level lifecycle (multiple accounts under one commercial relationship) MUST compose from this single-account state machine per `commercial/GROUP_STANDARD.md` and `commercial/TENANT_COMMERCIAL_MODEL.md`, not introduce an incompatible second lifecycle model.
