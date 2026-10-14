# Tenant Scheduling and Automation — RETIRED (2026-10-14)

> 每個客戶一份 `OPERATIONS_SCHEDULE.json`，由筆電的 Windows 工作排程器定時執行。2026-10-14 退役，原因：
> - `REGISTER_TENANT_TASKS.ps1` 的參數名 `$Args` 在 PowerShell 5.1 收不到值，從 4/5 第一版起什麼都沒註冊（實測 count=0）。
> - 三個客戶的清單裡沒有任何客戶工作；機器上只有 4/30 手動建的兩個「每月」任務，而每月清單是空的。
> - 筆電睡眠或用電池時任務會被拒（2026-10-01 0x800710E0）；5/30 已定原則：不再用單機 Windows 排程做 repo 層級的自動化（`weekly-automation-framework.md`）。
> 詳細：WORKLOG 2026-10-14。

## 現在去哪裡排

- 客戶例行工作：app.aware-wave.com 的排程頁（規劃中，見 TASKS.md）；現有範例是自動爬取（`collection_schedules`，Trigger.dev 每小時呼叫 `/api/internal/collect/run-due-schedules`）。
- 其他排程的分類規則：`automation/claude-routines/README.md` 的 Decision rubric。

## Related Documents (Auto-Synced)
- `automation/README.md`
- `docs/architecture/agency-command-center-v1.md`
- `docs/international/global-delivery-model.md`
- `README.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `tenants/README.md`
- `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md`

_Last synced: 2026-05-18 06:50:32 UTC_

