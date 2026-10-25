-- 0136: tenant members retain SELECT; control-plane tables accept writes only through privileged callers.
begin;
set local lock_timeout = '5s';
create or replace function public.current_clerk_org_id_from_jwt()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(j ->> 'org_id'), ''),
    nullif(trim(j ->> 'clerk_org_id'), ''),
    nullif(trim(j -> 'app_metadata' ->> 'org_id'), '')
  )
  from (select auth.jwt() as j) s;
$$;
alter function public.current_clerk_org_id_from_jwt() set search_path = public, pg_temp;

drop policy if exists agent_runs_insert on public.agent_runs;
drop policy if exists agent_runs_update on public.agent_runs;
drop policy if exists agent_runs_delete on public.agent_runs;
revoke insert, update, delete, truncate, references, trigger on public.agent_runs from anon, authenticated;
drop policy if exists ai_image_jobs_insert on public.ai_image_jobs;
drop policy if exists ai_image_jobs_update on public.ai_image_jobs;
drop policy if exists ai_image_jobs_delete on public.ai_image_jobs;
revoke insert, update, delete, truncate, references, trigger on public.ai_image_jobs from anon, authenticated;
drop policy if exists approval_steps_insert on public.approval_steps;
drop policy if exists approval_steps_update on public.approval_steps;
drop policy if exists approval_steps_delete on public.approval_steps;
revoke insert, update, delete, truncate, references, trigger on public.approval_steps from anon, authenticated;
drop policy if exists approvals_insert on public.approvals;
drop policy if exists approvals_update on public.approvals;
drop policy if exists approvals_delete on public.approvals;
revoke insert, update, delete, truncate, references, trigger on public.approvals from anon, authenticated;
drop policy if exists cx_retention_runs_insert on public.cx_retention_runs;
drop policy if exists cx_retention_runs_update on public.cx_retention_runs;
drop policy if exists cx_retention_runs_delete on public.cx_retention_runs;
revoke insert, update, delete, truncate, references, trigger on public.cx_retention_runs from anon, authenticated;
drop policy if exists cx_upsell_opportunities_insert on public.cx_upsell_opportunities;
drop policy if exists cx_upsell_opportunities_update on public.cx_upsell_opportunities;
drop policy if exists cx_upsell_opportunities_delete on public.cx_upsell_opportunities;
revoke insert, update, delete, truncate, references, trigger on public.cx_upsell_opportunities from anon, authenticated;
drop policy if exists decision_recommendations_insert on public.decision_recommendations;
drop policy if exists decision_recommendations_update on public.decision_recommendations;
drop policy if exists decision_recommendations_delete on public.decision_recommendations;
revoke insert, update, delete, truncate, references, trigger on public.decision_recommendations from anon, authenticated;
drop policy if exists decision_scores_insert on public.decision_scores;
drop policy if exists decision_scores_update on public.decision_scores;
drop policy if exists decision_scores_delete on public.decision_scores;
revoke insert, update, delete, truncate, references, trigger on public.decision_scores from anon, authenticated;
drop policy if exists environments_insert on public.environments;
drop policy if exists environments_update on public.environments;
drop policy if exists environments_delete on public.environments;
revoke insert, update, delete, truncate, references, trigger on public.environments from anon, authenticated;
drop policy if exists error_events_insert on public.error_events;
drop policy if exists error_events_update on public.error_events;
drop policy if exists error_events_delete on public.error_events;
revoke insert, update, delete, truncate, references, trigger on public.error_events from anon, authenticated;
drop policy if exists incidents_insert on public.incidents;
drop policy if exists incidents_update on public.incidents;
drop policy if exists incidents_delete on public.incidents;
revoke insert, update, delete, truncate, references, trigger on public.incidents from anon, authenticated;
drop policy if exists marketing_campaigns_insert on public.marketing_campaigns;
drop policy if exists marketing_campaigns_update on public.marketing_campaigns;
drop policy if exists marketing_campaigns_delete on public.marketing_campaigns;
revoke insert, update, delete, truncate, references, trigger on public.marketing_campaigns from anon, authenticated;
drop policy if exists media_assets_insert on public.media_assets;
drop policy if exists media_assets_update on public.media_assets;
drop policy if exists media_assets_delete on public.media_assets;
revoke insert, update, delete, truncate, references, trigger on public.media_assets from anon, authenticated;
drop policy if exists merchandising_insights_insert on public.merchandising_insights;
drop policy if exists merchandising_insights_update on public.merchandising_insights;
drop policy if exists merchandising_insights_delete on public.merchandising_insights;
revoke insert, update, delete, truncate, references, trigger on public.merchandising_insights from anon, authenticated;
drop policy if exists ops_action_runs_insert on public.ops_action_runs;
drop policy if exists ops_action_runs_update on public.ops_action_runs;
drop policy if exists ops_action_runs_delete on public.ops_action_runs;
revoke insert, update, delete, truncate, references, trigger on public.ops_action_runs from anon, authenticated;
drop policy if exists ops_audit_events_insert on public.ops_audit_events;
drop policy if exists ops_audit_events_update on public.ops_audit_events;
drop policy if exists ops_audit_events_delete on public.ops_audit_events;
revoke insert, update, delete, truncate, references, trigger on public.ops_audit_events from anon, authenticated;
drop policy if exists package_install_runs_insert on public.package_install_runs;
drop policy if exists package_install_runs_update on public.package_install_runs;
drop policy if exists package_install_runs_delete on public.package_install_runs;
revoke insert, update, delete, truncate, references, trigger on public.package_install_runs from anon, authenticated;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
revoke insert, update, delete, truncate, references, trigger on public.projects from anon, authenticated;
drop policy if exists sites_insert on public.sites;
drop policy if exists sites_update on public.sites;
drop policy if exists sites_delete on public.sites;
revoke insert, update, delete, truncate, references, trigger on public.sites from anon, authenticated;
drop policy if exists workflow_runs_insert on public.workflow_runs;
drop policy if exists workflow_runs_update on public.workflow_runs;
drop policy if exists workflow_runs_delete on public.workflow_runs;
revoke insert, update, delete, truncate, references, trigger on public.workflow_runs from anon, authenticated;
drop policy if exists workspaces_insert on public.workspaces;
drop policy if exists workspaces_update on public.workspaces;
drop policy if exists workspaces_delete on public.workspaces;
revoke insert, update, delete, truncate, references, trigger on public.workspaces from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agent_runs',
    'ai_image_jobs',
    'approval_steps',
    'approvals',
    'cx_retention_runs',
    'cx_upsell_opportunities',
    'decision_recommendations',
    'decision_scores',
    'environments',
    'error_events',
    'incidents',
    'marketing_campaigns',
    'media_assets',
    'merchandising_insights',
    'ops_action_runs',
    'ops_audit_events',
    'package_install_runs',
    'projects',
    'sites',
    'workflow_runs',
    'workspaces'
  ]
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and cmd <> 'SELECT') then
      raise exception '0136: % still has a non-SELECT policy', table_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_table_privilege('anon', format('public.%I', table_name), 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege('authenticated', format('public.%I', table_name), 'INSERT,UPDATE,REFERENCES')
       or has_any_column_privilege('anon', format('public.%I', table_name), 'INSERT,UPDATE,REFERENCES') then
      raise exception '0136: anon/authenticated can still write %', table_name;
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
