# ClickHouse health (EU)

- Generated: 2026-08-24 18:50:41
- Overall: **🟡 WARN**
- Host: 204.168.175.41 / container `trigger-clickhouse`

## Self-telemetry vs application data

| Metric | Value |
|--------|-------|
| system database | 383.83 MiB (4,258,697 rows) |
| trigger_dev (application) | 37.83 MiB (399,051 rows) |
| ratio (system / app) | 10.1x |
| largest system table | text_log:245140405 |
| active merges | 1 |
| max parts in one system table | 79 |
| trace_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |
| asynchronous_metric_log rows last hour | 0 (expected 0 - disabled 2026-08-15) |
| system tables missing TTL | 3 (opentelemetry_span_log,part_log,query_views_log) |
| orphaned renamed tables (_<N> suffix) | 3 |
| MergeTree tables seen this run | 14 |

## Findings

- 3 system table(s) have no TTL and will grow unbounded: opentelemetry_span_log,part_log,query_views_log
- 3 orphaned renamed system table(s) (_<N> suffix, any generation) left behind by a past rename-and-recreate cycle - safe to DROP after confirming the active table has the correct TTL
- self-telemetry is 10.1x the application data (warn at 5x)

## Why this check exists

ClickHouse was fixed four times in four months (2026-04-20 / 04-29 / 07-05 / 08-15).
The first three raised the memory ceiling or deleted accumulated rows; none of them
stopped the generators, so it returned with a different symptom each time (OOM, then
OOM death spiral, then a permanently pegged CPU). This check watches the ratio rather
than any single table, so the next flood is visible even if it comes from somewhere new.

Config SSOT: `lobster-factory/infra/trigger/clickhouse/override.xml`
