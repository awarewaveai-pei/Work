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

## 內容生產線能力映射（不新增第 21 部門）

> 你提到的「部落格、網站、產品、社群媒體管理」屬於高頻交付能力。  
> 為維持 **20 部門上限** 與既有 `cluster_id` 穩定性，以下採 **跨簇映射**，不另外創建新 ID。

| 內容生產能力 | 主要 cluster_id | 次要 cluster_id | 對應矩陣列鍵 |
|--------------|------------------|------------------|--------------|
| 部落格內容企劃／排程／發佈 | `CLU_MARKETING` | `CLU_BRAND_COMMS`、`CLU_ORDER_OPS` | `marketing_growth`、`brand_comms`、`operations_delivery` |
| 網站內容營運（頁面更新、Landing Page 文案） | `CLU_PRODUCT` | `CLU_ENGINEERING`、`CLU_MARKETING` | `product_digital`、`engineering`、`marketing_growth` |
| 產品內容管理（目錄、規格、商品敘述） | `CLU_PRODUCT` | `CLU_ORDER_OPS`、`CLU_CUSTOMER_SUCCESS` | `product_digital`、`operations_delivery` |
| 社群媒體內容與社群營運 | `CLU_MARKETING` | `CLU_BRAND_COMMS`、`CLU_CUSTOMER_SUCCESS` | `marketing_growth`、`brand_comms`、`operations_delivery` |

**實務建議（選型）**
- 若客戶「有內容生產代操」：至少啟用 `CLU_MARKETING` + `CLU_PRODUCT` + `CLU_BRAND_COMMS`。  
- 若含電商商品內容維運：再加 `CLU_ORDER_OPS`。  
- 若要求社群互動 SLA / 留存閉環：再加 `CLU_CUSTOMER_SUCCESS`。

### 內容生產線 RACI（長期穩定版）

| 能力域 | R（主責） | A（核准） | C（協作） | I（知會） |
|--------|-----------|-----------|-----------|-----------|
| 部落格內容企劃/發佈 | `CLU_MARKETING` | `CLU_BRAND_COMMS` | `CLU_ORDER_OPS`、`CLU_PRODUCT` | `CLU_STRATEGY_GOVERN` |
| 網站頁面內容營運 | `CLU_PRODUCT` | `CLU_BRAND_COMMS` | `CLU_ENGINEERING`、`CLU_MARKETING` | `CLU_STRATEGY_GOVERN` |
| 產品內容（SKU/規格/敘述） | `CLU_PRODUCT` | `CLU_ORDER_OPS` | `CLU_CUSTOMER_SUCCESS`、`CLU_MARKETING` | `CLU_FINANCE` |
| 社群內容與社群營運 | `CLU_MARKETING` | `CLU_BRAND_COMMS` | `CLU_CUSTOMER_SUCCESS` | `CLU_STRATEGY_GOVERN` |

## 供應鏈／製造能力映射（上下游與自製）

> 「上下游廠商管理」與「自行製造」也維持在既有 20 部門框架，不增新 `cluster_id`。

| 供應鏈/製造能力 | 主要 cluster_id | 次要 cluster_id | 對應矩陣列鍵 |
|----------------|------------------|------------------|--------------|
| 上游供應商管理（原料、代工、外包） | `CLU_PROCUREMENT` | `CLU_FINANCE`、`CLU_LEGAL` | `procurement`、`finance_ma`、`legal` |
| 下游渠道/履約管理（物流、倉配、退換） | `CLU_LOGISTICS` | `CLU_ORDER_OPS`、`CLU_CUSTOMER_SUCCESS` | `operations_delivery`、`tax_customs` |
| 自行製造（排產、製程、品保） | `CLU_ORDER_OPS` | `CLU_ENGINEERING`、`CLU_FINANCE` | `operations_delivery`、`engineering`、`finance_ma` |
| 供應鏈風險與追溯（斷料、品質、合規） | `CLU_RISK_FRAUD` | `CLU_DATA_AI`、`CLU_TAX_TRADE` | `risk_security`、`data_privacy`、`tax_customs` |

**實務建議（選型）**
- 有跨境採購或進出口：至少加 `CLU_TAX_TRADE`，並在 `CROSS_BORDER_GOVERNANCE` 填責任邊界。  
- 有自有工廠或委外製造：`CLU_ORDER_OPS` + `CLU_PROCUREMENT` + `CLU_FINANCE` 為最小集合。  
- 若要求批次追溯與異常預警：再加 `CLU_DATA_AI` + `CLU_RISK_FRAUD`。

### 供應鏈／製造 RACI（長期穩定版）

| 能力域 | R（主責） | A（核准） | C（協作） | I（知會） |
|--------|-----------|-----------|-----------|-----------|
| 上游供應商管理（採購/OEM） | `CLU_PROCUREMENT` | `CLU_FINANCE` | `CLU_LEGAL`、`CLU_ORDER_OPS` | `CLU_STRATEGY_GOVERN` |
| 下游履約（倉配/物流/退換） | `CLU_LOGISTICS` | `CLU_ORDER_OPS` | `CLU_CUSTOMER_SUCCESS` | `CLU_FINANCE` |
| 自行製造（排產/製程/品保） | `CLU_ORDER_OPS` | `CLU_STRATEGY_GOVERN` | `CLU_ENGINEERING`、`CLU_FINANCE` | `CLU_PROCUREMENT` |
| 追溯與供應鏈風險事件 | `CLU_RISK_FRAUD` | `CLU_STRATEGY_GOVERN` | `CLU_DATA_AI`、`CLU_TAX_TRADE` | `CLU_LEGAL`、`CLU_FINANCE` |

## 模組生命週期規則（可擴充、可刪減、不可衝突）

1. **ID 穩定原則**：既有 `cluster_id` 不改名、不重複、不挪作他用。  
2. **新增能力先映射**：優先映射到現有 20 部門；只有在無法映射時才提新增（需變更單）。  
3. **刪減只關閉，不硬刪歷史**：在 `selected_cluster_ids` 移除即可；歷史決策放 `excluded_explicit`。  
4. **RACI 單一 A 原則**：同一能力域同一時期只允許一個 `A`，避免責任衝突。  
5. **矩陣同步原則**：任何啟用/關閉變更，必同步 `DEPARTMENT_COVERAGE_MATRIX.md` Notes。  
6. **跨境與合規護欄**：涉及跨境、稅務、法務時，必同步 `CROSS_BORDER_GOVERNANCE.md`。  

## 夥伴生態能力映射（外包／KOL／聯盟行銷）

> 外部合作生態採「映射既有 20 部門」策略，不新增新部門、不拆第二套模型。

| 夥伴類型 | 主要 cluster_id | 次要 cluster_id | 對應矩陣列鍵 |
|----------|------------------|------------------|--------------|
| 外包廠商（開發/設計/代營運） | `CLU_PROCUREMENT` | `CLU_LEGAL`、`CLU_FINANCE`、`CLU_ORDER_OPS` | `procurement`、`legal`、`finance_ma`、`operations_delivery` |
| 合作網紅/部落客（KOL/KOC） | `CLU_MARKETING` | `CLU_BRAND_COMMS`、`CLU_LEGAL`、`CLU_FINANCE` | `marketing_growth`、`brand_comms`、`legal`、`finance_ma` |
| 聯盟行銷（含 WordPress affiliate 外掛） | `CLU_MARKETING` | `CLU_PRODUCT`、`CLU_ENGINEERING`、`CLU_RISK_FRAUD`、`CLU_PRIVACY_RETENTION` | `marketing_growth`、`product_digital`、`engineering`、`risk_security`、`data_privacy` |

### 夥伴生態 RACI（穩定版）

| 能力域 | R（主責） | A（核准） | C（協作） | I（知會） |
|--------|-----------|-----------|-----------|-----------|
| 外包廠商准入與續約 | `CLU_PROCUREMENT` | `CLU_STRATEGY_GOVERN` | `CLU_LEGAL`、`CLU_FINANCE`、`CLU_ORDER_OPS` | `CLU_SECURITY_IT` |
| KOL/KOC 合作內容審核與發佈 | `CLU_MARKETING` | `CLU_BRAND_COMMS` | `CLU_LEGAL`、`CLU_CUSTOMER_SUCCESS` | `CLU_FINANCE` |
| 聯盟行銷方案與分潤規則 | `CLU_MARKETING` | `CLU_FINANCE` | `CLU_PRODUCT`、`CLU_LEGAL`、`CLU_RISK_FRAUD` | `CLU_STRATEGY_GOVERN` |
| 聯盟外掛/追蹤技術運維（WordPress） | `CLU_ENGINEERING` | `CLU_PRODUCT` | `CLU_MARKETING`、`CLU_PRIVACY_RETENTION` | `CLU_SECURITY_IT` |

### 夥伴生態治理最低要求

- 合作對象必有唯一識別（`partner_slug` 或等價鍵）與責任窗口。  
- 涉及個資追蹤、cookie、跨境傳輸時，必回填 `CROSS_BORDER_GOVERNANCE.md`。  
- 聯盟行銷若啟用外掛，需在 `SYSTEM_REQUIREMENTS.md` 記錄外掛名稱、版本、責任人與回滾方案。  
- 佣金／分潤規則由 `FINANCIAL_LEDGER.md` 保留計算口徑，不在行銷檔內重複定義。  

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
