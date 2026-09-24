# codex-oracle review -- 2026-09-24 13:09:39 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/aw-hosting-gate.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/hosting-gate-contract.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/provision-staging-mainwp.test.ts, lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/.env.example  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Hosting bridge (next-admin provision-staging) SSH identity redesign. Before: route hardcoded root@:22 (dead on ks-aw-01), own unpinned ssh2 client, host root shell commands built by string interpolation (siteName at old route.ts:421 inside bash -c double quotes = host root command injection; raw siteId/pluginSlugs), DB root + main-site DB password held by next-admin and put on argv. After: key whose only power is root forced command aw-hosting-gate.sh (authorized_keys restrict,from=172.16.0.0/12, env -u BASH_ENV wrapper, same pattern as aw-autorepair-gate.sh) with two verbs: staging-prepare <slug> <db> (dir + DB + per-site DB account named <db> + wp core + wp-config; migrates legacy sites that use the main WP account; passwords only on stdin; DB root pw from DB container env via MYSQL_PWD) and staging-wp <slug> (stdin bash script run as www-data in lobster-wordpress). Route uses the shared pinned ssh.ts (readSshTargetFromEnv HOSTING_BRIDGE), validates siteId/pluginSlugs/wpPath with the gate regexes, shq() every interpolation, admin password via wp-cli --prompt on stdin. Invariant: one staging site <-> one DB <-> one DB account; deprovision drops the account. Known incident this session: a test of WPConfigTransformer without explicit path rewrote the MAIN site wp-config (restored in 80s); config_set now uses explicit realpath + prefix check. Integration test runs the real gate against a throwaway mariadb+wordpress stack (29/29). Check especially: gate argument parsing / injection, SQL built with printf (values regex-validated), migration rollback correctness, anything that could touch the main site DB or wp-config, secrets reaching argv/stdout/logs. Also verify: does this change depend on something NOT visible in this diff? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 105313ms | answer: 756B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/.env.example, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/provision-staging-mainwp.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/hosting/__tests__/hosting-gate-contract.test.ts, lobster-factory/infra/hetzner-phase1-core/scripts/aw-hosting-gate.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: An omitted hosting SSH port silently falls back to dead port 22 instead of failing closed.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts:164`
  confidence  -> CONFIRMED
  scenario    -> `HOSTING_BRIDGE_SSH_HOST`, key, and fingerprint are configured, but `HOSTING_BRIDGE_SSH_PORT` is absent; `readSshTargetFromEnv()` selects port 22, while the hosting bridge is documented/configured for port 58122 (`.env.example:197-202`). Provisioning then connects to the old dead port and fails rather than reporting missing configuration.
  why missed    -> The new hosting variables are described as all required, but the shared reader retains Auto-Repair’s optional-port default.

TOTAL: 1 findings
