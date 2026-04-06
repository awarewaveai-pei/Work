# Resume After Reboot

## 同一台電腦 — 重開機後

請先在 Cursor 開啟工作區：
- **建議 monorepo 根**：`<WORK_ROOT>`（含 `agency-os`、`lobster-factory` 與根 `scripts`）
- 或僅開：`<WORK_ROOT>\agency-os`

**建議**：在 monorepo 根打 **`AO-RESUME`**（Agent 會跑 **`.\scripts\ao-resume.ps1`**：已含 `fetch`／必要時 **`pull --ff-only origin main`**／`npm ci`／`verify-build-gates`），或先手動執行同一腳本再在 Cursor 打 **`AO-RESUME`**。遇本機未提交／衝突仍可能失敗。完整說明：**`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md`** §2、§2.3。

貼上：**`AO-RESUME`**

先看：
- `LAST_SYSTEM_STATUS.md`（在 `agency-os` 根目錄）
- 若存在 **`ALERT_REQUIRED.txt`**：先修復再繼續交付

## 他處電腦／公司機 — 第一次或換機

請改看：**`docs/overview/REMOTE_WORKSTATION_STARTUP.md`** — **新機／筆電第一次**依 **§1.5**（最短複製貼上序列）；之後每次開工依 **§2**（`git pull`、`lobster-factory\packages\workflows`／wrappers 之 `npm ci`、`verify-build-gates`、狀態檔路徑）。

> `<WORK_ROOT>` 例子：筆電可能是 `D:\Work`；公司桌機可能是 `C:\Users\USER\Work`。

## Related Documents (Auto-Synced)
- `docs/operations/system-guard-and-notification.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`

_Last synced: 2026-04-06 09:35:15 UTC_

