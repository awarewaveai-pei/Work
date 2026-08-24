# ClickHouse health (EU)

- Generated: 2026-08-25 04:08:35
- Overall: **🟡 WARN**
- Host: 204.168.175.41 / container `trigger-clickhouse`

## Self-telemetry vs application data

| Metric | Value |
|--------|-------|
| system database | 212.33 MiB (3,501,951 rows) |
| trigger_dev (application) | 37.88 MiB (400,361 rows) |
| ratio (system / app) | 5.6x |
| largest system table | text_log:181972761 |
| active merges | 0 |
| merges stalled at progress=0 | 0 (expected 0) |
| failed merge tasks last hour | 0 (text_log 0 / part_log 0; expected 0) |
| server-wide MEMORY_LIMIT_EXCEEDED last hour | 0 (not attributed to a source) |
| merge memory budget | 1.00 GiB |
| max parts in one system partition | 8 |
| max parts in one trigger_dev partition | 4 (raw_task_runs_payload_v1) |
| widest system log table | query_log (84 columns) |
| retired generators present | 0 (expected 0) |
| system tables missing TTL | 0 |
| orphaned renamed tables (_<N> suffix) | 0 |
| MergeTree tables seen this run | 12 |

## Findings

- self-telemetry is 5.6x the application data (warn at 5x)

## Why this check exists

ClickHouse was fixed five times in five months (2026-04-20 / 04-29 / 07-05 / 08-15 / 08-25).
The first three raised the memory ceiling or deleted accumulated rows; none of them
stopped the generators, so it returned with a different symptom each time (OOM, then
OOM death spiral, then a permanently pegged CPU). 08-15 stopped the biggest generators.
08-25 was different again: merges of a 1,344-column table could not fit the memory cap,
so they aborted and retried forever - and because the parts were never consumed, VOLUME
STAYED LOW and every volume-based threshold here stayed green through a three-day outage.
So this check now watches the mechanism (merge failures, stalled merges, part backlog,
table width, memory budget in force) as well as the outcome (ratio, bytes).

Config SSOT: `lobster-factory/infra/trigger/clickhouse/override.xml`
