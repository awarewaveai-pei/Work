# codex-oracle review -- 2026-09-26 18:44:42 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collection_service.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/collection_run.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/collection-run.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/domain/collection-run.fixtures.yaml, Projects/internal/cognitive-engineering-os/tests/unit/test_api_collections.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_ingest.py, Projects/internal/cognitive-engineering-os/tests/unit/test_project_erase.py, Projects/internal/cognitive-engineering-os/tests/unit/test_run_classification.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_main.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collection_run_repository.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collect_grant.py, Projects/internal/cognitive-engineering-os/docker-compose.yml, Projects/internal/cognitive-engineering-os/deploy/.env.example, Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Research-line P1 cards WC-P1-04..08 (RESEARCH_LINES_MASTER_PLAN.md section 12.7, interface table I-a..I-h).
04 collection runs: plan/confirm (no write without confirm), one-shot grant exchange, Grant-bound complete. Your previous
review found runs left open forever (grant expired unexchanged; crash after the run row). Fix is a redesign, not a
reconciliation: ONE deadline -- collection_runs.deadline_at = requested_at + RUN_TTL, the grant is issued to expire at that
same instant, and effective_status() derives "failed" for any open run past it (read-only, nothing written on read);
transitions are refused past the deadline inside the UPDATE. 05 ingest: grant-bound, whole batch hash-checked before any
write, repository decides created/unchanged/superseded in one transaction, unreferenced blobs removed if that transaction
fails. 06 DELETE /projects/{id}: content first, then one transaction deleting rows + project events, one ProjectErased
tombstone; SQLite secure_delete so erased text is not left in free pages. 07 recipe run classification from the Project
(body value refused). 08 egress allowlist + compose/policy parity test.
Probe: any state that two stores must keep in sync by code; any path leaving a run open or a grant alive past its run;
blob/row consistency on failure; erase completeness (anything personal readable afterwards); classification bypass;
tenant isolation. Files outside -Path belong to other sessions.
- exit: 0 | elapsed: 86298ms | answer: 1632B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/collection_run.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/deploy/.env.example, Projects/internal/cognitive-engineering-os/docker-compose.yml, Projects/internal/cognitive-engineering-os/tests/unit/test_api_main.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collect_grant.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collection_run_repository.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/collection-run.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/domain/collection-run.fixtures.yaml, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collection_service.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_collections.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_ingest.py, Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py, Projects/internal/cognitive-engineering-os/tests/unit/test_project_erase.py, Projects/internal/cognitive-engineering-os/tests/unit/test_run_classification.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Batch rollback can fail while cleaning duplicate new blobs, masking the original 409 and leaving inconsistent cleanup state
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py:1940 -> Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py:405
  confidence  -> CONFIRMED
  scenario    -> A batch contains two new URLs with identical content, `ingest_batch()` fails, the first cleanup iteration unlinks the shared CAS object, and the second iteration calls `unlink()` on the same path; the cleanup raises `CAS_OBJECT_NOT_FOUND` instead of returning the intended `SOURCE_INGEST_REFUSED` response.
  why missed  -> The rollback test uses one new blob and one already-referenced blob, so it never exercises multiple prepared records sharing one newly created CAS path.

FINDING 2: CAS cleanup races with concurrent ingestion and can delete a blob after another transaction starts referencing it
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py:1940 -> Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py:405
  confidence  -> CONFIRMED
  scenario    -> Request A rolls back and checks `content_hash_referenced()`; before A unlinks the CAS object, request B commits a Source row referencing that same hash; A then unlinks the object, leaving B’s committed row pointing to missing content.
  why missed  -> The reference check and unlink are separate operations with no lock or atomic coordination across the repository transaction and CAS lifecycle.

TOTAL: 2 findings
