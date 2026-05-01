# Department Coverage Matrix — Scenery Travel Mongolia

> 正本結構見 `tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md`；本檔為本租戶實例。

## 本租戶套用狀態

- **規模假設**：SMB（初期，單一業主）；旅遊產業 overlay 已於 `industry/travel/`。
- **優先補齊**：`ENVIRONMENT_REGISTRY.md`（staging 建立後為唯一變更入口）、`ACCESS_REGISTER.md`、`CROSS_BORDER_GOVERNANCE.md`（跨境客群，需補）。

## 矩陣

| 部門簇 | 主檔（tenant 內） | 必 | 建議（跨國） | Notes |
|--------|------------------|----|-----------|----|
| 董事／策略 | `PROFILE.md` | 商業目標、KPI、Out of Scope | 決策窗口 | 聯絡人**待補** |
| 財務 | `FINANCIAL_LEDGER.md` | 收入列、成本類別 | 多幣別（USD/MNT） | 待確認收款機制 |
| 稅務／關務 | `core/CROSS_BORDER_GOVERNANCE.md` | — | 蒙古法域 + 接待外國客戶的合規義務 | **跨境前必補** |
| 法務 | `core/CROSS_BORDER_GOVERNANCE.md` | — | 適用法域、DPA、隱私政策 | GDPR 適用性待評估 |
| 資安／IT | `ACCESS_REGISTER.md`、`ENVIRONMENT_REGISTRY.md` | MFA、密鑰 | 身分稽核 | Day 2 後填入 |
| 採購／供應商 | `FINANCIAL_LEDGER.md` | 外包成本 | 子處理者清單 | |
| 營運／交付 | `04_OPERATIONS_AUTOMATION_GUIDE.md`、`core/RELEASE_GATES_CHECKLIST.md` | 排程、Gate | SLO | 首版上線後建立節奏 |
| 行銷／成長 | `sites/scenery-travel-mn/OPS_GROWTH_PLAN.md` | 量測與目標 | 法遵（追蹤、同意） | SEO EN 優先 |
| 產品／數位通路 | `sites/scenery-travel-mn/SYSTEM_REQUIREMENTS.md` | 關鍵流程 | 整合清單 | 詢問表單為核心轉換路徑 |
| 工程 | `03_TOOLS_CONFIGURATION_GUIDE.md` | 工具與環境 | Staging 證據 | |
| 資料／隱私 | `core/CROSS_BORDER_GOVERNANCE.md` | — | 個資角色、跨境傳輸 | **跨境上線前必填** |
| 對外溝通 | `PROFILE.md` | 品牌與語系（EN 主） | 多市場訊息 | Instagram 為目前主要通路 |

## Related

- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- `industry/travel/REGULATORY_AND_OPERATIONAL_REQUIREMENTS.md`
