# Composable AI Commerce OS
## Demand Planning & Forecasting LEGO

> 文件角色：需求預測、補貨、安全庫存、過量/缺貨風險模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把歷史 sales、seasonality、lead time 與 inventory 轉成可執行的 replenishment signal。

# 2. Why This LEGO Exists

Inventory 告訴你現在有多少；Planning 告訴你未來會不會缺。

# 3. Boundary

## Owns

- Forecast
- ForecastVersion
- ReorderSuggestion
- SafetyStockPolicy

## Does Not Own

- Inventory ledger
- PurchaseOrder
- Product content

# 4. Core Dependencies

- Analytics
- Inventory
- Commerce
- Procurement

# 5. Public Capabilities

- Forecast
- Seasonality
- Safety stock
- Reorder point
- Stockout risk
- Overstock
- Aging

# 6. Primary Domain Objects

- Forecast
- ReorderSuggestion
- PlanningPolicy

# 7. Public Service Contract

```text
forecastDemand()
calculateReorderPoint()
suggestPurchase()
detectOverstock()
```

# 8. Events Published

```text
forecast.updated
forecast.stockout_risk
forecast.reorder_suggested
```

# 9. Events Consumed

```text
order.paid
inventory.changed
supplier.eta.changed
```

# 10. Permissions

```text
planning.read
planning.manage
planning.override
```

# 11. AI Tool Surface

```text
explain_forecast()
suggest_reorder()
detect_demand_anomaly()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Commerce history
- External forecasting provider optional

# 13. Primary Workflows

Sales history → forecast → inventory position → reorder suggestion → Procurement approval。

# 14. UX Surfaces

- Forecast chart
- Reorder queue
- Stockout risk
- Overstock

# 15. Data & Integration Rules

- Forecast versioned
- Manual override preserved
- AI suggestion 不直接發 PO

# 16. MVP

- Moving/seasonal forecast
- Reorder suggestion
- Stockout alert

# 17. Explicit Non-Goals for MVP

- Advanced deep-learning forecasting first

# 18. Acceptance Criteria

- Forecast 可 backtest
- suggestion 可解釋 inputs
- Procurement 可接受/拒絕

# 19. Expansion Roadmap

- V1 heuristics
- V2 probabilistic
- V3 multi-echelon

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

缺貨與補貨由可追溯 forecast 推導，而非人工猜測。
