# Department coverage matrix — P1 Pilot（內部實跑）

> 本 tenant 用於 **P1 證據鏈／drill**；營運上視為 SMB。正本結構見 `tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md`。

## 本租戶套用狀態

- **規模**：內部 drill；多數「企業／跨境」列為 **N/A** 或最小填。
- **主檔**：`PROFILE.md`、`ACCESS_REGISTER.md`、`core/*` 對齊 onboarding 以便 health／演練。

## 矩陣（精簡勾選）

| 部門簇 | 主檔 | Notes |
|--------|------|--------|
| 策略／財務／營運／工程 | `PROFILE.md`、`FINANCIAL_LEDGER.md`、`03_TOOLS`、`04_OPERATIONS`、`core/*` | 依 drill 需求最小填 |
| 跨境／稅務／法遵／大面積子處理者 | `CROSS_BORDER_GOVERNANCE.md` | **N/A —** 內部 drill，不涉及真實客戶跨境 |
| IR | `PROFILE.md` | **N/A —** |

## M3 控制台設定（2026-05-13）

要在 Ops Console 顯示部門覆蓋率，請在 Supabase `organizations.metadata.client_config` 填入：

```json
{
  "department_selection": ["CLU_STRATEGY_GOVERN","CLU_FINANCE","CLU_SECURITY_IT","CLU_ENGINEERING","CLU_ORDER_OPS"],
  "department_selection_reviewed_at": "2026-05-13"
}
```

> P1 Pilot 為內部實跑用途，採 SMB 最小集合（5/20）。  
> M3 API：`GET /api/ops/clients/company-p1-pilot/department-summary`

## Related

- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
