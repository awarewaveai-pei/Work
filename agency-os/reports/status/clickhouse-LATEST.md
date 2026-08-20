# ClickHouse health (EU)

- Generated: 2026-08-20 15:12:48
- Overall: **🟡 WARN**
- Host: 204.168.175.41 / container `trigger-clickhouse`

## Self-telemetry vs application data

| Metric | Value |
|--------|-------|
| system database | 221.19 MiB (3,453,089 rows) |
| trigger_dev (application) | 42.72 MiB (498,084 rows) |
| ratio (system / app) | 5.2x |
| largest system table | text_log:168569295 |
| active merges | 0 |
| max parts in one system table | 11 |
| trace_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |
| asynchronous_metric_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |
| system tables missing TTL | 0 |
| orphaned renamed tables (_<N> suffix) | 0 |
| MergeTree tables seen this run | 11 |

## Findings

- self-telemetry is 5.2x the application data (warn at 5x)

## Why this check exists

ClickHouse was fixed four times in four months (2026-04-20 / 04-29 / 07-05 / 08-15).
The first three raised the memory ceiling or deleted accumulated rows; none of them
stopped the generators, so it returned with a different symptom each time (OOM, then
OOM death spiral, then a permanently pegged CPU). This check watches the ratio rather
than any single table, so the next flood is visible even if it comes from somewhere new.

Config SSOT: `lobster-factory/infra/trigger/clickhouse/override.xml`
