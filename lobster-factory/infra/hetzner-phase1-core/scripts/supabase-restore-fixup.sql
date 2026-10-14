-- Run after loading supabase-all.sql.gz into a bare cluster (DR runbook §4 step 4; backup-restore-drill.py runs it too).
-- pg_dumpall hands these functions to postgres (not a superuser) before it creates their event triggers, and PostgreSQL
-- lets a superuser's event trigger call only a superuser's function. Prod's triggers predate the owner change, so
-- recreate them the same way. A trigger in the dump missing or defined differently after this file = the drill fails.
BEGIN;
ALTER FUNCTION extensions.grant_pg_cron_access() OWNER TO supabase_admin;
DROP EVENT TRIGGER IF EXISTS issue_pg_cron_access;
CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end WHEN TAG IN ('CREATE SCHEMA')
  EXECUTE FUNCTION extensions.grant_pg_cron_access();
ALTER FUNCTION extensions.grant_pg_cron_access() OWNER TO postgres;
ALTER FUNCTION extensions.grant_pg_net_access() OWNER TO supabase_admin;
DROP EVENT TRIGGER IF EXISTS issue_pg_net_access;
CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end WHEN TAG IN ('CREATE EXTENSION')
  EXECUTE FUNCTION extensions.grant_pg_net_access();
ALTER FUNCTION extensions.grant_pg_net_access() OWNER TO postgres;
-- Without --clean, pg_dumpall leaves database postgres's own owner and grants to whoever ran initdb (PostgreSQL commit
-- b3f8401); prod has owner postgres and CTc for dashboard_user. The drill compares every database's owner, grants and
-- settings with prod, so a future difference fails it instead of being lost here.
ALTER DATABASE postgres OWNER TO postgres;
GRANT ALL ON DATABASE postgres TO dashboard_user;
COMMIT;
