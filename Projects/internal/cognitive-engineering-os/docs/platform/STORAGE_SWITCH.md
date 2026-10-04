# Storage switch: SQLite → PostgreSQL per region (frozen 2026-10-04, before go-live)

Decided by the operator 2026-10-04: a database server before go-live (hundreds to thousands of users, worldwide); data
kept per region (`tenant.data_residency_region`, ai_lego/platform/identity/store.py); the first region is its own
PostgreSQL service, not inside the self-hosted Supabase. The engine speaks plain PostgreSQL only.

## Decisions (closed; change only by a new dated line here)

| # | Decision | Why |
|---|---|---|
| D1 | psycopg 3 (sync) + psycopg_pool, one thin module `ai_lego/data/db.py`; no ORM, no SQLAlchemy Core in the engine | SQL is already hand-written (~132 call sites); fewer layers |
| D2 | Alembic for schema versions, migrations as raw SQL (`op.execute`); the engine refuses to start when the schema is not at head; never auto-migrates in prod | standard, reversible, one ledger |
| D3 | Tests run on a real PostgreSQL only (Docker `postgres:17-alpine` pinned by digest, or `COGNITIVE_OS_TEST_DATABASE_URL`); no SQLite fallback | two dialects = bugs only prod sees |
| D4 | Times are `timestamptz`, microseconds; the API keeps today's ISO-8601 `Z` strings through one helper; order is by sequence, never by time | today's `_now()` has second ties |
| D5 | JSON columns are `jsonb`; ids stay text (uuid strings) | same values the API already returns |
| D6 | Regions: `COGNITIVE_OS_DATABASE_URLS` = `region=dsn,region=dsn`; one small directory (tenant → region, no personal data) is the only cross-region table, in the first region's database | residency per tenant |
| D7 | Blobs (TenantScopedCas, JsonArtifactStore) on disk under a per-region root now; object storage when a second region opens | no new service yet |
| D8 | A `cognitive-db` compose service, own volume, nightly pg_dump into the existing backup path, health check; added only via `scripts/safe-infra-patch.sh` with the operator's go-ahead (High-STOP) | AGENTS.md §0 |

## Invariants the port keeps (each has a test that fails on a naive port)

1. One aggregate's events are totally ordered, no gap, no duplicate: `pg_advisory_xact_lock` on (tenant, aggregate)
   first in `record_log.append`, `UNIQUE (tenant_id, aggregate_id, sequence)` as the backstop.
2. DOC_STALE and DOC_SINGLETON_EXISTS hold across processes: an advisory lock per doc / per (owner, kind) inside the save.
3. Nothing is written to an erased case (`ProjectSourceRepository.require_case`, CASE_ERASED): the check and the erase
   take the same per-(tenant, case) lock in their own transactions (today SQLite's single writer gives this for free).
4. A tenant's rows and blobs live only in its region; erasure removes rows in one region transaction, then blobs.
5. Every SQLite `BEGIN IMMEDIATE` (project_source_repository.py) is replaced by the narrowest lock that gives the same
   guarantee, named in a comment; none becomes "no lock".

## Work split

- W4 (first, new files only, no conflict with step 2): `ai_lego/data/db.py` (pools per region, `transaction(region)`,
  advisory-lock helpers keyed by text, `now()`), Alembic env + baseline migration = today's 20 tables translated per
  D4/D5, the PostgreSQL test fixture (template database, fresh database per test class), the schema-at-head check,
  helper-level tests for invariants 1-2 (two connections racing), pyproject + `scripts/lock-deps.sh` (drop the unused
  test-only `anthropic` in the same run).
- W1 record_log + case_docs + block_hooks locks (invariants 1-3) -- after step 2 is merged on main.
- W2 project_source_repository + custom_workflow_repository + derived_artifact_cache + blocks/govern.py queries.
- W3 identity/store + the region directory (D6).
- Last: the SQLite → PostgreSQL data-move script (row counts + a hash per aggregate, SQLite files kept read-only), the
  compose service (D8), the full suite once.

## Carried in

- gather.origins holds every card's group in one record capped by doc_kinds MAX_JSON_BYTES (64 KiB), so GATHER caps a
  case at MAX_CASE_CARDS = 800. If real cases reach it, store the grouping compactly or as rows -- decide with the
  schema, never by raising the global cap.
