# System Guard and Notification

## 目的
- 在重要時點主動檢查資料連動完整性並留下狀態告知。

## 守護內容
- 自動跑 `scripts/doc-sync-automation.ps1 -AutoDetect`
- 自動跑 `scripts/system-health-check.ps1`
- 若第一次 health/連動檢查 FAIL 且未禁用：保守自動修復一次（再重跑 doc-sync + system-health-check）
- 顯示桌面彈窗：PASS/FAIL（可視化提醒）
- 產生狀態報告與告警檔：
  - `reports/guard/guard-*.md`
  - `LAST_SYSTEM_STATUS.md`
  - `ALERT_REQUIRED.txt`（僅失敗時產生）

## 執行模式
- `manual`：手動觸發
- `daily`：每日固定時段
- `pre_shutdown`：登出前（`system-guard.ps1` 仍支援，但不再由排程自動觸發 — 見下）
- `startup`：開機後立即檢查（`system-guard.ps1` 仍支援，但不再由排程自動觸發 — 見下）

## 註冊排程
- `powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1 -DailyTime 22:30`
- 改用 `Register-ScheduledTask` 模組註冊（2026-06-16）：只註冊 **Daily** 一個任務，**隱藏視窗 + `-HideUi` 靜默**（不再開啟 `LAST_SYSTEM_STATUS.md` 彈窗）。
- **不再註冊 OnStartup / OnLogoff**：OnStartup 需系統管理員（非提權註冊會 HRESULT 0x80070005）且從未成功註冊，開機健檢已由 AO-RESUME + 雲端 routine 涵蓋；schtasks `/SC ONLOGOFF` 為無效 trigger。`-NoOpenStatusOnStartup` 參數已隨彈窗行為一併移除。
- 根因背景：舊版用 `schtasks /TR`（261 字元上限），但隱藏 launcher 指令約 308 字元 → 靜默建不起來，殘留舊的未隱藏 Daily 會閃紅字視窗。

## 手動立即執行
- `powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`

## 判定標準
- 健康分數 **>= 100%** 視為 PASS（`system-guard.ps1` 預設 `-MinHealthScore 100`；與 **AO-CLOSE** 預設收工門檻一致）
- 若需放寬（例如本機暫時性噪音）：手動執行時可傳 `-MinHealthScore 95`（不建議用於收工 push 前）
- Health Critical Gate 必須 PASS（map 連動缺漏或 tenant 必要檔缺漏會直接 FAIL）
- 低於門檻時建立 `ALERT_REQUIRED.txt`；但若允許 auto-repair，會先做一次保守重跑（仍 FAIL 才產生 ALERT）

## Related Documents (Auto-Synced)
- `../scripts/system-guard.ps1`
- `AGENTS.md`
- `automation/REGISTER_SYSTEM_GUARD_TASKS.ps1`
- `README.md`
- `RESUME_AFTER_REBOOT.md`

_Last synced: 2026-10-14 02:10:48 UTC_

