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
| D8 | A separate `cognitive-db` compose service, own volume, nightly host-side pg_dump, health check. Card 02's files are in isolated `refs/codex/work` (`842ab3941`), not this branch; current `safe-infra-patch.sh compose` operates the main compose and cannot install that separate project. A governed installer and operator approval are required (High-STOP). | AGENTS.md §0; `agency-os/handoffs/cos-codex-queue/cards/02-cognitive-db-ops.md` |

## Invariants the port keeps (each has a test that fails on a naive port)

1. One aggregate's events are totally ordered, no gap, no duplicate: `pg_advisory_xact_lock` on (tenant, aggregate)
   first in `record_log.append`, `UNIQUE (tenant_id, aggregate_id, sequence)` as the backstop.
2. DOC_STALE and DOC_SINGLETON_EXISTS hold across processes: an advisory lock per doc / per (owner, kind) inside the save.
3. Nothing is written to an erased case (`ProjectSourceRepository.require_case`, CASE_ERASED): the check and the erase
   take the same per-(tenant, case) lock in their own transactions (today SQLite's single writer gives this for free).
4. A tenant's rows and blobs live only in its region. Erasure must never remove a blob while its row can still roll back; **blocked** by the fault below.
5. Every SQLite `BEGIN IMMEDIATE` (project_source_repository.py) is replaced by the narrowest lock that gives the same
   guarantee, named in a comment; none becomes "no lock".

## Work split

- W4 (first, new files only, no conflict with step 2): `ai_lego/data/db.py` (pools per region, `transaction(region)`,
  advisory-lock helpers keyed by text, `now()`), Alembic env + baseline migration = today's 20 tables translated per
  D4/D5, the PostgreSQL test fixture (template database, fresh database per test class), the schema-at-head check,
  helper-level tests for invariants 1-2 (two connections racing), pyproject + `scripts/lock-deps.sh` (drop the unused
  test-only `anthropic` in the same run).
- W1 record_log + case_docs + block_hooks locks (invariants 1-3) -- after step 2 is merged on main. Built 2026-10-04.
- W2 project_source_repository + custom_workflow_repository + derived_artifact_cache + blocks/govern.py queries. Built 2026-10-04.
- W3 identity/store + the region directory (D6). Built 2026-10-04.
- Last: the SQLite → PostgreSQL data-move script (row counts + a hash per aggregate, SQLite files kept read-only), the
  compose service (D8), the full suite once.

## Built (W1-W3, 2026-10-04)

The engine reads and writes PostgreSQL only; no SQLite path, file or fallback is left in `ai_lego` or the tests
(`tests/unit/test_pg_foundation.py::test_the_engine_holds_no_sqlite_schema_any_more`).

| Piece | Where |
|---|---|
| Row type, jsonb and timestamptz adapters, shared and session advisory locks, tenant directory, rehearsal | `ai_lego/data/db.py` (its docstring holds the conventions, the one copy) |
| Migrations: 0002 `tenant_directory`, 0003 `write_order` on events and workspace | `ai_lego/data/migrations/versions/` |
| The SQLite schema the engine kept, frozen for the baseline comparison and the data move | `ai_lego/data/migrations/sqlite_schema_2026_10_04.sql` |
| record_log, case_docs, project_source_repository, custom_workflow_repository, derived_artifact_cache, identity store, GOVERN's queries | ported in place, each call `Databases.for_tenant` |
| API wiring: one process-wide `Databases` (`main.get_databases`, schema-at-head checked per region on first use); every store and repository dependency takes it | `ai_lego/apps/api/main.py` |
| Command lines: `bootstrap_phase1_tenant`, `bootstrap_service_identity` read `COGNITIVE_OS_DATABASE_URLS`; `--region` (default: the first region) replaces `--db-path` | `ai_lego/apps/cli/` |
| The integrity check's real-save checks run in a rehearsal on the configured database: one transaction, always rolled back | `ai_lego/platform/integrity.py` (`_rehearsal`) |
| Tests: one database per class from the migrated template; `add_tenant`, `empty_tables`, `dump`, `as_url` | `tests/pg.py` |

### SQLite-isms and what they became

| SQLite | PostgreSQL | Where it mattered |
|---|---|---|
| `?` placeholders | `%s`; a literal `%` in a query with parameters is `%%` | every call site; `last_activity`'s `LIKE 'project:%%'` |
| `sqlite3.Row` | `db.Row` (name, position, `dict(row)`) via the pool's row factory | every reader, unchanged |
| JSON text + `json.loads` / `json.dumps` | `jsonb`; written `Jsonb(value)`, read as the value, object keys sorted | every `*_json` column; the report compare-and-swap compares jsonb values, not text |
| `json_extract(payload_json, '$.k')` | `payload_json->>'k'`; nested `payload_json->'content'->>%s` | case_docs, interpretation/synthesis/tombstone readers, from_case erasure, GOVERN versions |
| TEXT times (`...Z`, seconds) | `timestamptz`, read back as `db.iso()` text (`...ffffffZ`) | every `*_at` column except `prov_sources.published_at` |
| `ORDER BY rowid` | `ORDER BY write_order` (identity, migration 0003) | a person's or a case's records across aggregates (GOVERN export), doc lists, analyses/tasks/reruns, tombstones newest first, workspaces |
| `INTEGER PRIMARY KEY AUTOINCREMENT` + `cursor.lastrowid` | identity + `RETURNING id`; an id is per region, so `settle_ai_usage(tenant_id, usage_id, ...)` | ai_usage, entitlement_audit |
| bare column beside `MAX()` in a GROUP BY | `(array_agg(model ORDER BY id DESC))[1]` | `ai_usage_recent` |
| `LIKE` (folds ASCII) | `ILIKE` for the person's search; fixed lowercase prefixes keep `LIKE` | `search_active_sources` |
| `INSERT OR ...` / `ON CONFLICT(...)` | `ON CONFLICT (key) DO UPDATE` (the one upsert: derived cache) | derived_artifact_cache |
| `sqlite3.IntegrityError` | `psycopg.errors.UniqueViolation` (a name taken: 409) | create/rename project, custom workflow create |
| `BEGIN IMMEDIATE` | the narrowest advisory lock, below | case writes, blob writes, AI budget |
| `PRAGMA foreign_keys/secure_delete`, `ALTER TABLE ADD COLUMN` on open, table rebuilds | foreign keys are the schema's; migrations are Alembic's; see "Erasure and the bytes on disk" | all repositories |
| one file per store (`identity`, `projects`, `custom_workflows`) | one database per region; the two `events` tables are one | `CustomWorkflowRepository.delete_person` deletes its workflows' aggregates only; GOVERN erases workflows before the person's other records |

## Locks

| Lock (first part of the name, then) | Taken by | Mode | Guards |
|---|---|---|---|
| `events`, tenant, aggregate (`record_log.lock_aggregate`) | `record_log.append`, first; `CaseDocs.save` (a next version) and `delete` before reading the document's history | xact, exclusive | invariant 1 (MAX(sequence)+1 never races; UNIQUE is the backstop); invariant 2 DOC_STALE |
| `doc-singleton`, tenant, owner kind, owner id, kind | `CaseDocs.save` of a new document of a one-per-owner kind, before `_live_ids` | xact, exclusive | invariant 2 DOC_SINGLETON_EXISTS |
| `case`, tenant, case (`db.owner_lock` via `ProjectSourceRepository.lock_case`) | every case writer, first in its transaction (`require_case`, `_content_write`, rename, report CAS); a person's `from_case` record (save: after its own checks -- an events row has no foreign key to the case, so it cannot hold the row the erase deletes; delete: before it writes); `erase_project`; `CaseDocs.save_many` with a `check` | xact; writers **shared**; the erase and a checked batch **exclusive** | invariant 3: writers do not wait for each other; an exclusive holder waits for the writes in flight only; a write after the erase gets CASE_ERASED; nothing a batch's check read changes before its writes (was SQLite's file write lock) |
| `source-blobs`, tenant | `add_source`, `supersede`, `ingest_batch` (after the case lock); `collect_unreferenced_blobs` and `erase_project` | xact; writes shared, garbage collection exclusive | the blob lifecycle rule (no blob of an uncommitted row is collected) -- was BEGIN IMMEDIATE |
| `ai-usage`, tenant | `reserve_ai_usage` | xact, exclusive | the budget check and the reservation are one step across processes -- was BEGIN IMMEDIATE |
| `case-hooks`, tenant, case (`CaseDocs.hooks_lock`) | `block_hooks._run_after_sources`, the whole run | session (a pooled connection held for it), exclusive | one after-sources run per case across processes -- was an in-process `threading.Lock`; its own name, so the erase never waits for a hook |

Order everywhere: case, then source-blobs, then events (an aggregate); a batch locks the documents it names in sorted
order before any write. `db.owner_lock(connection, kind, tenant, id, exclusive=)` is the scheme to reuse for a group
(STEP34_SHARED_RULES.md: a per-(tenant, group) lock, shared for writers, exclusive for the erase): one name for both
modes, the existence check under it. Alembic revisions 0002 and 0003 are taken here, so the groups' migration is 0004
(`down_revision = "0003"`), not the `0002_groups.py` STEP34 names. The file run locks (`workflow/run_lock.py`: recipe
runs, interpretations, syntheses, and the erase's synthesis lock) stay OS file locks: they guard journals and runners on
the API host and work across its processes; a write they let through still meets the database locks above.

## Regions

- `Databases.region_of(tenant_id)` is the one tenant -> region read: `tenant_directory` in the first region of
  `COGNITIVE_OS_DATABASE_URLS` (reordering that list moves the directory). `for_tenant` refuses a tenant the directory
  does not hold (`TENANT_REGION_UNKNOWN`); reads that answered "nothing" for an unknown tenant still do
  (`get_tenant`, `list_workspaces`, `get_workspace`, login), and an unknown tenant's denied entitlement check is audited
  in the first region.
- `create_tenant` writes the tenant row in its region and the directory line in the first region, the directory's
  transaction committing last; `data_residency_region` must be configured (`DB_REGION_UNKNOWN`, nothing written).
  Cross-region commits are not atomic: a directory commit failure can leave an unrouteable home row. Retrying the same
  create adopts that row only when all supplied values match; a conflicting orphan is refused. A second live region
  still requires D7 and an operator-owned recovery procedure for abandoned creates.
- A credential that names no tenant (session token, handoff code, reset token, grant reference or token, identity id) is
  looked up region by region: the random value, or its hash, is in at most one.
- There is no tenant deletion yet (no route). When there is, the directory line goes last, with the tenant.

## Behaviour that changed

- Times read from the database are `...T..:..:..ffffffZ` (six digits); a record a caller built keeps the text it was
  given until it is stored. `create_project`, `add_source`, `supersede`, `create_collection_run` and the custom
  workflow `create` now return the row as stored (`RETURNING`), so a create and the next read agree. Store-made times
  (`create_tenant`, sessions, codes, grants, usage) carry microseconds.
- An interpretation's, synthesis's or report's record carries its row's `created_at` as `occurred_at`
  (`record_log.append(at=)`): the two used to agree only to the second, by luck.
- The person's source search folds case for every letter the database locale knows (SQLite folded ASCII only).
- JSON read back has its object keys sorted (as canonical_json wrote them); jsonb's own order is never seen.
- Unchanged on purpose: the account export lists a workflow's records with the workflows, not among the person's other
  records, and the erase's `records` count leaves them out -- as when they were two files (one events table now).
- Not built: D7's per-region blob root. Source, artifact and journal files stay under one `.runtime` root. Production
  `Databases.from_env` refuses more than one configured region (`DB_MULTI_REGION_BLOBS_NOT_READY`) before opening pools;
  the two-region database test constructs `Databases` directly. Remove this guard only after all file roots route by
  tenant -> region and a real multi-region residency test covers them.
- On this Windows laptop Python 3.12's clock ticks every 15.6 ms: rows written in one tick share a time, which is why
  nothing orders by time to tell rows apart (write_order, sequence).
- Text ordering (`ORDER BY name`, `ORDER BY kind`) follows the database collation. The pinned `postgres:17-alpine` (musl)
  orders by bytes, as SQLite did; D8 must use the same image, or create the database with `LC_COLLATE=C`.

## Erasure and the bytes on disk (open decision)

### Merge blocker: erasure across DB and filesystem

The current `erase_case` deletes run artifacts/journals and AI artifacts before the DB erase (`ai_lego/apps/api/main.py:2808-2811`). The repository then unlinks Source CAS inside the DB transaction, before the tombstone append and commit (`ai_lego/data/repositories/project_source_repository.py:750-769`). Fault injection of `record_log.append` on a disposable PostgreSQL database returned `row_survives=True blob_survives=False`: the row rolled back but its content was gone. `close_collect_grants_for_project` is also a separate transaction before the erase. This violates invariant 4; W1-W3 must not merge to main or serve people as-is.

Required repair boundary: one durable, idempotent erasure workflow covering DB rows, Source CAS, AI artifacts, run journals and grants. DB commit must precede irreversible file deletion; a committed-but-unfinished cleanup must be discoverable and retryable after process crash. The tombstone/API must not claim physical completion until cleanup succeeds. Test failures before DB commit, after commit, during each unlink, and during retry; preserve shared Source blobs. Do not replace this with a post-commit best-effort call that can strand personal files.

### Physical retention decision

SQLite ran with `secure_delete = ON`: an erased row was overwritten in the file (plan D10). PostgreSQL has no such
switch. A deleted row's bytes stay in its data file until VACUUM prunes the page (probe 2026-10-04 with pageinspect on the
pinned image: present after DELETE, gone from the page after VACUUM), and they stay in the WAL until it is recycled and in
every nightly dump (D8) until that dump expires. The tests now prove the region's every row no longer holds what was
erased (`tests/pg.py::dump`); they no longer prove the bytes on disk. Options for the operator: VACUUM the touched tables
after an erasure (cost on large tables, still not WAL or dumps), a dump retention that bounds how long erased data lives,
or per-tenant/per-person encryption keys destroyed on erasure. Until decided, an erasure is complete for every reader of
the database and not for its files.

## Data move (requirements; the script is later)

- Source: the three SQLite files at the a76af28da shape (the frozen schema). A file not at that shape is first opened
  once by the engine at a76af28da, whose on-open migrations bring it there (owners derived for old rows, the per-person
  name key, added columns, deadline_at, ai_usage.status) -- never re-implemented in the move. The files are opened
  read-only and kept.
- Columns by name, never by position. `events` of `projects.sqlite3` and `custom_workflows.sqlite3` go into one table
  (aggregate prefixes `project:`, `source:`, `doc:`, `custom_workflow:` do not collide); a row with no owner stops the move.
- Times: parse each `...Z` text to `timestamptz` (second-precision values become `.000000`); `published_at` stays text.
  JSON: parse each `*_json` text into jsonb (hashes are of values, never the stored text).
- Rows go in each SQLite table's rowid order: `write_order` numbers them (never copied in). `ai_usage.id` and
  `entitlement_audit.id` are copied, then each identity sequence is `setval` past the largest id.
- `tenant_directory`: one line per tenant, its `data_residency_region` mapped to a configured region (today every
  tenant says `local-dev`: map it to the first region, or decide otherwise before the move).
- Blobs (D7) are copied per tenant under the region's root; `derived_artifact_cache` moves with its index rows.
- Proof: row counts per table, and per aggregate a hash of its events (sequence, type, canonical JSON of the payload)
  computed on both sides; the move fails on any difference.

## Carried in

- gather.origins holds every card's group in one record capped by doc_kinds MAX_JSON_BYTES (64 KiB), so GATHER caps a
  case at MAX_CASE_CARDS = 800. If real cases reach it, store the grouping compactly or as rows -- decide with the
  schema, never by raising the global cap.
