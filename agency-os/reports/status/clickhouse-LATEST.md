# ClickHouse health (EU)

- Generated: 2026-08-16 20:10:01
- Overall: **🟢 PASS**
- Host: 204.168.175.41 / container `trigger-clickhouse`

## Self-telemetry vs application data

| Metric | Value |
|--------|-------|
| system database | 150.95 MiB (3,586,199 rows) |
| trigger_dev (application) | 47.83 MiB (599,903 rows) |
| ratio (system / app) | 3.2x |
| largest system table | text_log:47957806 |
| active merges | 1 |
| max parts in one system table | 17 |
| trace_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |
| asynchronous_metric_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |

## Findings

- No drift. Generation rate and volume are within budget.

## Why this check exists

ClickHouse was fixed four times in four months (2026-04-20 / 04-29 / 07-05 / 08-15).
The first three raised the memory ceiling or deleted accumulated rows; none of them
stopped the generators, so it returned with a different symptom each time (OOM, then
OOM death spiral, then a permanently pegged CPU). This check watches the ratio rather
than any single table, so the next flood is visible even if it comes from somewhere new.

Config SSOT: `lobster-factory/infra/trigger/clickhouse/override.xml`
