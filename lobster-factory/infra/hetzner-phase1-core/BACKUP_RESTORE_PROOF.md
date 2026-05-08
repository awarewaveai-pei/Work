# Backup and Restore Proof — Hetzner Phase 1 (SG VPS)

> Infrastructure-level backup evidence for the Phase 1 compose stack.
> Per LONG_TERM_OPS.md §4: annual minimum restore drill required.

## Backup Record

- Stack: Phase 1 compose (Nginx + Redis + WordPress + MariaDB + Node API + Next Admin)
- VPS: 5.223.93.113 (Hetzner SG, instance-id: 125887340)
- Backup scope: WordPress DB (MariaDB `wordpress`) + wp-content uploads + n8n volume (when running)
- Backup script: `scripts/backup-phase1.sh` (cron daily 02:00 UTC)
- Verify script: `scripts/verify-backup.sh` (cron daily 02:30 UTC)
- Local retention: 7 days (`BACKUP_RETAIN_DAYS`)
- Offsite: pending `RCLONE_REMOTE` configuration (rclone installed, target: Hetzner Object Storage fsn1)
- Cron file: `/etc/cron.d/lobster-backup`
- Log: `/var/log/lobster-backup.log`

## Restore Drill Record

### Drill #1 — 2026-05-08

- Drill date: 2026-05-08T07:53Z
- Operator: Claude Code (automated)
- Backup used: `./backups/20260508-075320/wordpress-db.sql.gz` (28K gzip)
- Restore target: `wordpress_restore_drill` (temporary database, same MariaDB container)
- Method: `gunzip -c | docker exec -i lobster-wordpress-db mariadb`
- Duration: < 5 seconds

#### Verification

| Check | Result |
|-------|--------|
| Backup file integrity (`gzip -t`) | PASS |
| Restore without errors | PASS |
| Table count: production = 12, restored = 12 | PASS (match) |
| Tables present: wp_options, wp_posts, wp_users, wp_comments, wp_postmeta, wp_usermeta, wp_terms, wp_termmeta, wp_term_taxonomy, wp_term_relationships, wp_commentmeta, wp_links | PASS (all 12) |
| Row counts: wp_options=147, wp_usermeta=25, wp_posts=4 | PASS (plausible) |
| Uploads archive integrity (`tar tzf wp-html.tgz`) | PASS |
| Uploads archive size: 28M | PASS (matches live 89M uncompressed) |

#### Cleanup
- Test database `wordpress_restore_drill` dropped immediately after verification.
- No production data modified.

#### Issues found: None
#### Corrective actions: None required

---

## Next scheduled drill

- Annual minimum per LONG_TERM_OPS.md §4 + §6
- Next: 2027-05 (or before any major upgrade)
- Scope: full DR in isolated VM (not just DB restore)
