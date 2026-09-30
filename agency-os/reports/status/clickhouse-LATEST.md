# ClickHouse health (EU)

- Generated: 2026-09-30 10:19:39
- Overall: **🟢 PASS**
- Host: 145.239.195.47 / container `trigger-clickhouse`

## Self-telemetry vs application data

| Metric | Value |
|--------|-------|
| system database | 45.78 MiB (1,173,403 rows) |
| trigger_dev (application) | 41.64 MiB (442,119 rows) |
| ratio (system / app) | 1.1x |
| largest system table | query_log:20739598 |
| active merges | 0 |
| merges stalled at progress=0 | 0 (expected 0) |
| failed merge tasks last hour | 0 (text_log 0 / part_log 0; expected 0) |
| server-wide MEMORY_LIMIT_EXCEEDED last hour | 0 (not attributed to a source) |
| merge memory budget | 1.00 GiB |
| max parts in one system partition | 6 |
| max parts in one trigger_dev partition | 4 (raw_task_runs_payload_v1) |
| widest system log table | query_log (84 columns) |
| retired generators present | 0 (expected 0) |
| system tables missing TTL | 0 |
| orphaned renamed tables (_<N> suffix) | 0 |
| MergeTree tables seen this run | 12 |

## Findings

- No drift. Generation rate and volume are within budget.

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
