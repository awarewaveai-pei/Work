-- Social platform connections: maps client_id → Postiz integration_id per platform.
-- v1: single Postiz workspace; allowlist enforced server-side, not via RLS on frontend.
-- Gate D (POSTIZ_SOCIAL_PUBLISHING_PLAN.md 2026-06-22)

create table if not exists social_postiz_connections (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references organizations(id) on delete cascade,
  postiz_workspace_id   text,
  postiz_integration_id text not null,
  platform              text not null check (platform in (
    'instagram','facebook','reddit','linkedin','x','threads','tiktok','pinterest','bluesky'
  )),
  label                 text,
  status                text not null default 'connected' check (status in (
    'connected','disabled','expired'
  )),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (client_id, postiz_integration_id)
);

create index if not exists idx_social_postiz_connections_client_id
  on social_postiz_connections(client_id);

create index if not exists idx_social_postiz_connections_platform
  on social_postiz_connections(client_id, platform);
