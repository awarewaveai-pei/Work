-- WordPress site connections table
-- Stores client WP sites for Content Studio multi-site management.
-- Tokens are WP JWT tokens — treated as secrets: service role access only.

create table if not exists wp_sites (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  url         text        not null,
  token       text        not null,
  color       text        not null default '#5855d0',
  active      boolean     not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Prevent duplicate URLs
create unique index if not exists wp_sites_url_unique on wp_sites (lower(url));

-- RLS: deny all public/anon access. Service role bypasses RLS and is the only accessor.
alter table wp_sites enable row level security;

-- No RLS policies defined intentionally — service role bypasses RLS.
-- Anon / authenticated clients should never reach this table directly.
