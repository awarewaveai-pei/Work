-- 0044_wp_sites_content_defaults.sql
-- Per-site Content Studio defaults: language, country, marketing brief, image model.
-- Stored as JSONB so new fields can be added without schema changes.
-- Loaded by Content Studio when a site is selected → auto-fills empty form fields.

ALTER TABLE wp_sites
  ADD COLUMN IF NOT EXISTS content_defaults JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN wp_sites.content_defaults IS
  'Content Studio per-site defaults. Keys: language, targetCountry, imageModel, marketing (audience/positioning/usp/primaryCta/funnelStage/pricePositioning/emotionalTriggers/objections/forbiddenClaims).';
