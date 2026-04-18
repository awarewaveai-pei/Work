# Resume After Reboot

## 下次開機提醒（輪替：有新事項只改本節）

> **寫法規則（給未來自己／代理）**：營運者**一次只會有一台電腦在身邊**。凡屬「**兩台都要做**」的設定（PATH、MariaDB、WP bootstrap、`gh`、vault、`mcp.json`、`npm ci`、Strict 稽核，以及**自託管營運工具在本機的消費端**：例如能觸發／驗證 **n8n staging Webhook**；**Trigger.dev 自託管**（**自架叢集尚未完成前**，本機 env 可能仍對 **雲端或過渡** 目標——以 repo 為準；**自架完成後**才談每台 **`TRIGGER_*`／Worker API URL** 對齊同一自架端點，見 **`lobster-factory/packages/workflows`** 與 **`docs/operations/github-actions-trigger-prod-deploy.md`**）；vault 內對應鍵；後續 **`TASKS`** 裡其他自託管／Phase 1 工具在本機的憑證與連通），在本節**務必拆成兩句**：**（A）現在手上這台**當次要做什麼；**（B）另一台**下次開機／下次帶到身邊時要做什麼——**不要**只寫「請完成雙機」一句話。更新本節時刪舊輪替、只保留仍有效者。

1. **開工單一路徑（兩台各自）**  
   - **現在這台**：在 **monorepo 根**（`<WORK_ROOT>`）執行 **`powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1`** → **exit 0** → 再在 Cursor 打 **`AO-RESUME`**（見 `30-resume-keyword.mdc`）。  
   - **另一台**：下次帶到身邊時同樣在該機 `<WORK_ROOT>` 跑 **`ao-resume.ps1` exit 0**（勿假設已與 GitHub 對齊而不跑）。

2. **雙機對齊（`TASKS` 仍開放；兩台各自）**  
   - **現在這台**：若尚未做 §1.5.1／Strict，依 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §1.5／§1.5.1**；MariaDB PATH 可選 **`.\scripts\ensure-mariadb-on-user-path.ps1`**；本機 WP 正本 **`lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md`**；試跑紀錄見 **`WORKLOG` 2026-04-13**（桌機範例）。  
   - **另一台**：**筆電／公司機**到齊後**整段重做一遍**（含 **`machine-environment-audit.ps1 -FetchOrigin -Strict`** 至 **PASS（無 WARN）**）。**兩台**都達標後才勾 `TASKS`「雙機環境對齊」，並在當日 **`WORKLOG`** 單獨一行 **`- AUTO_TASK_DONE:`** 命中該條待辦。

3. **Git（兩台各自看）**  
   - **現在這台**：若 **`git status`** 顯示 **ahead**，收工 **`AO-CLOSE`** 或 **`git push origin main`**。  
   - **另一台**：下次開工先 **`ao-resume`**（會 **fetch**／落後時 **ff-only pull**），避免以為自己還在舊 **`origin/main`**。

4. **自託管營運工具（伺服器一套、本機／CI 各自消費）**  
   - **n8n（staging，已證 E2E）**：**雲端實例**通常只維護一套，但**每台開發機**若要用 Webhook／除錯／放 **`secrets-vault`** 內相關值，仍須在**該機**補齊（不依 Git 同步）。正本：**`docs/operations/n8n-staging-client-onboarding-e2e.md`**；證據索引：**`WORKLOG` `## 2026-04-10`**。  
   - **Trigger.dev（自託管；營運確認：自架尚未完成）**：政策為**僅自託管**；**Hetzner／指定環境上的 Trigger 自架 Worker 尚未依 runbook 做完**（見 **`hetzner-stack-rollout-index.md`**「尚未自架」列、**`hetzner-full-stack-self-host-runbook.md`** 階段 3）。**在此之前**：勿把「雙機對齊」誤解成兩台都已接上自架叢集；`packages/workflows` 與 GHA 以 **`github-actions-trigger-prod-deploy.md`** 與 repo 內 env 範本為準。**自架完成後**：每台開發機再把 **`TRIGGER_SECRET_KEY`、Worker／API base URL** 寫入該機 **vault**（不進 git），並更新總表 **`TOOLS_DELIVERY_TRACEABILITY.md`**。  
   - **現在這台**：n8n 依上段正本做 smoke；Trigger：**若尚未自架**，只確認你理解現況與下一步 runbook（不必假裝已連自架）；**若已自架**，才做本機 env smoke。  
   - **另一台**：帶到身邊後**重做** n8n 消費端檢查；Trigger **自架完成前**與「另一台 vault」無強制對稱要求，**自架完成後**兩台再各自對齊自架 URL／`TRIGGER_*`。往後若 **`TASKS`**「Enterprise 工具層 Phase 1」新增其他自託管項，**輪替本節時一併寫進來**。

## 同一台電腦 — 重開機後

請先在 Cursor 開啟工作區：
- **建議 monorepo 根**：`<WORK_ROOT>`（含 `agency-os`、`lobster-factory` 與根 `scripts`）
- 或僅開：`<WORK_ROOT>\agency-os`

**建議**：在 monorepo 根執行 **`powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1`**（**預設**含 fetch、behind 時 ff-only pull、閘道、workflows 依賴、`print-open-tasks`、**`machine-environment-audit -FetchOrigin -Strict`**）。遇本機未提交變更／衝突時會**非 0**，請依 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` 2.5.1** 處理後重跑。完整準備與 §2.3 三指令自檢亦見該檔 §2、§2.3。

腳本 **exit 0** 後，在 Cursor 貼上：**`AO-RESUME`**（代理依 **`30-resume-keyword.mdc` 第 3 節**給**五段式**匯報，含 **`open-tasks-snapshot.md`**／**`TASKS.md`** 待辦全列）。

可選人類掃視：
- `LAST_SYSTEM_STATUS.md`（在 `agency-os` 根目錄）
- 若存在 **`ALERT_REQUIRED.txt`**：先修復再繼續交付

## 他處電腦／公司機 — 第一次或換機

請改看：**`docs/overview/REMOTE_WORKSTATION_STARTUP.md`** — **新機／筆電第一次**依 **§1.5**（最短複製貼上序列）；之後每次開工依 **§2**（`git pull`、`lobster-factory\packages\workflows`／wrappers 之 `npm ci`、`verify-build-gates`、狀態檔路徑）。

> `<WORK_ROOT>` 例子：筆電可能是 `D:\Work`；公司桌機可能是 `C:\Users\USER\Work`。

## Related Documents (Auto-Synced)
- `docs/operations/system-guard-and-notification.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`

_Last synced: 2026-04-18 14:30:02 UTC_

