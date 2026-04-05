# 四份規格原文 — 維護索引（P1）

> **整合閱讀入口**（先讀）：`[agency-os/docs/overview/company-os-four-sources-integration.md](../../../agency-os/docs/overview/company-os-four-sources-integration.md)`  
> **母索引**：`[docs/spec/README.md](../README.md)`

## 四檔分工（不重複維護）


| 原文                                                                     | 角色                                           | 工程／營運 SSOT（勿在手抄「第二份真相同步」）                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [LOBSTER_FACTORY_MASTER_V3.md](LOBSTER_FACTORY_MASTER_V3.md)           | Company OS **主藍圖**、20 模組正文、CURSOR BUILD MODE | 模組落地映射 → `[lobster-factory/docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md](../../../lobster-factory/docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md)`；`task_type` 閘道 → `[lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)`；§三跳表 → `[agency-os/docs/overview/company-os-twenty-modules.md](../../../agency-os/docs/overview/company-os-twenty-modules.md)` |
| [LOBSTER_FACTORY_MASTER_SPEC_V1.md](LOBSTER_FACTORY_MASTER_SPEC_V1.md) | 目標、邊界、多租戶、權限、自動化等級 **長規格**                   | 交付與治理敘述 → `[agency-os/docs/overview/agency-os-complete-system-introduction.md](../../../agency-os/docs/overview/agency-os-complete-system-introduction.md)`；架構 → `[agency-os/docs/architecture/agency-command-center-v1.md](../../../agency-os/docs/architecture/agency-command-center-v1.md)`                                                                                                                         |
| [ENTERPRISE_BASE_STACK.md](ENTERPRISE_BASE_STACK.md)                   | 企業級 **工具分層**（必補／建議／視需求）                      | **已拍板選型** → `[agency-os/TASKS.md](../../../agency-os/TASKS.md)`、`[agency-os/docs/operations/tools-and-integrations.md](../../../agency-os/docs/operations/tools-and-integrations.md)`；本檔商標列為「選型參考」，不必與 TASKS 逐字一致                                                                                                                                                                                                      |
| [CURSOR_PACK_V1.md](CURSOR_PACK_V1.md)                                 | **施工用 prompt** 包（含 v2/v3 延伸）                 | **版控 IDE 規則** → `[agency-os/docs/operations/cursor-enterprise-rules-index.md](../../../agency-os/docs/operations/cursor-enterprise-rules-index.md)`；與 V3／程式／閘道衝突時 **以後者為準**                                                                                                                                                                                                                                            |


## 本目錄內其他資料夾


| 路徑                                                                        | 說明                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| [Cursor  Rules for AI / README-部署說明](./Cursor  Rules for AI/README-部署說明.md) | 規則溯源包；**部署正本**在 `agency-os/.cursor/rules/63`–`66`；**變更 Routing／inventory／TASKS 時**須依該目錄 §主動對齊複核 raw `01`–`03` |


## 大段錨點速查（方便 diff／PR 討論）

### V3

- §0 定位 → §一 CURSOR BUILD MODE → **§三 OS 01–20** → §四 Supabase Schema → §七 資料夾連動 → §八 Workflow 包 → §九 技術棧 → §十 Gap／路線圖 → §十一 原則。

### Spec v1（第 1 部分檔內）

- §0 定義 → §1 總目標（1.1–1.8）→ §2 邊界 → §3 三個 OS → §4–5 架構與責任 → §6 多租戶 → §7 權限 → §8 自動化等級 → §9 human-in-the-loop → §10 技術棧定位 → …（檔內尚有後續章，按需搜尋 `^# `**）。

### ENTERPRISE_BASE_STACK

- 必補 6 → 強烈建議 5 → 視需求 →「最實際清單」→ 判斷句。

### CURSOR_PACK_V1

- v1 段 1–8（MASTER / DATA / WP FACTORY / ROUTING / AGENT / APPROVAL / COST / TASKS）→ 使用順序 → v2 / v3 延伸區（檔案很長，**以分段標題搜尋為準**）。

## 變更紀律

1. **改藍圖語意**（20 模組邊界、公司敘事）：優先改 **V3**（或 Spec v1 對應章），再在 integration 頁或 **integration plan** 記一筆「對照變更」。
2. **改「現在要用哪個 SaaS」**：改 **TASKS + tools-and-integrations**，必要時在 ENTERPRISE 檔加一行「歷史／替換註記」，避免讀者以為仍是唯一答案。
3. **改自動化誰能跑**：只認 `**MCP_TOOL_ROUTING_SPEC.md`** + 龍蝦治理 JSON，**不要**只靠 Pack 或 V3 口頭描述。

