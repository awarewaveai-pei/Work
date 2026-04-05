# Company OS：20 模組一頁導覽

> **定位**：這是 **[LOBSTER_FACTORY_MASTER_V3 §三](../../../docs/spec/raw/LOBSTER_FACTORY_MASTER_V3.md)** 的**快速跳行表**，不是四份原文的「整合本」。  
> **四份 raw 怎麼合成一套、先讀誰** → 請看 **[Company OS：四份原文整合閱讀](company-os-four-sources-integration.md)**。

## 點連結卻說「找不到檔案」？

常見原因：

1. **工作區只開了 `agency-os` 子資料夾**：原文在上一層的 `docs/spec/raw/`，用 **相對路徑** 仍指向磁碟上的同一個 repo，但部分環境 Ctrl+點擊會解析錯誤。  
   **建議**：在 Cursor 用 **檔案 › 開啟工作區**，選 repo **根目錄** `D:\Work`，或直接雙擊根目錄的 **`Work-Monorepo.code-workspace`**。
2. **`#L170` 這類行號片段**：在 Cursor／VS Code 裡有時會讓連結變成「只認檔名」而找不到路徑。本頁改為 **純檔案連結**；到檔內後請用 **Ctrl+G**（跳行）輸入右欄的 **約 L*** 數字。

## 這頁是什麼？

**文件導覽**：一張表對應 V3 裡 **§三「完整 20 個 OS 模組詳解」**，不取代原文。

**V3 全文（同一份檔，所有模組都在裡面）**：[LOBSTER_FACTORY_MASTER_V3.md](../../../docs/spec/raw/LOBSTER_FACTORY_MASTER_V3.md)

**用途**：續接、對範圍、對客戶說交付對應哪一模組；開啟上文連結後，用下表 **§三 約行** 跳行。

## Agency OS 與 Client OS

- **Agency OS**：你公司營運的 20 模組。  
- **Client OS**：你幫客戶建置的那套；V3 §三裡多處有 **Client OS 層** 小節。

| #   | 模組                          | 一句話（導覽用）                        | §三（開啟 V3 後 Ctrl+G） |
| --- | --------------------------- | ------------------------------- | ------------------------ |
| 01  | Sales OS                    | 獲客、估價、提案、deal pipeline、多語銷售材料   | 約 170                   |
| 02  | Marketing OS                | SEO／廣告／funnel／自動化＋客戶側行銷交付      | 約 216                   |
| 03  | CX OS                       | 全通道客服、ticket／SLA、體驗與留存營收        | 約 241                   |
| 04  | Factory OS                  | 建站／系統生產線（WP、manifest、部署與驗收）     | 約 389                   |
| 05  | Commerce OS                 | 電商營運、訂單／商品／物流與 Client 商模      | 約 490                   |
| 06  | Brand + Content OS          | 品牌系統與內容產線（對內＋對客）                | 約 521                   |
| 07  | Data OS                     | 資料管線、儀表板、事件與歸因                  | 約 562                   |
| 08  | Finance OS                  | 報價、請款、發票、成本與毛利追蹤                | 約 589                   |
| 09  | Legal OS                    | 合約範本、法遵流程、爭議與證據                 | 約 647                   |
| 10  | IT / Infra OS               | DNS、主機、安全、備份、權杖與環境              | 約 682                   |
| 11  | HR / People OS              | 人資、組織角色、排班與績效（若啟用）              | 約 715                   |
| 12  | Ops OS                      | 內部行政、採購、固定班表與內部 SOP             | 約 736                   |
| 13  | Partner / Ecosystem OS      | 夥伴、聯盟、分潤與生態串接                   | 約 751                   |
| 14  | Media / Asset Pipeline      | 影音／素材版本、轉檔與發佈管線                 | 約 765                   |
| 15  | Compliance / Governance OS  | 跨國法遵、稽核、政策與簽核                   | 約 779                   |
| 16  | PMO / Delivery OS           | 專案組合、里程碑、變更與交付治理                | 約 793                   |
| 17  | Knowledge / Training OS     | 知識庫、訓練、教材與權限                    | 約 810                   |
| 18  | Supply Chain OS             | 實體供應鏈、採購與倉儲（若客戶有貨）              | 約 826                   |
| 19  | Analytics / Decision Engine | 全 OS 資料匯入、評分、建議與 KPI 決策         | 約 840                   |
| 20  | Merchandising OS            | 品類／定價／促銷與商品策略                   | 約 900                   |

**Master Spec v1（長文，非 §三）**：[LOBSTER_FACTORY_MASTER_SPEC_V1.md](../../../docs/spec/raw/LOBSTER_FACTORY_MASTER_SPEC_V1.md)

## 工程落地對照（Repo 內）

- [LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md](../../../lobster-factory/docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md)
- [V3_MODULE_SKELETONS.md](../../../lobster-factory/docs/V3_MODULE_SKELETONS.md)

## 與龍蝦 MCP Routing 的關係

[MCP_TOOL_ROUTING_SPEC.md](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 只規範 **自動化任務** 誰能 orchestrate（Trigger / n8n / GitHub / WP）；**不**列出這 20 個營運模組——兩層一起看：模組定義「做什麼業務」、Routing 定義「哪類任務用哪個工具跑」。

## Related Documents (Auto-Synced)

- [docs/spec/README.md](../../../docs/spec/README.md)
- [agency-os-complete-system-introduction.md](agency-os-complete-system-introduction.md)
