# Global Task Board



<details>
<summary><strong>待辦原則（給營運者）— 細節較長，可稍後再讀</strong></summary>

> **待辦原則（給營運者）**  
> - **單一清單**：所有「之後還要做」的事，應以 **`### 未完成`**（或 **`Backlog — 未完成`**）的一條 `- [ ]` 表示；不要只放在聊天或腦裡。**勿**在「未完成」區混放 `- [x]`（已完成請移到 **`Next — 已完成歷程`**）。  
> - **當天做不完／臨時改做別的**：在當日 **`WORKLOG.md`** 寫一句（做了什麼、停在哪、為何轉向）；若承諾仍有效，**留在下面未完成清單**；若作廢，把該條刪除或改成「已取消／改路由至…」。  
> - **`Next — 已完成歷程`**：僅供查說：曾經排過、已完成者；**新工作請不要加在這裡**。  
> - **收工與打勾（預設全自動）**：**不必手動**改 `TASKS`。**只打 `AO-CLOSE`（或收工同義詞）即觸發代理**依當輪對話與 **`TASKS` 開放項**在當日 **`WORKLOG.md`**（`## yyyy-MM-dd`）寫 **`- AUTO_TASK_DONE: <唯一子字串>`**（須只命中一條仍為 `- [ ]` 的待辦；已 `[x]` 時略過並收斂標記），**不必再口頭重複指令**。收工腳本會跑 **`scripts/apply-closeout-task-checkmarks.ps1`** 打勾並改為 **`AUTO_TASK_DONE_APPLIED (UTC): …`**。選填： **`pending-task-completions.txt`**（見 **`pending-task-completions.example.txt`**）。`AO-CLOSE` 開頭會印 **`print-today-closeout-recap.ps1`** 摘要。

</details>

## 現況快照（怎麼看懂：做過／沒做／做到哪）

| 你想查… | 請看 |
|--------|------|
| **還有什麼沒做完** | **`### 未完成`**（僅 `- [ ]`，一條一個開放責任）。 |
| **某件事結案了沒** | 編輯器 **搜尋標題關鍵字**。出現在 **`## Next — 已完成歷程`** 且為 `- [x]` → **已結案**；只出現在 **`### 未完成`** → **仍開放**。 |
| **進行到一半嗎** | 看該條是否含 **`—— 進度：`**；子項裡的日期／DoD 是細節證據。 |

**狀態 prefix（選用，方便掃描）**：**【未開始】**＝尚未動或尚未達第一個可驗證里程碑；**【進行中】**＝已有部分交付／PR／部署，但未達該條 DoD；**【卡住】**＝依賴外部決策或環境，見子項說明。

**機讀待辦快照**：開工時 **`scripts/ao-resume.ps1`** 會寫 **`agency-os/.agency-state/open-tasks-snapshot.md`**（gitignore），與本檔 **`### 未完成`** 應對齊。

**聊天 ≠ 入庫**：其他 AI（含 Claude）對話裡答應的待辦**不會**自動進 `TASKS`、也不會自動進任何 checklist 檔；若你看不到條目，代表**尚未寫入本 repo 並 commit**（或寫在別台機器未 push）。要生效：**請同一輪請代理／自己改 `TASKS.md`（或對應 Owner 檔）+ checkpoint／push**。

| **長期可稽核紀律（含「MD 為何可信」）** | **`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`** **§4**（真相順序、禁雙寫、演進範圍） |

## 歷史封存 — In Progress（早期項目，均已結案）

> 以下 **`- [x]`** 為存檔；**不要**用這段判斷「現在還要做什麼」——請看 **`### 未完成`**。

- [x] 建立多租戶案場資料夾結構（company -> site -> project）
- [x] 設計標準報價包（建置/維運/行銷/客製）
- [x] 定義變更單（CR）流程與核價規則
- [x] 套入第一個真實客戶到 `tenants/company-a/`
- [x] 完成 `2026-001` Discovery 需求盤點（初版）
- [x] 補齊 `2026-001` 時程與里程碑日期（初版）
- [x] 建立 `lobster-factory` Phase 1 底座骨架（Supabase migrations + wc-core manifest + workflow 安全骨架）

## Next — 未完成（目前正式隊列）

> **版面規約（減少漏勾／誤判）**  
> - **本節只保留 `- [ ]`。**已結案請移到 **`## Next — 已完成歷程（查詢用）`**，不要留在這裡。  
> - **代理**：完成某一條 DoD 時，當日 **`WORKLOG`** 必須有 **`- AUTO_TASK_DONE: <子字串>`**（命中該條待辦）；`AO-CLOSE` 會跑 **`apply-closeout-task-checkmarks`**。  
> - **縮排**：子項一律 **兩個空白**，勿使用單獨一字的 ` - [ ]`（易與清單錯位）。

### 未完成

#### 雙機環境 / 日常開工

- [x] **（AO-RESUME 提醒）開工後閱讀 Telegram 內容** —— **【未完成】** 每次開工（含送出 `AO-RESUME` 後）先開 Telegram：營運／告警／`@awarewave_ops_bot` 等相關對話，處理未讀與待回覆。**DoD：**(1) 未讀已消化（回覆、存檔或標記稍後）；(2) 需追蹤事項已寫入當日 `WORKLOG.md` 或對應 tenant／`TASKS`；(3) 若有指令錯誤或告警，已對照 `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md`／`TELEGRAM_OPERATOR_CHEATSHEET.md` 排查或記錄阻塞。**敏感：**勿將 token／對話全文貼進 git 或聊天留存檔。
- [x] **（AO-RESUME 提醒）桌機開工後跑 Claude user-level 對齊腳本** —— **【未完成】** 2026-05-07 筆電已建立 `mcp/claude-userlevel/` SSOT + `scripts/sync-claude-userlevel.ps1`，並對齊筆電 `~/.claude/`。**桌機下一步**：`git pull` 後在 monorepo 根執行 `powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode merge`，使 `~/.claude/{hooks,settings.json,mcp.json}` 對齊 SSOT。**驗收**：跑 `-Mode verify` 應 exit 0（PASS）。背景：`mcp/claude-userlevel/README.md`、`CLAUDE.md` § 桌機/換機設定。
- [x] **（桌機必做）確認 Claude Code 完全授權模式（bypassPermissions）** —— **【完成 2026-05-14】** 筆電 `~/.claude/settings.json` 已設 `"defaultMode": "bypassPermissions"` + `"skipDangerousModePermissionPrompt": true`，Claude Code 不詢問任何工具調用。桌機需同步此設定才能達到同等效果。**步驟：** `git pull` 後在 monorepo 根執行 `powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode merge`，再跑 `-Mode verify`。**DoD：** `verify` exit 0 且 `~/.claude/settings.json` 含 `"defaultMode": "bypassPermissions"`。
- [x] **（AO-RESUME 提醒）雙機環境對齊（桌機＋筆電）** —— **【進行中】** **進度：桌機 2026-05-07 `machine-environment-audit -Strict` PASS（no warnings）✓**；筆電尚未執行。任一台未 PASS 則本條不結案。**筆電下一步：**依 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §1.5 + §1.5.1**（WP 棧）逐步執行後，在筆電 monorepo 根跑 `machine-environment-audit.ps1 -FetchOrigin -Strict`；細項 → **`docs/overview/DUAL_MACHINE_ENVIRONMENT_CHECKLIST.md`**。
- [x] **（AO-RESUME 提醒—筆電）確認桌機 2026-05-11 變更不衝突筆電設定** —— **【待筆電開工時查照】** **本輪桌機改動（代理查照）：** (1) `sync-claude-userlevel.ps1 -Mode merge` 更新 `~/.claude/hooks/` 3 個檔（`ao-resume-on-prompt.ps1`、`hooks.json`、`README.md`），覆寫 `settings.json` governed keys，normalize 9 個 array 結構；SSOT `mcp/claude-userlevel/` 本身未改，git 含最新版。(2) SG VPS `app.aware-wave.com` Basic Auth：加入系統 nginx `/etc/nginx/sites-enabled/app` 的 `location /` block（`auth_basic "Aware Wave Admin"` + user_file `/etc/nginx/.htpasswd_studio`）；Docker `nginx/default.conf` 的 `auth_basic` 也已取消注釋（但系統 nginx 才是 443 真正入口）。**筆電開工查照清單：** (a) `git pull` 後執行 `sync-claude-userlevel.ps1 -Mode verify`——若 hooks 顯示 3 個 update（同桌機），跑 `-Mode merge` 對齊，再 verify exit 0；(b) 確認 `settings.json` `additionalDirectories` 含筆電正確 USERPROFILE 路徑（merge 自動展開 `${USERPROFILE}`，通常無問題）；(c) VPS 變更純伺服器端，不影響筆電。**DoD：筆電 `verify` exit 0（PASS）後本條結案。**
- [x] **（筆電必做）AO-SYNC 環境變數設定** —— **【未開始】** 桌機已設好，筆電需要同步設定兩個環境變數才能讓 AO-CLOSE 正確匯出。
  **筆電環境**：repo 在 `D:\Work`，帳號家目錄在 `C:\Users\<帳號>`，project key = `d--Work`。
  在筆電 PowerShell（從 `D:\Work` 執行）：
  > **Cryptomator 架構（2026-05-15 確認）**：
  > - Vault 加密容器位於 `G:\我的雲端硬碟\MySecretVault\MySecretVault\`
  > - Cryptomator 解鎖後虛擬磁碟掛載為 `E:\`（這才是正確的讀寫路徑）
  > - 桌機 env var 已確認：`AO_SYNC_ROOT=E:\AO-SYNC`、`AO_SYNC_SECRETS_ROOT=E:\`
  ```powershell
  [System.Environment]::SetEnvironmentVariable('AO_SYNC_ROOT',         'E:\AO-SYNC', 'User')
  [System.Environment]::SetEnvironmentVariable('AO_SYNC_SECRETS_ROOT', 'E:\',        'User')
  ```
  設完後測試（**只做一次**，之後 AO-CLOSE / AO-RESUME 全自動；須先確認 Cryptomator 已解鎖並掛載至 `E:\`）：
  ```powershell
  & scripts\export-cross-machine-memory.ps1 -WorkRoot (Get-Location).Path
  ```
  應看到 MEMORY.md + user-env.ps1 + SSH keys + AWARE_WAVE_CREDENTIALS.md 全部寫入 `E:\`。
  **DoD：** export 成功 + MEMORY.md 寫到 `E:\AO-SYNC\AO-SYNC-<date>-<MACHINE>\memory\`。
- [x] **（筆電必做）確認 Cryptomator vault 掛載路徑，將 AO-SYNC 秘密檔案移入加密區** —— **【完成 2026-05-15 確認】** **結論（桌機已驗證）：** Cryptomator vault 加密容器位於 `G:\我的雲端硬碟\MySecretVault\MySecretVault\`；解鎖後虛擬磁碟掛載至 `E:\`。`.ssh/`、`user-env.ps1`、`AWARE_WAVE_CREDENTIALS.md`、`AO-SYNC/` 均存放於 `E:\`（加密保護）。**兩台機器正確 env var：** `AO_SYNC_ROOT=E:\AO-SYNC`、`AO_SYNC_SECRETS_ROOT=E:\`。**注意：** `ANTHROPIC_API_KEY` 已從 `user-env.ps1`（本機 + vault 兩份）移除，避免 Claude Code 走 API 計費而非 Max 訂閱。筆電開工前須先解鎖 Cryptomator（`E:\` 才會出現），再執行 AO-RESUME。
- [ ] **（出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤** —— **【未開始】**
  - 📖 **完整步驟讀這個（單一主人）**：[`agency-os/docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md`](docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md) — §0（5 步驗證）+ §5（4 條 Snippets）+ §8（key 上手機 3 方法）
  - 📅 **規劃日期**：2026-05-08
  - 👤 **執行者**：**操作者親自手機操作**，代理無法代執行
  - 🎯 **DoD**:
  - **(1) SSH key 弄到手機 Termius**（3 種方法擇一；推薦 B1 = iCloud Universal Clipboard）：
    - **方法 A（最安全）**：電腦裝 7-Zip（https://www.7-zip.org/）→ 對 `C:\Users\user1115\.ssh\hetzner_trigger` 7-Zip → 加入壓縮檔 → 加密 AES-256 + 設密碼 → 上傳 iCloud Drive / Google Drive → 手機下載 + 解壓 + Termius Keychain → New Key → import
    - **方法 B1（最快，iPhone + Mac 同 Apple ID）**：電腦記事本打開 `hetzner_trigger` → 全選複製 → iPhone Universal Clipboard 取得 → 備忘錄貼上 → Termius Keychain 貼上 → 用後**刪備忘錄**
    - **方法 B2（其它情況）**：Email 自寄 key 純文字 → 手機收信複製 → Termius 貼上 → 收件匣+寄件備份+垃圾桶**全刪**
  - **(2) Termius 加 SG host**：Hostname `5.223.93.113` / Username `root` / Port `22` / Private Key 選 `hetzner_trigger`
  - **(3) 跑 §0 5 步驗證**（**手機關 wifi 切 4G 模擬國外**）：(a) 連線見 `root@wordpress-ubuntu-4gb-sin-1:~#`；(b) `whoami` → `root`；(c) `ls /root/lobster-phase1/scripts/sg-deploy.sh` 存在；(d) `/root/lobster-phase1/scripts/sg-deploy.sh next-admin --dry-run` 印 `DRY RUN complete`；(e) `docker ps --format '{{.Names}} {{.Status}}'` 看到 `lobster-next-admin Up X (healthy)` — **5 步全綠才算 PASS**
  - **(4) Termius 加 4 條 Snippets**：`🔍 status` (`docker ps`) / `📋 deploy next-admin` (`sg-deploy.sh next-admin`) / `📋 dry-run` (加 `--dry-run`) / `📊 drift log` (`tail -50 /var/log/sg-deploy-drift.log`)
  - **(5) 手機加書籤**: cheat sheet（`https://github.com/awarewaveai-pei/Work/blob/main/agency-os/docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md`）+ ops console (`app.aware-wave.com/ops/system-modes` / `/ops/approvals` / `/ops/inbox`)；建議「加到主畫面」+ 離線備份（raw markdown 複製進備忘錄）
  - **(6) 出國前一晚再跑 §0 5 步**確認還能連（不重做設定，只測連線）
  - **失敗時找代理**：說明哪步、什麼錯誤訊息（如 `Permission denied` / connection timeout / sg-deploy.sh 跑出非 dry-run 動作等），代理會幫拆。

#### 客戶試點 — Soulful Expression（既有站接手）

- [ ] **既有站接手（Soulful Expression Art Therapy）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架完整；**Day 2 書面** staging canonical URL 已入 registry／SITE_PROFILE／`02_EXECUTION_PLAN`。**下一步：**Day 1 Runbook §1.1–1.3（操作者登入）+ **`TASKS`**「Day 2 實機驗收」。
  - 本項目標：完成 M1 台帳（staging/prod、備份策略、維護窗、baseline 外掛/版本）
- [ ] **既有站接手 Day 1（Soulful Expression）** —— **【進行中 2026-05-08】§1.2 ✅ §1.3 DB dump ✅**。§1.2 機讀基線完成（commit `b5cef4c`：WP 6.9.4 / PHP 8.2.30 / MariaDB 11.8.6 / Kadence 1.3.6 / 35 active plugins (16 有更新) / 2 admins / 138MB DB / 風險 Top 3）。§1.3 DB dump 完成（`soulful_db_20260508_160734.sql.gz`，15 MB，SHA256 `849db784…`，本機 + `BACKUP_RESTORE_PROOF.md #1`；restore drill 待 staging 建立後執行）。**仍開放（操作者必做）**：§1.1 帳號層級權限確認（Hostinger panel / DNS panel / WP admin browser login，純 SSH 無法驗證 panel-level access）。Day 2 staging 操作指引已備：`DAY2_STAGING_OPERATOR_GUIDE.md`；Day 3 更新計劃已備：`DAY3_SECURITY_PATCH_PLAN.md`。
  - 執行：`docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md` 第 1~2 節
  - 產出：§1.2 ✅ §1.3 DB dump ✅ §1.1 待操作者 §restore drill 待 Day 2

#### 客戶試點 — Scenery Travel Mongolia（新站建置）

- [ ] **新站建置（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架完整；**Day 2 書面**：canonical staging **提案** `https://staging.scenery-travel.mn/` 已寫入 registry／SITE_PROFILE。**下一步：**選定主機商後 Runbook §2 建置實機 + 客戶訪談補 Discovery。
  - 本項目標：完成 M1 啟動（tenant/site/project + 雲端 staging 可用 + Discovery 國際需求補齊）
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架 + Discovery 骨架完成。**下一步：**與客戶確認素材與頂級網域，選定主機商 → 銜接 **`TASKS`**「Day 2 雲端 staging 實機驗收」。
  - 執行：`docs/operations/PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md` 第 1~2 節
  - 產出：新站 staging 啟動條件

#### Next-Gen 對齊（兩案共用）

- [ ] **Next-Gen 試點 — Day 2 雲端 staging 實機驗收（兩案）** —— **【未完成】** **DoD：**Soulful：`https://staging.soulfulexpression.org/` 後台可登入 + 關鍵頁可開（Pilot A §2）；Scenery：`https://staging.scenery-travel.mn/`（若網域變更須先更新 registry）同等驗收。**阻塞：**須 Hostinger／選定主機商操作與 DNS／SSL；代理無法代登入第三方面板。
  - 證據鏈：`core/ENVIRONMENT_REGISTRY.md`（**URL／lifecycle SSOT**）、`SITES_INDEX.md`（須與 registry 對齊）、各案 `02_EXECUTION_PLAN.md` Day 2、`SITE_PROFILE.md`；Runbook §2 對齊框：`PRODUCTION_RUNBOOK_PILOT_*`；藍圖 §6：`docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
  - **自動漂移閘道**：`agency-os/scripts/verify-tenant-staging-sites-index-ssot.ps1`（比對 **`SITES_INDEX`**、含 HTTPS 之 **`sites/*/SITE_PROFILE`**、以及 `projects/*/02_EXECUTION_PLAN.md` 的 staging URL；`scripts/system-health-check.ps1` → **`verify-build-gates`**；PR `.github/workflows/tenant-staging-ssot.yml`）。
- [ ] `tenants/templates/` v2 —— **【未開始】** **進度：**依試點回填後再開；見 Pilot 條目。
  - 本項目標：試點 tenant 實填回饋後，再擴欄位與自動檢查（若有）
- [x] （Next-Gen 對齊）M3 控制台輸出映射到「20 部門」責任矩陣與模板欄位 —— **【完成 2026-05-13】**
  - 目的：避免 Pilot 成果與跨國企業目標脫鉤
  - **交付**：`department-summary` API + `DepartmentCoveragePanel` UI + `ClientCard` badge + `generate-customer-delivery-status.ps1` + `DEPARTMENT_COVERAGE_MATRIX.md` 四份更新

#### 龍蝦工廠（lobster-factory）

- [ ] `lobster-factory` A10-2 商業閉環實跑 —— **【未開始】**
  - 流程：新客戶建立 -> 驗收 -> production 觸發證據鏈
- [ ] `lobster-factory` A7 全站自動建站補齊 —— **【未開始】**
  - 範圍：hosting adapter + provision/shell guardrails 端到端

#### 工具層 / 基礎建設 / 治理

- [x] Enterprise 工具層 Phase 1 正式串接 —— **【完成 2026-05-13】** 五層工具全數結案＋端到端串接路徑驗收，見 `WORKLOG.md §2026-05-13「Enterprise 工具層 Phase 1 — 端到端串接結案驗收」`。
  - [x] Secrets 治理（env/mcp vault + n8n key 輪替）— 2026-05-01
  - [x] Sentry 錯誤觀測（next-admin／node-api／php）— 2026-04-12
  - [x] PostHog 事件基線（三站命名 + live 驗證）— 2026-05-01
  - [x] Cloudflare DNS／WAF／rate-limit 邊界保護 — 2026-05-01
  - [x] Slack 告警通道（Netdata `#infra-alerts` + n8n Sentry handler）— 2026-05-01
  - [x] 端到端串接驗收：Telegram → Cloudflare → JWT/RLS ops console → Supabase → Slack，Command Plane Phase 2c smoke 15/15 PASS（2026-05-08）；`WORKLOG.md §2026-05-13`
- [x] （工具建置）Phase 1 建議順序（P1 -> P7） —— **【完成 2026-05-13】** Next.js 控制台 v1（P6，2026-05-07）＋ Enterprise 串接證據鏈（P1–P5，2026-05-13）＋ Command Plane（P7，2026-05-08）三條件全達。追溯總表已同步：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`（P1–P7 全 🟢）。
- [ ] 三檔長期治理巡檢（Inventory / Routing Spec / Routing Matrix / Traceability） —— **【進行中】** **進度：**文件曾對齊；需 **每月 drift** 記錄與證據才算結案。
  - 範圍：`cursor-mcp-and-plugin-inventory.md`、`MCP_TOOL_ROUTING_SPEC.md`、`ROUTING_MATRIX.md`、`TOOLS_DELIVERY_TRACEABILITY.md`
  - DoD：術語與欄位一致（`task_type`/`risk_level`/`environment`/`approval_required`），並完成每月 drift 檢查記錄

#### 下一期計畫（未開始）

- [x] **（下次 AO-RESUME 提醒）AwareWave 自動告警維修系統 v3.2 — 計畫書執行** —— **【進行中】** **2026-05-13 Codex implementation baseline 已完成**：`repair_runs` migration、`/ops/repairs` Queue/Runs/Safety/Policy UI、`/api/ops/repairs/*`、`/api/ops/repairs/health`、Slack interactive callback、Slack `approve_repair` 按鈕、GitHub auto-repair workflows、pre-repair backup gate（webhook 或 SG/EU SSH fallback）、CLAUDE auto-repair 紅線；`npm run build` PASS。**2026-05-13 上線基礎已補**：EU DB `repair_runs` migration 已以 `supabase_admin` 套用並 reload schema；SG `next-admin` 已部署 commit `41a773a`；production `/api/ops/repairs/health` 已回報 `table_ok=true`、`backup_configured=true`、`backup_mode=ssh`、`source_policies` 含 Sentry/Kuma/Grafana/PostHog/Netdata/manual。**2026-05-13 Web-control / Phase 3 安全驗收已補強**：`AUTO_REPAIR_GITHUB_TOKEN` 與 GitHub Secrets (`ANTHROPIC_API_KEY`、`SLACK_WEBHOOK_URL`) 已設定；SG deployed commit `87cfa76`；`/ops/repairs` 為操作者控制台，Repair API 由 nginx Basic Auth 邊界保護後注入可信 ops role；`/ops/inbox` 保持 incident SSOT，不合併成第二套維修 UI；production smoke `repair-center` 15 checks / 0 failed / 1 expected warning；backup-fail drill PASS（不建 GitHub Issue）；safe rollback snapshot/restore drill PASS；synthetic Sentry → backup → GitHub Issue → Claude Action analysis-only handoff PASS。**Slack secret gate 已完成**：`SLACK_SIGNING_SECRET` 已寫入 credentials / SG `.env` / GitHub Secret，`SLACK_BOT_TOKEN` 已在 SG + GitHub；production smoke 15 checks / 0 failed / 0 warning。**2026-05-13 最終實機驗收已完成**：signed Slack `approve_repair` production callback → Repair Run `f82411fe-d802-4b90-aef1-5d0c1fc46786` → backup PASS → GitHub Issue #2；Codex 接手完成 code-scoped PR #3 → Release Gate PASS → merge commit `460aa7d` → `sg-deploy.sh next-admin` → production smoke `repair-center` 17 checks / 0 failed / 0 warning，Repair Run 已標記 `resolved` / deploy `passed`。**2026-05-13 Claude auto-repair workflow 已解除 GitHub 端阻塞**：改傳 `${{ github.token }}`、允許 `Edit`、提高 turns、Actions repo permission 改為 `write` + `can_approve_pull_request_reviews=true`，Issue #5 已證明 Claude 可成功執行並推 `claude/...` branch；Claude-generated PR #8 已合併，production smoke 18 checks / 0 failed / 0 warning。**目前唯一外部缺口**：有效 `ANTHROPIC_API_KEY` 需補額（valid key 回 `Credit balance is too low`；另一支本機 key invalid，已還原）。**計畫書 owner doc**：`docs/awarewave-auto-repair-plan-v3.2-final.md`（v3.2 Final 2026-05-08，33 KB）。**目標**：多來源 ops signals（Sentry／Uptime Kuma／Netdata／Grafana／PostHog／CI／health／Cloudflare／Supabase／n8n／Trigger.dev／deploy drift／WordPress/MainWP）→ Ops Inbox → Repair Center → Slack 核准 → PR → Merge → `/sg-deploy`。**分類原則**：Sentry→auto-repair；Uptime/Grafana/PostHog→analysis-only；Netdata/資安/控制面→human-only；CI/流程類→先 triage。**4 層保護**：CI 綠勾／中文摘要／部署後 health-check 自動 rollback／Sentry 持續監控。
  - **2026-05-12 基線更新**：owner docs 已收斂為 `docs/awarewave-auto-repair-plan-v3.2-final.md` + `docs/awarewave-auto-repair-phase2-handoff.md` + `docs/awarewave-repair-center-app-architecture.md` + `docs/BRIEF_AWAREWAVE_REPAIR_CENTER_AI.md` + `agency-os/docs/operations/slack-notification-routing.md`。**路由基線**：`#infra-alerts` = raw infra、`#ops-incidents` = curated incident、`#github-prs` = PR 通知、Telegram = 手機備援；舊 `#alerts-critical` / `#alerts-info` 已作廢。
  - **下次 AO-RESUME 必提醒（最新停點 2026-05-13）**：系統 Web 控制、安全 drills、Slack secret gate、真實 `approve_repair`、code-scoped PR/merge/deploy 均已跑通；production smoke 18 checks / 0 failed / 0 warning。剩餘缺口：(1) Anthropic API 帳戶補額後，重跑 Issue #5 或新 issue 驗證全自動 Claude branch → PR step；(2) 啟動 Phase 4 每週 5 分鐘巡檢；(3) 只有使用者明確授權時，才做壞 commit auto-rollback destructive drill；否則維持目前 safe snapshot/restore rollback PASS 證據。
  - **Phase 1（你做，30 分鐘）**：確認既有 `#infra-alerts` / `#ops-incidents`，只新增 `#github-prs`；建 Slack App（Webhook 指向 `#ops-incidents`）；GitHub repo 設 4 個 Secrets（`ANTHROPIC_API_KEY`／`SLACK_WEBHOOK_URL`／`SLACK_BOT_TOKEN`／`SLACK_SIGNING_SECRET`）；**不要**把 Telegram token 放進 GitHub Secrets；驗證 `/api/ops/inbox/health` 顯示 `telegram_notify_enabled=true`；啟用 main branch protection。
  - **Phase 2（Claude Code 做，2-3 小時）**：擴充 `app/api/webhooks/sentry/route.ts`（fingerprint dedup + Slack Block Kit）；新增 `webhooks/uptime-kuma`／`webhooks/netdata` route；新增 `app/api/internal/commands/slack/route.ts`（Approve → 備份 → GitHub Issue）；新增 `.github/workflows/auto-repair-claude.yml` + `auto-repair-pr-notify.yml`；補強 `sg-deploy.sh` health-check + Slack 通知；CLAUDE.md 追加自動維修紅線；**新增 app 路由骨架**：`app.aware-wave.com/ops/repairs` 作為 Repair Center orchestration layer，不可另建第二套 inbox / approval / deploy UI。
  - **Phase 3（驗收 1 小時）**：22 步端到端（Sentry test error → Slack → Approve → 備份 → Issue → Claude PR → CI → Merge → `/sg-deploy` → health-check → Slack 完成）+ Phase 3-B（rollback drill）+ Phase 3-C（備份失敗阻擋驗收）。
  - **Phase 4（觀察期 30 天）**：每週日 5 分鐘巡檢（重複修同一 bug？`needs-human-review` PR？BACKUP_RESTORE_PROOF 最新一筆超過 7 天？）；每月初 10 分鐘指標複盤。
  - **Phase 5（多客戶擴展 + Dashboard）**：Phase 4 完成後啟動，計畫書第十五節有完整任務清單。
  - **不衝突宣告**：計畫書 §二明列「不可更動」既有架構（lobster-* 容器、GitHub Actions 4 個 workflow、CLAUDE.md、`system-health-check`、`rollback-phase1.sh`、`backup-eu-stack.sh`、Sentry／Kuma／Netdata、`sg-deploy.sh`、ops console）；不採用 n8n Slack 中間層／自動 deploy on merge。Telegram 保留為手機備援通知 + command plane，與本計畫並行但不擔任主 incident bus。
  - **DoD（總）**：(1) Phase 1+2+3 全綠（22 步端到端 PASS）；(2) `BACKUP_RESTORE_PROOF` 含一筆 auto-repair 觸發的 backup ID；(3) Phase 4 第一週巡檢報告；(4) WORKLOG 留 `AUTO_TASK_DONE` evidence。
  - **下一步建議**：先讀計畫書全文（`Read d:/Work/docs/awarewave-auto-repair-plan-v3.2-final.md`）+ handoff brief（`Read d:/Work/docs/awarewave-auto-repair-phase2-handoff.md`）+ AI 實作閱讀簡報（`Read d:/Work/docs/BRIEF_AWAREWAVE_REPAIR_CENTER_AI.md`），再開始 Phase 1；交代理時三份一起附上。

- [ ] **（2026-05-14 提醒）檢討自動修復系統觸發分類：為什麼只有 Sentry 是全自動，其他來源都要人工核准？** —— **【未開始】** 目前分類原則：Sentry→auto-repair；Uptime Kuma/Grafana/PostHog→analysis-only；Netdata/資安/控制面→human-only；CI/流程類→先 triage。**待釐清問題：**(1) 每個來源的 auto-repair 門檻是什麼（信號可信度？影響範圍？可逆性？）；(2) 哪些來源已具備足夠信號品質可升級為全自動（例如 Uptime Kuma down + 已知 pattern）；(3) 哪些應永遠維持人工核准（資安、DB migration、金流）；(4) 現行 Slack `approve_repair` 流程是否太重——能否有「輕量核准」（一鍵）vs「完整核准」（需備份 + review）兩種模式？**DoD：** 輸出一份更新的分類決策表，更新至計畫書 `docs/awarewave-auto-repair-plan-v3.2-final.md` §分類原則，並同步 `source_policies` 設定。

## Next — 已完成歷程（查詢用）

### 2026-05-13 — Enterprise 工具層 Phase 1 正式串接 + Phase 1 P1→P7 建置順序（結案）

- [x] **Enterprise 工具層 Phase 1 正式串接**
  - **證據**：`WORKLOG.md §2026-05-13「Enterprise 工具層 Phase 1 — 端到端串接結案驗收」`
  - **五層**：Secrets（2026-05-01）/ Sentry（2026-04-12）/ PostHog（2026-05-01）/ Cloudflare（2026-05-01）/ Slack（2026-05-01）
  - **端到端路徑**：Command Plane Phase 2c smoke 15/15 PASS（2026-05-08）覆蓋全五層（Telegram→Cloudflare→JWT→Supabase→Slack）
  - **追溯總表**：`TOOLS_DELIVERY_TRACEABILITY.md` P1–P7 全部更新為 🟢
- [x] **（工具建置）Phase 1 建議順序（P1 -> P7）**
  - **P6（Next.js 控制台 v1）**：ops-console-smoke 9/9 PASS（2026-05-07）；`reports/status/ops-console-smoke-LATEST.json`
  - **Enterprise 串接**：見上條，2026-05-13 結案
  - **P7（Command Plane）**：Phase 2c smoke 15/15 PASS（2026-05-08）

### 2026-05-13 — WordPress 外掛堆疊自動安裝 上線（結案）

- [x] **WordPress 外掛堆疊自動安裝（app.aware-wave.com Onboard Wizard）**
  - **證據**：SG WP-CLI 2.11.0 驗證通過（`sg-deploy.sh wordpress` 重建）；Trigger.dev Version **`20260513.2`** 已 deploy（10 tasks live on EU）；E2E dry-run smoke：task 接收 payload → 回傳 `installed: [{slug, version: 'dry_run'}]` → 無 DB write（設計正確）
  - **主要修正**：`trigger.config.ts` 加 `external: ["ssh2", "cpu-features"]`（native addon esbuild 相容）+ `LOBSTER_EXECUTE_MANIFEST_STEPS` / `LOBSTER_WP_SSH_PRIVATE_KEY` 寫入 `syncEnvVars`；`lobster-trigger-deploy.ps1` 修 PS5.1 `??` compat + 加選填 var 注入
  - **Vault 金鑰**：`TRIGGER_DEPLOY_PAT`、`POSTHOG_API_KEY`、`OPS_INBOX_INGEST_TOKEN` 已入庫；`LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `LOBSTER_WP_SSH_PRIVATE_KEY` 留待首個真實客戶上線時設定
  - **待補**：`package_install_runs` DB 寫入驗證——DB 現無真實 client 記錄（FK 約束設計正確），首客上線後即可全鏈驗收

### 2026-05-08/09 — SG drift cron + strategy-review demo + Command Plane Phase 2 + MainWP EU（結案）

- [x] **（2026-05-08 09:00 TPE 之後驗證）SG drift cron 第一次自動 firing** —— **【AUTO_TASK_DONE_APPLIED 2026-05-08T09:xx TPE】** log: `[2026-05-08T01:00:03Z] alert sent: HTTP 200, behind=7`；cron daemon active/enabled；結案條件已達（drift>0 + HTTP 2xx）。
- [x] **（明日提醒）`/strategy-review` skill demo 實測** —— **【完成 2026-05-09】** **明日（2026-05-08）試跑：**用今天 Hermes Agent 的問題（要不要採用、值不值得整合）作為第一個 strategy-review 案例，跑 **Mode 1（four-role-collaboration）**驗證並行 subagent 真的有獨立 context、不會互相污染。**操作：**在 Claude Code 輸入 `/strategy-review 要不要採用 Hermes Agent` 或自然語觸發。**DoD：**(1) 4 個 `general-purpose` subagent 並行返回 4 份結構化 finding／bias_check／must_investigate；(2) 產出 `agency-os/reports/strategy-review/2026-05-08-adopt-hermes-agent.md`；(3) `INDEX.md` 自動補一行；(4) 確認 4 份報告**真的不同**（沒有 context contamination — 例：相同 finding 用相同 framing 出現在 2+ 份 = 失敗，要回頭調 mode 檔案）。**背景：**`.claude/skills/strategy-review/SKILL.md`、`.claude/skills/strategy-review/README.md` §Testing the skill；範本 `templates/decision-record.md`。
- [x] **Command Plane Phase 2** —— **【完成 2026-05-08】** Phase 1 已 production live（`@awarewave_ops_bot` 5 個 low-risk 指令 + 8/8 smoke + 端到端驗收，2026-05-07）。Phase 2 解鎖「手機可執行任務」，是 vs Slack 的真正差異點。**owner doc**：`agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` §13。
  - **2a — Kill switch 從手機控** —— **【已完成 2026-05-08】** ✅ commit `a329335`（feat）+ `e20386e`（smoke 動態 count）。已 deploy 到 SG `lobster-next-admin`（Up healthy），smoke **9/9 PASSED** 含 `emergency_stop_via_telegram - cmd=completed mode=emergency_stop`。Telegram setMyCommands 已含 8 個指令。**驗收路徑**：手機 `/emergency_stop` → `system_modes.mode='emergency_stop'` ✅；後續 `/status` → `blocked_by_killswitch` ✅；SQL editor 改 mode='normal' 後恢復 ✅。`/normal_mode` 從 Telegram 永遠擋 ✅。
  - **2b — Trigger.dev medium-risk dispatch** —— **【已完成 2026-05-08】** ✅ commit `8b8d54e`. Phase 2b ships **lightweight inline pattern**（非完整 Trigger.dev queue）：`/trigger_staging_workflow <task>` 直接 HTTP POST 到 Trigger.dev REST API（allowlist 目前只有 `ao-infrastructure-check`），handler 立即回 run_id；`/replay_dead_letter <uuid>` 為**診斷模式**（lookup `error_events` 回傳細節，full automatic re-execution 排到 Phase 3 — 需要先處理 idempotency rewrite + side-effect rollback hooks）。SG `.env` 加入 `TRIGGER_API_URL` + `TRIGGER_ACCESS_TOKEN`，docker-compose 已 wire。Smoke **11/11 PASSED** 含 `trigger_workflow_allowlist` + `replay_dead_letter_validation`。Telegram setMyCommands 含 10 個指令。手機驗收：傳 `/trigger_staging_workflow ao-infrastructure-check` 應拿到 run_id；傳 `/trigger_staging_workflow no-such-task` 拿到 allowlist 拒絕訊息。
  - **2c — ops console approval / system_modes UI** —— **【已完成 2026-05-08】** ✅ commit `6b7b525`（UI pages）+ `c09a529`（RLS fix）+ smoke 15/15（`approvals_list_endpoint_shape` / `system_modes_get_shape` / `approve_route_wired` all OK）。`/ops/approvals` 列出 pending high/critical command_requests；`/ops/system-modes` 顯示 current mode；兩個 API GET 端點以 service-role client 繞過 RLS，均回 200。手動解鎖路徑驗證：SQL editor `update system_modes set mode='normal'` PASS（Phase 2c.1 system_modes UI 不再是阻塞項）。
- [x] **MainWP EU 計畫啟動核對** —— **【完成 2026-05-09】** Dashboard 已部署於 EU (204.168.175.41)，`mainwp.aware-wave.com`。Docker Compose (WordPress 6.7-apache + MySQL 8.0)、nginx vhost + rate-limit、fail2ban WordPress jail、WP-CLI 安裝、MainWP Dashboard 6.0.12 激活、host crontab WP-Cron、Uptime Kuma Monitor #22。**待操作者**：(1) Cloudflare DNS A record `mainwp.aware-wave.com → 204.168.175.41`；(2) `certbot --expand` 加域名；(3) Dashboard 後台初始化精靈；(4) 接入第一個客戶（§22 Child 流程）。計畫文件：`D:\Work\docs\wordpress_mainwp_plan.md` §25 部署紀錄。

### 2026-05-07 — Next.js 控制台 v1（P7）DoD 結案

- [x] **（工具建置）Next.js 控制台 v1（Internal Ops）**
  - **證據**：`WORKLOG.md` §「P7 Next.js 控制台 v1 — DoD 完整驗收（ops-console-smoke ALL PASSED）」含 `AUTO_TASK_DONE` 與 9/9 checks。
  - **機械報告**：`agency-os/reports/status/ops-console-smoke-LATEST.json`（`result=passed`；含 tenant 回顯、viewer 403、admin 寫入、audit 對應）。
  - **收斂說明**：本項結案不代表總賬結案；`Phase 1 建議順序（P1 -> P7）` 與 `Enterprise 工具層 Phase 1 正式串接` 仍依其各自 DoD 保持開放。

### 2026-05-07 — Trigger workflows EU deploy（結案）

- [x] **Trigger workflows 完整 deploy**
  - **證據**：`WORKLOG.md` §「Trigger workflows deploy to EU — 完成」（version **`20260507.3`**，dashboard deployment 連結同該節）。
  - **金鑰對照**：Project **`tr_prod_*`** → 後端 **`TRIGGER_SECRET_KEY`**（觸發任務）；Account **`tr_pat_*`** → **`TRIGGER_ACCESS_TOKEN`**（`deploy`／CI／無頭機）；路徑 **`{APP_ORIGIN}/account/tokens`**。見 **`lobster-factory/infra/trigger/README.md`** §7、blockquote §7a。

### 2026-05-07 — Next-Gen v1 試點：Day 2 書面子交付（registry／URL）

- [x] **啟動 Next-Gen 升級藍圖 v1（M1→M3）— M1 試點 + Day 2「書面 staging」階段（2026-05-07）**
  - **試點：**Soulful Expression（既有站接手）+ Scenery Travel Mongolia（新站建置）；tenant 骨架先前已建立。
  - **本輪交付：**兩站 **canonical staging URL** 寫入各 tenant **`core/ENVIRONMENT_REGISTRY.md`**、`sites/*/SITE_PROFILE.md`、專案 **`02_EXECUTION_PLAN.md` Day 2**；**`NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` §6** 補記現況（🟡＝書面就緒，實機待 Runbook）。
  - **未宣稱完成：**雲端 staging **實機**（DNS／SSL／WP 可登入）——見 **`### 未完成`**「**Next-Gen 試點 — Day 2 雲端 staging 實機驗收**」。
  - **SSOT 收斂（避免矛盾）：**`SITES_INDEX`、兩份 **Pilot Runbook §2（Repo 對齊框）**、`RELEASE_GATES_CHECKLIST`、`CROSS_BORDER_GOVERNANCE`、`BACKUP_RESTORE_PROOF`、`ACCESS_REGISTER`、`30_YEAR_AI_CODING_EXEC_CHARTER` §4.1／§4.3、`TASKS` 證據鏈——均以 **`core/ENVIRONMENT_REGISTRY.md`** 為 URL／lifecycle 先決；**未新增**獨立長文檔。
- [x] **Staging URL SSOT 漂移閘道擴充（`SITES_INDEX` + `SITE_PROFILE` + `02_EXECUTION_PLAN`）**
  - **機械檢查**：`agency-os/scripts/verify-tenant-staging-sites-index-ssot.ps1` 單一腳本擴充；本機與 CI 共用，不開平行實作。
  - **閘道接入**：`scripts/system-health-check.ps1` Critical Gate + `.github/workflows/tenant-staging-ssot.yml`（PR 路徑觸發）；
  - **驗證**：`system-health-check` 100% PASS（354/354）。

### 2026-05-08 — Vault 憑證補齊：4 個原始待補項全數完成

- [x] **（AO-RESUME 提醒）補齊剩餘 Vault 憑證**
  - **OPS_INBOX_INGEST_TOKEN**（2026-05-07）：從 SG `/root/lobster-phase1/.env` 讀取，已入 vault。
  - **SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY**（2026-05-07）：Supabase cloud `mffjqjiidbeibilmxzef`，7 keys 已入 vault。
  - **SUPABASE_A_SERVICE_ROLE_KEY** + **SUPABASE_AWAREWAVE_URL** + **SUPABASE_A_URL**（2026-05-08）：alias 從 vault 複製。
  - **XAI_API_KEY**（2026-05-08）：`xai-X5nRy…XrRg`，已入 vault + Windows env。
  - **最終狀態**：`sync-cursor-mcp-user-env` → 26 vars synced；剩 32 base-URL / API 設定（非原始待補項，見 sync 輸出清單，可按需補齊）。

### 2026-05-07 — phase1 WordPress（SG）PostHog MU 完成部署

- [x] **phase1 WordPress（SG）PostHog MU**
  - **交付**：`posthog.php` MU 已部署至 SG；`curl -sL http://aware-wave.com/ | grep "posthog.init"` 驗證回傳 key `phc_vKX…`；`site_name`, `site_domain`, `app_surface` 均正確。
  - **根本修正**：Dockerfile 改用 `CMD` 入口取代 `docker-entrypoint.d/`（nginx 慣例問題）；`mu-plugins/` 在 image build 時正確植入。
  - **Commit**: `f9e666b`（push origin/main）

### 2026-05-07 — Git `main` 與 `origin/main` 對齊（滯後文案收口）

- [x] **Git：`main` 未推送 commits → `git push origin main`（隊列滯後敘述結案）**
  - **驗證（本機）：**`git fetch` 後 **`git rev-list --left-right --count origin/main...HEAD`** 為 **`0  0`**（ahead／behind 皆 0）；先前累積 commits 已反映在遠端。
  - **備註：**若之後又出現 ahead，仍依 **`REMOTE_WORKSTATION_STARTUP.md` §2.5** 於 **`AO-CLOSE`** 閘道後推送。

### 2026-05-03 — 龍蝦 SSOT 連結收口

- [x] **龍蝦 SSOT 四檔 + 合併版 — 全域索引／腳本連結替換（`_v1.3`／`_v1.4`／`_v2`）** — 根／`lobster-factory` README、AO 導覽、`generate-integrated-status-report.ps1`、`validate-doc-integrity.mjs`、`DEPLOYMENT_CHECKLIST_v1.4` §0、`OPERATOR_RUNBOOK`；**刻意不改**：`WORKLOG`、舊 `memory/daily`、`.claude/sessions`。**日常入口**：`LOBSTER_FACTORY_CHECKLIST.md`（v3）；細項勾選：`MASTER_CHECKLIST_v2.md`。

### 2026-05-01 — 自 Next 隊列移入（整理版面）

- [x] **Supabase Postgres MCP（AwareWave）／EU SSH tunnel — 穩定 smoke**
  - `npm run smoke:supabase-tunnel`：PASS Postgres 127.0.0.1:5432 / PASS Studio :3000 / PASS Kong :8000
- [x] **n8n MCP（Cursor）：HTTP 運輸改 stdio 橋接並驗證（抖動／No tools）**
  - 證據：`scripts/run-n8n-mcp.mjs`、`mcp/registry.template.json`、`docs/operations/n8n-self-hosted-mcp-troubleshooting.md`
- [x] **建立全域月檢 `AgencyOS-MonthlySystemReview` 與 tenant monthly 排程基線**
- [x] **（Ops Inbox Path B）生產收斂完成 — 2026-05-01 實機驗證**
- [x] **（工具建置）安裝 Grok CLI（筆電 / Codex）**
- [x] Slack `#infra-alerts` 歷史訊息批次清理 — 2026-05-01（公司桌機）
- [x] Netdata Centralized Cloud Notifications — 2026-05-01（公司桌機）
- [x] ClickHouse TTL（EU server）— 2026-05-01
- [x] 筆電回家後重載 MCP 環境（`user-env.ps1` + `sync-mcp-config.ps1`）
- [x] **Trigger.dev 自託管上線（Hetzner compose）** — 營運定案 2026-04-20；正本 `lobster-factory/infra/trigger/README.md`
- [x] （工具建置）Sentry 觀測接入（含 `SENTRY_ALERT_POLICY.md`、gate 契約）
- [x] （工具建置）PostHog 事件基線
- [x] （工具建置）Cloudflare 邊界保護
- [x] （工具建置）Secrets 治理升級（含 n8n MCP key 輪替證據與 `AUTO_TASK_DONE`）

### 更早 — 查詢用
- [x] **（工具建置）Hetzner 自託管 n8n（staging）**
  - DoD：`client_onboarding` 輕量流程於 **staging** Webhook 端到端成功；證據見 `WORKLOG.md` **`## 2026-04-10`** →「n8n staging client_onboarding E2E」（`workflow_id` `LUEO8tirSCFaVGjH`、`execution_id` `1`、`route_summary` `POST /webhook/client-onboarding/staging-ping`）。
  - 正本：`docs/operations/n8n-staging-client-onboarding-e2e.md`
- [x] 建立 WordPress 客戶交付「雙模式 SOP」
  - 內容：既有站接手 + 新站從零
  - 原則：雲端 staging 優先，避免跨機重工
  - 檔案：`docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- [x] **既有站接手 Day 1（Soulful Expression）前置實填完成**
  - 已建台帳：`tenants/company-soulful-expression/`（`PROFILE.md`、`SITES_INDEX.md`、`core/ENVIRONMENT_REGISTRY.md`、therapy QA、專案 brief）
  - 待補欄位：標記 `待補`，待權限盤點後回填
- [x] **Phase 1 模板硬化（Core）**
  - 新增：`tenants/templates/core/ENVIRONMENT_REGISTRY.md`、`RELEASE_GATES_CHECKLIST.md`、`BACKUP_RESTORE_PROOF.md`
  - 升級：`ACCESS_REGISTER.md`、`SITES_INDEX.md`、`OPERATIONS_SCHEDULE.json`、`NEW_TENANT_ONBOARDING_SOP.md`
- [x] **Phase 1.5 產業 Overlay（首批）**
  - 新增：`tenants/templates/industry/travel/*`、`tenants/templates/industry/therapy/*`
  - 接入：`tenants/README.md`、`NEW_TENANT_ONBOARDING_SOP.md`、`NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- [x] **（2026-03-30）整理 `docs/spec/raw/` 四份原文**
  - 範圍：V3 / Spec v1 / ENTERPRISE / CURSOR_PACK
  - 新增：`docs/spec/raw/README-four-sources-maintenance.md`（維護索引 + 大段錨點 + SSOT 對照）
  - 連動：各檔首段加維護提示，並回連 `company-os-four-sources-integration.md`、`docs/spec/README.md`
- [x] 定義 WordPress 客製系統開發準則（plugin/mu-plugin/資料表策略）
- [x] 建立 n8n 工作流分層（共用流程 vs 客戶專屬流程）
- [x] 建立 KPI + 毛利雙儀表板（規格）
- [x] 建立文件分類與連動更新機制（`docs/CHANGE_IMPACT_MATRIX.md`）
- [x] 建立結案自動檢查清單與文件自動同步（`scripts/doc-sync-automation.ps1`）
- [x] 建立每公司自動排程系統（Daily/Weekly/Monthly/Adhoc）
- [x] 建立國際化交付/合規/多幣別政策（global delivery/compliance/commercial）
- [x] 建立系統健康檢查機制（`scripts/system-health-check.ps1`）
- [x] 建立主動守護與告警機制（`scripts/system-guard.ps1` + 排程）
- [x] 建立桌面彈窗提醒（PASS/FAIL）與 ALERT/LAST_STATUS 主動提示
- [x] 建立可販售產品化藍圖與交接清單（`docs/product/*`）
- [x] 建立對外販售打包腳本（`scripts/build-product-bundle.ps1`）
- [x] 建立總控中心架構與多平台（WordPress-first）連動設計
- [x] （2026-04-09）AO-RESUME 規則防漂移硬化（單一 Owner + 腳本硬檢查 + 無效回覆判定）
  - Owner：`docs/operations/rules-version-and-enforcement.md`
  - 腳本：`scripts/ao-resume.ps1` 新增規則版本/鏡像一致性 precheck（失敗即中止 + quick-fix）
  - 規則：`30-resume-keyword.mdc` 明確「未全列 `- [ ]` 視為無效回覆，必須重出」
  - 對齊：`rules/README` + `cursor-enterprise-rules-index.md` 已補 Owner 入口
- [x] （2026-04-09）平台能力總表狀態欄位升級（含 emoji）
  - 檔案：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
  - 變更：新增「目前實際狀態」欄，並統一 `🟢 已上線 / 🟡 建置中 / ⚪ 未啟動` 圖例於能力總表與 P1-P7 建置順序表
  - 驗證：`doc-sync-automation -AutoDetect` + `system-health-check` 100% PASS
- [x] AO-CLOSE 預設 100% health 閘道已落地（規則/文件/腳本三層）
- [x] 用 1 個新客戶實跑 `tenants/NEW_TENANT_ONBOARDING_SOP.md`
  - 客戶：`company-p1-pilot`
  - 狀態：最小實跑完成
  - 證據：`reports/e2e/onboarding-a10-2/20260331-214650-company-p1-pilot-2026-010-p1-pilot/`
- [x] 全面檢查並升級 `tenants/templates/`（v1）
  - 新增：`core/DEPARTMENT_COVERAGE_MATRIX.md`、`core/CROSS_BORDER_GOVERNANCE.md`
  - 強化：`PROFILE`、`FINANCIAL_LEDGER`
  - 連動：`NEW_TENANT_ONBOARDING_SOP`、`tenants/README` 已接上（2026-04-02）
- [x] 新增對外短憲章
  - 檔案：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`
  - 定位：30 年 AI/coding/專案管理跨國企業決策與執行口徑
- [x] 新增客戶精簡鏡像：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`
- [x] `system-guard.ps1` FAIL 後保守 auto-repair
  - 行為：只重跑 `doc-sync-automation` + `system-health-check` 一次
  - 升級條件：仍 FAIL 才產生 `ALERT_REQUIRED.txt`
- [x] 完成今日 AO-CLOSE 三步收工檢查（doc-sync / health / guard 全 PASS）
- [x] 完成今日 AO-CLOSE 一鍵閘道與同步推送
  - 流程：verify-build-gates + guard + integrated-status + git push
  - 補充：**2026-03-28 晚** 再跑一輪，收斂 A10 / SOP / presign 等本機變更
- [x] 報表單一路徑收斂（canonical=`agency-os/reports`，root `reports/` 退役為相容用途）
- [x] 建立標準 MSA/SOW/CR 文件模板
- [x] 修復 `AgencyOS-*` 排程路徑到 `D:\Work\agency-os` 並補齊命令引號防呆
- [x] 建立 reports 歸檔腳本（`scripts/archive-old-reports.ps1`）與 README 操作入口
- [x] 他處／公司機開機須知（`docs/overview/REMOTE_WORKSTATION_STARTUP.md` + `RESUME_AFTER_REBOOT.md` 分機情境）
- [x] Enterprise 工具層選型/安裝完成
  - 主工具：Sentry / PostHog / Cloudflare / Identity/JWT（不綁特定供應商）
  - Secrets：先採 env/mcp（後續可升級）
  - 輔助：Supabase / Slack
- [x] 啟用 Operator Autopilot 規則與 Phase1 自動化腳本（startup preflight / alert auto-repair / closeout optional push / Slack notify）
- [x] AO + Lobster 事件流圖（Mermaid）已落地到 `docs/overview/ao-lobster-operating-model.md`
- [x] 落地「Single Owner 最高原則」：核心規則/`AGENTS.md` 已寫入；`doc-sync-automation.ps1` 新增 owner 重複內容檢查（registry 驅動）
- [x] Single Owner 第 2 階段：registry 擴充 AO-RESUME 主流程、30 秒自檢、AO-CLOSE 硬性 Gate（避免關鍵流程多處複製）
- [x] P1/P2 跑道加速：新增 preflight（`scripts/preflight-onboarding-a10-2-readiness.ps1`）、證據骨架初始化（`scripts/init-onboarding-a10-2-evidence-skeleton.ps1`）、Run ID 對照規格（`docs/operations/ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md`）
- [x] 整合 `LOBSTER_FACTORY_MASTER_V3` 至系統建置路線（gap map + skeleton sprint + gate 追蹤，H1~H6 baseline 完成）
- [x] `lobster-factory` H3 第一批 skeleton sprint（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）
- [x] `lobster-factory` H4 Decision Engine baseline（recommendations schema + contract）
- [x] `lobster-factory` H5 CX retention/upsell baseline（workflow_runs 串接骨架）
- [x] `lobster-factory` C3-3 release gate baseline（PR gate + prod deploy gate）
- [x] `lobster-factory` Trigger deploy CI 修復完成（project ref 對齊 + 缺失 `uid` 補齊 + Actions 綠燈）
- [x] 修復 Cursor `user-trigger` MCP 啟動錯誤（移除錯誤 `--api-key` 參數，改 vault 啟動腳本）
- [x] 落地強制版 MCP routing 規格與風險矩陣（`MCP_TOOL_ROUTING_SPEC.md` + `workflow-risk-matrix.json`）
- [x] 落地 WordPress Factory 細部執行規格（`WORDPRESS_FACTORY_EXECUTION_SPEC.md`：step-by-step + failure matrix + approval payload）
- [x] 將 WordPress Factory 規範轉成可執行 gate（`wordpress-factory-execution-policy.json` + `validate-workflow-routing-policy.mjs` + bootstrap 整合）
- [x] `lobster-factory` C3-1 標準 E2E payload + staging 管線回歸腳本（`docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`、`run-staging-pipeline-regression.mjs`）
- [x] `lobster-factory` C2-1 mock hosting adapter（`hosting/mockStagingAdapter.ts` + `create-wp-site` 整合 + `MOCK_HOSTING_ADAPTER.md`）
- [x] `lobster-factory` C3-2 演練報告產生器（`emit-staging-drill-report.mjs` → `agency-os/reports/e2e/`）
- [x] `lobster-factory` hosting 合約（`resolveStagingProvisioning`、`provider_stub` 阻擋、`HOSTING_ADAPTER_CONTRACT.md`）
- [x] `lobster-factory` A9 本機 artifacts（`localArtifactSink`、`LOBSTER_ARTIFACTS_MODE=local`、`logs_ref` PATCH）
- [x] `lobster-factory` hosting `providers/` 合約骨架 + `print-create-wp-site-payload` CLI
- [x] `lobster-factory` 營運套裝：`operator:sanity`、`payload:apply-manifest`、`LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`
- [x] `lobster-factory` hosting：`http_json` 適配器 + 合約文件（`resolveStagingProvisioning` async）
- [x] `lobster-factory` A9：`remote_put` artifact 上傳（presigned PUT + presign broker 合約）
- [x] Monorepo 根 `README.md` + `EXECUTION_DASHBOARD` 現況對齊 + 雙邊 README／`AGENTS` 導覽連動
- [x] `lobster-factory` A10-1：`OPERABLE_E2E_PLAYBOOK.md` + `validate-operable-e2e-skeleton.mjs`（納入 bootstrap）；A9 政策 `ARTIFACTS_LIFECYCLE_POLICY.md`
- [x] A10-2 前置：`NEW_TENANT_ONBOARDING_SOP` Step 7（Lobster 銜接）+ `PRESIGN_BROKER_MINIMAL` + presign JSON 範例；operable gate 驗證 monorepo SOP 橋接
- [x] `lobster-factory` C1-2 execute 驗證（`package_install_runs` lifecycle：pending -> running -> completed）
- [x] `lobster-factory` C1-3 execute 驗證（DB 寫入韌性：retry/compensation/trace）
- [x] 建立零成本本機 Secrets Vault（Windows DPAPI，`scripts/secrets-vault.ps1`）
- [x] 完成 Secrets Vault 一鍵匯入（`mcp.json` + Lobster/Slack 關鍵值）
- [x] `lobster-factory` A9 雲端 artifacts 治理補齊 baseline（生命周期規則/IAM/稽核自動化：policy + validator + audit report）

## Backlog — 未完成
- [ ] 建立跨國稅務與法遵顧問審核流程（法律文件外部審核）
- [x] `lobster-factory` Enterprise 必備工具補強路線（已取消）
  - 範圍：Sentry / PostHog / Cloudflare / Secrets / Identity
  - 現況：Identity 採 JWT/OIDC（不綁特定供應商）；Secrets 暫採 env/mcp，後續升級 secrets manager
- [ ] **`lobster-factory/packages/workflows` `npm audit`**（2026-04-01）
  - 現況：已做相依升級與 `overrides` 收斂；目前剩 2 筆 moderate，皆來自 `@trigger.dev/sdk` -> `uuid`（`<14.0.0`）上游傳遞依賴。
  - 2026-04-29 決策：`npm audit`/`npm outdated` 複核，`@trigger.dev/sdk` 與 `trigger.dev` 最新仍為 `4.4.4`，`fixAvailable=false`；暫列 **acceptable risk**（僅 moderate，無 high/critical）。
  - 禁止：勿在本目錄執行 `npm audit fix --force`（會導向不相容 Trigger 版本）。
  - 對策：持續追 Trigger 官方修補（`@trigger.dev/sdk`/`trigger.dev`）；每次升版後執行 `npm run test` + `npm audit` 回歸；本機勿將 Trigger dev server 暴露公網。
  - 例行檢查：執行 `npm run audit:workflows-security`，報告輸出至 `agency-os/reports/security/workflows-npm-audit-LATEST.md`（週檢 + 升版觸發檢查）。

## Backlog — 已完成歷程
- [x] 客戶分級與風險評分模型
- [x] 外包交付評分卡
- [x] 合規檢查清單（抓取與 leads）
- [x] 建立英文化客戶輸出模板（Proposal/SOW/Monthly Report）
- [x] 建立 release notes + upgrade path + migration checklist
- [x] `lobster-factory` 補齊 raw spec 差距檔案（C4-1~C4-5 完成）

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/20-doc-sync-closeout.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `docs/architecture/agency-command-center-v1.md`
- `docs/compliance/leads-and-scraping-checklist.md`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/operations/client-risk-scoring-model.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/outsourcing-vendor-scorecard.md`
- `docs/operations/system-operation-sop.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`

_Last synced: 2026-05-14 10:42:25 UTC_

