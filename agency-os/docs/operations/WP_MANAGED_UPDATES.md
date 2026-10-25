# WordPress Managed Plugin Updates

> **Owner file** — single source of truth for managed WordPress plugin update policy and runbook.  
> **Last updated**: 2026-05-09
> **Script**: `scripts/update-client-wp-plugins.ps1`  
> **Client configs**: `agency-os/tenants/*/core/wp-update-config.json`

---

## 1. Purpose

Provide a safe, repeatable, one-command workflow to update WordPress plugins on managed client sites — without a staging environment, without breaking production.

**Design principle**: backup-first + per-plugin health check + auto-rollback replaces the "update on staging first" approach. Each plugin update is verified individually before proceeding to the next; a failure triggers immediate DB restore from the just-taken backup.

---

## 2. Architecture (Two-Tier)

```
Tier 1 (today): scripts/update-client-wp-plugins.ps1
  └── WP-CLI via host profile: ks-aw-01-docker (docker exec) | shared-ssh (e.g. cPanel/Hostinger)
  └── Config: tenants/<client>/core/wp-update-config.json
  └── DB creds: read live from wp-config.php via WP-CLI (never in vault)
  └── Backup: mysqldump → gzip → local + checksum
  └── Rollback: SCP backup back → gunzip | mysql
  └── Report: agency-os/reports/wp-updates/<client>-YYYYMMDD.json

Tier 2 (active visual/control plane):
  └── MainWP Dashboard at mainwp.aware-wave.com
  └── WPvivid Backup for MainWP extension
  └── Backup gate owner: agency-os/docs/operations/MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md
  └── Tier 1 remains the automation/emergency CLI path where SSH is available
```

**Why not staging-first?**  
Hostinger shared hosting provides site-cloning via hPanel (Subdomains). The Day 2 staging plan for Soulful Expression creates a staging copy for restore drills and major changes. For routine plugin updates, the backup-rollback approach is faster, safer for low-risk updates, and avoids the "staging drift" problem where staging plugins diverge from production.

---

## 3. Quick Start

```powershell
# See what updates are pending (no changes)
.\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins list

# Dry run (shows what WOULD be done)
.\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins wave1 -DryRun

# Update high-risk plugins one-by-one with health check + auto-rollback
.\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins wave1

# Update medium-risk plugins
.\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins wave2

# Update low-risk plugins in batch
.\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins wave3
```

---

## 4. Wave Risk Classification

| Wave | Risk | Update mode | Health check | Notes |
|------|------|-------------|--------------|-------|
| wave1 | High | One-by-one | After each plugin | Auth cores, ecommerce, plugins with CVE history |
| wave2 | Medium | One-by-one | After each plugin | Cache, URL structure, form/email cores |
| wave3 | Low | Batch | Once at end | SEO, analytics, minor utilities |
| CSV | Any | One-by-one | After each | Explicit slug list: `"akismet,woocommerce"` |
| all | Mixed | Batch | Once at end | Use with caution — not recommended for wave1 items |

**Never-in-waves** (must be updated manually with client notification):
- `fluent-smtp` — transactional email; broken = no WP email
- `fluent-crm` — email marketing core
- Any plugin with pending DB schema migrations (check update notes first)

---

## 5. Safe Update Flow (what the script does)

```
1. Load config from tenants/<client>/core/wp-update-config.json
2. Pre-flight: SSH reachable? Site returning HTTP 200?
3. Backup: mysqldump via SSH → gzip → `Dump completed` trailer check. `ks-aw-01-docker`: DB dump + plugins-folder tgz stay on the host in `/root/backups/wordpress/` (pruned after 30 days; no laptop download; 2026-10-25 a slow download killed a run mid-backup). `shared-ssh`: downloaded to local `backups/`
4. Resolve plugin list (wave / csv / all / list)
5. For each plugin:
   a. wp plugin update <slug> --format=json
   b. Health check: HTTP 200 + no PHP Fatal / WP DB error in body
   c. On health-check FAIL:
      - SCP backup back to server temp dir
      - gunzip | mysql (restore DB)
      - Halt and report failure
6. Write JSON report to agency-os/reports/wp-updates/
```

---

## 6. Client Configs

Each managed client needs one config at `tenants/<folder>/core/wp-update-config.json`.

**Required fields** — `host.profile` decides how every remote step runs (2026-09-24):
```json
{
  "clientSlug": "soulful",
  "siteUrl": "https://...",
  "host": { "profile": "ks-aw-01-docker", "wpContainer": "soulful-wp", "dbContainer": "soulful-db" },
  "waves": { "wave1": ["plugin-slug-a"], "wave2": ["plugin-slug-c"], "wave3": ["plugin-slug-d"] }
}
```
- `ks-aw-01-docker`: our host (ssh facts from `scripts/lib/prod-host.ps1`); WP-CLI `docker exec -u www-data <wpContainer>`; DB dump/restore as root inside `<dbContainer>` (the site's DB password is never read).
- `shared-ssh`: `"host": { "profile": "shared-ssh", "sshHost", "sshPort", "sshUser", "sshKeyName", "wpPath" }` — WP-CLI on PATH, DB password read live via `wp config get DB_PASSWORD`. A config with no `host` block (legacy flat fields) = `shared-ssh`.
- Backup passes only with a `-- Dump completed` trailer (pipefail); `-BackupOnly` takes + downloads the backup and stops.

### Current clients

| Client slug | Config path | Profile | Site |
|-------------|-------------|---------|------|
| `soulful` | `tenants/company-soulful-expression/core/wp-update-config.json` | `ks-aw-01-docker`（Hostinger 副本為凍結回滾，勿更新） | soulfulexpression.org |

---

## 7. Adding a New Client

1. Create `agency-os/tenants/company-<name>/core/wp-update-config.json` from the template above
2. Ensure SSH key is in `~/.ssh/<keyName>` and added to server's `authorized_keys`
3. Run `list` mode to confirm WP-CLI works: `.\scripts\update-client-wp-plugins.ps1 -ClientSlug <slug> -Plugins list`
4. Add client row to §6 table above
5. Update `SITES_INDEX.md` if needed

---

## 8. Auto-Rollback Details

When a health check fails after a plugin update:

`ks-aw-01-docker`: unpacks the host plugins tgz beside the live folder, swaps them by rename (failed code kept in the container at `/var/www/plugins.failed-<timestamp>`, outside the docroot), restores the DB from the host dump (even if the plugins step failed), halts. Files AND DB return to the pre-update state.

`shared-ssh`:
1. Script SCPs the backup `.sql.gz` back to the server and restores the DB
2. Halts — does NOT continue to next plugin
3. Only restores DB — file changes from the plugin update persist in `wp-content/plugins/`
- If manual file rollback needed: SSH → `wp plugin install <slug> --version=<old_version> --force`

---

## 9. Soulful Expression — Plugin Wave Assignments

Based on `projects/2026-011-existing-site-handover-soulful/10_DISCOVERY.md` (2026-05-08).

### wave1 — High Risk (update one-by-one)

| Plugin | Current | Target | Risk reason |
|--------|---------|--------|-------------|
| advanced-custom-fields-pro | 6.4.2 | 6.8.0.1 | 4 minor versions behind; field definitions core |
| ultimate-member | 2.11.3 | 2.11.4 | Auth core; CVE history; member-gated content |
| woocommerce | 10.6.1 | 10.7.0 | Ecommerce core; DB schema migrations |
| woocommerce-points-and-rewards | 1.8.10 | 1.18.20 | 10+ versions behind; known CVE risk |

### wave2 — Medium Risk (update one-by-one)

| Plugin | Current | Target | Risk reason |
|--------|---------|--------|-------------|
| fluentform | 6.1.20 | 6.2.2 | Form/booking core; data collection |
| kadence-blocks-pro | 2.7.8 | 2.8.14 | Visual core; may affect page layouts |
| litespeed-cache | 7.8.0.1 | 7.8.1 | Cache layer; incorrect config = stale pages |
| permalink-manager-pro | 2.5.1.4 | 2.5.3.3 | URL rewrite rules; broken = all custom URLs 404 |

### wave3 — Low Risk (batch update)

| Plugin | Current | Target |
|--------|---------|--------|
| akismet | 5.6 | 5.7 (tested 2026-05-08) |
| astra-portfolio | 1.13.1 | 1.13.4 |
| cartflows | 3.0.0 | 3.0.1 |
| code-snippets | 3.9.5 | 3.9.6 |
| google-site-kit | 1.174.0 | 1.178.0 |
| hostinger | 3.0.65 | 3.0.66 |
| kadence-blocks | 3.6.5 | 3.6.7 |
| seo-by-rank-math | 1.0.266.1 | 1.0.269 |

### Not in waves (hold)

| Plugin | Reason |
|--------|--------|
| fluent-smtp | Transactional email — test on staging first |
| fluent-crm | Email marketing core — schedule with client |

---

## 10. Tier 2: MainWP Dashboard + WPvivid

**Status**: active for visual management and backup verification.

Primary dashboard: `https://mainwp.aware-wave.com/wp-admin/admin.php?page=Extensions-Wpvivid-Backup-Mainwp`

**Setup baseline**:
1. MainWP Dashboard runs on `mainwp.aware-wave.com`.
2. MainWP Child plugin is installed on each connected client WordPress site.
3. WPvivid Backup for MainWP extension is installed on the dashboard.
4. Each client has a remote-storage-backed WPvivid schedule before production updates are allowed.
5. The owner runbook for backup setup, sync checks, storage policy, and safe-update gates is `agency-os/docs/operations/MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md`.

**Current split of responsibility**:
- Tier 1 script remains the automation and emergency rollback path where SSH/WP-CLI access exists.
- MainWP handles visual site inventory, plugin visibility, client-site sync, and operator-driven updates.
- WPvivid provides the backup proof required before safe updates.

**Coexistence**: both Tier 1 and Tier 2 remain valid. When both are available, use MainWP/WPvivid to verify backup readiness, then use the lowest-risk update path for the client and wave.

---

## 11. Reports

Update reports are written to `agency-os/reports/wp-updates/` as JSON:
```
agency-os/reports/wp-updates/soulful-20260508-wave1.json
```

Report schema:
```json
{
  "client": "soulful",
  "wave": "wave1",
  "startedAt": "2026-05-08T...",
  "completedAt": "...",
  "backupFile": "soulful_db_20260508_160734.sql.gz",
  "plugins": [
    {
      "slug": "ultimate-member",
      "fromVersion": "2.11.3",
      "toVersion": "2.11.4",
      "status": "updated",
      "healthCheck": "pass"
    }
  ],
  "overallStatus": "completed|failed|rolled_back"
}
```

---

## 12. Related Documents

- `scripts/update-client-wp-plugins.ps1` — the script (owner: this doc)
- `scripts/README.md` — script catalogue entry
- `tenants/company-soulful-expression/core/wp-update-config.json` — Soulful config
- `tenants/company-soulful-expression/projects/2026-011-existing-site-handover-soulful/10_DISCOVERY.md` — plugin risk baseline
- `tenants/company-soulful-expression/core/BACKUP_RESTORE_PROOF.md` — backup records
- `tenants/company-soulful-expression/core/ENVIRONMENT_REGISTRY.md` — environment SSOT
- `agency-os/docs/operations/MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md` — MainWP + WPvivid backup gate and safe-update routine
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` — tool routing constraints

_Last updated: 2026-05-09_
