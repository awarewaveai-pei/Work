# Operations and Automation Guide

## 目的
- 定義這家公司每日/每週/每月/臨時任務如何自動執行。

## 設定檔
- `OPERATIONS_SCHEDULE.json`：固定排程
- `OPS_QUEUE.json`：臨時任務佇列

## 排程頻率
- Daily：固定時間執行每日例行
- Weekly：固定星期與時間
- Monthly：每月固定日期與時間
- Adhoc：固定分鐘輪詢佇列

## 常用操作
- 註冊排程：
  - `powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_TENANT_TASKS.ps1 -TenantSlug <company-slug>`
- 加入臨時任務：
  - `powershell -ExecutionPolicy Bypass -File .\automation\ENQUEUE_TENANT_TASK.ps1 -TenantSlug <company-slug> -Title "<task>" -Command "<command>"`
- 手動跑一次：
  - `powershell -ExecutionPolicy Bypass -File .\automation\TENANT_AUTOMATION_RUNNER.ps1 -TenantSlug <company-slug> -Frequency daily`

## 觀測與排錯
- 執行報告：`reports/automation/<company-slug>/`
- 系統總狀態：`LAST_SYSTEM_STATUS.md`
- 若 FAIL：先看 `ALERT_REQUIRED.txt` 與最新 health report

## Related Documents (Auto-Synced)
- `automation/README.md`
- `docs/operations/tenant-scheduling.md`
- `README.md`
- `tenants/company-p1-pilot/04_OPERATIONS_AUTOMATION_GUIDE.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `tenants/README.md`

_Last synced: 2026-04-02 06:26:32 UTC_

