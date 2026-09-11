-- Migration 0078: VALIDATE the two NOT VALID constraints added by 0077, in their own transaction.
--
-- WHY: db-expert review of 0077 (2026-09-11) — folding VALIDATE CONSTRAINT into 0077's own
-- transaction would keep holding whatever lock that transaction already had, defeating the point
-- of adding the constraints NOT VALID in the first place. VALIDATE CONSTRAINT here takes only
-- ShareUpdateExclusiveLock (blocks other DDL, not normal reads/writes) — safe to run against the
-- live organizations table separately. Must run after 0077.
begin;
alter table public.organizations validate constraint organizations_no_self_parent;
alter table public.organizations validate constraint organizations_group_has_no_parent;
commit;
