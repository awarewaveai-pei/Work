-- Back to 0135: restore the exact active policies from 0010/0016, default write grants, and 0018 JWT helper.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0136_control_plane_tables_writes_only.sql';
  end if;
end $$;
grant insert, update, delete, truncate, references, trigger on public.agent_runs to anon, authenticated;
drop policy if exists agent_runs_insert on public.agent_runs;
create policy agent_runs_insert on agent_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists agent_runs_update on public.agent_runs;
create policy agent_runs_update on agent_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists agent_runs_delete on public.agent_runs;
create policy agent_runs_delete on agent_runs
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.ai_image_jobs to anon, authenticated;
drop policy if exists ai_image_jobs_insert on public.ai_image_jobs;
create policy ai_image_jobs_insert on public.ai_image_jobs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists ai_image_jobs_update on public.ai_image_jobs;
create policy ai_image_jobs_update on public.ai_image_jobs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists ai_image_jobs_delete on public.ai_image_jobs;
create policy ai_image_jobs_delete on public.ai_image_jobs
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.approval_steps to anon, authenticated;
drop policy if exists approval_steps_insert on public.approval_steps;
create policy approval_steps_insert on approval_steps
for insert
with check (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
);
drop policy if exists approval_steps_update on public.approval_steps;
create policy approval_steps_update on approval_steps
for update
using (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
)
with check (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
);
drop policy if exists approval_steps_delete on public.approval_steps;
create policy approval_steps_delete on approval_steps
for delete
using (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
);
grant insert, update, delete, truncate, references, trigger on public.approvals to anon, authenticated;
drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on approvals
for insert
with check (user_has_org_access(organization_id));
drop policy if exists approvals_update on public.approvals;
create policy approvals_update on approvals
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists approvals_delete on public.approvals;
create policy approvals_delete on approvals
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.cx_retention_runs to anon, authenticated;
drop policy if exists cx_retention_runs_insert on public.cx_retention_runs;
create policy cx_retention_runs_insert on cx_retention_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists cx_retention_runs_update on public.cx_retention_runs;
create policy cx_retention_runs_update on cx_retention_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists cx_retention_runs_delete on public.cx_retention_runs;
create policy cx_retention_runs_delete on cx_retention_runs
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.cx_upsell_opportunities to anon, authenticated;
drop policy if exists cx_upsell_opportunities_insert on public.cx_upsell_opportunities;
create policy cx_upsell_opportunities_insert on cx_upsell_opportunities
for insert
with check (user_has_org_access(organization_id));
drop policy if exists cx_upsell_opportunities_update on public.cx_upsell_opportunities;
create policy cx_upsell_opportunities_update on cx_upsell_opportunities
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists cx_upsell_opportunities_delete on public.cx_upsell_opportunities;
create policy cx_upsell_opportunities_delete on cx_upsell_opportunities
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.decision_recommendations to anon, authenticated;
drop policy if exists decision_recommendations_insert on public.decision_recommendations;
create policy decision_recommendations_insert on decision_recommendations
for insert
with check (user_has_org_access(organization_id));
drop policy if exists decision_recommendations_update on public.decision_recommendations;
create policy decision_recommendations_update on decision_recommendations
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists decision_recommendations_delete on public.decision_recommendations;
create policy decision_recommendations_delete on decision_recommendations
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.decision_scores to anon, authenticated;
drop policy if exists decision_scores_insert on public.decision_scores;
create policy decision_scores_insert on decision_scores
for insert
with check (user_has_org_access(organization_id));
drop policy if exists decision_scores_update on public.decision_scores;
create policy decision_scores_update on decision_scores
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists decision_scores_delete on public.decision_scores;
create policy decision_scores_delete on decision_scores
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.environments to anon, authenticated;
drop policy if exists environments_insert on public.environments;
create policy environments_insert on environments
for insert
with check (user_has_org_access(organization_id));
drop policy if exists environments_update on public.environments;
create policy environments_update on environments
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists environments_delete on public.environments;
create policy environments_delete on environments
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.error_events to anon, authenticated;
drop policy if exists error_events_insert on public.error_events;
create policy error_events_insert on error_events
for insert
with check (user_has_org_access(organization_id));
drop policy if exists error_events_update on public.error_events;
create policy error_events_update on error_events
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists error_events_delete on public.error_events;
create policy error_events_delete on error_events
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.incidents to anon, authenticated;
drop policy if exists incidents_insert on public.incidents;
create policy incidents_insert on incidents
for insert
with check (user_has_org_access(organization_id));
drop policy if exists incidents_update on public.incidents;
create policy incidents_update on incidents
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists incidents_delete on public.incidents;
create policy incidents_delete on incidents
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.marketing_campaigns to anon, authenticated;
drop policy if exists marketing_campaigns_insert on public.marketing_campaigns;
create policy marketing_campaigns_insert on marketing_campaigns
for insert
with check (user_has_org_access(organization_id));
drop policy if exists marketing_campaigns_update on public.marketing_campaigns;
create policy marketing_campaigns_update on marketing_campaigns
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists marketing_campaigns_delete on public.marketing_campaigns;
create policy marketing_campaigns_delete on marketing_campaigns
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.media_assets to anon, authenticated;
drop policy if exists media_assets_insert on public.media_assets;
create policy media_assets_insert on media_assets
for insert
with check (user_has_org_access(organization_id));
drop policy if exists media_assets_update on public.media_assets;
create policy media_assets_update on media_assets
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists media_assets_delete on public.media_assets;
create policy media_assets_delete on media_assets
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.merchandising_insights to anon, authenticated;
drop policy if exists merchandising_insights_insert on public.merchandising_insights;
create policy merchandising_insights_insert on merchandising_insights
for insert
with check (user_has_org_access(organization_id));
drop policy if exists merchandising_insights_update on public.merchandising_insights;
create policy merchandising_insights_update on merchandising_insights
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists merchandising_insights_delete on public.merchandising_insights;
create policy merchandising_insights_delete on merchandising_insights
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.ops_action_runs to anon, authenticated;
drop policy if exists ops_action_runs_insert on public.ops_action_runs;
create policy ops_action_runs_insert on public.ops_action_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists ops_action_runs_update on public.ops_action_runs;
create policy ops_action_runs_update on public.ops_action_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists ops_action_runs_delete on public.ops_action_runs;
create policy ops_action_runs_delete on public.ops_action_runs
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.ops_audit_events to anon, authenticated;
drop policy if exists ops_audit_events_insert on public.ops_audit_events;
create policy ops_audit_events_insert on public.ops_audit_events
for insert
with check (user_has_org_access(organization_id));
drop policy if exists ops_audit_events_update on public.ops_audit_events;
create policy ops_audit_events_update on public.ops_audit_events
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists ops_audit_events_delete on public.ops_audit_events;
create policy ops_audit_events_delete on public.ops_audit_events
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.package_install_runs to anon, authenticated;
drop policy if exists package_install_runs_insert on public.package_install_runs;
create policy package_install_runs_insert on package_install_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists package_install_runs_update on public.package_install_runs;
create policy package_install_runs_update on package_install_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists package_install_runs_delete on public.package_install_runs;
create policy package_install_runs_delete on package_install_runs
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.projects to anon, authenticated;
drop policy if exists projects_insert on public.projects;
create policy projects_insert on projects
for insert
with check (user_has_org_access(organization_id));
drop policy if exists projects_update on public.projects;
create policy projects_update on projects
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on projects
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.sites to anon, authenticated;
drop policy if exists sites_insert on public.sites;
create policy sites_insert on sites
for insert
with check (user_has_org_access(organization_id));
drop policy if exists sites_update on public.sites;
create policy sites_update on sites
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists sites_delete on public.sites;
create policy sites_delete on sites
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.workflow_runs to anon, authenticated;
drop policy if exists workflow_runs_insert on public.workflow_runs;
create policy workflow_runs_insert on workflow_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists workflow_runs_update on public.workflow_runs;
create policy workflow_runs_update on workflow_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists workflow_runs_delete on public.workflow_runs;
create policy workflow_runs_delete on workflow_runs
for delete
using (user_has_org_access(organization_id));
grant insert, update, delete, truncate, references, trigger on public.workspaces to anon, authenticated;
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on workspaces
for insert
with check (user_has_org_access(organization_id));
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on workspaces
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on workspaces
for delete
using (user_has_org_access(organization_id));
create or replace function current_clerk_org_id_from_jwt()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(j ->> 'org_id'), ''),
    nullif(trim(j ->> 'clerk_org_id'), ''),
    nullif(trim(j -> 'app_metadata' ->> 'org_id'), ''),
    nullif(trim(j -> 'user_metadata' ->> 'org_id'), '')
  )
  from (select auth.jwt() as j) s;
$$;
alter function public.current_clerk_org_id_from_jwt() set search_path = public, pg_temp;
notify pgrst, 'reload schema';
commit;
