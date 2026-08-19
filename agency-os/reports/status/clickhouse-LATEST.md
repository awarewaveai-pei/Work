# ClickHouse health (EU)

- Generated: 2026-08-19 12:20:06
- Overall: **🟡 WARN**
- Host: 204.168.175.41 / container `trigger-clickhouse`

## Self-telemetry vs application data

| Metric | Value |
|--------|-------|
| system database | 323.70 MiB (4,339,302 rows) |
| trigger_dev (application) | 44.01 MiB (522,989 rows) |
| ratio (system / app) | 7.4x |
| largest system table | text_log:169484198 |
| active merges | 3 |
| max parts in one system table | 61 |
| trace_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |
| asynchronous_metric_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |

## Findings

- self-telemetry is 7.4x the application data (warn at 5x)

## Why this check exists

ClickHouse was fixed four times in four months (2026-04-20 / 04-29 / 07-05 / 08-15).
The first three raised the memory ceiling or deleted accumulated rows; none of them
stopped the generators, so it returned with a different symptom each time (OOM, then
OOM death spiral, then a permanently pegged CPU). This check watches the ratio rather
than any single table, so the next flood is visible even if it comes from somewhere new.

Config SSOT: `lobster-factory/infra/trigger/clickhouse/override.xml`
