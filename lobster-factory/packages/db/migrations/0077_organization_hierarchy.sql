-- Migration 0077: Organization hierarchy — group (集團) over existing flat org, individual (個人自用) label.
--
-- WHY: organizations (0001_core.sql) was flat (type: agency|client only). Customer-service system
-- build surfaced two real needs: (1) a holding company managing several client organizations
-- (2) a genuine "no company at all" personal account. Department-level grouping already exists via
-- workspaces (0001_core.sql:16) — not touched here.
--
-- SCHEMA DECISIONS:
--   org_level — 'group' (holding co, owns children, cannot itself have a parent) | 'company'
--     (today's default — every existing row backfills here via column DEFAULT) | 'individual'
--     (self-use account: one person, no real company; still a normal organizations row so every
--     existing organization_id-scoped table — billing, RLS, cs_*, etc. — works unmodified).
--   parent_organization_id — nullable self-FK; ON DELETE SET NULL (deleting a group must not cascade-
--     delete its children). Three checks keep this a flat 2-level tree by construction, not an
--     arbitrary graph: a row can't parent itself, a 'group' row can never have its own parent, and
--     (via trigger, not a plain CHECK — Postgres CHECK can't query other rows) whatever a row points
--     to as its parent must itself be org_level='group' — so "walk up one level" is always enough,
--     no recursive CTE needed anywhere downstream, and this is a real DB-enforced guarantee, not just
--     an app-layer convention.
--   The two plain CHECK constraints are added NOT VALID here (metadata-only, no table scan/lock) —
--     every existing row already satisfies both trivially (parent_organization_id is NULL for 100%
--     of pre-existing rows), but VALIDATE CONSTRAINT still takes ACCESS EXCLUSIVE while scanning to
--     prove it on a live, heavily-referenced table. 0078 runs VALIDATE CONSTRAINT in its own
--     transaction (ShareUpdateExclusiveLock only, doesn't block readers/writers) — do not fold that
--     into this transaction, which would keep holding the lock this migration already released.
--   No new RLS: parent_organization_id/org_level carry no new access grant. Seeing a child org's
--     data through a group still requires an explicit organization_memberships row on that child
--     (deliberately NOT auto-granted here) — cross-org rollup is a read-side product decision for
--     whoever builds the group dashboard, not a blanket RLS bypass baked into this migration.
--
-- BOUNDARY (ADR-0009, ACCEPTED, agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/): portal
-- `organizations` is a product-layer construct, explicitly NOT the platform's Tenant source of
-- truth (that's AI LEGO ADR-003, a separate system). This migration only adds portal-internal
-- structure (same table, same product-layer scope as the existing `type` column) — it must never
-- be read as, or grown into, a cross-product Tenant primitive, and must never gain a cross-product
-- DB foreign key. If a platform-wide Tenant hierarchy is ever needed, that is ADR-0009's adapter
-- work (`external_tenant_id` on 0062), not this column.
--
-- SECURITY: additive only (new nullable/defaulted columns) — no existing query, RLS policy, or
-- organization_id foreign key changes shape. Safe to apply to a live table.
begin;
set lock_timeout = '3s';

alter table public.organizations
  add column if not exists parent_organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists org_level text not null default 'company'
    check (org_level in ('group', 'company', 'individual'));

alter table public.organizations
  add constraint organizations_no_self_parent
    check (parent_organization_id is null or parent_organization_id <> id) not valid;

alter table public.organizations
  add constraint organizations_group_has_no_parent
    check (org_level <> 'group' or parent_organization_id is null) not valid;

create or replace function public.organizations_validate_parent_is_group()
returns trigger
language plpgsql
as $$
begin
  if new.parent_organization_id is not null then
    if (select org_level from public.organizations where id = new.parent_organization_id) <> 'group' then
      raise exception 'parent_organization_id % must reference an org_level=group organization', new.parent_organization_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_parent_is_group on public.organizations;
create trigger organizations_parent_is_group
  before insert or update of parent_organization_id on public.organizations
  for each row execute function public.organizations_validate_parent_is_group();

create index if not exists organizations_parent_idx
  on public.organizations (parent_organization_id)
  where parent_organization_id is not null;

reset lock_timeout;
notify pgrst, 'reload schema';
commit;
