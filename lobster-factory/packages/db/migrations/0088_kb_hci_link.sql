-- 0088 — links a cs_knowledge_sources row to the HCI-30 hci.sources row it has been sent to
-- (operator: "資料蒐集器>>HCI 串連使用", 2026-09-18) — same shape as migration 0087's Cognitive OS
-- link, one column pair per downstream product.
--
-- Written by lib/hci/import-sources.ts's importOrganizationSourcesToHci() right after each
-- successful POST .../api/hci/v1/seeds call whose outcome is 'written' (hci30's own
-- orchestrate-discovered-fetch.mjs) -- never guessed/backfilled, since the only source of truth for
-- "was this actually sent" is that HTTP call's own outcome, not anything derivable from data already
-- in this table.
--
-- Nullable, no backfill: every row sent before today has never made that call, so NULL correctly
-- means "not sent yet", not "sent, status unknown".
--
-- hci_source_id is hci.sources.id (uuid, HCI-30's own separate Postgres instance -- its own
-- migration ledger under Projects/internal/hci30/database/migrations/, a completely different
-- numbering scheme from this one) -- typed uuid, not a foreign key, for the identical reason
-- migration 0087 gives for cognitive_os_project_id: no real FK can span two separate Postgres
-- instances, and the value is always a real UUID at the source
-- (hci30's sink-hci-discovered.mjs crypto.randomUUID()) with this column empty today, so
-- uuid-not-text costs nothing now and a text->uuid rewrite later would (db-expert review 2026-09-18).
--
-- No index on hci_source_id, matching 0087's own cognitive_os_project_id: the only planned access
-- pattern is a point write against an already-identified row (see markSourceSentToHci in
-- lib/kb/db.ts), never a `WHERE hci_source_id = ?` lookup. Add one only if that access pattern ever
-- changes (db-expert review 2026-09-18).
--
-- APPLY WITH (Low risk -- additive, nullable, no existing query/RPC touched; db-expert review
-- 2026-09-18 confirmed: metadata-only ACCESS EXCLUSIVE held for milliseconds, independent of row
-- count, zero backward-compat impact):
--   node scripts/apply-db-migration.mjs 0088
-- Down migration: packages/db/scripts/0088_kb_hci_link_down.sql

BEGIN;

ALTER TABLE public.cs_knowledge_sources
  ADD COLUMN IF NOT EXISTS hci_source_id uuid,
  ADD COLUMN IF NOT EXISTS hci_imported_at timestamptz;

COMMIT;
