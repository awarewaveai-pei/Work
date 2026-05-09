-- lobster-factory/packages/db/migrations/0026_ops_incidents_client_slug.sql
-- Add client_slug to ops_incidents for per-client alert filtering.
-- Enables /ops/inbox?client_slug=<slug> deep-link from ClientCard.
-- Nullable: existing rows default to NULL (applies to platform-wide alerts).

alter table ops_incidents
  add column if not exists client_slug text;

create index if not exists ops_incidents_client_slug_idx
  on ops_incidents(client_slug)
  where client_slug is not null;
