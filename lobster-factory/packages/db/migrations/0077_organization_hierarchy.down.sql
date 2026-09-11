-- 0077 down: remove org hierarchy fields added by 0077. Run BEFORE 0078 is applied (0078 only
-- validates constraints this file drops; if 0078 already ran, this still works — VALIDATE
-- CONSTRAINT leaves no separate object, it just flips the same constraint's `convalidated` flag).
begin;
drop trigger if exists organizations_parent_is_group on public.organizations;
drop function if exists public.organizations_validate_parent_is_group();
drop index if exists public.organizations_parent_idx;
alter table public.organizations drop constraint if exists organizations_group_has_no_parent;
alter table public.organizations drop constraint if exists organizations_no_self_parent;
alter table public.organizations drop column if exists parent_organization_id;
alter table public.organizations drop column if exists org_level;
notify pgrst, 'reload schema';
commit;
