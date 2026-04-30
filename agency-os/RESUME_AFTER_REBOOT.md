# Resume After Reboot

## 下次開機提醒（輪替：有新事項只改本節）

> **寫法規則（給未來自己／代理）**：營運者**一次只會有一台電腦在身邊**。凡屬「**兩台都要做**」的設定（PATH、MariaDB、WP bootstrap、`gh`、vault、`mcp.json`、`npm ci`、Strict 稽核，以及**自託管營運工具在本機的消費端**：例如能觸發／驗證 **n8n staging Webhook**；**Trigger.dev 自託管**（**營運定案 2026-04-20：自架叢集視為已上線**，見 **`TOOLS_DELIVERY_TRACEABILITY.md`**；**每台開發機**仍須把 **`TRIGGER_*`／Worker API URL** 寫進該機 **vault**／本機 env 對齊 **`packages/workflows`** 與 **`github-actions-trigger-prod-deploy.md`**）；vault 內對應鍵；後續 **`TASKS`** 裡其他自託管／Phase 1 工具在本機的憑證與連通），在本節**務必拆成兩句**：**（A）現在手上這台**當次要做什麼；**（B）另一台**下次開機／下次帶到身邊時要做什麼——**不要**只寫「請完成雙機」一句話。更新本節時刪舊輪替、只保留仍有效者。

1. **開工單一路徑（兩台各自）**  
   - **現在這台**：在 Cursor 開 **monorepo 根**工作區（`<WORK_ROOT>`），對話裡**輸入並送出 `AO-RESUME`**；repo 根的 **`.cursor/hooks.json`**（`beforeSubmitPrompt`）會先跑 **`scripts\ao-resume.ps1 -FullMainlineParity`**，代理再依 **`30-resume-keyword.mdc`** 五段式讀檔（見 **`AGENTS.md`**）。**除錯、hook 未載入、或離開 Cursor 操作**時，才改在 monorepo 根手動：`powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1 -FullMainlineParity` 至 **exit 0**。  
   - **另一台**：下次帶到身邊時同樣在該機 `<WORK_ROOT>` 用 Cursor 送 **`AO-RESUME`**（或手動跑上段腳本至 exit 0）；勿假設已與 GitHub 對齊而不做。

2. **雙機對齊（`TASKS` 仍開放；兩台各自）**  
   - **現在這台**：若尚未做 §1.5.1／Strict，依 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §1.5／§1.5.1**；MariaDB PATH 可選 **`.\scripts\ensure-mariadb-on-user-path.ps1`**；本機 WP 正本 **`lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md`**；試跑紀錄見 **`WORKLOG` 2026-04-13**（桌機範例）。  
   - **另一台**：**筆電／公司機**到齊後**整段重做一遍**（含 **`machine-environment-audit.ps1 -FetchOrigin -Strict`** 至 **PASS（無 WARN）**）。**兩台**都達標後才勾 `TASKS`「雙機環境對齊」，並在當日 **`WORKLOG`** 單獨一行 **`- AUTO_TASK_DONE:`** 命中該條待辦。

3. **Git（兩台各自看）**  
   - **現在這台**：若 **`git status`** 顯示 **ahead**，收工 **`AO-CLOSE`** 或 **`git push origin main`**。  
   - **另一台**：下次開工先 **`ao-resume`**（會 **fetch**／落後時 **ff-only pull**），避免以為自己還在舊 **`origin/main`**。

4. **自託管營運工具（伺服器一套、本機／CI 各自消費）**  
   - **n8n（staging，已證 E2E）**：**雲端實例**通常只維護一套，但**每台開發機**若要用 Webhook／除錯／放 **`secrets-vault`** 內相關值，仍須在**該機**補齊（不依 Git 同步）。正本：**`docs/operations/n8n-staging-client-onboarding-e2e.md`**；證據索引：**`WORKLOG` `## 2026-04-10`**。  
   - **Trigger.dev（自託管；營運定案 2026-04-20：已上線）**：自架叢集視為**已上線**（與 **`TOOLS_DELIVERY_TRACEABILITY.md`**／**`hetzner-stack-rollout-index.md`** 一致）；實裝與 v4 邊界見 **`lobster-factory/infra/trigger/README.md`**。**每台開發機**仍須各自具備 **`TRIGGER_SECRET_KEY`、Worker／API base URL**（**vault**／本機 env；不進 git）與可 **`deploy`** 的憑證；CI 切線見 **`github-actions-trigger-prod-deploy.md`**。  
   - **現在這台**：n8n 依上段正本做 smoke；Trigger：確認本機 **`trigger.config.ts`／env** 與自架 URL 一致，必要時跑一次輕量 deploy smoke。  
   - **另一台**：帶到身邊後**重做** n8n 與 Trigger **消費端**（vault／`TRIGGER_*`／連通），勿假設桌機 secret 已自動存在。往後若 **`TASKS`**「Enterprise 工具層 Phase 1」新增其他自託管項，**輪替本節時一併寫進來**。

## 同一台電腦 — 重開機後

請先在 Cursor 開啟工作區：
- **建議 monorepo 根**：`<WORK_ROOT>`（含 `agency-os`、`lobster-factory` 與根 `scripts`）
- 或僅開：`<WORK_ROOT>\agency-os`

**建議（日常）**：在 Cursor 開 monorepo 根工作區後，對話送出 **`AO-RESUME`**；專案 **hook** 會先跑 **`ao-resume.ps1 -FullMainlineParity`**（含 fetch、behind 時 ff-only pull、閘道、workflows 依賴、`print-open-tasks`、**`machine-environment-audit -FetchOrigin -Strict`**）。遇本機未提交變更／衝突時腳本會**非 0**，請依 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` 2.5.1** 整理後**再送一次 `AO-RESUME`** 或手動重跑腳本。完整準備與 §2.3 三指令自檢亦見該檔 §2、§2.3。

**除錯／無 Cursor**：在 monorepo 根手動 **`powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1 -FullMainlineParity`** 至 **exit 0**，之後若仍用 Cursor 續接可再送 **`AO-RESUME`**（代理依 **`30-resume-keyword.mdc` 第 3 節**給**五段式**匯報，含 **`open-tasks-snapshot.md`**／**`TASKS.md`** 待辦全列）。

可選人類掃視：
- `LAST_SYSTEM_STATUS.md`（在 `agency-os` 根目錄）
- 若存在 **`ALERT_REQUIRED.txt`**：先修復再繼續交付

## 他處電腦／公司機 — 第一次或換機

請改看：**`docs/overview/REMOTE_WORKSTATION_STARTUP.md`** — **新機／筆電第一次**依 **§1.5**（最短複製貼上序列）；之後每次開工依 **§2**（`git pull`、`lobster-factory\packages\workflows`／wrappers 之 `npm ci`、`verify-build-gates`、狀態檔路徑）。

> `<WORK_ROOT>` 例子：筆電可能是 `D:\Work`；公司桌機可能是 `C:\Users\USER\Work`。

## Related Documents (Auto-Synced)
- `docs/operations/system-guard-and-notification.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`

_Last synced: 2026-04-30 09:24:59 UTC_

