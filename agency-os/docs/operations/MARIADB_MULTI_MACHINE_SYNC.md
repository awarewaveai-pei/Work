# MariaDB 多機同步（Windows 本機 WordPress）

> 目的：讓你在公司桌機、私人筆電、未來新電腦之間，穩定維持「可跑本機 WordPress/WP-CLI」的能力。  
> 範圍：本文件只處理 **WordPress 本機執行層（MySQL 相容）**；**不取代 Supabase（Postgres SoR）**。

## 1) 先講結論：你要同步的是「流程」，不是 DB 程式檔

- **要同步到 Git 的**：腳本、文件、版本、檢查流程（例如 `bootstrap-local-wordpress-windows.ps1`、runbook）。
- **不要直接同步的**：`C:\Program Files\MariaDB ...` 安裝目錄、`data` 目錄原始檔、`ibdata*`/`ib_logfile*` 等執行中資料檔。
- **資料要跨機帶走**：用 SQL dump（`mysqldump`）或重新建空站；不要複製執行中 data folder。

## 2) 角色分工（避免混淆）

- **Supabase（Postgres）**：平台 SoR（工作流狀態、審批、營運資料等）。
- **MariaDB（本機）**：WordPress 核心與 WP-CLI 執行需要的 MySQL 相容層。
- **MCP 工具清單**：只管 IDE 工具連線，不包含 MariaDB 本機服務本身。

## 3) 多機標準做法（推薦）

每台 Windows 機器都跑同一套「可重建」流程：

1. 在 monorepo 根安裝依賴（如未安裝）：
   - `winget install --id MariaDB.Server -e --accept-package-agreements`
   - `winget install --id PHP.PHP.NTS.8.4 -e --accept-package-agreements`
2. 設定 WP-CLI：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\setup-wp-cli-windows.ps1`
3. 一鍵建本機 WP 能力（含 DB）：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`
4. 驗證：
   - `wp option get siteurl --path="C:\Users\<you>\Work\.scratch\wordpress-pilot"`
   - `npm run regression:staging-pipeline -- --wpRootPath="C:\Users\<you>\Work\.scratch\wordpress-pilot"`

> 重點：把「每台都能重建」當標準，不依賴某一台電腦的不可攜狀態。

## 4) 何時需要資料同步（而不只是環境重建）

如果你要在另一台電腦延續同一個本機 WP 內容（文章/設定/外掛狀態）：

- **匯出（來源機）**
  - `mysqldump -u root wordpress_dev > wp-wordpress_dev.sql`
- **匯入（目標機）**
  - 先跑 bootstrap 產生空 DB/站台，再：
  - `mysql -u root wordpress_dev < wp-wordpress_dev.sql`
- **注意**
  - SQL dump 檔案可能含敏感內容（帳號、email、站點設定），不要直接進 Git。
  - 建議放在本機受控路徑，必要時加密後再傳輸。

## 5) 建議的機器分層策略

- **桌機（主力）**：保留較完整的本機 WP 測試資料。
- **筆電（移動）**：以可快速重建為主，預設用乾淨/最小資料集。
- **新機（短期）**：先完成 §1.5 + §1.5.1 對齊，再決定要不要匯入歷史 DB。

## 6) 常見錯誤與對應

- **問題：有 Supabase，為何還要 MariaDB？**  
  因為 WordPress 本身需要 MySQL 相容庫；Supabase 不直接取代 WP DB。

- **問題：能不能把 MariaDB data 目錄直接複製到另一台？**  
  不建議。版本、檔案鎖、服務狀態容易造成毀損；請用 dump/import。

- **問題：每次換機都要重裝很慢？**  
  把流程腳本化（本 repo 已有），首次較慢；之後只需補差異與驗證。

## 7) 與 AO-RESUME / 雙機對齊的關係

- 在 `TASKS.md` 的「雙機環境對齊」未勾選前，`AO-RESUME` 必須提醒：
  - `REMOTE_WORKSTATION_STARTUP.md` §1.5（整體）
  - `REMOTE_WORKSTATION_STARTUP.md` §1.5.1（MariaDB/PHP/WP）
  - `machine-environment-audit.ps1 -FetchOrigin` 至 PASS（無 WARN）

## Related

- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `../operations/cursor-mcp-and-plugin-inventory.md`
- `../../lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md`
- `../../scripts/bootstrap-local-wordpress-windows.ps1`

_Last synced: 2026-04-01_
