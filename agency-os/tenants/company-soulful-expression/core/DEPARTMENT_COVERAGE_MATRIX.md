# Department coverage matrix — Soulful Expression Art Therapy

> 正本結構見 `tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md`；本檔為 **本租戶實例**，可在此加附註，勿複製長政策全文。

## 本租戶套用狀態

- **規模假設**：成長型（既有 production 站 + **規劃跨國**）；療癒產業 overlay 已於 `industry/therapy/`。
- **優先補齊**：`ENVIRONMENT_REGISTRY.md`（staging 建立後為唯一變更入口）、`ACCESS_REGISTER.md`、本檔下列 Notes、`CROSS_BORDER_GOVERNANCE.md`（跨境前必補）。

## 矩陣（部門簇 → 主檔 → 必／建議）

| 部門簇（常見 17–20 部門歸桶） | 主檔（tenant 內） | 必（所有付費客戶） | 建議（跨國／多法人／強合規） | Notes |
|------------------------------|-------------------|-------------------|------------------------------|--------|
| 董事／策略／治理 | `PROFILE.md` | 商業目標、Out of Scope、風險標記 | 決策窗口、升級路徑 | 聯絡人／付款方式仍 **待補** |
| 財務／管理會計 | `FINANCIAL_LEDGER.md` | 收入列、成本類別、毛利 | 多幣別、付款條件、發票抬頭（不含稅務法律意見） | Billing baseline **待補** |
| 稅務／關務（資訊橋） | `core/CROSS_BORDER_GOVERNANCE.md` | — | 課稅地、申報責任、外部顧問狀態 | 跨國前 **必** 補；現階段台灣為主 |
| 法務／合規 | `core/CROSS_BORDER_GOVERNANCE.md` | — | 適用法域、DPA 狀態、外部審閱 | 療癒行銷／健康宣稱需對齊法遵 |
| 資安／IT／身分 | `ACCESS_REGISTER.md`、`core/ENVIRONMENT_REGISTRY.md` | MFA、密鑰位置、輪替、環境 URL | 身分供應商、稽核證據路徑 | Hostinger / WP admin **待盤點** |
| 採購／供應商／外包 | `core/CROSS_BORDER_GOVERNANCE.md`、`FINANCIAL_LEDGER.md` | 外包成本列帳 | 子處理者清單、主約與附件索引 | 見 `docs/operations/outsourcing-vendor-scorecard.md` |
| 人資（交付觸及時） | `PROFILE.md`、專案 `10_DISCOVERY.md` | 利害關係人 | 培訓／權限交接責任 | 不存個資原文 |
| 營運／客服／交付 | `04_OPERATIONS_AUTOMATION_GUIDE.md`、`core/RELEASE_GATES_CHECKLIST.md` | 排程、放行 gate | SLO、值班與升級 | 對齊 `WORDPRESS_CLIENT_DELIVERY_MODELS.md` |
| 行銷／成長 | `sites/*/OPS_GROWTH_PLAN.md`（若已建） | 量測與目標 | 法遵（追蹤、同意）與 `industry/*` | 站級檔案待建立時先記於專案 brief |
| 產品／數位通路 | `sites/*/SYSTEM_REQUIREMENTS.md`、專案 brief | 關鍵流程 | 整合清單、API 責任邊界 | `2026-011` brief |
| 工程／開發／基礎建設 | `03_TOOLS_CONFIGURATION_GUIDE.md`、SOP Step 7 | 工具與環境 | Staging 為真相、變更證據 | `ENVIRONMENT_REGISTRY` evidence path 已指 `reports/e2e/` |
| 資料／隱私／留存 | `core/CROSS_BORDER_GOVERNANCE.md`、`ACCESS_REGISTER.md` | — | 個資角色、留存、跨境傳輸機制 | 跨境上線前 **必** 填 |
| 風險／資安事件 | `PROFILE.md`、`ACCESS_REGISTER.md` | 風險標記 | 事件通報鏈、證據保存 | `合規風險：中` |
| 對外溝通／品牌 | `PROFILE.md` | 品牌與語系 | 多市場訊息責任 | production: `soulfulexpression.org` |
| 投資人關係／IR | `PROFILE.md` | — | `N/A` 或窗口索引 | **N/A —** 目前規模不适用 |

## Related (repo SSOT)

- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- `docs/operations/outsourcing-vendor-scorecard.md`
- `docs/operations/security-secrets-policy.md`
