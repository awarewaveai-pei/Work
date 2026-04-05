# Environment Registry — P1 Pilot

> Drill tenant；環境以 ** Lobster／staging 演練** 為主，欄位對齊模板便於複製。

## Environment Inventory

| Environment | URL | Hosting Provider | Region | WP Version | PHP Version | DB Engine | Backup Location | Last Backup | Last Restore Test | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| staging | **待補**（演練／mock） | mock / TBD | — | — | — | — | — | — | — | Agency OS | 對齊 `sites/pilot-main` |
| production | **N/A**（drill） | — | — | — | — | — | — | — | — | — | 無 |

## DNS and SSL

| Item | Staging | Production | Owner | Verified Date |
|---|---|---|---|---|
| DNS zone access | 待補 | N/A | — | |
| SSL certificate valid | 待補 | N/A | — | |
| CDN/cache config | 待補 | N/A | — | |

## Change Control

- Production change window: **N/A**
- Rollback owner: Agency OS Operator
- Escalation contact: 見 `PROFILE.md`
- Evidence path for preflight/postcheck: `agency-os/reports/e2e/`
