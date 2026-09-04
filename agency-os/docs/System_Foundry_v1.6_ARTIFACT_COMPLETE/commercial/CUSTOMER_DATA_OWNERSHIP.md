# Customer Data Ownership Standard

## Purpose
Draw an explicit, contractual line between what the customer owns/controls and what the platform owns, so downgrade, exit, and legal events have an unambiguous answer instead of an improvised one.

## Ownership Boundary
1. Customer-generated content and configuration data MUST be classified as customer-owned; the customer retains the right to export and delete it, subject to legal hold.
2. Platform-derived data (aggregated analytics, models trained across tenants, internal operational telemetry) MUST be classified separately as platform-owned; customer exit MUST NOT be interpreted as a claim on platform-owned derived data.
3. The ownership classification of every stored data category MUST be documented and traceable. "Unclassified" is not a valid terminal state: an undocumented category defaults to the stricter classification (customer-owned) until reviewed.

## Isolation
4. Customer data MUST be isolated per the system's tenancy model (`engineering/TENANT_ARCHITECTURE_STANDARD.md`). The ownership commitments in this document are meaningless without enforced isolation.

## Training / Secondary-Use Defaults
5. Use of customer data for cross-customer purposes (model training, cross-tenant analytics, benchmarking) MUST default to OFF and require explicit, revocable, auditable customer opt-in. Silent default-on is prohibited.
6. Withdrawing consent MUST stop future secondary use. The system MUST document the technical limits of retracting already-derived artifacts (for example, a trained model checkpoint) rather than promising an erasure it cannot actually deliver.

## Export
7. The customer MUST be able to export their owned data in a documented format sufficient for practical reuse elsewhere, without platform staff intervention as the only path (`engineering/DATA_PORTABILITY_STANDARD.md`).
8. Export completeness MUST be independently verifiable (checksum, record count, or manifest) — not asserted as "best effort" with no way for the customer to confirm it.

## Data Residency
9. Any data-residency commitment MUST be enforced at the infrastructure/adapter boundary, not asserted only in policy text. Sub-processors and backups MUST be included in the residency boundary, never exempted by omission.
10. Changes to sub-processors or processing locations that affect a residency commitment MUST be disclosed before taking effect, with a defined objection/exit path for affected customers.

## Sub-processor Disclosure
11. The current sub-processor list MUST be discoverable by the customer at any time, not only at contract signature. Material additions MUST be notified with a defined lead time, not silently absorbed into an "we may update this" clause with no active signal.

## Downgrade vs. Cancellation
12. Downgrade MUST NOT delete customer data as a side effect. Access MAY be restricted per the new edition's entitlements (`commercial/ENTITLEMENT_STANDARD.md`), but the underlying data MUST remain intact and re-accessible on upgrade, up to a documented retention limit.
13. Cancellation follows the deletion sequence and timing defined in `commercial/CUSTOMER_EXIT_STANDARD.md`. This document defines *what* is owned; that document defines *what happens to it on exit*.

## Legal Hold
14. Data under legal hold MUST be excluded from any deletion, export-then-purge, or retention-expiry process until the hold is explicitly released by an authorized actor. The hold state MUST be a hard gate visible to the deletion pipeline, never a manual checklist item that can be missed.

## Export as a Right, Not a Lever
15. Export of customer-owned data MUST NOT be withheld as commercial leverage in any non-terminal lifecycle state (`commercial/CUSTOMER_LIFECYCLE.md`) — including `past_due`/`grace`/`suspended` states pending a billing dispute (`commercial/BILLING_ARCHITECTURE.md`). Only a fully terminal, deletion-completed state may make export moot because the data no longer exists.

