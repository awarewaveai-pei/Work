-- Supabase security lint: rls_disabled_in_public.
--
-- Service-role jobs bypass RLS; client-side access must go through explicit
-- policies. Enabling RLS without adding broad policies makes previously
-- unprotected public tables default-deny for anon/authenticated users.
--
-- This project may have only part of the numbered migration stack applied, so
-- each named table is checked before altering. The final sweep covers any
-- manually-created public table, such as user_settings.

do $$
declare
  table_name text;
  known_public_tables text[] := array[
    'organizations',
    'workspaces',
    'profiles',
    'organization_memberships',
    'workspace_memberships',
    'roles',
    'permissions',
    'role_permissions',
    'user_role_assignments',
    'projects',
    'sites',
    'environments',
    'packages',
    'package_versions',
    'manifests',
    'workflows',
    'workflow_versions',
    'workflow_runs',
    'package_install_runs',
    'policies',
    'policy_versions',
    'approval_policies',
    'approvals',
    'approval_steps',
    'agents',
    'tool_policies',
    'agent_versions',
    'agent_runs',
    'incidents',
    'error_events',
    'sales_leads',
    'marketing_campaigns',
    'partner_referrals',
    'media_assets',
    'decision_scores',
    'merchandising_insights',
    'decision_recommendations',
    'cx_retention_runs',
    'cx_upsell_opportunities',
    'clerk_organization_mappings',
    'ops_action_catalog',
    'ops_action_runs',
    'ai_image_jobs',
    'ops_audit_events',
    'ops_incidents',
    'ops_inbox_gemini_quota',
    'user_settings'
  ];
begin
  foreach table_name in array known_public_tables
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;
end
$$;

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity = false
  loop
    execute format(
      'alter table %I.%I enable row level security',
      table_record.schemaname,
      table_record.tablename
    );
  end loop;
end
$$;
