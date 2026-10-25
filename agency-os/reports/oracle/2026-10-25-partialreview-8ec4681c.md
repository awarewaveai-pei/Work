# codex-oracle review -- 2026-10-25 15:07:39 +08:00

- mode: `review`
- scope: -Path scripts/rollout-wp-bridge.ps1, scripts/release-wp-bridge.sh, lobster-factory/packages/wp-bridge-plugin  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: New scripts/rollout-wp-bridge.ps1 (PowerShell 5.1 locally, bash on the prod host via scp+ssh): upgrades aware-wave-wp-bridge on every WordPress container on the prod host that already has it (discovered, not listed). Per site: DB dump (db container from WORDPRESS_DB_HOST or the compose service), plugin folder tgz backup, wp plugin install --force (keeps active state), chown to the plugins folder owner, checks (plugin version, REST /aware-wave-bridge/v1/health 200 with the new version via rest_do_request, home page code < 500), restore previous folder on failure and exit 1. Plugin 0.18.2: ProductFields registers only when the billing switch is on, because wp-bridge also runs on client sites (soulful has WooCommerce). release-wp-bridge.sh prints a NEXT rollout line.
- exit: 0 | elapsed: 144134ms | answer: 1501B
- files-reviewed: lobster-factory/packages/wp-bridge-plugin/aware-wave-wp-bridge.php, lobster-factory/packages/wp-bridge-plugin/includes/Admin/BillingSettingsPage.php, lobster-factory/packages/wp-bridge-plugin/includes/Billing/BillingModule.php, scripts/release-wp-bridge.sh, scripts/rollout-wp-bridge.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Soulful cannot pass the database backup gate
  file:line   -> scripts/rollout-wp-bridge.ps1:83
  confidence  -> CONFIRMED
  scenario    -> Soulful uses the configuration in lobster-factory/infra/soulful/docker-compose.yml:33, which defines MARIADB_DATABASE, MARIADB_USER and MARIADB_PASSWORD. The dump command reads only MYSQL_* variables, so its credentials and database name are empty. Backup fails and Soulful remains unupgraded. The existing backup script already handles this at lobster-factory/infra/ks-aw-01-backup/backup-ks-aw-01.sh:98.
  why missed  -> The fallback accommodates MariaDB’s executable name but not its environment variables. Entrypoint exports do not supply subsequent exec processes; Docker uses the [container creation environment](https://docs.docker.com/reference/cli/docker/container/exec/#set-environment-variables-for-the-exec-process---env--e).

FINDING 2: Container discovery failure returns a successful rollout
  file:line   -> scripts/rollout-wp-bridge.ps1:66
  confidence  -> CONFIRMED
  scenario    -> SSH succeeds but the Docker daemon is unavailable. `docker ps` fails and produces no container names, so the loop never executes. `fail` remains zero from line 64, and line 113 exits successfully despite checking or upgrading no sites. An unmatched explicit `-Site` also silently succeeds.
  why missed  -> Failures inside the loop update the exit status, but discovery failure and zero matched targets never enter that handling.

TOTAL: 2 findings
