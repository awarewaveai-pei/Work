# codex-oracle review -- 2026-10-01 15:13:59 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0022_build_console_execution_tables.sql, lobster-factory/packages/db/migrations/0024_tenant_integration_registry.sql, lobster-factory/packages/db/migrations/0037_ops_action_runs_pending_dispatch_index.sql, lobster-factory/packages/db/migrations/0057_seed_wp_maintenance_action.sql, lobster-factory/packages/db/migrations/0094_public_tables_rls_default_deny.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/db/__tests__/rls-open-policy.test.ts, mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Fix 4 never-applied migrations (0022 could not apply: now() in index predicate; role-less using(true) policies opened 2 tables to anon -> service_role only) already applied to prod 2026-10-01; new 0094 locks 3 verified RLS-less prod tables + event trigger auto-enabling RLS on new public tables (NOT applied, awaiting operator); static guard test for literal-true policies; Codex parity detector uses rollout session_meta start time instead of resettable file CreationTime. Also verify: does this change depend on something NOT visible in this diff -- a config value, retention/timeout setting, schema assumption, cron schedule, or upstream default defined elsewhere in the repo? If it contradicts the change, report it. If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 713056ms | answer: 2272B
- files-reviewed: lobster-factory/packages/db/migrations/0022_build_console_execution_tables.sql, lobster-factory/packages/db/migrations/0024_tenant_integration_registry.sql, lobster-factory/packages/db/migrations/0037_ops_action_runs_pending_dispatch_index.sql, lobster-factory/packages/db/migrations/0057_seed_wp_maintenance_action.sql, mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/db/__tests__/rls-open-policy.test.ts, lobster-factory/packages/db/migrations/0094_public_tables_rls_default_deny.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 0022 revokes authenticated tenant access from five previously tenant-isolated tables.
  lobster-factory/packages/db/migrations/0022_build_console_execution_tables.sql:195 -> lobster-factory/packages/db/migrations/0022_build_console_execution_tables.sql:203
  confidence  -> CONFIRMED
  scenario    -> An authenticated tenant request reads `operator_tasks` -> `REVOKE ALL ... authenticated` causes access denial; only `service_role` remains permitted.
  why missed  -> The service-only fix intended for two tables was applied to all seven.

FINDING 2: 0094 may abort on the public migration ledger before installing any protection.
  lobster-factory/packages/db/migrations/0022_build_console_execution_tables.sql:13 -> lobster-factory/packages/db/migrations/0094_public_tables_rls_default_deny.sql:19
  confidence  -> PLAUSIBLE
  scenario    -> `public.schema_migrations` exists without RLS -> the allowlist check raises an exception, rolling back both the three-table lockdown and event trigger creation.
  why missed  -> The scan allowlists only the three verified application tables and does not exclude the ledger.

FINDING 3: 0094 has a race between its inventory scan and event-trigger installation.
  lobster-factory/packages/db/migrations/0094_public_tables_rls_default_deny.sql:19 -> lobster-factory/packages/db/migrations/0094_public_tables_rls_default_deny.sql:56
  confidence  -> CONFIRMED
  scenario    -> Another session creates `public.new_table` after the scan but before the event trigger commits -> the table remains RLS-disabled with default public ACLs.
  why missed  -> The one-time scan and future trigger are treated as atomic without locking or a post-install rescan.

FINDING 4: Migration 0037 still cannot run through the normal migration runner.
  lobster-factory/packages/db/migrations/0037_ops_action_runs_pending_dispatch_index.sql:15 -> lobster-factory/packages/db/migrations/0037_ops_action_runs_pending_dispatch_index.sql:21
  confidence  -> CONFIRMED
  scenario    -> The runner starts a transaction and executes `CREATE INDEX CONCURRENTLY` -> PostgreSQL rejects it, so the migration remains unapplied.
  why missed  -> The change fixes schema qualification but retains the transaction-incompatible statement.

TOTAL: 4 findings
