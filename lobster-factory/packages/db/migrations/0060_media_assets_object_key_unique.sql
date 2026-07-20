-- 0060_media_assets_object_key_unique.sql
--
-- ROOT CAUSE (2026-07-20):
--   video-pipeline.ts recordVideoAsset() uses upsert({ onConflict: "object_key" })
--   to prevent duplicate rows when /status poll and reconcile cron race on the same
--   finished render job. However no single-column unique index on object_key exists —
--   only the composite uq_media_assets_org_backend_key_version (org + backend + key + version).
--   Supabase upsert with onConflict: "object_key" silently falls back to plain INSERT
--   when no matching single-column constraint is found → duplicates are still written.
--
-- FIX:
--   Add a partial unique index on object_key (WHERE object_key IS NOT NULL).
--   R2 object keys are globally unique paths (e.g. video/<title>/16x9.mp4) — there is
--   no per-org namespacing at the R2 path level, so uniqueness across orgs is correct.
--   CONCURRENTLY avoids an ACCESS EXCLUSIVE lock on the live table.
--
-- IDEMPOTENT: CREATE UNIQUE INDEX IF NOT EXISTS is safe to replay.
-- ROLLBACK: DROP INDEX IF EXISTS uq_media_assets_object_key;

create unique index if not exists uq_media_assets_object_key
  on media_assets(object_key)
  where object_key is not null;

-- Reload PostgREST schema cache (harmless if not needed).
notify pgrst, 'reload schema';
