# HCI Evidence Tamper-Evidence Spec

P0-03 (`21_HCI_TOP_TIER_GAP_ANALYSIS.md`). Expected result: critical
evidence cannot be silently rewritten without detection, and can still be
lawfully erased when required. Five required elements named by the gap
analysis; each mapped below to what the shipped schema
(`database/migrations/0001`-`0018`, documented in full in `docs/domain/`)
already provides. All five closed as of 0018 (2026-09-12) — see the summary
table at the bottom for the two that were re-verified against actual current
schema state and reclassified from a previous, stale "OPEN" reading.

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

## 4. Content/source/attachment hashes — CLOSED (2026-09-12, migrations/0018)

`hci.source_snapshots.content_hash` (required, non-blank) hashes a specific
retrieval of a Source at a point in time — closed since before this file was
first written. **Was open, now closed**: this section previously said
`subject_records` had no `content_hash` column "because it has no real
content/payload column at all yet" — that blocker was actually resolved by
`0012_wave1_subject_record_payload_up.sql` (ADR-0034's generic `payload
jsonb` column, landed 2026-09-09) and this spec was never revisited until a
2026-09-12 pass caught the drift. `subject_records.content_hash` (text,
server-computed via `hci.compute_subject_record_hash()`, a `BEFORE INSERT`
trigger) now hashes `payload` together with the row's own identity columns
and its position in the chain (item 5) at insert time.

## 5. Hash-chain / Merkle verification "where justified" — CLOSED (2026-09-12, migrations/0018)

Was correctly deferred while item 4's blocker stood; that blocker cleared
2026-09-09 (see above) and this item shipped alongside it 2026-09-12.
`subject_records.prev_hash` chains every row to its immediate predecessor
**within the same case**, ordered by the existing `system_recorded_at`
column (0005) — ALL kinds (EVIDENCE/CLAIM/ASSESSMENT/TRUST_DOMAIN) chain
together in one sequence, since they already share one physical append-only
table and one insert-order timeline. `hci.subject_record_chain_tips` (one
row per case, holding the current tip hash) makes the write path
concurrency-safe without a full-table scan per insert. `hci.
verify_subject_record_chain(tenant_id, case_id)` recomputes and checks the
whole chain on demand.

**What this catches that items 1-3 (grant + trigger layer append-only) do
not**: those stop the *application role* from ever editing or deleting a
row, and stop a table-owner/superuser connection too *as long as the
append-only trigger stays enabled*. Neither stops a table owner who first
runs `ALTER TABLE ... DISABLE TRIGGER`, edits or deletes a row, then
re-enables it — DDL ownership is a strictly higher bar than the DML grants
being bypassed, and no grant or trigger can defend against disabling itself.
A hash chain is a *detective* control for exactly that gap: it cannot
prevent the edit, but recomputing content_hash catches a changed row, and
prev_hash linkage catches one deleted from the middle (the next surviving
row's prev_hash then points at a hash no row produces). Real-Docker tested
against both scenarios (CHAIN-VERIFY-TAMPER-01, CHAIN-VERIFY-DELETE-01 in
`database/tests/wave1-negative-tests.sql`), not merely asserted.

## Summary

| Element | Status |
|---|---|
| Immutable audit refs | Closed |
| Correction lineage | Closed |
| Crypto-shredding | Closed (DSR-lifecycle wiring is Wave 4) |
| Content/source/attachment hashes | Closed (2026-09-12, migrations/0018) |
| Hash-chain/Merkle | Closed (2026-09-12, migrations/0018) |

All five closed as of migrations/0001-0018 (DSR-lifecycle auto-wiring for
crypto-shredding remains a separate, explicitly tracked Wave 4 item — not a
gap in this spec's five named elements, which are about detecting/preventing
silent rewrites, not about who/what triggers a lawful erasure).
