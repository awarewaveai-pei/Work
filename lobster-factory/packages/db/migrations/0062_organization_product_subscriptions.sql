-- Migration 0062: organization_product_subscriptions — which SaaS product a client org has.
--
-- WHY: portal.aware-wave.com needs "who signed up for what". The existing schema has no
-- concept of a multi-product SaaS entitlement -- 0001_core.sql was built for the WP agency
-- business (projects.project_type defaults to 'wordpress', 0001:107). The customer identity
-- layer is NOT new and is deliberately NOT rebuilt here:
--   customer org   = organizations row, type='client'          (0001:3-14)
--   customer login = profiles row, id = auth.users.id          (0001:29-39)
--   membership     = organization_memberships, status='active' (0001:41-50)
--   request-time   = app_metadata.user_kind/org_id -> x-ops-user-kind/x-ops-org-id
--                    (middleware.ts:112,120-121 -> lib/tenant-guard.ts)
-- This table adds exactly one missing fact and nothing else.
--
-- SCHEMA DECISIONS (post db-expert review 2026-08-29, see
-- agency-os/docs/operations/PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §9 for full review):
--   organization_id  FK -> organizations, **ON DELETE RESTRICT** (deliberately NOT the house
--     CASCADE convention used by 0001:18/0010:9/0051:57). An entitlement/billing row must never
--     silently vanish when an org row is deleted -- deleting a client org with live subscription
--     history must fail loudly and force an explicit decision (soft-delete via organizations.status,
--     which already supports 'inactive'/'suspended', 0001:8), not cascade-erase billing history.
--   product_key      CHECK-constrained, same style as 0050:45 / 0051:59.
--   external_tenant_id  NULLABLE, INTENTIONALLY NOT A FOREIGN KEY. Seam to each product's own
--     Tenant record (Cognitive OS ADR-003 domain object #23). That table does not exist yet
--     ("no code or data exists yet"), so an FK is impossible today. NULL = not yet provisioned;
--     the launcher must render "coming soon", never fake a provisioned state.
--   status           lifecycle only. V1 is operator-toggled (comp/manual), NOT Stripe. Money is
--     a separate go-ahead (AGENTS.md payment red line).
--
-- SECURITY (read the review doc before changing any of this):
--   SELECT for authenticated is scoped by **user_has_org_membership(organization_id)** —
--     NOT user_has_org_access(organization_id). This is a deliberate divergence from the usual
--     org-scoped helper. user_has_org_access() ORs in a second path via
--     current_clerk_org_id_from_jwt() + clerk_organization_mappings (0018:39-56), which does a
--     TEXT comparison against the same app_metadata.org_id claim portal's tenant-guard.ts uses
--     for identity (middleware.ts:112). clerk_organization_mappings is empty today (verified via
--     `docker exec supabase-db psql -c "select count(*),status from clerk_organization_mappings
--     group by status;"` -> 0 rows, 2026-08-29) but "currently empty" is not a durable safety
--     guarantee for a permanent table. user_has_org_membership() is a direct membership check
--     with no JWT/mapping path at all -- structurally excludes the collision class rather than
--     relying on the mapping table staying empty forever.
--   WRITES ARE service_role ONLY. This DELIBERATELY DIVERGES from the 4-policy CRUD pattern
--     that 0010 applies to workflow_runs/package_install_runs. That pattern grants any active
--     org member insert/update/delete on their own org's rows -- correct for a work log, a
--     PRIVILEGE ESCALATION for an entitlement table (a customer could set status='active' on
--     itself). Precedent for the divergence is in-repo: 0010:525 "organizations: no INSERT for
--     authenticated (bootstrap via service_role / controlled jobs)". DO NOT "fix" this back to
--     the 0010 CRUD pattern -- that is the exact mistake this migration exists to avoid.
--   Explicit deny policies rather than relying on "no policy = deny", per 0033:4-11.
--
-- APPLICATION-LAYER NOTE (High risk, tracked separately, NOT part of this SQL file):
--   RLS here is defense-in-depth only -- the app reaches Postgres via the service-role client
--   (lib/supabase-server.ts), which bypasses RLS entirely (0033:13, 0051:39-42). The real
--   isolation boundary for portal is lib/tenant-guard.ts at the application layer, and its
--   resolveTenant() FAILS OPEN to `{ staff, null }` (full cross-org access) when
--   x-ops-user-kind is absent -- safe today because the only caller class is internal staff,
--   unsafe once portal is a real external caller. This MUST be fixed at the application layer
--   (a fail-closed helper for portal routes) before any portal route is wired to this table.
--   See PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §9 RISK 3 -- tracked as a blocking code change,
--   not something this migration can fix.
--
-- APPLY WITH (High risk -- do NOT run without operator go-ahead):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     -f /tmp/0062_organization_product_subscriptions.sql
--   (supabase_admin, not postgres -- same reason as 0050:23-24 / 0051:44-46)
--   NOTE: scripts/apply-lobster-rls-migrations-eu.mjs will NOT apply this file; its file list
--   is hardcoded to 0014/0016. Apply manually via the command above.
--
-- Down migration (rollback): packages/db/scripts/0062_organization_product_subscriptions_down.sql

begin;

-- FK creation takes a brief SHARE ROW EXCLUSIVE on organizations. Metadata-only, sub-ms, but
-- acquisition can queue behind an in-flight write. Same guard rationale as 0058/0060/0061.
set lock_timeout = '3s';

create table if not exists public.organization_product_subscriptions (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete restrict,
  product_key         text        not null
    check (product_key in ('cognitive','hci')),
  status              text        not null default 'trial'
    check (status in ('trial','active','past_due','canceled')),
  external_tenant_id  uuid,
  started_at          timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

reset lock_timeout;

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- REQUIRED, not optional. Postgres does not index FK columns automatically, and this column is
-- evaluated by the RLS predicate on every row of every SELECT (user_has_org_membership(organization_id)).
-- Without it, each portal launcher page load is a seq scan whose cost grows with total customer
-- count across ALL orgs.
create index if not exists org_product_subs_org_id_idx
  on public.organization_product_subscriptions (organization_id);

-- One live subscription per product per org. Canceled rows are retained as history, so the
-- constraint is partial rather than a plain UNIQUE.
create unique index if not exists org_product_subs_live_uniq
  on public.organization_product_subscriptions (organization_id, product_key)
  where status <> 'canceled';

-- A product-side tenant must not be claimed by two orgs -- but only among LIVE claims.
-- Codex second-opinion finding 2 (2026-08-29, CONFIRMED, agency-os/docs/operations/
-- PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §12): the original version of this index had no
-- `status <> 'canceled'` scoping, which meant a canceled row's external_tenant_id stayed
-- "claimed" forever -- reactivating the SAME org onto the SAME product tenant it previously
-- canceled (an ordinary, expected flow) would collide with the index and be rejected, even
-- though the org_product_subs_live_uniq index above already allows a new live row once the
-- old one is canceled. Scoping this index the same way as that one fixes it: a canceled row's
-- historical external_tenant_id no longer counts against new claims, while two DIFFERENT orgs
-- still cannot simultaneously hold a live claim on the same tenant.
create unique index if not exists org_product_subs_external_tenant_uniq
  on public.organization_product_subscriptions (external_tenant_id)
  where external_tenant_id is not null and status <> 'canceled';

-- ── updated_at trigger (pattern: 0027) ───────────────────────────────────────
create or replace function public.org_product_subs_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Lock search_path (Supabase lint function_search_path_mutable; 0015:14-16, 0017:10-11).
alter function public.org_product_subs_touch_updated_at() set search_path = public, pg_temp;

drop trigger if exists org_product_subs_touch_updated
  on public.organization_product_subscriptions;
create trigger org_product_subs_touch_updated
before update on public.organization_product_subscriptions
for each row execute function public.org_product_subs_touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.organization_product_subscriptions enable row level security;

-- READ: org-scoped via DIRECT membership check only (see SECURITY note above for why this is
-- user_has_org_membership, not the usual user_has_org_access).
drop policy if exists org_product_subs_select on public.organization_product_subscriptions;
create policy org_product_subs_select on public.organization_product_subscriptions
for select
to authenticated
using (user_has_org_membership(organization_id));

-- WRITE: none for authenticated. Explicit denies (0033:4-11) so an audit reads as intent,
-- not as "someone forgot the policy". Entitlement changes go through a service_role route.
drop policy if exists org_product_subs_deny_insert_authenticated on public.organization_product_subscriptions;
create policy org_product_subs_deny_insert_authenticated on public.organization_product_subscriptions
for insert to authenticated with check (false);

drop policy if exists org_product_subs_deny_update_authenticated on public.organization_product_subscriptions;
create policy org_product_subs_deny_update_authenticated on public.organization_product_subscriptions
for update to authenticated using (false) with check (false);

drop policy if exists org_product_subs_deny_delete_authenticated on public.organization_product_subscriptions;
create policy org_product_subs_deny_delete_authenticated on public.organization_product_subscriptions
for delete to authenticated using (false);

-- anon: fail-closed and explicit. Supabase's default privileges grant anon SELECT on new public
-- tables, so this table IS reachable with the anon key once PostgREST reloads -- RLS is the only
-- thing stopping it. Mirrors 0033:18-23 and 0052:33-35.
drop policy if exists org_product_subs_deny_anon on public.organization_product_subscriptions;
create policy org_product_subs_deny_anon on public.organization_product_subscriptions
for all to anon using (false) with check (false);

-- ── Comments ─────────────────────────────────────────────────────────────────
comment on table public.organization_product_subscriptions is
  'Which SaaS product (Cognitive OS / HCI-30) a client organization is subscribed to. The customer identity is the organizations row itself (type=client) -- this table adds entitlement only. Writes are service_role-only by design; see migration header.';

comment on column public.organization_product_subscriptions.external_tenant_id is
  'Deliberately NOT a foreign key. Placeholder for the product-side Tenant id (Cognitive OS ADR-003 #23); that table does not exist yet. NULL = not provisioned -- the launcher must show "coming soon", never a fake provisioned state. Replace with a real FK when the product ships.';

comment on column public.organization_product_subscriptions.status is
  'Operator-toggled in V1 (comp/manual). NOT driven by Stripe -- billing is a separate change requiring explicit go-ahead.';

notify pgrst, 'reload schema';

commit;
