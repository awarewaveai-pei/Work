# codex-oracle review -- 2026-10-08 10:49:23 +08:00

- mode: `review`
- scope: whole repo
- target: `445f39e51..3e3c563f1`
- context: Storage switch W1-W3: SQLite -> plain PostgreSQL (psycopg 3), spec docs/platform/STORAGE_SWITCH.md. record_log per-aggregate advisory lock + UNIQUE(tenant_id, aggregate_id, sequence); CaseDocs, Project/Source repository, custom workflows, derived-artifact cache, GOVERN queries; identity store per region via tenant_directory; shared per-(tenant,case) advisory lock for writers, exclusive for erase. Hunt: SQLite-isms left (rowid order, case folding, implicit transactions, time text compare, JSON key order); locks taken in different orders (deadlock); read-modify-write without lock; region routing holes; a pooled connection held across a hook or network call; tests green with a guard removed.
- exit: 0 | elapsed: 341710ms | answer: 2832B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/govern.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/bootstrap_phase1_tenant.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/bootstrap_service_identity.py, Projects/internal/cognitive-engineering-os/ai_lego/data/db.py, Projects/internal/cognitive-engineering-os/ai_lego/data/events/record_log.py, Projects/internal/cognitive-engineering-os/ai_lego/data/migrations/sqlite_schema_2026_10_04.sql, Projects/internal/cognitive-engineering-os/ai_lego/data/migrations/versions/0002_tenant_directory.py, Projects/internal/cognitive-engineering-os/ai_lego/data/migrations/versions/0003_write_order.py, Projects/internal/cognitive-engineering-os/ai_lego/data/object/derived_artifact_cache.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/custom_workflow_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/__init__.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/integrity.py, Projects/internal/cognitive-engineering-os/docs/platform/STORAGE_SWITCH.md, Projects/internal/cognitive-engineering-os/tests/pg.py, Projects/internal/cognitive-engineering-os/tests/unit/test_ai_gateway.py, Projects/internal/cognitive-engineering-os/tests/unit/test_ai_usage_reservations.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_collections.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_ingest.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_main.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_report.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_synthesis.py, Projects/internal/cognitive-engineering-os/tests/unit/test_authenticate_timing.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_compute.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_govern.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_verify.py, Projects/internal/cognitive-engineering-os/tests/unit/test_business_plan_full_recipe.py, Projects/internal/cognitive-engineering-os/tests/unit/test_cached_transcription.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collect_grant.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collection_run_repository.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collector_wire_v2.py, Projects/internal/cognitive-engineering-os/tests/unit/test_custom_workflow_api.py, Projects/internal/cognitive-engineering-os/tests/unit/test_derived_artifact_cache.py, Projects/internal/cognitive-engineering-os/tests/unit/test_entitlement_check.py, Projects/internal/cognitive-engineering-os/tests/unit/test_identity_store.py, Projects/internal/cognitive-engineering-os/tests/unit/test_integrity.py, Projects/internal/cognitive-engineering-os/tests/unit/test_pg_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_project_erase.py, Projects/internal/cognitive-engineering-os/tests/unit/test_project_source_api.py, Projects/internal/cognitive-engineering-os/tests/unit/test_project_source_repository.py, Projects/internal/cognitive-engineering-os/tests/unit/test_record_log.py, Projects/internal/cognitive-engineering-os/tests/unit/test_source_provenance.py, Projects/internal/cognitive-engineering-os/tests/unit/test_step2_foundation.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Account erasure can be bypassed by an in-flight person-owned save
  file:line   -> `apps/api/main.py:370` -> `data/repositories/case_docs.py:56`
  confidence  -> CONFIRMED
  scenario    -> A person save starts, account erasure deletes owned events, then the save appends and commits; the account is reported erased while a personal record remains.
  why missed  -> Case locks protect case-owned writes, but erasure takes no person/identity lock.

FINDING 2: After-sources hooks can deadlock small connection pools
  file:line   -> `data/db.py:236` -> `platform/block_hooks/__init__.py:99`
  confidence  -> CONFIRMED
  scenario    -> With `max_size=2`, two hooks each hold a session-lock connection, then both call repository writes needing another connection; both wait forever.
  why missed  -> Tests use the default larger pool and do not exercise nested database use under a held session lock.

FINDING 3: Reordering configured regions makes every existing tenant unreachable
  file:line   -> `data/db.py:171` -> `data/db.py:189`
  confidence  -> CONFIRMED
  scenario    -> Tenants are directory-mapped in region `one`; configuration order changes to `two,one`; lookups read the empty directory in `two`, so login and all tenant operations return “unknown tenant.”
  why missed  -> The directory location is derived from process-local ordering with no persisted anchor or startup validation.

FINDING 4: Cross-region tenant creation is not atomic
  file:line   -> `platform/identity/store.py:115` -> `platform/identity/store.py:120`
  confidence  -> CONFIRMED
  scenario    -> The home-region transaction commits, then the process dies before the directory transaction commits; the tenant row exists but no routing entry can ever find it.
  why missed  -> “Directory commits last” is treated as atomicity, but these are independent PostgreSQL transactions without two-phase commit.

FINDING 5: Blob storage is not region-routed despite regional database routing
  file:line   -> `apps/api/main.py:466` -> `docs/platform/STORAGE_SWITCH.md`
  confidence  -> CONFIRMED
  scenario    -> A tenant routed to region `two` writes artifacts under the shared `.runtime/artifact-cas` root, so its bytes are not confined to that region.
  why missed  -> Region tests verify database rows only; the document explicitly defers per-region CAS routing.

FINDING 6: The SQLite-schema guard misses dynamic f-string DDL
  file:line   -> `tests/unit/test_pg_foundation.py:51` -> `tests/unit/test_pg_foundation.py:54`
  confidence  -> CONFIRMED
  scenario    -> Engine code adds `f"CREATE TABLE {table} (...)"`; the AST node is `JoinedStr`, not `ast.Constant`, so the guard returns no hits and passes.
  why missed  -> The check scans only constant string nodes while claiming to detect all remaining SQLite DDL.

TOTAL: 6 findings
