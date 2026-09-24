# codex-oracle review -- 2026-09-24 13:58:47 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh, scripts/check-staging-orphans.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: deprovision-staging.sh (root operator script on ks-aw-01, backup-first staging teardown) gains: (1) --db <name> mode for DB-only orphans (staging naming regex, not the main DB read from the running WP container env, must exist, must not be referenced by any staging wp-config, dump backup then DROP DATABASE + DROP USER same name); (2) slug mode also deletes client_credentials rows whose metadata.staging_url is the site URL (with/without trailing slash) and their vault secrets via rpc secret_delete (secret first, then row; any non-2xx aborts); (3) wp_sites/client_credentials lookups use curl --fail and abort instead of treating a failed query as zero rows; (4) DB root password no longer on argv (MYSQL_PWD from the DB container env), PROD_DB_NAME from the running container instead of .env; (5) DEPROVISION_ENV_FILE override for the throwaway test. Integration test runs the real script against a disposable mariadb+wordpress stack with a busybox Supabase stub (42/42). Check correctness, destructive-path guards, PostgREST query syntax (in.() with quoted URLs), and anything that could delete the wrong thing. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 307321ms | answer: 671B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh, scripts/check-staging-orphans.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A successful HTTP response containing invalid JSON is treated as zero `wp_sites` rows, then destructive teardown continues  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh:165`  
  confidence  -> CONFIRMED  
  scenario    -> Supabase/proxy returns HTTP 200 with an HTML/error body; `json.load()` fails, `SB_COUNT` becomes `0`, and the script proceeds to drop the database and remove the staging directory instead of aborting.  
  why missed  -> `curl --fail` detects HTTP failures, but the existing JSON parser fallback still converts malformed successful responses into an apparently empty result.

TOTAL: 1 finding
