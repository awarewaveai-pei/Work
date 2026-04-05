# Agency OS Complete System Introduction

## 1) 這套系統是什麼
Agency OS 是一套給接案公司使用的營運系統，核心目標是把「接案、執行、交付、維運、風險控制」標準化，並把容易遺漏的檢查流程自動化。

它不只是文件集合，而是包含：
- 治理規則（SOP、政策、模板）
- 執行機制（排程、自動化腳本）
- 驗證機制（健康檢查、連動檢查、守護告警）
- 客戶 package（每家公司可獨立操作）

## 2) 為誰設計
- Agency owner（總司令）：用來看全局狀態、風險、排程、品質
- Delivery team：用固定流程交付，減少返工
- Client（非技術）：用客戶工作區指南理解進度與提需求

## 3) 可以做到什麼
### A. 營運標準化
- 有完整操作 SOP、變更管理、資安與事件應變
- 所有核心文件在 `docs/` 分類管理，避免散落

### B. 客戶級 package
- 每家公司可維護自己的 1-4 指南：
  - `01_COMMANDER_SYSTEM_GUIDE.md`
  - `02_CLIENT_WORKSPACE_GUIDE.md`
  - `03_TOOLS_CONFIGURATION_GUIDE.md`
  - `04_OPERATIONS_AUTOMATION_GUIDE.md`
- 讓總司令與客戶使用流程分離，減少溝通誤差

### C. 自動化執行
- Daily/Weekly/Monthly/Adhoc 任務排程
- 任務執行有報告輸出到 `reports/automation/<company>/`

### D. 自動連動與結案檢查
- 依 `docs/change-impact-map.json` 自動推導受影響文件
- 產生 `reports/closeout/closeout-*.md`，留下可追溯證據

### E. 健康檢查與硬性關卡
- `scripts/system-health-check.ps1` 提供健康分數與 Critical Gate
- 關聯 map 缺漏或 tenant package 缺檔會直接 FAIL

### F. 主動守護與告警
- `scripts/system-guard.ps1` 可手動或排程執行
- 產生 `LAST_SYSTEM_STATUS.md`
- 若失敗，建立 `ALERT_REQUIRED.txt` 並顯示 PASS/FAIL 桌面提醒

### G. 可產品化交付
- `scripts/build-product-bundle.ps1` 可打包對外交付版本
- 有 release notes、upgrade path、migration checklist 支援升級治理

## 4) 系統分層結構
### Layer 1: Governance (規則層)
- `docs/operations/`, `docs/sales/`, `docs/templates/`, `docs/standards/`

### Layer 2: Execution (執行層)
- `automation/`（租戶任務執行與排程註冊）
- `scripts/`（同步、健康、守護、打包）

### Layer 3: Tenant Package (客戶層)
- `tenants/<company-*/>`（客戶資料、排程、專案、指南；試點如 `company-p1-pilot`、`company-soulful-expression`）

### Layer 4: Evidence (證據層)
- `reports/closeout/`, `reports/health/`, `reports/guard/`, `reports/automation/`

## 5) 你每天怎麼用（總司令）
1. 看 `LAST_SYSTEM_STATUS.md`
2. 若有 `ALERT_REQUIRED.txt`，先修復再繼續交付
3. 看 `TASKS.md`、`WORKLOG.md`、`tenants/company-p1-pilot/01_COMMANDER_SYSTEM_GUIDE.md`（或你負責租戶之同名檔）
4. 需要時手動跑：
   - `powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`

## 6) 客戶怎麼用（非技術）
1. 看租戶目錄內 `02_CLIENT_WORKSPACE_GUIDE.md`
2. 看 `SITES_INDEX.md` 與專案 `02_EXECUTION_PLAN.md` 追進度
3. 在 `01_SCOPE_AND_CR.md` 提需求與確認變更

## 7) 你得到的價值
- 降低「靠人記憶」造成的遺漏與失誤
- 提升可預測性（流程、品質、排程、風險）
- 每次改動可追溯（報告與狀態檔）
- 可逐步擴展到更多客戶而不失控

## 8) 目前範圍與下一步
- 目前生效租戶：`company-p1-pilot`、`company-soulful-expression` 等（見 `tenants/README.md`）；**已退役示範**：`company-a`（勿再新增）。
- 建議下一步：
  1. 以真實資料填滿各活躍租戶之 1-4 指南與各 register
  2. 每週固定檢視 health/closeout/guard 報告
  3. 每次重大變更前先跑 guard，再進行交付

## 9) AO + 龍蝦如何一起運作（事件節奏）
- 開工事件：以 `docs/overview/REMOTE_WORKSTATION_STARTUP.md` + `AO-RESUME` 為入口。
- 收工事件：以 `docs/operations/end-of-day-checklist.md` + `AO-CLOSE` 為入口。
- 工廠執行：以 `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` 和 `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md` 追蹤。
- 單一運作模型：`docs/overview/ao-lobster-operating-model.md`（避免跨檔案重複維護）。

## Related Documents (Auto-Synced)
- `docs/operations/system-operation-sop.md`
- `docs/README.md`
- `README.md`
- `tenants/company-p1-pilot/01_COMMANDER_SYSTEM_GUIDE.md`
- `tenants/company-p1-pilot/02_CLIENT_WORKSPACE_GUIDE.md`
- `tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md`
- `tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md`

_Last synced: 2026-04-02 05:57:37 UTC_

