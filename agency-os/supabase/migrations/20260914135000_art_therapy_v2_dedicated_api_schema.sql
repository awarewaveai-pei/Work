-- Keep canonical tables out of PostgREST. Only this dedicated read-model
-- schema is exposed, following Supabase's dedicated API schema guidance.
create schema art_therapy_api;

revoke all on schema art_therapy_api from public, anon, authenticated;
grant usage on schema art_therapy_api to service_role;

grant usage on schema art_therapy to service_role;
grant select on
  art_therapy.tools,
  art_therapy.tool_localizations,
  art_therapy.tool_healing_stages,
  art_therapy.healing_stage_localizations,
  art_therapy.tool_focuses,
  art_therapy.therapeutic_focus_localizations,
  art_therapy.tool_theories,
  art_therapy.theory_category_links,
  art_therapy.theory_category_localizations,
  art_therapy.theories,
  art_therapy.theory_localizations,
  art_therapy.tool_details,
  art_therapy.theory_details
to service_role;

create view art_therapy_api.tool_details
with (security_invoker = true) as
select * from art_therapy.tool_details;

create view art_therapy_api.theory_details
with (security_invoker = true) as
select * from art_therapy.theory_details;

revoke all on art_therapy_api.tool_details, art_therapy_api.theory_details
from public, anon, authenticated;
grant select on art_therapy_api.tool_details, art_therapy_api.theory_details
to service_role;

revoke usage on schema art_therapy from anon, authenticated;

-- The pre-write baseline had no role-wide or database-specific override.
-- Remove the temporary role-wide setting and use a database-specific value.
alter role authenticator reset pgrst.db_schemas;
alter role authenticator in database postgres
  set pgrst.db_schemas = 'public, graphql_public, art_therapy_api';

notify pgrst, 'reload config';
