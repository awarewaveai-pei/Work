# MainWP + WPvivid Client Backup Runbook

> Owner file for MainWP-managed WordPress client backups, WPvivid storage configuration, and the backup gate before plugin updates.
> Last updated: 2026-05-09

## 1. Purpose

Use this runbook when a WordPress client is managed through MainWP and backups are handled by WPvivid.

The target operating model is:

1. MainWP Dashboard can sync the child site.
2. MainWP WPvivid extension can read the child site's WPvivid settings.
3. WPvivid has a remote storage target with enough space.
4. A recent backup exists before any plugin update.
5. Plugin updates run by risk wave, with health checks between changes.

Do not run a production plugin update if backup proof is missing.

## 2. Quick Start

For an existing client:

1. Open MainWP: `https://mainwp.aware-wave.com/wp-admin/admin.php?page=Extensions-Wpvivid-Backup-Mainwp`
2. Confirm the site appears in the WPvivid extension list.
3. Confirm WPvivid Backup is installed, active, and latest.
4. Confirm remote storage is configured and selected as default.
5. Confirm schedule is enabled.
6. Trigger or verify one backup.
7. Only then run the safe update routine in section 9.

Fast command checks, when SSH is available:

```bash
# MainWP Dashboard container
cd /root/mainwp
docker exec mainwp-web wp plugin list --path=/var/www/html --allow-root

# WPvivid extension rows on MainWP
docker exec mainwp-web wp eval 'global $wpdb; foreach($wpdb->get_results("SELECT site_id, CHAR_LENGTH(remote) remote_len, CHAR_LENGTH(schedule) schedule_len, sync_error FROM {$wpdb->prefix}mainwp_wpvivid ORDER BY site_id", ARRAY_A) as $r){ echo wp_json_encode($r).PHP_EOL; }' --path=/var/www/html --allow-root
```

Expected result: one row per connected client, `remote_len > 0`, `schedule_len > 0`, and empty `sync_error`.

## 3. Source Of Truth

| Area | Owner |
|---|---|
| Command plane client operations | `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` |
| SSH/WP-CLI plugin update flow | `agency-os/docs/operations/WP_MANAGED_UPDATES.md` |
| MainWP + WPvivid backup gate | This file |
| Client environment facts | `agency-os/tenants/<client>/core/ENVIRONMENT_REGISTRY.md` |
| Backup evidence | `agency-os/tenants/<client>/core/BACKUP_RESTORE_PROOF.md` |
| Work evidence | `agency-os/WORKLOG.md` |

## 4. Client Eligibility

A client can use this path when all of these are true:

- The site is WordPress.
- `MainWP Child` is installed and active on the client site.
- `WPvivid Backup` is installed and active on the client site.
- The MainWP Dashboard has a valid connection key for the site.
- The remote storage account has enough free space for the selected backup scope and retention.

If the site is SSH-managed, keep the SSH/WP-CLI flow available as a fallback even after MainWP is connected.

## 5. MainWP Connection Checks

On the MainWP Dashboard:

```bash
cd /root/mainwp
docker exec mainwp-web wp eval 'global $mainwp_wpvivid_extension_activator; $sites=$mainwp_wpvivid_extension_activator->get_websites(); foreach($sites as $s){ echo wp_json_encode(["id"=>$s["id"],"name"=>$s["name"],"install"=>$s["install"],"active"=>$s["active"],"version"=>$s["version"],"status"=>$s["status"]]).PHP_EOL; }' --path=/var/www/html --allow-root
```

Expected:

- `install = 1`
- `active = 1`
- `status = Latest version` or an explicit update status

If MainWP sync fails with an OpenSSL private key warning, check the key files:

```bash
cd /root/mainwp
docker exec mainwp-web wp eval '$dirs=MainWP\Dashboard\MainWP_System_Utility::get_mainwp_dir(); $pk=$dirs[0]."pk/"; foreach([1,2,3,4,5] as $id){ $f=$pk."mainwp_priv_encrypt_keys_".$id; if(file_exists($f)){ echo "site {$id}: keyfile yes len=".filesize($f).PHP_EOL; } }' --path=/var/www/html --allow-root
```

If the DB has a site row but the required key decrypt file is missing, reconnect the child site or regenerate the MainWP connection key pair. The private key stays only on MainWP; the child site stores only `mainwp_child_pubkey`.

## 6. WPvivid Install Permission Fix

Symptom:

```text
Installation failed: Could not create directory. /var/www/html/wp-content/upgrade/...
```

Fix inside the affected WordPress container:

```bash
chown -R www-data:www-data /var/www/html/wp-content
rm -rf /var/www/html/wp-content/upgrade/wpvivid-*
su -s /bin/sh www-data -c 'test -w /var/www/html/wp-content/upgrade && echo writable'
```

Then install or activate WPvivid again as the web user when possible.

## 7. Remote Storage Standard

Default recommendation:

| Storage | Free space | Use |
|---|---:|---|
| Google Drive | 15 GB shared account quota | Preferred free remote for small client sites |
| Dropbox Basic | 2 GB | Acceptable only for DB-only backups or very small sites |
| S3-compatible storage | Paid | Preferred for scale, long retention, or multiple clients |

Rules:

- Do not store storage tokens, OAuth codes, app passwords, or account passwords in repo docs.
- OAuth authorization must be completed in the WordPress admin UI by an authorized operator.
- After remote storage is added, set it as default and run one real backup.
- For sites larger than 1 GB, do not rely on Dropbox Basic for full-site retention.

Current baseline as of 2026-05-09 (updated 2026-05-09 by maintenance agent):

| Site | Remote | Backup scope | Schedule | Last verified backup | Notes |
|---|---|---|---|---|---|
| `aware-wave.com` | Google Drive `Update_Backup` (remote id: `wpvivid-remote-69ff09b7329dd`) | files + DB | weekly, enabled | 2026-05-09 11:04 UTC - 30.14 MB zip - result: success | Migrated from Dropbox; Dropbox remote retained as fallback |
| `soulfulexpression.org` | Google Drive `Update_Backup` (remote id: `wpvivid-remote-69ff0a63b77ab`) | files + DB | weekly, enabled | 2026-05-09 11:08 UTC - 141 MB zip - result: success | Migrated from DB-only Dropbox to full-site Google Drive |

## 8. Backup Policy

Minimum policy:

| Site class | Scope | Frequency | Retention |
|---|---|---|---|
| Small static/info WP site | DB + files | Weekly | 3 |
| Ecommerce, membership, booking, forms | DB daily, files weekly | DB 7, files 3 | 7/3 |
| Site with large media library | DB weekly, files via host/S3 | Depends on storage | Explicitly documented |

Before updates:

- A same-day DB backup is required.
- A full-site backup is required for high-risk waves when storage allows.
- If only DB backup exists, do not update plugins that require file rollback unless an explicit rollback path exists.

## 9. Safe Plugin Update Routine

Use this routine for MainWP-managed clients.

1. Confirm site health:
   - homepage returns HTTP 200/301/302 as expected
   - admin login page is reachable
   - no active incidents
2. Confirm backup gate:
   - WPvivid remote exists
   - schedule is enabled
   - latest backup completed successfully
   - backup exists in remote storage
3. Classify pending updates:
   - wave1: WooCommerce, auth, payment, membership, security
   - wave2: forms, cache, SEO, URL/permalink, page builders
   - wave3: analytics, utilities, widgets
4. Update:
   - wave1 one-by-one, health check after each
   - wave2 one-by-one, health check after each
   - wave3 can batch only after backup proof
5. Stop on first failure:
   - record failing plugin and version
   - do not continue to the next plugin
   - restore from backup or reinstall the previous plugin version
6. Record outcome:
   - update `WORKLOG.md`
   - update tenant backup/update evidence where applicable

For SSH-managed clients, the script flow in `WP_MANAGED_UPDATES.md` remains the safer automation path because it includes DB backup and auto-rollback.

## 10. MainWP WPvivid Sync Verification

After adding a site or changing WPvivid storage:

```bash
cd /root/mainwp
docker exec mainwp-web wp eval 'foreach([1,2] as $id){ $website=MainWP\Dashboard\MainWP_DB::instance()->get_website_by_id($id); if($website){ MainWP\Dashboard\MainWP_Sync::sync_website($website); echo "site {$id}: synced".PHP_EOL; } }' --path=/var/www/html --allow-root
```

Then verify WPvivid data:

```bash
cd /root/mainwp
docker exec mainwp-web wp eval 'global $wpdb; $rows=$wpdb->get_results("SELECT site_id, remote, schedule FROM {$wpdb->prefix}mainwp_wpvivid ORDER BY site_id", ARRAY_A); foreach($rows as $r){ $remote=maybe_unserialize($r["remote"]); $schedule=maybe_unserialize($r["schedule"]); $summary=["site_id"=>$r["site_id"],"remote_count"=>isset($remote["upload"]) ? count(array_filter(array_keys($remote["upload"]), fn($k)=>$k!=="remote_selected")) : 0,"schedule_enable"=>$schedule["enable"]??null]; echo wp_json_encode($summary).PHP_EOL; }' --path=/var/www/html --allow-root
```

Expected:

- `remote_count >= 1`
- `schedule_enable = 1`

## 11. Troubleshooting

### WPvivid install fails

Use section 6. This is usually `wp-content` ownership or an old failed `upgrade/` scratch directory.

### MainWP sync runs but WPvivid table is empty

Likely causes:

- MainWP Child connection key broken or missing.
- MainWP Dashboard private-key decrypt file missing.
- WPvivid Backup is inactive on the child site.
- MainWP Child cannot call the `wpvivid_backuprestore` action.

Verification:

```bash
cd /root/mainwp
docker exec mainwp-web wp eval 'global $mainwp_wpvivid_extension_activator; foreach([1,2] as $site_id){ $post_data=["mwp_action"=>"wpvivid_get_backup_schedule_mainwp"]; $info=apply_filters("mainwp_fetchurlauthed", $mainwp_wpvivid_extension_activator->childFile, $mainwp_wpvivid_extension_activator->childKey, $site_id, "wpvivid_backuprestore", $post_data); echo wp_json_encode(["site_id"=>$site_id,"ok"=>!isset($info["error"]),"has_wpvivid"=>isset($info["wpvivid"])]).PHP_EOL; }' --path=/var/www/html --allow-root
```

### Remote storage quota is too small

Reduce scope temporarily to DB-only and migrate remote storage. Do not pretend DB-only is a full rollback path.

## 12. Command And Routine Mapping

| Surface | Command/routine | Status | Risk |
|---|---|---|---|
| Claude Code | `/wp-maintenance status` | Added as local command | Low |
| Claude Code | `/wp-maintenance update-plan <client>` | Added as local command | Low |
| Claude Code | `/wp-maintenance safe-update <client> <wave>` | Added as local command; requires backup proof | High |
| Telegram | `/wp_backup_status [client]` | Planned | Low |
| Telegram | `/wp_update_plan <client>` | Planned | Low |
| Telegram | `/mainwp_sync_status` | Planned | Low |
| Telegram | `/wpvivid_storage_audit` | Planned | Low |
| Telegram | `/wp_safe_update <client> <wave>` | Planned; must queue for ops approval | High |

Do not add planned Telegram commands to `setMyCommands` until a handler exists in the command plane.

## 13. Agent

Use `.claude/agents/wordpress-maintenance-agent.md` for:

- backup status checks
- MainWP/WPvivid sync diagnosis
- plugin update plans
- pre-update backup gate verification
- post-update evidence capture

The agent must refuse or stop production updates if backup proof is missing.

## 14. Related Documents

- `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md`
- `agency-os/docs/operations/WP_MANAGED_UPDATES.md`
- `agency-os/docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md`
- `docs/wordpress_mainwp_plan.md`
- `.claude/agents/wordpress-maintenance-agent.md`
- `.claude/commands/wp-maintenance.md`

