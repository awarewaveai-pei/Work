# Composable AI Commerce OS
## Analytics & Data Platform LEGO

> 文件角色：Metrics、Data Contracts、Warehouse/Lakehouse、BI 與 Executive Analytics 模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

建立全公司一致的 metrics 與事件資料層，避免 CRM、Commerce、Finance 各自算不同 Revenue。

# 2. Why This LEGO Exists

沒有統一 data contract，Executive AI 只會把錯誤數據回答得更自信。

# 3. Boundary

## Owns

- MetricDefinition
- SemanticModel
- DataContract
- AnalyticsEvent schema
- DataQualityIssue

## Does Not Own

- Operational source records
- Module domain state

# 4. Core Dependencies

- Events
- Audit
- Organization
- Data Governance

# 5. Public Capabilities

- Operational metrics
- Semantic metrics
- Warehouse feed
- Data quality
- Attribution data
- Dashboards

# 6. Primary Domain Objects

- Metric
- Dimension
- DataContract
- DataQualityCheck
- Snapshot

# 7. Public Service Contract

```text
getMetric()
queryMetrics()
registerDataContract()
runDataQualityChecks()
publishDataset()
```

# 8. Events Published

```text
data.quality.failed
metric.anomaly.detected
dataset.updated
```

# 9. Events Consumed

```text
* domain events via analytics pipeline
```

# 10. Permissions

```text
analytics.read
analytics.export
metric.manage
data_quality.manage
```

# 11. AI Tool Surface

```text
query_metrics()
explain_metric_change()
detect_anomaly()
build_executive_summary()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- BI tools
- Warehouse/lakehouse
- Ad platforms
- Web analytics

# 13. Primary Workflows

1. Domain events → analytics ingestion。
2. Contract validation。
3. Semantic metrics。
4. Dashboard / AI queries。

# 14. UX Surfaces

- Executive dashboard
- Metric explorer
- Data quality
- Attribution
- Anomalies

# 15. Data & Integration Rules

- Metric definitions versioned
- Operational DB 不直接當 BI warehouse 長期方案
- PII classification

# 16. MVP

- PostgreSQL metrics
- Core KPI dashboard
- Data contracts
- Basic anomaly

# 17. Explicit Non-Goals for MVP

- Huge lakehouse first
- 100 dashboards

# 18. Acceptance Criteria

- Revenue 只有一個正式定義
- Dashboard 與 AI 使用同一 metric layer
- schema break 可被偵測

# 19. Expansion Roadmap

- V1 operational analytics
- V2 warehouse
- V3 semantic AI BI

# 20. LEGO Test

這個模組完成前必須通過：

1. **Remove Test** — 停用本模組後，Core 與其他模組仍可啟動。
2. **Replace Test** — 外部 Provider 可替換，不需修改本模組 Domain。
3. **Boundary Test** — 不可直接讀寫其他模組擁有的資料表。
4. **Event Test** — 跨模組 side effects 透過 public service 或 event 發生。
5. **Tenant Test** — 所有資料都必須 organization scoped。
6. **Audit Test** — 敏感 write action 都可追蹤。
7. **Contract Test** — 對外 contract 有自動化測試。

# 21. Definition of Done

所有重要 KPI 有唯一定義、來源與品質檢查。
