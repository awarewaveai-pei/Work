# Environment Registry - Soulful Expression Art Therapy

> **與 Discovery 同步**：`production` 列的 **WP／PHP／DB Engine** 應與 `projects/2026-011-existing-site-handover-soulful/10_DISCOVERY.md` 的「環境基線」**一致**（Day 1 盤點同一輪填入）。

## Environment Inventory

| Environment | URL | Hosting Provider | Region | WP Version | PHP Version | DB Engine | Backup Location | Last Backup | Last Restore Test | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| staging | **https://staging.soulfulexpression.org/**（canonical） | Hostinger（預設） | APAC | 待實機 | 待實機 | MySQL/MariaDB | 待實機 | 待實機 | 待實機 | Agency OS | **lifecycle=`provision_pending`**（Runbook Pilot A §2）；實機建立後改 `live` 並回填 WP/PHP。**禁止**在未備份前直接改 production。 |
| production | https://soulfulexpression.org/ | Hostinger | APAC | 待盤點 | 待盤點 | 待盤點 | 待盤點 | 待盤點 | 待盤點 | Client + Agency OS | 既有運行站 |

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
