-- Add username column to wp_sites for WP Application Password auth.
-- Empty string = legacy env-based JWT fallback; non-empty = Basic auth.
alter table wp_sites add column if not exists username text not null default '';
