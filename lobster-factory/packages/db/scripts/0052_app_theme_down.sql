-- Down migration for 0052_app_theme.sql — drops the global app-theme table.
-- Lossless: app_theme holds only the operator's CSS-var overrides + sidebar order (no
-- referenced data, no FK dependents). The fail-open read in lib/theme/store.ts returns
-- empty config when the table is absent, so the app falls back to globals.css defaults.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0052_app_theme_down.sql

BEGIN;

drop policy if exists app_theme_deny_non_service on public.app_theme;
drop table if exists public.app_theme;

COMMIT;
