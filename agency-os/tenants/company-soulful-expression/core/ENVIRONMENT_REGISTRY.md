# Environment Registry - Soulful Expression Art Therapy

> **URL／lifecycle SSOT**：本檔為本租戶 **staging／production canonical URL** 與 **`lifecycle`** 唯一真相；`SITES_INDEX.md`、`sites/*/SITE_PROFILE.md`、`NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` §6 為衍生摘要——**變更網址或 lifecycle 時先改本檔**，再同步索引。
>
> **與 Discovery 同步**：`production` 列的 **WP／PHP／DB Engine** 應與 `projects/2026-011-existing-site-handover-soulful/10_DISCOVERY.md` 的「環境基線」**一致**（Day 1 盤點同一輪填入）。

## Environment Inventory

| Environment | URL | Hosting Provider | Region | WP Version | PHP Version | DB Engine | Backup Location | Last Backup | Last Restore Test | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| staging | **https://staging.soulfulexpression.org/**（canonical） | Hostinger（預設） | APAC | 待實機 | 待實機 | MySQL/MariaDB | 待實機 | 待實機 | 待實機 | Agency OS | **lifecycle=`provision_pending`**（Runbook Pilot A §2）；實機建立後改 `live` 並回填 WP/PHP。**禁止**在未備份前直接改 production。 |
| production | https://soulfulexpression.org/ | Hostinger（host: `sg-nme-web624.main-hosting.eu`） | APAC | 6.9.4 | 8.2.30 | MariaDB 11.8.6 | Local: `backups/soulful_db_20260508_160734.sql.gz`（DB only，15 MB，SHA256 `849db784…`）+ Hostinger 自動備份（panel，未驗還原） | **2026-05-08 08:07 UTC**（mysqldump via SSH） | **未執行**（staging `provision_pending`；計劃 Day 2） | Client + Agency OS | 既有運行站；Day 1 §1.2 機讀盤點 2026-05-08 ✅；Day 1 §1.3 DB dump 完成（`BACKUP_RESTORE_PROOF.md #1`）；restore drill 待 staging 建立後執行 |

## DNS and SSL

| Item | Staging | Production | Owner | Verified Date |
|---|---|---|---|---|
| DNS zone access | **預期**：`staging.soulfulexpression.org` → Hostinger／CDN（§2） | Hostinger | 待補 |  |
| SSL certificate valid | 待實機建立後驗證 | 待盤點 | 待補 |  |
| CDN/cache config | 建議 Basic Auth／access rule（§2） | 待盤點 | 待補 |  |

## Change Control

- Production change window: 待補
- Rollback owner: 待補
- Escalation contact: 待補
- Evidence path for preflight/postcheck: `agency-os/reports/e2e/`
