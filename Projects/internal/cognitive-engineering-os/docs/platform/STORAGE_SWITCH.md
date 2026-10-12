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
| D8 | A separate `cognitive-db` compose service, own volume, nightly host-side pg_dump, health check. Built 2026-10-10 in `ops/cognitive-db/` (compose, backup, restore, `restore-live-cognitive-db.sh`, and `install-cognitive-db.sh` = the governed installer; `safe-infra-patch.sh compose` operates the main compose and cannot install a separate project). Applying it is High-STOP, operator approval: `docs/platform/GO_LIVE.md`. | AGENTS.md §0; `agency-os/handoffs/cos-codex-queue/cards/02-cognitive-db-ops.md` |

## Invariants the port keeps (each has a test that fails on a naive port)

1. One aggregate's events are totally ordered, no gap, no duplicate: `pg_advisory_xact_lock` on (tenant, aggregate)
   first in `record_log.append`, `UNIQUE (tenant_id, aggregate_id, sequence)` as the backstop.
2. DOC_STALE and DOC_SINGLETON_EXISTS hold across processes: an advisory lock per doc / per (owner, kind) inside the save.
3. Nothing is written to an erased case (`ProjectSourceRepository.require_case`, CASE_ERASED): the check and the erase
   take the same per-(tenant, case) lock in their own transactions (today SQLite's single writer gives this for free).
4. A tenant's rows and blobs live only in its region. Erasure never removes a file while the decision it depends on can still roll
   back, and a committed erasure can always be finished ("Erasure across the database and the files", built 2026-10-08).
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
  compose service (D8), the full suite once. Script, installer and deploy path built 2026-10-10, not applied anywhere:
  `docs/platform/GO_LIVE.md` holds the ordered steps.

## Built (W1-W3, 2026-10-04)

The engine reads and writes PostgreSQL only; no SQLite path, file or fallback is left in `ai_lego` or the tests
(`tests/unit/test_pg_foundation.py::test_the_engine_holds_no_sqlite_schema_any_more`).

| Piece | Where |
|---|---|
| Row type, jsonb and timestamptz adapters, shared and session advisory locks, tenant directory, rehearsal | `ai_lego/data/db.py` (its docstring holds the conventions, the one copy) |
| Migrations: 0002 `tenant_directory`, 0003 `write_order` on events and workspace, 0004 `erasure_jobs` + `erasure_items` (the erasure outbox) | `ai_lego/data/migrations/versions/` |
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
| `events`, tenant, aggregate (`record_log.lock_aggregate`) | `record_log.append`, first; `CaseDocs.save` (a next version), `delete` and `record_read` (EXPRESS's DocRead: the version read is the version recorded) before reading the document's history | xact, exclusive | invariant 1 (MAX(sequence)+1 never races; UNIQUE is the backstop); invariant 2 DOC_STALE |
| `doc-singleton`, tenant, owner kind, owner id, kind | `CaseDocs.save` of a new document of a one-per-owner kind, before `_live_ids` | xact, exclusive | invariant 2 DOC_SINGLETON_EXISTS |
| `case`, tenant, case (`db.owner_lock` via `ProjectSourceRepository.lock_case`) | every case writer, first in its transaction (`require_case`, `_content_write`, rename, report CAS); a person's `from_case` record (save: after its own checks -- an events row has no foreign key to the case, so it cannot hold the row the erase deletes; delete: before it writes); the erasure's decision (`erase_case_rows`); `CaseDocs.save_many` with a `check`, `CaseDocs.delete` with a `then` (block_hooks ON_DELETE) | xact; writers **shared**; the erase, a checked batch and a delete with a `then` **exclusive** | invariant 3: writers do not wait for each other; an exclusive holder waits for the writes in flight only; a write after the erase gets CASE_ERASED; nothing a batch's check read changes before its writes (was SQLite's file write lock) |
| `group`, tenant, group (`db.owner_lock` via `ProjectSourceRepository.lock_group`) | every writer of a group's records, first (`require_group`, from `CaseDocs.save`/`save_many`/`delete`; a person writing also takes their person lock and holds their membership row FOR SHARE), leave, hand over: shared; close and erase (`_owned_group`): exclusive | xact | G1-G4 (STEP34_SHARED_RULES.md §2): nothing is written to an erased group (GROUP_ERASED) or new to a closed one (GROUP_CLOSED), nothing by someone who left; leaving and the account erasure lock the conveners' rows FOR UPDATE in (group, identity) order, so the last convener never goes (G5) |
| `source-blobs`, tenant | `add_source`, `supersede`, `ingest_batch` (after the case lock); `collect_unreferenced_blobs`, the erasure's decision (`unreferenced_blobs`) and each blob item of its cleanup (`blob_referenced`) | xact; writes shared, garbage collection exclusive | the blob lifecycle rule (no blob of an uncommitted row is collected; a blob a committed row names is never removed) -- was BEGIN IMMEDIATE |
| `person`, tenant, identity (`record_log.require_person`) | every person-owned record (`record_log.append`, and first in `CaseDocs.save`/`save_many`/`delete` of a person's documents, custom workflow create/update/delete, `create_project` of the opener), a recipe run's admission (`erasure.admit_run`, after the case lock and `require_case` when the run is on a case): shared; the account erasure's decision, `CaseDocs.save_many` of a person's documents with a `check` (every `/me/docs` save: BEFORE_SAVE runs as its check), and `CaseDocs.delete` of one with a `then` (its ON_DELETE hooks read and write inside it): exclusive | xact | nothing a person's batch check read changes before its writes; nothing person-owned is written, no case opened and no run admitted for a person after the account decision commits (IDENTITY_ERASED); what started before it is seen by it (a live case refuses the decision: ACCOUNT_HAS_LIVE_CASES, 409) |
| row locks on `erasure_items` / `erasure_jobs` | the erasure's cleanup: an item `FOR UPDATE SKIP LOCKED`, the job `FOR UPDATE` when it completes | row, until the transaction ends | two workers (a second DELETE, another process's start) never work one item at once; a job completes, and gets its tombstone, once |
| `ai-usage`, tenant | `reserve_ai_usage_for` | xact, exclusive | the person's and the tenant's budget checks and the reservation are one step across processes -- was BEGIN IMMEDIATE |
| `case-hooks`, tenant, case (`CaseDocs.hooks_lock`) | `block_hooks._run_after_sources`, the whole run | session (the thread's pooled connection: the run's transactions run on it), exclusive | one after-sources run per case across processes -- was an in-process `threading.Lock`; its own name, so the erase never waits for a hook |

Order everywhere: case, then source-blobs, then events (an aggregate); a batch locks the documents it names in sorted
order before any write. A thread holds one connection of a pool (`Databases._held_connection`): a transaction inside
another of the same thread is a savepoint of it, a batch's check reads on the batch's connection, a session lock's
holder writes on the lock's -- no thread waits on a pool while holding a connection of it (Codex W1-W3 F2). `db.owner_lock(connection, kind, tenant, id, exclusive=)` is the scheme to reuse for a group
(STEP34_SHARED_RULES.md: a per-(tenant, group) lock, shared for writers, exclusive for the erase): one name for both
modes, the existence check under it. Alembic revisions 0002-0004 are taken here (0004 = the erasure outbox), so the groups' migration is 0005
(`down_revision = "0004"`), not the `0002_groups.py` STEP34 names. The file run locks (`workflow/run_lock.py`: recipe
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

## Erasure and the bytes on disk

### Erasure across the database and the files

Built 2026-10-08 (was the merge blocker: `erase_case` deleted run files and artifacts and closed grants before the
database erase, and `erase_project` unlinked Source CAS inside its rollbackable transaction; fault injection showed
`row_survives=True blob_survives=False`). Invariant: **nothing irreversible happens before the decision it depends on
is durable, and a durable decision to erase can always be finished.** One workflow, `ai_lego/platform/erasure.py`, for
`DELETE /projects/{id}`, every case of `POST /govern/account/erase`, and the account's own part.

| Step | What | Where |
|---|---|---|
| 1 Decide (one transaction) | Case: case lock exclusive, every row of the case (`erase_case_rows`), the person's runs on it read under that lock (a run's admission holds it shared and writes its sidecar under it: `admit_run`; a run still going refuses the erase), its collect grants closed (`IdentityStore.close_collect_grants_on`), the tenant's unreferenced Source blobs listed under the source-blobs lock, and the outbox: one `erasure_jobs` row + one `erasure_items` row per blob / AI artifact (case rows and run sidecars) / run. Person: person lock exclusive, refused while the person still has a case (`ACCOUNT_HAS_LIVE_CASES`) or is already deleted (`ACCOUNT_ALREADY_ERASED`), the runs left in the folder read under it, workflows, person records, identity marker, outbox of those runs. References only (path, hash, artifact reference, run id), never content. Nothing on disk is touched; a failure leaves everything as it was. | `Erasure.decide_case`, `decide_person`; `erasure_outbox.write_job`; migration 0004 |
| 2 Clean up (after commit) | Each item in its own transaction, `FOR UPDATE SKIP LOCKED`. A Source blob is re-checked under the source-blobs lock (`blob_referenced`), an artifact against committed artifact rows: still named = `kept`. A run's artifact is never shared (`recipe_runtime.persist_artifact_output` gives each write its own bytes; pinned by two `test_block_govern` tests). A well-formed path of the tenant is removed by its path, even when its bytes no longer match the reference's hash. Already gone = `absent`. A filesystem error leaves it `pending` (attempts + 1; from `ATTENTION_ATTEMPTS` on, logged as an error). A reference that names no file of the tenant (malformed, another tenant's, a run id that leaves its folder) = `unresolvable`. | `Erasure.finish`, `_remove` |
| 3 Complete | Job `FOR UPDATE`; every item `removed`/`absent`/`kept` ("done" = every target accounted for): the ProjectErased tombstone (platform-owned; counts of what was actually removed) and the job delete commit together, then `physical_retention_hook` (see below). | `Erasure._complete` |

An unfinished job (its row exists exactly while something is left) is found again by a repeated `DELETE` of the case by
the person who erased it (nobody else: another person gets 404), by that person's account deletion (`resume` narrowed
to them), and at every API start (`main._lifespan` -> `resume_pending_erasures`; logged, never fatal). Items no retry
will settle, and items that kept failing, are logged at error level at every start and listed by
`python -m ai_lego.platform.erasure` (`Erasure.needs_attention`, read only; acknowledging an unresolvable item is not
built yet). Nothing waits for a case's hooks. The run routes (`GET /recipes/{id}/runs/{run_id}[/result]`) refuse a run
whose sidecar names a case that is gone (CASE_ERASED 404), so files waiting for the cleanup are read by nobody.

API: `DELETE /projects/{id}` answers 200 `{project_id, erased: {sources, blobs_unlinked, artifacts_deleted,
events_deleted}, physical_cleanup: "done"}` or 202 `{..., physical_cleanup: "pending" | "blocked", pending_items,
failed?}` (`pending`: a retry will do it; `blocked`: only unresolvable items are left, an operator must look); the
account erase adds `physical_cleanup`, and `tombstone` is false (202) while anything is left. `GET /projects/erased`
lists finished erasures only. The web client needs no change: `apiFetch` accepts any 2xx
(`apps/cognitive-web/lib/api.ts:9`) and ignores the DELETE body (`components/ProjectPage.tsx:131`,
`components/result/ResultPage.tsx:351`).

Cost of this shape (an outbox/saga) over the rejected ones: one migration (head moves to 0004: prod is migrated before
the code that requires it, `require_schema_at_head`), one short transaction per file, a source-blob item holding the
tenant's source-blobs lock for one unlink (source writes of that tenant wait that long), a person lock and one identity
read per person-owned record, a start-up scan of `erasure_jobs` per region. Rejected: a post-commit best-effort unlink
(a crash strands personal files with nothing to find them); files first (the original fault).

Gates (`tests/unit/test_erasure_workflow.py`): fault injection at each decision step, after commit, at each file kind,
during the resume, a fresh process, a concurrent DELETE, the account path, shared blobs (also one added after the
decision), run admission and a personal record racing each decision; `NothingIrreversibleDuringTheDecisionTests` and
the account test beside it run every erase entry point with every file mutator (`Path.unlink/rmdir/replace/rename/
write_*/touch/mkdir`, `os.remove/unlink/rmdir/replace/rename`, `shutil.rmtree`, the CAS and artifact store writers)
raising while a decision is open; `IrreversibleGateTests` statically walks the calls from the entry points to the
same names (it matches names only: the runtime trap is the stronger one).

Not covered: encrypted-journal ciphertext in `workflow-cas` stays (named in the account summary, unchanged); an
unresolvable item cannot be acknowledged yet, so its job stays `blocked` until an operator removes the row by hand.

### Physical retention decision

SQLite ran with `secure_delete = ON`: an erased row was overwritten in the file (plan D10). PostgreSQL has no such
switch. A deleted row's bytes stay in its data file until VACUUM prunes the page (probe 2026-10-04 with pageinspect on the
pinned image: present after DELETE, gone from the page after VACUUM), and they stay in the WAL until it is recycled and in
every nightly dump (D8) until that dump expires. The tests prove the region's every row no longer holds what was erased
(`tests/pg.py::dump`), not the bytes on disk.

Decided 2026-10-10 under the operator's delegation (GO_LIVE.md D4): VACUUM after erasure, and nightly dumps kept 7 days.

Built: after each erasure transaction commits -- `decide_case`, `decide_groups`, `decide_person`, the completion --
`physical_retention_hook` VACUUMs (`INDEX_CLEANUP ON`) every table that transaction deleted or updated rows of
(`touched_tables`: `pg_stat_xact_user_tables`, read just before the commit, so a table a future erase step touches is
included without a list to keep). One background worker per process runs them in order on a pooled autocommit
connection (`Databases.vacuum`; VACUUM refuses a transaction; `lock_timeout` 30 s, so a conflicting lock fails the VACUUM
instead of parking the worker): the API answer never waits, a failure is logged and never
fails the erasure (autovacuum prunes later), a process that dies first leaves them to autovacuum. A dead row is
pruned only once no open transaction that began before the erasure's commit can still see it; one that is left waits for
the next VACUUM or autovacuum. Gate:
`PhysicalRetentionTests` (the case's tables and the outbox's have `vacuum_count` raised; an empty hook turns it red).
`ops/cognitive-db/backup-cognitive-db.sh` keeps 7 days by default (the production cron passes 7 as well; the pre-deploy
dumps of `deploy/lib-db.sh` use the same default).

Still not done, so an erasure is complete for every reader of the database and only partly for its files:
- VACUUM frees a dead row's space and does not zero it. Compacting the page moves live rows over most freed bytes, but a
  dead row at the page's free-space edge keeps its bytes until a later write reuses them (probe 2026-10-10, postgres:17,
  raw file read after CHECKPOINT: a middle row gone after VACUUM, the page's last-inserted row still there) -- a case
  erased soon after it was written is the likely case. Only a rewrite (`VACUUM FULL`: an exclusive lock on the table for
  the rewrite) or per-tenant/per-person keys destroyed on erasure would close this; neither is decided.
- The WAL keeps the rows until its segments are recycled.
- A nightly dump keeps them until it expires (7 days; a dump quarantined as corrupt expires on the same date); the
  pre-deploy dumps likewise; any other copy (the SQLite volume
  and copies of the go-live, GO_LIVE.md D3) until it is deleted.

## Data move

Built 2026-10-10: `ai_lego/apps/cli/move_sqlite_to_pg.py` (`move`, `move --dry-run`, `verify`), tested on the files the engine
of a76af28da wrote (`tests/fixtures/sqlite_a76af28da/`, `tests/unit/test_move_sqlite_to_pg.py`: equal proof, one corrupted
row fails it and leaves nothing). Where it chose, beyond the requirements below:
- `tenant.data_residency_region` is rewritten to the mapped region, the value its directory line gets (`create_tenant` keeps
  the two equal); `--region-map SOURCE=REGION` is required and every tenant's source region must be in it.
- One configured region only (the engine refuses more: D7). The proof also holds a digest of every row of every table, the
  rowid order of `events`/`workspace` against `write_order`, and both sequences (past `sqlite_sequence`, so a deleted id is
  not handed out again); files per tenant: count, bytes, digest of (path, sha256).
- Files: the move copies the `objects/<tenant>` and `objects/<sha256(tenant)[:32]>` trees of `source-cas`, `artifact-cas`,
  `workflow-cas` and `workflows/<sha256(tenant)[:32]>`; a directory of no tenant, or an entry the move does not know, stops it.
- `verify` is valid until the engine writes its first row after the move.

Requirements (frozen 2026-10-04):


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
