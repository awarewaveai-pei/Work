# HCI Evidence Tamper-Evidence Spec

P0-03 (`21_HCI_TOP_TIER_GAP_ANALYSIS.md`). Expected result: critical
evidence cannot be silently rewritten without detection, and can still be
lawfully erased when required. Five required elements named by the gap
analysis; each mapped below to what the shipped schema
(`database/migrations/0001`-`0011`, documented in full in `docs/domain/`)
already provides, or honestly marked open with the specific blocker.

## 1. Immutable audit refs — CLOSED, built

Every evidentiary/decision table is append-only at both the grant layer
(role never holds UPDATE/DELETE) and the trigger layer (`hci.reject_update_delete()`,
defends a bypassed grant — table owner, break-glass superuser):
`subject_records` (EVIDENCE/CLAIM rows), `decisions`, `decision_claims`,
`data_subject_request_events`, `source_snapshots`, `source_relationships`.
See `docs/domain/HCI_INVARIANTS.md` §Append-only / no-delete / no-truncate
for the full mechanism, including the three rejected escape-hatch designs
(session GUC, temp-table lock) and why the shipped effect-based one cannot
be forged by an application role.

## 2. Correction lineage — CLOSED, built (ADR-0017)

A correction is never an UPDATE — it is a new row with `supersedes_id`
pointing at the predecessor plus a required, non-blank `corrected_reason`,
and the predecessor's own `system_superseded_at` is set atomically by
`hci.mark_superseded()`. No forks: `UNIQUE(tenant_id, supersedes_id)`
rejects a second row superseding an already-superseded one. Point-in-time
reconstruction (`hci.*_as_of(t)`) proves the lineage is actually navigable,
not just recorded. See `docs/domain/HCI_STATE_MACHINES.md` §Bitemporal
supersession.

## 3. Crypto-shredding — CLOSED, built (ADR-0018)

`hci.data_encryption_keys` (key material, zero grant to application roles —
isolated by grant absence, not by a second layer of encryption, Wave 1) +
`subject_records.encryption_key_ref` (required for EVIDENCE/CLAIM) +
`tombstoned_at` + `hci.tombstone_evidence(id)` (SECURITY DEFINER, sets
`tombstoned_at` via the same effect-based escape hatch as bitemporal
supersession). Lawful erasure = destroy the key + tombstone the row +
append an immutable `ERASURE_RECORDED` `data_subject_request_events` row —
the row's ciphertext becomes permanently unrecoverable without the row
itself ever being deleted, satisfying both "cannot be silently rewritten"
and "can still be lawfully erased" at once.

**Not yet wired (Wave 4, tracked not faked)**: `hci.record_erasure()` — the
function that would let a real `DELETION`-type `data_subject_requests` row
actually *drive* `tombstone_evidence()` — does not exist. Calling
`tombstone_evidence()` today requires already knowing the target
`subject_records.id` directly; there is no DSR-lifecycle trigger that calls
it automatically on a resolved DELETION request. Mediated read/write
functions for the real (not-yet-existing) payload column are the other
named Wave 4 gap (`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Immutability
vs. Erasure) — erasure of *content* is not a meaningful mechanism to build
against a row that has never held real content through a real write path.

## 4. Content/source/attachment hashes — PARTIAL

`hci.source_snapshots.content_hash` (required, non-blank) hashes a specific
retrieval of a Source at a point in time — this half is closed. **Open**:
`subject_records` (Evidence/Claim rows themselves) has no `content_hash`
column, because it has no real content/payload column at all yet (Wave 1
schema only — see `docs/domain/HCI_ENTITY_DICTIONARY.md`
§Subject records; the `encryption_key_ref` column exists for a payload that
does not exist yet either). Hashing a column that does not exist is not a
schema decision this migration can make — it is the same Wave 4 payload-column
gate item 3 above is blocked on, not a separate open question.

## 5. Hash-chain / Merkle verification "where justified" — OPEN, correctly not built yet

The gap analysis's own wording ("where justified") makes this conditional,
not unconditional. A hash chain or Merkle structure verifies that a
*sequence* of records has not been reordered or had entries silently
removed — meaningful once real Evidence content exists to chain (item 4).
Chaining today would mean hashing rows that currently hold no real payload,
which would prove nothing about content integrity and would need to be
re-designed the moment a real payload column lands — inventing it now risks
exactly the "shape that has to be torn out later" `0008`'s own header
warns against for a different concept. **What would unblock this**: the
Wave 4 payload-column decision (item 3/4's shared blocker). Once that
lands, evaluate whether `source_relationships`' corroboration graph (which
already has no correction mechanism at all — see
`docs/domain/HCI_ENTITY_DICTIONARY.md` §Evidence / provenance graph) or the
bitemporal supersession chain itself is the more natural place to add
chaining, rather than a third, parallel mechanism.

## Summary

| Element | Status |
|---|---|
| Immutable audit refs | Closed |
| Correction lineage | Closed |
| Crypto-shredding | Closed (DSR-lifecycle wiring is Wave 4) |
| Content/source/attachment hashes | Partial (Source-level closed; Evidence-content-level blocked on Wave 4 payload column) |
| Hash-chain/Merkle | Open, correctly deferred (same Wave 4 blocker; "where justified" is conditional) |

Two of five fully closed, one closed-with-a-tracked-Wave-4-gap, two blocked
on the same single root cause: no real Evidence/Claim payload column exists
in this schema yet. That is a genuine, undischarged product decision (what
does a payload column even look like — free text, structured, external
object reference?) — not something this spec should invent to look more
complete.
