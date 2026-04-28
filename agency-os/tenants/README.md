# Tenants（租戶 v2）

管理多家 **tenant（公司）** 與其網站／系統資產；**每家公司資料隔離**。

在編輯器內對連結 **Ctrl+Click**（Mac：**Cmd+Click**）可開檔。本頁路徑相對 **`agency-os/`** 根。

---

## 邊界（勿混用）

| 目錄 | 是什麼 | 不是什麼 |
|:---|:---|:---|
| **`tenants/`**（本頁） | 每家 `company-*` 從 **`templates/`** 複製而來的**租戶包** | 不是 Woo 堆疊產品範本 |
| **`platform-templates/`** | Woo 堆疊／專案骨架（`woocommerce`、`client-base`） | 不是租戶公司資料夾 |
| **合約／全庫範本索引** | [repo-template-locations.md](../docs/overview/repo-template-locations.md) | 其餘分散範本請以該索引為準 |

---

## 目錄結構

| 路徑 | 用途 |
|:---|:---|
| `templates/` | 新 tenant 或新 site 複製起點 |
| `templates/core/` | 全客戶必填控制模板（環境台帳、gate、備份證據、**多部門路由矩陣**、**跨境治理索引**） |
| `templates/industry/` | 產業 overlay（travel／therapy 等） |
| `company-p1-pilot/` | 目前啟用中的公司資料夾（範例） |

---

## 每家公司至少維護（檔名）

| 檔名 | 用途（摘要） |
|:---|:---|
| `PROFILE.md` | 公司輪廓 |
| `SERVICE_CATALOG.md` | 服務目錄 |
| `SITES_INDEX.md` | 站點索引 |
| `FINANCIAL_LEDGER.md` | 財務流水 |
| `ACCESS_REGISTER.md` | 存取登記 |
| `01_COMMANDER_SYSTEM_GUIDE.md` | 總司令指南 |
| `02_CLIENT_WORKSPACE_GUIDE.md` | 客戶工作區 |
| `03_TOOLS_CONFIGURATION_GUIDE.md` | 工具設定 |
| `04_OPERATIONS_AUTOMATION_GUIDE.md` | 營運自動化 |
| `OPERATIONS_SCHEDULE.json` | 排程 |
| `OPS_QUEUE.json` | 佇列 |

---

## 新增公司流程

1. 複製 `templates/tenant-template/` → 改名 `company-<slug>`。
2. 複製 `templates/core/*` → `company-<slug>/core/`（含 `DEPARTMENT_COVERAGE_MATRIX.md`、`CROSS_BORDER_GOVERNANCE.md`；SMB 可最小填並註 `N/A`）。
3. 依產業選用 `templates/industry/<industry>/*` → `company-<slug>/industry/`。
4. 更新 `PROFILE.md`、`SITES_INDEX.md`。
5. 建立至少一個 `sites/<site-slug>/`。

**完整 SOP**：[NEW_TENANT_ONBOARDING_SOP.md](NEW_TENANT_ONBOARDING_SOP.md)

**排程註冊**：在 `agency-os/` 根執行 `automation/REGISTER_TENANT_TASKS.ps1`（見 [automation/README.md](../automation/README.md)）。

---

## 連動文件（手動維護；不跑 doc-sync 平面覆寫）

| 說明 | 檔案 |
|:---|:---|
| 租戶排程與自動化 | [tenant-scheduling.md](../docs/operations/tenant-scheduling.md) |
| 新租戶 Onboarding | [NEW_TENANT_ONBOARDING_SOP.md](NEW_TENANT_ONBOARDING_SOP.md) |
| 範本指南 01～04 | [01_COMMANDER_SYSTEM_GUIDE.md](templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md)、[02_CLIENT_WORKSPACE_GUIDE.md](templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md)、[03_TOOLS_CONFIGURATION_GUIDE.md](templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md)、[04_OPERATIONS_AUTOMATION_GUIDE.md](templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md) |

**全庫操作導覽**：[docs/operations/OPS_DOCS_INDEX.md](../docs/operations/OPS_DOCS_INDEX.md)
