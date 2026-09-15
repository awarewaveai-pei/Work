-- Expose the custom schema to PostgREST while keeping canonical tables private.
-- Only the server-side service role can read the two approved read models.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, art_therapy';

grant usage on schema art_therapy to service_role;
grant select on art_therapy.tool_details, art_therapy.theory_details to service_role;

revoke all privileges on all tables in schema art_therapy from anon, authenticated;

notify pgrst, 'reload config';
