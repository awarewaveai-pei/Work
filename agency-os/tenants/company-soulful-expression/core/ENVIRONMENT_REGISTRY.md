# Environment Registry - Soulful Expression Art Therapy

> **URL／lifecycle SSOT**：本檔為本租戶 **staging／production canonical URL** 與 **`lifecycle`** 唯一真相；`SITES_INDEX.md`、`sites/*/SITE_PROFILE.md`、`NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` §6 為衍生摘要——**變更網址或 lifecycle 時先改本檔**，再同步索引。
>
> **與 Discovery 同步**：`production` 列的 **WP／PHP／DB Engine** 應與 `projects/2026-011-existing-site-handover-soulful/10_DISCOVERY.md` 的「環境基線」**一致**（Day 1 盤點同一輪填入）。

## Environment Inventory

| Environment | URL | Hosting Provider | Region | WP Version | PHP Version | DB Engine | Backup Location | Last Backup | Last Restore Test | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ~~staging~~ | ~~https://staging.soulfulexpression.org/~~ | — | — | — | — | — | — | — | — | — | **lifecycle=`abandoned`（2026-08-16）** —— 原計畫在 Hostinger 面板建 staging 子網域，卡 3 個月未動；hosting 已決定 2026-11-12 不續約，在即將退場的主機上建 staging 沒有意義。還原演練改以 EU 拋棄式容器完成（`BACKUP_RESTORE_PROOF.md` Drill #1）。新主機上線後再視需要建 staging |
| production | https://soulfulexpression.org/ | **ks-aw-01**（`soulful-wp`/`soulful-db`/`soulful-redis` container，`127.0.0.1:8081`→nginx→Cloudflare；切換完成 2026-08-28）。Hostinger 為凍結中的回滾路徑，**未退場**，`2026-11-12` 為 hosting 不續約自然到期日，非搬遷截止日 | APAC | **6.9.7**（`?ver=` 實測） | **8.2.31**（container 實測） | MariaDB 11.8.8（container image tag，實測） | **EU VPS `/root/backups/clients/soulful/`**：`db-20260815-122353.sql.gz`（15 MB）+ `uploads-20260815.tar.gz`（632 MB）+ `code-20260816.tar.gz`（122 MB，SHA256 `a6cd877b…`）。**不在 Hostinger**，主機到期不受影響 | **2026-08-15**（DB + uploads）／**2026-08-16**（程式碼） | **✅ 2026-08-16 PASS**（EU 拋棄式容器：288 表、750 筆附件零遺失交叉比對） | Client + Agency OS | DNS 自 2026-08-15 起由 **Cloudflare** 服務（zone `bb1358fe…` active，apex A 記錄 `145.239.195.47`＝ks-aw-01）；信箱仍在 Hostinger Business Email（付至 2029-06-03）|

> **2026-09-05 校正**：Hosting Provider／WP／PHP／DB Engine 欄改為 ks-aw-01 現況（`TASKS.md` "🎉 Soulful 正式切換完成" 2026-08-28 已完成真流量切換，本表當時未同步更新，停留在切換前的 2026-08-16 校正值）。起因：同日在 Hostinger 端改 `.htaccess` 完全無效，才發現本表的 Hosting Provider 欄早已與實況脫鉤——`git blame`/CF DNS A 記錄一查便知，Hostinger 只是 FTP 仍可連的死路徑。**改站台設定一律對 ks-aw-01 container 操作**。
> **2026-08-16 校正**：本表原記載 WP 6.9.4 / PHP 8.2.30 / 備份僅本機 DB dump / 還原測試「未執行」，皆為 2026-05-08 的舊值。已依實查更新。
> 連帶過期：`projects/2026-011-existing-site-handover-soulful/10_DISCOVERY.md` 的環境基線（WP 6.9.4、plugins 579 MB、35 active）—— 該檔為 **Day 1 當下快照**，刻意不追改；**現行基線以本表 + [`SITE_CODE_MANIFEST.md`](SITE_CODE_MANIFEST.md) 為準**。

## DNS and SSL

| Item | Production | Owner | Verified Date |
|---|---|---|---|
| DNS 權威 | **Cloudflare**（`anirban` / `irma`；14 筆記錄，見 [`DNS_MIGRATION_RECORD_MAP.md`](DNS_MIGRATION_RECORD_MAP.md)） | Agency OS | 2026-08-16 |
| SSL 憑證 | Cloudflare Universal（`ssl=full`）；HTTPS 200 實測通過 | Agency OS | 2026-08-16 |
| CDN / cache | apex + `www` 開 proxy（🟠）；信箱相關記錄一律 dns-only | Agency OS | 2026-08-16 |
| 郵件驗證 | SPF / DKIM(`hostingermail1`) / DMARC **三項 pass**，mail-tester 10/10 | Agency OS | 2026-08-16 |

## Change Control

- **搬站執行手冊**：[`SITE_MIGRATION_RUNBOOK.md`](SITE_MIGRATION_RUNBOOK.md)（步驟 / 切換 / 回滾 SSOT）
- Production change window: 搬站切換需操作者明示 go-ahead（High risk）；一般維護沿用 backup-gated safe update
- Rollback owner: Agency OS（切換回滾 = 改 Cloudflare A 記錄，見 runbook §6）
- Escalation contact: 待補
- Evidence path for preflight/postcheck: `agency-os/reports/e2e/`
