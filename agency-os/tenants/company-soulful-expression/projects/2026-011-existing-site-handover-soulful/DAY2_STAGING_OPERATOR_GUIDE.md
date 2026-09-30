# Day 2 Staging — Operator Step-by-Step Guide
# Soulful Expression Art Therapy

> # ⛔ 本文已作廢，請勿照做（2026-08-16）
>
> Hostinger hosting **2026-11-12 到期且已決定不續約**。在一台即將退場的主機上建 staging 是白工，而且會多一份要一起搬的東西。
>
> - 這份文件當初要解決的問題是「沒有安全的地方驗還原」 —— **已用別的方式解決**：2026-08-16 在 EU 開拋棄式容器完成還原演練並 PASS（見 [`core/BACKUP_RESTORE_PROOF.md`](../../core/BACKUP_RESTORE_PROOF.md) Drill #1）
> - 現在要做的事是**搬站**，不是建 staging → 請改讀 [`core/SITE_MIGRATION_RUNBOOK.md`](../../core/SITE_MIGRATION_RUNBOOK.md)
> - 環境現況 SSOT：[`core/ENVIRONMENT_REGISTRY.md`](../../core/ENVIRONMENT_REGISTRY.md)（staging `lifecycle=abandoned`）
>
> 保留本文僅為歷史紀錄。若日後在**新主機**上要建 staging，步驟會完全不同（不再是 Hostinger 面板操作）。

> ~~**目標**：建立 `https://staging.soulfulexpression.org/`，內容從 production 複製，後台可登入，關鍵頁可開。~~ ⛔ 已取消。
> **估時**：約 20–40 分鐘（視 All-in-One WP Migration 匯出速度而定）。
> **前提**：已有 Hostinger 帳號登入權限。

---

## Step 1 — Hostinger hPanel：建立子網域

1. 瀏覽器開 **https://hpanel.hostinger.com** → 登入。
2. 點左側「**Websites**」→ 選 `soulfulexpression.org`。
3. 在 Overview 頁找「**Subdomains**」（或左側 Domain 下的 Subdomains）。
4. 點「**Create a subdomain**」。
5. 填入：
   - Subdomain name：`staging`
   - Domain：`soulfulexpression.org`
   - Document root：保持預設（Hostinger 自動建立 `public_html/staging`，但通常 subdomain 會有獨立根目錄）
6. 按「**Create**」。
7. 等 DNS 傳播（通常 1–5 分鐘；Hostinger 內部 DNS 很快）。

> ~~**驗證**：`nslookup staging.soulfulexpression.org` 應回傳 IP。~~ ⛔ 已取消。

---

## Step 2 — 建立 WordPress 安裝於 staging 子網域

> Hostinger 不支援「一鍵複製網站」到子網域。最穩定的方法是安裝一個新 WP，再用 migration plugin 搬。

1. hPanel → **Websites** → `soulfulexpression.org` → **Auto Installer**（或 WordPress）。
2. 選「**Install WordPress**」（或「Add WordPress website」）。
3. ~~選擇安裝位置：選 `staging.soulfulexpression.org`（若下拉沒有，輸入完整 URL）。~~ ⛔ 已取消。
4. 設定：
   - Site name：`Staging - Soulful Expression`
   - Admin user：建一個獨立帳號（例如 `staging-admin`）或使用現有帳號
   - Admin password：隨機強密碼（記錄在 `core/ACCESS_REGISTER.md`）
   - Admin email：可用自己的 email（測試環境不會寄信給客戶）
5. 按「**Install**」→ 等待完成（約 1–2 分鐘）。

---

## Step 3 — Production 安裝 All-in-One WP Migration

> 在 **production 後台** 操作。

1. 瀏覽器開 `https://soulfulexpression.org/wp-admin` → 登入。
2. 左側 → **外掛** → **安裝外掛** → 搜尋「All-in-One WP Migration」。
3. 安裝 + 啟用（免費版即可，支援匯出）。
4. 左側 → **All-in-One WP Migration** → **Export**。
5. 選「**Export To** → **File**」。
6. 等待打包完成（Production 約 600 MB，預計 5–15 分鐘）。
7. 下載 `.wpress` 檔到本機。

> **提示**：若匯出失敗（PHP timeout），可嘗試在「Advanced options」勾選「Do not export spam comments」等排除選項減少體積。

---

## Step 4 — Staging 安裝 All-in-One WP Migration + 匯入

1. ~~瀏覽器開 `https://staging.soulfulexpression.org/wp-admin` → 用 Step 2 設定的帳號登入。~~ ⛔ 已取消。
2. 左側 → **外掛** → **安裝外掛** → 搜尋「All-in-One WP Migration」。
3. 安裝 + 啟用。
4. 左側 → **All-in-One WP Migration** → **Import**。
5. 拖曳或選擇 Step 3 下載的 `.wpress` 檔案上傳。
6. 上傳完成後，按「**Proceed**」覆蓋現有 staging 安裝。
7. 匯入完成後，按「**Permalinks → Save Changes**」（重要：清快取 + 重建 URL）。

---

## Step 5 — Staging 關鍵設定（防止污染 Production）

> **必做**，避免 staging 發出正式電郵/統計污染。

1. **WP Admin → Settings → General**
   - ~~Site URL：確認是 `https://staging.soulfulexpression.org`（匯入後應自動更新）~~ ⛔ 已取消。
   - Email：改成你自己的 email（不用客戶信箱）

2. **關閉 LiteSpeed Cache 快取**：外掛 → LiteSpeed Cache → 停用（或 Settings → Turn Off Cache）。

3. **停用 FluentSMTP**（防止 staging 寄真信）：外掛清單 → FluentSMTP → Deactivate。

4. **停用 Google Site Kit**（防止 GA4/Search Console 統計污染）：外掛清單 → Google Site Kit → Deactivate。

5. **停用 FluentCRM 自動化**：FluentCRM → Automations → 全部暫停（防 CRM cron 觸發真實電郵）。

6. **（推薦）加 HTTP Basic Auth 保護**：
   - hPanel → Staging subdomain → Password Protection（或 `.htaccess` 加密碼）
   - 這樣外部使用者/Google 就看不到 staging 內容

---

## Step 6 — SSL 驗證

1. Hostinger 通常會自動發 Let's Encrypt SSL 給新子網域（等 5–10 分鐘）。
2. ~~瀏覽器開 `https://staging.soulfulexpression.org` → 確認出現鎖頭（無警告）。~~ ⛔ 已取消。
3. ~~若 SSL 未自動：hPanel → SSL → Let's Encrypt → 選 `staging.soulfulexpression.org` → 安裝。~~ ⛔ 已取消。

---

## Step 7 — 驗收清單

完成後，逐一確認以下項目：

| 驗收項目 | 預期結果 | 結果 |
|---|---|---|
| ~~`https://staging.soulfulexpression.org`~~ | ~~首頁可開，樣式正確~~ | ☐ **作廢** |
| staging 後台登入 | `/wp-admin` 可登入（原 production admin 帳密） | ☐ PASS / FAIL |
| 關鍵內頁可開 | 藝術療法、預約頁、聯絡頁 | ☐ PASS / FAIL |
| 電郵不會送出 | FluentSMTP 停用（測試表單不發真信） | ☐ PASS / FAIL |
| Google Analytics 不污染 | Site Kit 停用 | ☐ PASS / FAIL |
| SSL 有效 | 鎖頭，無憑證警告 | ☐ PASS / FAIL |

---

## Step 8 — 完成後回填文件

驗收通過後，更新以下文件：

1. **`core/ENVIRONMENT_REGISTRY.md`**：
   - staging 列：`lifecycle` 改 `live`
   - WP/PHP 版本回填（從 staging 後台 Dashboard 看）
   - Backup Location, Last Backup 填入

2. **`core/BACKUP_RESTORE_PROOF.md`**：
   - **先**在檔頭 frontmatter 的 `restore_drills` 加一筆（`- date:` / `result: PASS`）—— Phase 4 巡檢只讀這裡
   - **再**在 Restore Drill Record 填敘述（匯入 = restore drill 通過 ✅），保留 `| Drill date | YYYY-MM-DD |` 那一列供對帳

3. **`sites/soulfulexpression-org/SITE_PROFILE.md`**：
   - Staging URL lifecycle 更新

4. **WORKLOG.md**：
   - 加一行 `- AUTO_TASK_DONE: Soulful Day 2 staging 實機驗收完成`

---

## 快速問題排解

| 問題 | 解法 |
|---|---|
| 匯入後所有頁面 404 | WP Admin → Settings → Permalinks → 按「Save Changes」 |
| 匯入後圖片不顯示 | Media Library 頁重整；上傳路徑可能需調整 |
| 後台 URL 仍是 production | phpMyAdmin → `wp_options` → `siteurl`/`home` 改成 staging URL |
| SSL 不生效 | 等 10 分鐘；或 hPanel → SSL → 強制重裝 |
| 匯出 .wpress 太大 | 用「Find/Replace」外掛後，在 Export 勾除 Uploads，先搬 DB |

---

> **Owner**: `projects/2026-011-existing-site-handover-soulful/DAY2_STAGING_OPERATOR_GUIDE.md`
> **對齊**: `PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md` §2 ← 本文補充細節
> **完成後**: 更新 `ENVIRONMENT_REGISTRY.md` lifecycle + `BACKUP_RESTORE_PROOF.md` drill record
