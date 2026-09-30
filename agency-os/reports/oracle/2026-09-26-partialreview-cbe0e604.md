# codex-oracle review -- 2026-09-26 19:27:47 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/data/object/tenant_scoped_cas.py, Projects/internal/cognitive-engineering-os/ai_lego/data/object/json_artifact_store.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collection_service.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/collection_run.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/collection-run.schema.yaml, Projects/internal/cognitive-engineering-os/tests/unit/test_api_ingest.py, Projects/internal/cognitive-engineering-os/tests/unit/test_project_erase.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_collections.py, Projects/internal/cognitive-engineering-os/tests/unit/test_source_provenance.py, Projects/internal/cognitive-engineering-os/tests/unit/test_run_classification.py, Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py, Projects/internal/cognitive-engineering-os/docker-compose.yml, Projects/internal/cognitive-engineering-os/deploy/.env.example  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Research-line P1 cards WC-P1-04..08 (RESEARCH_LINES_MASTER_PLAN.md section 12.7), fourth review round.
Your previous round found (F1) rollback cleanup unlinking the same new blob twice and (F2) the cleanup racing a
concurrent ingest (reference check and unlink not atomic). The fix is a redesign, not more cleanup code:
- Committed rows are the only record of which Source blobs are live. Every Source content write runs inside
  ProjectSourceRepository._write_transaction (BEGIN IMMEDIATE = SQLite write lock), AFTER its rows and BEFORE commit
  (add_source, supersede, ingest_batch via a put_content callback; each new hash written once).
- A blob no committed row references is garbage. The only remover is collect_unreferenced_blobs /
  _collect_unreferenced_blobs, run under the same write lock; erase_project runs it inside its own write transaction
  after deleting the Project's rows, before commit. There is no per-request cleanup (content_hash_referenced and
  erase_plan were deleted).
- Accepted consequence: a crash or I/O error between content write and commit leaves garbage until the next
  collection (every Project erasure collects the whole tenant), stated in the module docstring.
Probe: any Source content write outside the write lock; any path where a live (committed-referenced) blob can be
removed; erase completeness for plan D10 (anything of the erased Project readable afterwards, incl. SQLite free pages,
events, runs, grants, interpretation artifacts); lock ordering/deadlock between the identity store and the project
repository; tenant isolation of the collector; anything the docstrings claim that the code does not do.
Files outside -Path belong to other sessions.
- exit: 0 | elapsed: 178720ms | answer: 11B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/collection_run.py, Projects/internal/cognitive-engineering-os/ai_lego/data/object/json_artifact_store.py, Projects/internal/cognitive-engineering-os/ai_lego/data/object/tenant_scoped_cas.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/deploy/.env.example, Projects/internal/cognitive-engineering-os/docker-compose.yml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/collection-run.schema.yaml, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collection_service.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_collections.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_ingest.py, Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py, Projects/internal/cognitive-engineering-os/tests/unit/test_project_erase.py, Projects/internal/cognitive-engineering-os/tests/unit/test_run_classification.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
