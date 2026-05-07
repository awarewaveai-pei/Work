# Environment Registry - Scenery Travel Mongolia

## Environment Inventory

| Environment | URL | Hosting Provider | Region | WP Version | PHP Version | DB Engine | Backup Location | Last Backup | Last Restore Test | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| staging | **https://staging.scenery-travel.mn/**（canonical **提案**；若客戶頂級網域未定，建立實機前請置換） | **主機商待定**（Runbook Pilot B §2） | APAC／跨時區 | 待實機 | 待實機 | MySQL/MariaDB | 待實機 | 待實機 | 待實機 | Agency OS | **lifecycle=`provision_pending`**；對齊 site id `scenery-travel-mn`。 |
| production | **（Day 5）** 待客戶網域／主機確定後填入 | 待補 | APAC | 待補 | 待補 | MySQL/MariaDB | 待補 | 待補 | 待補 | Agency OS | 首版上線前完整 gate 驗證 |

## DNS and SSL

| Item | Staging | Production | Owner | Verified Date |
|---|---|---|---|---|
| DNS zone access | 待補 | 待補 | 待補 | |
| SSL certificate valid | 待補 | 待補 | 待補 | |
| CDN/cache config | 待補（Cloudflare 選用） | 待補 | 待補 | |

## Change Control

- Production change window: 亞洲時間週二或週四 10:00–12:00（初定，待客戶確認）
- Rollback owner: Agency OS
- Escalation contact: 待補
- Evidence path for preflight/postcheck: `agency-os/reports/e2e/`
