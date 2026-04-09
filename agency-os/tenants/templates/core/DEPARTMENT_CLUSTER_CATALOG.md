# 部門簇目錄（20 部門版）

> **Owner**：本檔為「客戶要啟用哪些企業能力」的選型正本。  
> **固定口徑**：以 **20 部門能力清單**為上限；每案可先啟用子集。  
> **填檔路由**：仍以 `DEPARTMENT_COVERAGE_MATRIX.md` 的 15 列交付歸桶為準（不等於 org chart 線條數）。

## 與 `DEPARTMENT_COVERAGE_MATRIX.md` 的關係

| 概念 | 說明 |
|------|------|
| **本目錄（Catalog）** | 對外／內部溝通用的 **能力模組** + 穩定 **`cluster_id`**，方便報價、SOW、控制台。 |
| **覆蓋矩陣（Matrix）** | **治理交付**：每一列對應 **要填 tenant 哪幾份主檔**；列數固定為歸桶結果（目前 15 列）。 |
| **多對一** | 多個 `cluster_id` 可能對應 **同一矩陣列**（例如「數據」與「AI」都主要落在資料／隱私列 + 工程列時，於 Notes 細分）。 |

## 選型結果放哪裡

- 每租戶：`core/DEPARTMENT_SELECTION.json`（由 `DEPARTMENT_SELECTION.example.json` 複製；見 `NEW_TENANT_ONBOARDING_SOP`）。
- 矩陣裡：對**未啟用**的能力，在對應列 **Notes** 寫 `N/A — 未採購／開案未選`；**啟用後**刪除或改為啟用範圍描述。

## 日後擴充部門（標準動作）

1. 客戶決定新增模組 → **變更單／SOW 附錄**更新範圍。  
2. 在 `core/DEPARTMENT_SELECTION.json` 的 `selected_cluster_ids` **append** 新 ID（勿刪歷史，可另欄 `activated_at` 若你日後自動化）。  
3. 開 `core/DEPARTMENT_COVERAGE_MATRIX.md`：把相關列 **Notes** 從 `N/A` 改為 **啟用**與責任窗口。  
4. 依矩陣 **補齊主檔**（PROFILE／FINANCIAL／ACCESS／CROSS_BORDER…）。  
5. 大筆新範疇（跨境、金流、新法人）→ `CROSS_BORDER_GOVERNANCE`、`RELEASE_GATES` 一併檢視。

---

## 能力模組總覽（20 部門）

以下 **20 項**為標準選型單位。`smb_default` 僅供內部參考（實際以報價/SOW 為準）。

| `cluster_id` | 客戶溝通名稱（中） | 模組 | 對應矩陣列（鍵） | smb_default |
|--------------|-------------------|------|------------------|-------------|
| `CLU_STRATEGY_GOVERN` | 董事／策略／治理 | 治理 | `strategy_gov` | on |
| `CLU_FINANCE` | 財務／管理會計 | 財務 | `finance_ma` | on |
| `CLU_SECURITY_IT` | 資安／身分／存取 | 橫向 | `security_it` | on |
| `CLU_ENGINEERING` | 工程技術／IT／DevOps | 平台 | `engineering` | on（技術案） |
| `CLU_ORDER_OPS` | 訂單／客服／交付營運 | 供應鏈 | `operations_delivery` | on |
| `CLU_MARKETING` | 市場行銷 | 營收 | `marketing_growth` | 視業態 |
| `CLU_PRODUCT` | 產品管理／UX | 平台 | `product_digital` | 視業態 |
| `CLU_SALES_BD` | 銷售／商務拓展 | 營收 | `product_digital` + `strategy_gov` | off |
| `CLU_CUSTOMER_SUCCESS` | 客戶成功／CRM／留存 | 營收 | `marketing_growth` + `operations_delivery` | 視業態 |
| `CLU_PROCUREMENT` | 採購／供應商／外包 | 供應鏈 | `procurement` | off |
| `CLU_LOGISTICS` | 物流／倉儲／履約 | 供應鏈 | `operations_delivery` + `tax_customs` | off |
| `CLU_DATA_AI` | 數據／BI／AI | 平台 | `data_privacy` + `engineering` | off |
| `CLU_PRIVACY_RETENTION` | 資料／隱私／留存 | 橫向 | `data_privacy` | 視業態 |
| `CLU_RISK_FRAUD` | 風控／反詐欺 | 財務 | `risk_security` + `finance_ma` | off |
| `CLU_TAX_TRADE` | 稅務／關務（資訊橋） | 財務 | `tax_customs` | off |
| `CLU_LEGAL` | 法務／合規 | 企業支援 | `legal` | off |
| `CLU_HR` | 人力資源 | 企業支援 | `hr` | off |
| `CLU_BRAND_COMMS` | 對外溝通／品牌 | 橫向 | `brand_comms` | 視業態 |
| `CLU_REGIONAL` | 區域／國際化營運 | 國際化 | `tax_customs` + `legal` + `strategy_gov` | off |
| `CLU_IR` | 投資人關係／IR | 橫向 | `ir` | off |

### 矩陣列鍵 ↔ `DEPARTMENT_COVERAGE_MATRIX.md` 第一欄

| 鍵 | 矩陣列（摘要） |
|----|----------------|
| `strategy_gov` | 董事／策略／治理 |
| `finance_ma` | 財務／管理會計 |
| `tax_customs` | 稅務／關務（資訊橋） |
| `legal` | 法務／合規 |
| `security_it` | 資安／IT／身分 |
| `procurement` | 採購／供應商／外包 |
| `hr` | 人資（交付觸及時） |
| `operations_delivery` | 營運／客服／交付 |
| `marketing_growth` | 行銷／成長 |
| `product_digital` | 產品／數位通路 |
| `engineering` | 工程／開發／基礎建設 |
| `data_privacy` | 資料／隱私／留存 |
| `risk_security` | 風險／資安事件 |
| `brand_comms` | 對外溝通／品牌 |
| `ir` | 投資人關係／IR |

---

## 啟用策略（預設全開 + 可挑選）

- **預設**：新客戶 `selected_cluster_ids` 直接放入 **全部 20 部門**（完整能力上限）。
- **可挑選（依預算/方案）**：在 `DEPARTMENT_SELECTION.json` 以
  - `selected_cluster_ids`（實際啟用）
  - `excluded_explicit`（未採購原因）
  來做降配，避免「只付一點錢卻看起來全包」。
- **報價建議**：用 `cluster_id` 組合成 Basic / Growth / Enterprise 三層，不改 ID，只改選取集合。

## 降配常見分組（可選）

- **供應鏈深度**：`CLU_PROCUREMENT`、`CLU_LOGISTICS`
- **合規與風控**：`CLU_RISK_FRAUD`、`CLU_TAX_TRADE`、`CLU_LEGAL`、`CLU_PRIVACY_RETENTION`
- **組織與品牌**：`CLU_HR`、`CLU_BRAND_COMMS`、`CLU_REGIONAL`、`CLU_IR`
- **營收與智能**：`CLU_SALES_BD`、`CLU_DATA_AI`

## ChatGPT「六大骨架」快速套餐（可當報價組合標籤）

可當 **組合標籤**（非強制）：`BUNDLE_GTM`、`BUNDLE_PRODUCT_TECH`、`BUNDLE_DATA_AI`、`BUNDLE_SUPPLY_CHAIN`、`BUNDLE_FINANCE_RISK`、`BUNDLE_CORP`。  
實作上仍建議 **細到 `cluster_id`**，以免日後爭議「套餐包不包跨境稅務」。

---

## Related

- `DEPARTMENT_COVERAGE_MATRIX.md`（填檔路由）
- `DEPARTMENT_SELECTION.example.json`（每租戶一份實例）
- `NEW_TENANT_ONBOARDING_SOP.md`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`（M3 與部門視圖）
