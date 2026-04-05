# 規格原文區（`spec/`）

本目錄保存 **未精簡、篇幅較長的設計原文**（規格源頭），與各子專案裡「已落地、可執行」的短文件 **並存**：後者負責日常閘道與 PR；前者負責 **整體藍圖與模組邊界**。

（`raw/` 內檔名已盡量改為 **ASCII**，避免編輯器／連結檢查因空格、括號解析失敗；標題仍以檔內第一行為準。）

**先看「四份怎麼整合」**（閱讀順序、與 Agency OS／龍蝦的關係）：[`agency-os/docs/overview/company-os-four-sources-integration.md`](../../agency-os/docs/overview/company-os-four-sources-integration.md)。

**維護與大段目錄（P1）**：[`raw/README-four-sources-maintenance.md`](raw/README-four-sources-maintenance.md) — 標明 **勿與 `agency-os`／`lobster-factory` 手抄雙軌** 及各檔對應 SSOT。

## `raw/` 檔案索引

| 檔案 | 內容摘要 |
|------|----------|
| [`raw/LOBSTER_FACTORY_MASTER_V3.md`](raw/LOBSTER_FACTORY_MASTER_V3.md) | **Company OS** 總覽：**Agency OS（你公司營運）** + **Client OS（每客戶一套，由 Factory 生成）**；含 **20 個 OS 模組** 的**逐模組詳解**（見下方「模組內容在哪」）、整體流程與 **CURSOR BUILD MODE**。 |
| [`raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md`](raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md) | **Master Spec v1**：系統目標、邊界、多租戶、權限等長規格（分多段／多主題）。檔名已改為無空格，避免編輯器點連結找不到檔。 |
| [`raw/ENTERPRISE_BASE_STACK.md`](raw/ENTERPRISE_BASE_STACK.md) | **企業級底座**：在 Cursor / Supabase / n8n / GitHub 之上，建議補齊的觀測、耐用流程、邊界安全、身分與計費等工具分層。 |
| [`raw/CURSOR_PACK_V1.md`](raw/CURSOR_PACK_V1.md) | **Cursor Pack v1**：分段可貼的 prompt（MASTER_SYSTEM、資料模型、WP Factory 等）。 |
| [`raw/README-four-sources-maintenance.md`](raw/README-four-sources-maintenance.md) | **四份原文維護索引**：大段錨點、與 monorepo SSOT 對照、變更紀律（**整合頁**仍為 [`company-os-four-sources-integration.md`](../../agency-os/docs/overview/company-os-four-sources-integration.md)）。 |
| [`raw/Cursor  Rules for AI/README-部署說明.md`](raw/Cursor%20%20Rules%20for%20AI/README-%E9%83%A8%E7%BD%B2%E8%AA%AA%E6%98%8E.md) | **多模型產出的 Cursor 規則溯源包**；**版控與部署正本**在 [`agency-os/docs/operations/cursor-enterprise-rules-index.md`](../../agency-os/docs/operations/cursor-enterprise-rules-index.md)（`agency-os/.cursor/rules/63`–`66`）。 |

## 20 個模組：**你公司**與**客戶**的關係（以 V3 為準）

- **Agency OS**：你自己公司要跑的 20 個 OS（§0 架構圖上面那棵樹）。
- **Client OS**：你幫客戶建置／生成的系統（§0 下面那棵樹：網站／CRM／追蹤／CX／Commerce…）；許多模組在 **§三「OS 02 / 03 / 05 …」**裡另有 **「Client OS 層」** 小節，寫的就是**交付給客戶**要做的事（例如 Marketing 裡的客戶 SEO、funnel、pixel）。

**不是**只在 `agency-os/docs/` 分散成 20 份檔案；**逐模組的規格正文**目前以 **V3 原文**為主，AO 目錄多是 SOP／治理／租戶包，與「模組畫像」互補而非重複貼上整本。

## 每個模組的內容寫在哪？

| 要找什麼 | 去哪裡 |
|----------|--------|
| **OS 01～20**：部門對應、核心功能、資料模型草圖、Workflow | [`raw/LOBSTER_FACTORY_MASTER_V3.md`](raw/LOBSTER_FACTORY_MASTER_V3.md) 內 **`# ▌ 三、完整 20 個 OS 模組詳解`**（約檔案 **L166** 起），標題形式 **`## OS NN — …`** |
| **工程上**：各 OS 對應哪個 package／migration 缺口 | [`lobster-factory/docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`](../../lobster-factory/docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md) |
| **已落地的 skeleton 清單**（與 DB migration 連動的那一組） | [`lobster-factory/docs/V3_MODULE_SKELETONS.md`](../../lobster-factory/docs/V3_MODULE_SKELETONS.md) |
| 更廣的目標／邊界／多租戶哲學（長文） | [`raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md`](raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md) |

V3 第三部裡每一個 OS 常見結構：**核心功能** → **資料模型**（SQL 草）→ **Workflow**；部分含 **Client OS** 子段落。

## 與 repo 內「精簡規格」的關係

- **`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`**：只定義 **龍蝦自動化**在工程上 **強制**的 `task_type` → `primary_tool`（Trigger / n8n / GitHub / WordPress + Supabase SoR）。**列少是正常的**——那是執行閘道，不是整間公司的 20 模組目錄。
- **本 `spec/raw` 原文**：描述你要複製的 **整間公司／全模組 OS** 與交付哲學；落地時再拆到 `agency-os/docs/`、`lobster-factory/docs/`、Checklist 與 code。

若要從「藍圖」對照到「今天 repo 裡已寫了什麼」，建議先讀 V3 的 **§0 架構圖**，再開 [`agency-os/docs/architecture/agency-command-center-v1.md`](../../agency-os/docs/architecture/agency-command-center-v1.md) 與 [`agency-os/docs/overview/agency-os-complete-system-introduction.md`](../../agency-os/docs/overview/agency-os-complete-system-introduction.md)。

**V3 §三 快速跳行（20 模組表）**：[`agency-os/docs/overview/company-os-twenty-modules.md`](../../agency-os/docs/overview/company-os-twenty-modules.md)。
