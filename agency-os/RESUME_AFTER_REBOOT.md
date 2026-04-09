# Resume After Reboot

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

_Last synced: 2026-04-09 05:14:56 UTC_

