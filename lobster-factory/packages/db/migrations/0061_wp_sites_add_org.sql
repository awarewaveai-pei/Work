-- 0061_wp_sites_add_org.sql
-- Tenant ownership for WordPress sites.
--
-- WHY (2026-08-26): wp_sites (0039) has no owner column, and lib/content/wp-sites.ts
-- getWpSites() applies no org filter at all -- it returns EVERY active site plus its
-- Application Password. Seven API routes then resolve a site with the same shape:
--     const site = (siteId && sites.find(s => s.id === siteId)) || sites[0];
-- where siteId comes straight from the caller's query string or body. The routes are
-- app/api/video/embed-to-wp, app/api/content/wp-post, .../calendar, .../categories,
-- .../tags, .../patterns, .../related-posts. Two of them WRITE: embed-to-wp rewrites a
-- post's content, wp-post publishes articles. So any caller past the ops-role gate could
-- publish to, or rewrite posts on, ANY client's WordPress site.
--
-- Nothing was exploitable when this was written: EU auth had exactly one account
-- (staff/owner). This closes the hole before Phase 5 client self-service opens it, while
-- the table is 5 rows and the backfill is unambiguous.
--
-- BACKFILL is by identity, not by guesswork:
--   * 3 sites whose wp_sites.name equals organizations.name exactly
--     (E2E-Verify-0704 / Test WP Webhook Co / MONGOLIA-03)
--   * 2 sites mapped explicitly by URL because their names differ from the org name
--     ("Soulful Expression" vs org "Soulful Expression Art Therapy";
--      "AwareWave" vs org "AwareWave Ops")
-- Measured 2026-08-26: 5 wp_sites rows, 5 organizations, mapping is 1:1 with no ambiguity.
--
-- Nullable on purpose: the env-var fallback path in wp-sites.ts (WP_SITE_n_*) produces
-- sites with no DB row and therefore no org. assertOrgAccess(req, null) passes staff and
-- blocks client -- fail-closed exactly where it matters.

-- Hot-table guard, same rationale as 0058/0060: execution is metadata-only (nullable, no
-- default, all-NULL FK needs no validation scan) so the ACCESS EXCLUSIVE hold is
-- sub-millisecond, but acquisition can queue behind an in-flight content route.
set lock_timeout = '3s';

alter table public.wp_sites
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

reset lock_timeout;

-- 1) exact name match (3 rows)
update public.wp_sites w
   set organization_id = o.id
  from public.organizations o
 where w.organization_id is null
   and o.name = w.name;

-- 2) explicit URL -> org slug mapping for the two whose names differ (2 rows)
update public.wp_sites w
   set organization_id = o.id
  from public.organizations o
 where w.organization_id is null
   and o.slug = 'soulful-expression'
   and lower(rtrim(w.url, '/')) = 'https://soulfulexpression.org';

update public.wp_sites w
   set organization_id = o.id
  from public.organizations o
 where w.organization_id is null
   and o.slug = 'awarewave-ops'
   and lower(rtrim(w.url, '/')) = 'https://aware-wave.com';

-- Report, do NOT abort, on leftovers. A site added between the audit and this apply would
-- otherwise block the migration; a NULL org is already fail-closed for client callers and
-- transparent for staff, so surfacing it beats refusing to run.
do $$
declare n int;
begin
  select count(*) into n from public.wp_sites where organization_id is null;
  if n > 0 then
    raise notice '0061: % wp_sites row(s) still have organization_id IS NULL -- client callers will be denied access to them until mapped', n;
  else
    raise notice '0061: all wp_sites rows mapped to an organization';
  end if;
end $$;

-- Queried by org in content/sites listing; 5 rows today but the index costs nothing and the
-- table is append-mostly. (Contrast 0060_video_jobs_add_org, which is accessed only by PK
-- and therefore deliberately has no org index.)
create index if not exists wp_sites_org_id_idx
  on public.wp_sites (organization_id)
  where organization_id is not null;

comment on column public.wp_sites.organization_id is
  'Owning tenant. Authorization source for resolveWpSite() in lib/content/wp-sites.ts; every route that resolves a site from a caller-supplied siteId must go through it.';

notify pgrst, 'reload schema';
