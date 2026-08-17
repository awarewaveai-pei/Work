# ClickHouse health (EU)

- Generated: 2026-08-17 15:36:18
- Overall: **🟢 PASS**
- Host: 204.168.175.41 / container `trigger-clickhouse`

## Self-telemetry vs application data

| Metric | Value |
|--------|-------|
| system database | 184.35 MiB (3,750,211 rows) |
| trigger_dev (application) | 46.52 MiB (573,993 rows) |
| ratio (system / app) | 4x |
| largest system table | text_log:74734318 |
| active merges | 0 |
| max parts in one system table | 9 |
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
