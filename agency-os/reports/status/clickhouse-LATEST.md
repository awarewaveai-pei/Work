# ClickHouse health (EU)

- Generated: 2026-08-18 11:18:49
- Overall: **🟡 WARN**
- Host: 204.168.175.41 / container `trigger-clickhouse`

## Self-telemetry vs application data

| Metric | Value |
|--------|-------|
| system database | 245.63 MiB (4,005,282 rows) |
| trigger_dev (application) | 45.27 MiB (548,065 rows) |
| ratio (system / app) | 5.4x |
| largest system table | text_log:115597240 |
| active merges | 2 |
| max parts in one system table | 45 |
| trace_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |
| asynchronous_metric_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |

## Findings

- self-telemetry is 5.4x the application data (warn at 5x)

## Why this check exists

ClickHouse was fixed four times in four months (2026-04-20 / 04-29 / 07-05 / 08-15).
The first three raised the memory ceiling or deleted accumulated rows; none of them
stopped the generators, so it returned with a different symptom each time (OOM, then
OOM death spiral, then a permanently pegged CPU). This check watches the ratio rather
than any single table, so the next flood is visible even if it comes from somewhere new.

Config SSOT: `lobster-factory/infra/trigger/clickhouse/override.xml`
