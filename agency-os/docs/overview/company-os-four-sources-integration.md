# Company OS：四份原文怎麼整合（閱讀與落地）

## 你的直覺是對的

把 `docs/spec/raw/` 裡那 **四份資料** 看成 **一組成套規格**，比只做 [20 模組一頁導覽](company-os-twenty-modules.md) 更能回答「Agency OS / 客戶交付」到底依據什麼。**導覽頁**只解決「在 V3 裡別迷路」；**本檔**解決「四份東西各管什麼、先讀誰、和 repo 哪裡對齊」。

## 四份原文：分工（彼此不取代）

以下路徑皆相對於 **monorepo 根**（例：`D:\Work`）。

| 檔案 | 在整體裡的角色 | 讀的時機 |
|------|----------------|----------|
| [LOBSTER_FACTORY_MASTER_V3.md](../../../docs/spec/raw/LOBSTER_FACTORY_MASTER_V3.md) | **主藍圖**：Agency OS（20 模組）+ Client OS（每客戶一套）怎麼長、`CURSOR BUILD MODE`、**§三逐模組**（功能／資料草模／Workflow）；另有 schema／workflow 包等 | **一律先從這份建立共識** |
| [LOBSTER_FACTORY_MASTER_SPEC_V1.md](../../../docs/spec/raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md) | **長規格加深**：八大目標、系統邊界、多租戶／權限等敘述比 V3 更細、更長 | **對某主題要查證時**再翻，不必首讀全文 |
| [ENTERPRISE_BASE_STACK.md](../../../docs/spec/raw/ENTERPRISE_BASE_STACK.md) | **工具棧剛性**：必補／建議／視需求的觀測、耐用流程、邊界、身分、計費等 | **對照**現有選型與 [`tools-and-integrations.md`](../operations/tools-and-integrations.md)、`TASKS.md` |
| [CURSOR_PACK_V1.md](../../../docs/spec/raw/CURSOR_PACK_V1.md) | **施工 prompt**：分段貼給 Cursor 的執行指令 | **開工／衝刺**時用；**不作 SSOT**，與 V3／Spec／已落地程式衝突時以後者為準 |

**維護索引（目錄速查／誰別重複寫）**：[README-four-sources-maintenance.md](../../../docs/spec/raw/README-four-sources-maintenance.md)（P1：四份原文對齊本檔 + `docs/spec/README`）。

## 建議閱讀順序（整合心智模型）

1. **V3**：§0 兩棵樹（Agency / Client）→ §一流程 → **§三**你要交付或對客戶承諾的模組。  
2. **本檔**：確認四份資料與 repo 三本柱的關係（下面）。  
3. **Spec v1**：按需查章（例如多租戶、邊界）。  
4. **企業級底座**：對照 env、閘道、Enterprise 任務是否覆蓋。  
5. **Cursor Pack**：實作階段再貼，避免用 prompt 取代藍圖。

## 與 monorepo 三本柱（怎麼「整合進 repo」）

| 柱 | 承載什麼 | 與四份原文的關係 |
|----|----------|------------------|
| `docs/spec/raw/` | 四份原文 | **願景 + 深度 + 工具論 + 施工 prompt** 的源頭 |
| `agency-os/` | 治理、租戶、SOP、健康、任務、記憶 | **公司怎麼運營**；對齊 V3 的 Agency OS 與交付治理 |
| `lobster-factory/` | migrations、workflows、routing | **工廠怎麼自動化**；對齊 V3 的 Factory／部分 Data／Decision；工程對照 [V3_INTEGRATION_PLAN](../../../lobster-factory/docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md) |

強制執行面上自動化誰能跑：另見 [MCP_TOOL_ROUTING_SPEC.md](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)（**不是** 20 模組清單，是 `task_type` 閘道）。

## 「20 模組一頁導覽」算整合嗎？

**不算。** 它只是 [V3 §三](company-os-twenty-modules.md) 的**索引导航**（ Ctrl+G 跳行用）。  
**整合入口**以 **本檔** 為準；導覽頁從本檔連過去即可。

## 若你希望「嚴格」合成單一檔

- **推薦**：維持四份原文 + **本整合說明**（不重複貼上千行，避免雙處維護）。  
- **若一定要單檔**：只能做**人工摘要**並標明「摘要日期／以上游 raw 為準」，維護成本高，需另立規矩誰更新。

## Related Documents (Auto-Synced)

- [company-os-twenty-modules.md](company-os-twenty-modules.md)
- [docs/spec/README.md](../../../docs/spec/README.md)
- [agency-os-complete-system-introduction.md](agency-os-complete-system-introduction.md)
