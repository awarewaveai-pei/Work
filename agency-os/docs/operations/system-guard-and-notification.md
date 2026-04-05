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
- `pre_shutdown`：登出前（接近關機前）
- `startup`：開機後立即檢查

## 註冊排程
- `powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1 -DailyTime 22:30`
- 預設會在開機守護後開啟 `LAST_SYSTEM_STATUS.md`
- 若不想開啟：加 `-NoOpenStatusOnStartup`

## 手動立即執行
- `powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`

## 判定標準
- 健康分數 **>= 100%** 視為 PASS（`system-guard.ps1` 預設 `-MinHealthScore 100`；與 **AO-CLOSE** 預設收工門檻一致）
- 若需放寬（例如本機暫時性噪音）：手動執行時可傳 `-MinHealthScore 95`（不建議用於收工 push 前）
- Health Critical Gate 必須 PASS（map 連動缺漏或 tenant 必要檔缺漏會直接 FAIL）
- 低於門檻時建立 `ALERT_REQUIRED.txt`；但若允許 auto-repair，會先做一次保守重跑（仍 FAIL 才產生 ALERT）

## Related Documents (Auto-Synced)
- `AGENTS.md`
- `automation/REGISTER_SYSTEM_GUARD_TASKS.ps1`
- `README.md`
- `RESUME_AFTER_REBOOT.md`
- `scripts/system-guard.ps1`

_Last synced: 2026-04-02 08:02:41 UTC_

