# ADR-0014 — Data Subject Rights Channel

Status: **ACCEPTED — SYNTHETIC RUNTIME GATE VERIFIED (mutation-checked); NOT production-authorized**
Date: 2026-09-01
Decision authority: Operator explicit approval — `HD-03=A`

## Decision

HCI will model a `DataSubjectRequest` as a first-class, P0 domain record. It has a lifecycle, append-only event history, and tenant-scoped links to affected records. Correction is a new lineage event, never a silent overwrite.

## Runtime gate

`Projects/internal/hci30/database/` provides a synthetic-only local PostgreSQL skeleton for request, event, and target tables. It does not process real persons, establish a legal response deadline, or prove production readiness. Bitemporal history (`HD-06`, decided by `ADR-0017` same batch) landed Wave 1 gates 1-3 on 2026-09-05 (`migrations/0005_wave1_bitemporal_history_up.sql`) — not built here, in `ADR-0017`'s own migration instead; this DSR channel's correction lineage does not yet reference it (that wiring belongs to whichever future work connects `data_subject_requests` corrections to a `supersedes_id` chain).

## Consequences and rollback

Access, correction, dispute, and deletion requests can be represented and audited before HCI admits non-synthetic data. A reversal requires a superseding ADR; any populated runtime needs a reviewed migration that preserves request history.
