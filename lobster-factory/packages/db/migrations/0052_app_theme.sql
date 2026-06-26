-- Migration 0052: app_theme — global appearance overrides for the admin console.
--
-- WHY: /tools/theme lets the operator recolor/retypeset the whole admin app by overriding
-- CSS custom properties (+ reorder the sidebar). Previously these were stored ONLY in the
-- browser's localStorage, so the look did not follow the operator across devices/browsers and
-- the editor falsely claimed "permanent for all users". This table is the single server-side
-- source of truth: app/layout.tsx reads it (service-role, fail-open) and renders the saved
-- look before paint on every device; /api/theme POST writes it (owner/admin only).
--
-- SCHEMA DECISIONS:
--   Single global row (id = 'default'). This is one shared admin theme, not per-tenant or
--   per-user — there is effectively one operator. Kept as a keyed table (not a singleton view)
--   so a future per-user/per-tenant theme is an additive PK change, not a rewrite.
--   tokens jsonb   — only the OVERRIDDEN tokens (diffs vs globals.css :root defaults), e.g.
--                    {"--accent":"#ff0066"}. Defaults stay in globals.css; we never overwrite it.
--   layout jsonb   — sidebar order: { sectionOrder: string[], itemOrders: {sectionId: string[]} }.
--   RLS enabled with NO policies → only the service_role key (server-side app/layout + /api/theme)
--   can read/write. Non-sensitive data, but locking it keeps the write path single + auditable.

create table if not exists public.app_theme (
  id          text primary key default 'default',
  tokens      jsonb not null default '{}'::jsonb,
  layout      jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.app_theme enable row level security;

-- Seed the single global row so the first GET/upsert has a target (idempotent).
insert into public.app_theme (id, tokens, layout)
values ('default', '{}'::jsonb, null)
on conflict (id) do nothing;
