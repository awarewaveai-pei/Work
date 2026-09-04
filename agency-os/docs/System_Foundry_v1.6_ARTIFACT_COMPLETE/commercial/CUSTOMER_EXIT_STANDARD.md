# Customer Exit Standard

## Purpose
Exit is the highest-blast-radius customer lifecycle event because it ends in irreversible data loss. It MUST be a defined, ordered, auditable sequence — never an ad hoc delete.

## Offboarding Sequence
1. Exit MUST follow an explicit ordered sequence: exit initiated -> grace/export window opens -> customer-accessible export available -> access restricted -> data soft-deleted -> backup retention expiry -> hard deletion -> deletion certificate issued. No step may be skipped silently.
2. Each transition in the sequence MUST be a recorded lifecycle event (`commercial/CUSTOMER_LIFECYCLE.md`) with actor, timestamp, and trigger reason.

## Export Before Deletion
3. The customer MUST be offered an export opportunity, covering the data classified as customer-owned per `commercial/CUSTOMER_DATA_OWNERSHIP.md`, before any irreversible deletion step begins.
4. Failure to export within the grace window MUST NOT silently cancel the scheduled deletion. The documented deletion policy proceeds; the export opportunity is a right, not a precondition that blocks the platform indefinitely.

## Backup Retention Tied to Deletion
5. Backups containing deleted customer data MUST have a bounded, documented expiry after which they are purged or rotated out. "Deleted" is only a true statement once it is true across primary storage AND backups, not primary storage alone.
6. The gap between primary deletion and backup expiry MUST be disclosed as the real data-elimination timeline. Claiming immediate deletion while backups persist longer is a false claim under this framework's Evidence Law.

## Irreversibility Point
7. There MUST be one explicit, named point in the sequence after which exit becomes irreversible (typically: hard deletion of primary storage). Before that point, exit MUST be reversible via a defined reactivation path.
8. The irreversibility point and the exact consequence of crossing it MUST be disclosed to the customer before they cross it, consistent with the IRREVERSIBLE control class in `experience/ERROR_RECOVERY_OPERATOR_SAFETY_STANDARD.md` (explicit consequence disclosure before commit).

## Deletion Certificate
9. On completion of hard deletion (including backup expiry where contractually committed), the system MUST be able to produce an audit-backed deletion confirmation identifying what was deleted, when, and confirming legal-hold status was clear throughout.

## Legal Hold Interaction
10. A legal hold placed at any point in the sequence MUST pause progression at the current step. The hold state MUST be checked immediately before each irreversible action, not only at sequence start, so a cancellation cannot race past a hold placed mid-sequence.

## Win-back vs. Permanent Exit
11. Reactivation (win-back) MUST only be offered before the irreversibility point. The system MUST distinguish "canceled, data retained, reactivation restores prior state" from "deleted, reactivation is a new account with no data continuity" and communicate which applies at time of exit.
12. A customer-initiated re-signup after the irreversibility point MUST be treated as a new customer relationship for entitlement and billing purposes (`commercial/CUSTOMER_LIFECYCLE.md`), never silently re-linked to the deleted account's history.

## Cross-references
- Ownership boundary the export step must honor: `commercial/CUSTOMER_DATA_OWNERSHIP.md`
- Lifecycle states/transitions driving this sequence: `commercial/CUSTOMER_LIFECYCLE.md`
- Entitlement removal during exit: `commercial/ENTITLEMENT_STANDARD.md`
