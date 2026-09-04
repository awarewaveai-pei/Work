# Private Deployment Standard

## Purpose
Define what changes about the commercial model when a customer runs a dedicated, customer-cloud, on-prem, or air-gapped deployment instead of the multi-tenant hosted default — without maintaining a second codebase to do it.

## Deployment Modes
1. Private deployment modes (dedicated single-tenant hosted, customer's own cloud account, on-prem, fully air-gapped) MUST each be an explicit, named configuration of the same core system (`commercial/EDITION_ARCHITECTURE.md` zero-forks principle), not a separately maintained variant.
2. Each mode MUST document what commercial mechanisms remain live (phone-home entitlement checks, usage metering) versus what falls back to offline mechanisms (`commercial/LICENSE_ARCHITECTURE.md`).

## Licensing Without Live Phone-Home
3. Air-gapped and on-prem deployments MUST use the offline license validation path (`commercial/LICENSE_ARCHITECTURE.md`) as the entitlement source of truth; they MUST NOT silently assume full entitlements when connectivity is simply absent.
4. Usage/billing metering for private deployments MUST define how usage data reaches the vendor for billing purposes (periodic manual export, batched sync on reconnect, or contractually fixed pricing with no metering) — this MUST be decided explicitly per contract, not left ambiguous.

## Support Model
5. Private deployments MUST define a support model that does not assume the vendor has direct runtime access (diagnostic bundle export, customer-initiated log sharing, or a documented, audited remote-access exception) per `governance/AUTHORITY_MODEL.md`.

## Update Delivery
6. Update delivery to a private deployment (patches, upgrades) MUST be versioned and MUST NOT silently auto-apply where the customer's contract or connectivity model precludes it; the update mechanism MUST make the currently-running version verifiable.
7. A private deployment falling behind on updates MUST have a documented support-window policy (e.g. N versions back still supported) rather than an undefined, case-by-case decision.

## Exit
8. Private deployment MUST NOT weaken `commercial/CUSTOMER_EXIT_STANDARD.md` guarantees — export and deletion obligations apply the same way even when the vendor does not operate the infrastructure.
