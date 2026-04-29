-- Supabase security lint: rls_disabled_in_public
--
-- Service-role jobs bypass RLS; client-side access must go through explicit
-- policies. Enabling RLS without adding broad policies makes previously
-- unprotected public tables default-deny for anon/authenticated users.

alter table organizations enable row level security;
alter table workspaces enable row level security;
alter table profiles enable row level security;
alter table organization_memberships enable row level security;
alter table workspace_memberships enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table user_role_assignments enable row level security;
alter table projects enable row level security;
alter table sites enable row level security;
alter table environments enable row level security;

alter table packages enable row level security;
alter table package_versions enable row level security;
alter table manifests enable row level security;
alter table workflows enable row level security;
alter table workflow_versions enable row level security;
alter table workflow_runs enable row level security;
alter table package_install_runs enable row level security;

alter table policies enable row level security;
alter table policy_versions enable row level security;
alter table approval_policies enable row level security;
alter table approvals enable row level security;
alter table approval_steps enable row level security;
alter table agents enable row level security;
alter table tool_policies enable row level security;
alter table agent_versions enable row level security;
alter table agent_runs enable row level security;
alter table incidents enable row level security;
alter table error_events enable row level security;

alter table sales_leads enable row level security;
alter table marketing_campaigns enable row level security;
alter table partner_referrals enable row level security;
alter table media_assets enable row level security;
alter table decision_scores enable row level security;
alter table merchandising_insights enable row level security;
alter table decision_recommendations enable row level security;
alter table cx_retention_runs enable row level security;
alter table cx_upsell_opportunities enable row level security;

alter table clerk_organization_mappings enable row level security;
alter table ops_action_catalog enable row level security;
alter table ops_action_runs enable row level security;
alter table ai_image_jobs enable row level security;
alter table ops_audit_events enable row level security;
alter table ops_incidents enable row level security;
alter table ops_inbox_gemini_quota enable row level security;

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
