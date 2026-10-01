-- Dispatcher poll index (db-expert Major finding, Hetzner Phase 1 review 2026-06-06).
--
-- The dispatcher polls every 60s:
--   WHERE status='pending' AND (approval_required=false OR approval_status='approved')
--   ORDER BY started_at ASC LIMIT 10
-- with NO organization_id filter. The only status index is org-leading
-- (idx_ops_action_runs_org_status), unusable for this org-less scan → the append-only
-- ops_action_runs table forces a growing seq-scan + sort every minute.
--
-- A PARTIAL index on (started_at) WHERE status='pending' stays tiny (only pending rows)
-- and serves both the filter and the ORDER BY (no sort node). Additive — no data change,
-- safe rollback (DROP INDEX CONCURRENTLY).
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block. If the migration
-- runner wraps statements in a transaction, run this one out-of-band (psql, no -1) or strip
-- CONCURRENTLY for the (small) current table size.

-- A failed CONCURRENTLY build leaves an INVALID index that `if not exists` then skips: before
-- recording this file, `select indisvalid from pg_index where indexrelid =
-- 'public.idx_ops_action_runs_pending_dispatch'::regclass` must be true (else drop and rerun).
create index concurrently if not exists idx_ops_action_runs_pending_dispatch
  on public.ops_action_runs (started_at)
  where status = 'pending';
