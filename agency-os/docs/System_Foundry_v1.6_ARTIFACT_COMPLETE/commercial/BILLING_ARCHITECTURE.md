# Billing Architecture Standard

## Purpose
Billing is the system of record for what was promised, delivered, charged, and reconciled. It must be independently auditable against the payment provider, never merely a mirror of it.

## Billing Event Sourcing
1. Every billable fact (subscription created, plan changed, usage recorded, invoice issued, payment captured, refund issued, credit applied) MUST be captured as an immutable, timestamped billing event before any derived state (invoice, balance, entitlement) is computed from it.
2. Billing state (current balance, active subscription, invoice history) MUST be a projection of the event log, not the primary record. The event log is the source of truth; read models MAY be rebuilt from it.
3. Billing events MUST NOT be edited or deleted after commit. Corrections MUST be new compensating events (credit note, adjustment, reversal) that reference the original event.

## Idempotent Charge Processing
4. Every charge attempt MUST carry a caller-supplied idempotency key bound to the specific billable transaction (invoice line, usage period). Retried charge requests with the same key MUST return the original result, never create a second charge.
5. Webhook/callback handlers from the payment provider MUST be idempotent against the provider's event id; duplicate delivery MUST NOT double-apply a payment or double-fire a downstream entitlement change.
6. A charge MUST NOT be reported as successful until the payment provider confirms durable capture; success MUST NOT be signaled before that confirmation is recorded (mirrors `experience/ERROR_RECOVERY_OPERATOR_SAFETY_STANDARD.md`'s prohibition on success-before-durable-success).

## Invoice Immutability
7. A finalized/issued invoice MUST be immutable. Post-issue corrections MUST be represented as credit notes, adjustment invoices, or an explicit void-and-reissue with an audit trail linking old and new documents.
8. Draft invoices MAY be mutated freely before finalization; the finalization transition MUST itself be an explicit, auditable state change.

## Proration
9. Mid-cycle plan or quantity changes MUST follow a documented proration policy (time-based, usage-based, or none), stated per plan/edition — never improvised per request.
10. Proration MUST be reproducible from stored inputs (old plan, new plan, effective timestamp, billing-period boundaries), not just a stored output number, so disputes can be recomputed and audited.

## Currency, Tax, and Jurisdiction Boundaries
11. Tax calculation and remittance MUST sit behind an owned, replaceable adapter boundary (`engineering/PROVIDER_RESILIENCE_STANDARD.md`) — never jurisdiction logic hardcoded into billing core.
12. The currency of record for a subscription MUST be fixed at subscription creation and changed only through an explicit, audited currency-migration procedure; billing core MUST NOT silently recompute historical amounts in a different currency.

## Reconciliation
13. Billing MUST run scheduled reconciliation against the payment provider's ledger; discrepancies MUST raise a tracked, owned operational incident with an audit trail, never be silently auto-corrected with no record of the correction.
14. The payment provider is authoritative only for payment/settlement fact. Internal billing events remain authoritative for what was promised and for entitlement decisions.

## Dunning and Retry
15. Failed-payment retry (dunning) MUST follow a documented, bounded schedule with a defined terminal state (for example, suspension). Unbounded silent retries and unbounded silent inaction are both prohibited.
16. Each dunning attempt and its outcome MUST be an audit event visible to customer-facing support tooling per `commercial/OPERATING_MODEL_STANDARD.md`.
17. Entitlement consequences of payment failure (grace period, downgrade, suspension) MUST be defined jointly with `commercial/CUSTOMER_LIFECYCLE.md` and `commercial/ENTITLEMENT_STANDARD.md`; billing MUST NOT unilaterally mutate entitlements outside that contract.

## Audit Trail
18. Every billing-affecting action MUST record actor (customer, staff, system/automation), authority basis, and before/after state, per `governance/AUTHORITY_MODEL.md`.
19. Revenue-recognition exports/reports MUST be derivable from the immutable event log with a stated point-in-time cutoff, enabling reproducible historical reporting.
