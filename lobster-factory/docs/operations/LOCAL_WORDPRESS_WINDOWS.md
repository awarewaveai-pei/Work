# Windows：本機 WordPress + WP-CLI（給 staging 第 4 步真實執行）

> **用途**：`install-from-manifest.sh` 在 **DRY_RUN=0** 時會呼叫真實 `wp`。本檔說明如何在 Windows 上備妥 **PHP + wp + MySQL + WordPress 根目錄**，以便對 `regression:staging-pipeline` / `execute-apply-manifest-staging` 傳入真實 `--wpRootPath`。

## 0）你目前若只有「DRY 預覽」

不需資料庫；已支援 **DRY_RUN=1** 且無 `wp`（只列印將執行的指令）。要 **真的安裝 theme/plugin**，從下文 1）開始。

## 1）安裝 PHP（winget）

在提升權限或使用者範圍終端機（依你環境）：

```powershell
winget install --id PHP.PHP.NTS.8.4 -e --accept-package-agreements
```

安裝後**重開** PowerShell，確認：

```powershell
php -v
```

若仍找不到 `php`，將 PHP 安裝目錄加入使用者 **PATH**（winget 通常會加；若沒有，到「系統環境變數」新增 `php.exe` 所在資料夾）。

## 2）安裝 WP-CLI（repo 腳本）

在 **monorepo 根**：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-wp-cli-windows.ps1
```

依腳本輸出把 `%LOCALAPPDATA%\Programs\wp-cli` 加入使用者 PATH，重開終端後：

```powershell
wp --info
```

## 3）MySQL / MariaDB

`wc-core` manifest 的 `wp theme install` / `wp plugin install` 需要 **可連線的資料庫** 與已設好的 `wp-config.php`。

**選項 A — 已有本機 MySQL**：自行建立資料庫與帳密，記下 `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST`。

**選項 A′ — winget MariaDB.Server（本 repo 一鍵腳本）**

若已用 `winget install MariaDB.Server` 安裝，但 **沒有** Windows 服務（`Get-Service` 看不到 Maria/MySQL），可用 monorepo 根目錄腳本一次完成：**背景啟動 `mysqld`（正確帶入含空白的 `--defaults-file`）→ 建庫 → 下載/安裝 WordPress**：

```powershell
cd C:\Users\USER\Work
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni
```

- 預設資料庫：`wordpress_dev`；預設站台目錄：`<repo>\.scratch\wordpress-pilot`（勿提交到 Git）。
- 首次若 WP-CLI 報 **No working transports**，代表 PHP 未載入 `openssl`/`curl`；`-EnsurePhpIni` 會在 `php.exe` 旁建立/調整 `php.ini`（含 `extension_dir`、`memory_limit=512M`）。
- 若 `wp core install` 缺 **mysqli**，同樣靠 `-EnsurePhpIni` 啟用 `extension=mysqli`。
- `mysqld` 標準輸出/錯誤會寫到 `<repo>\.scratch\mariadb-logs\`（除錯用）。關機後若要再開 DB，再執行一次腳本即可（會偵測已連線則不重啟）。

**選項 B — XAMPP（範例）**：

```powershell
winget install --id ApacheFriends.Xampp.8.2 -e --accept-package-agreements
```

啟動 XAMPP 控制台的 **MySQL**，用 phpMyAdmin 建一個空資料庫（例如 `wordpress_dev`）。

## 4）建立 WordPress 站台目錄

自選一個**空資料夾**作為 `WP_ROOT`（勿用 repo 內已被追蹤的路徑當唯一真相；可沿用腳本預設 `<repo>\.scratch\wordpress-pilot`，或例如 `C:\Users\<you>\WordpressDev\pilot-main`）。

```powershell
$WP_ROOT = "C:\Users\<you>\WordpressDev\pilot-main"
New-Item -ItemType Directory -Path $WP_ROOT -Force | Out-Null
cd $WP_ROOT
wp core download
wp config create --dbname=wordpress_dev --dbuser=root --dbpass= --dbhost=127.0.0.1
wp core install --url=http://localhost --title=Pilot --admin_user=admin --admin_password=change-me --admin_email=dev@local.test
```

（`--dbpass` / 帳密請改成你的 MySQL 設定；本機開發用弱密請勿對外暴露。）

確認：

```powershell
wp option get siteurl --path=$WP_ROOT
```

## 5）跑龍蝦 staging 第 4 步（真 wp）

在 **lobster-factory** 目錄：

```powershell
cd C:\Users\USER\Work\lobster-factory
npm run regression:staging-pipeline -- --wpRootPath="C:\Users\<you>\WordpressDev\pilot-main"
```

若要**真的改檔**（非 preview），對 executor 使用 `--execute=1`（**僅限 staging WP、已備份**）：

```powershell
node scripts/execute-apply-manifest-staging.mjs `
  --organizationId=11111111-1111-1111-1111-111111111111 `
  --workspaceId=22222222-2222-2222-2222-222222222222 `
  --projectId=33333333-3333-3333-3333-333333333333 `
  --siteId=44444444-4444-4444-4444-444444444444 `
  --environmentId=55555555-5555-5555-5555-555555555555 `
  --wpRootPath="C:\Users\<you>\WordpressDev\pilot-main" `
  --execute=1
```

## 6）產 drill 報告（含 4/4）

```powershell
cd C:\Users\USER\Work\lobster-factory
node scripts/emit-staging-drill-report.mjs --wpRootPath="C:\Users\<you>\WordpressDev\pilot-main" --notes="real wp-cli path"
```

## Related

- `templates/woocommerce/scripts/install-from-manifest.sh`
- `scripts/execute-apply-manifest-staging.mjs`
- `docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`

_Last synced: 2026-04-01_
