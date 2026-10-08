# codex-oracle review -- 2026-10-08 09:38:22 +08:00

- mode: `review`
- scope: whole repo
- target: `3a61a61aa..aa41cd9aa`
- context: Erasure saga for the Cognitive Sovereignty Platform engine on PostgreSQL (Projects/internal/cognitive-engineering-os). You found the P0: erase unlinked Source CAS inside a rollbackable transaction (row_survives=True blob_survives=False) and main.py deleted runs/artifacts and closed grants before the DB erase. Fix: ai_lego/platform/erasure.py decide (one transaction under the exclusive case lock: rows deleted, grants closed, outbox erasure_jobs/erasure_items of references only, migration 0004), finish (one transaction per item, FOR UPDATE SKIP LOCKED, blob re-checked under the blob lock), complete (tombstone + job delete only when nothing pending); resumed by repeated DELETE, account deletion, and API start; DELETE answers 200 done or 202 pending. Hunt: any irreversible action still before the decision commits; a crash point that strands a file forever or loses a reference; a shared blob removed; a race between a writer and the decision (a run or artifact created after the decision); a job that can be completed while an item is pending; tests that stay green with a guard removed; the AST gate's blind spots.
- exit: 0 | elapsed: 467907ms | answer: 1951B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/govern.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/data/migrations/versions/0004_erasure_outbox.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/custom_workflow_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/erasure_outbox.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/erasure.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md, Projects/internal/cognitive-engineering-os/docs/platform/STORAGE_SWITCH.md, Projects/internal/cognitive-engineering-os/tests/unit/case_fixture.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_ingest.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_main.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_govern.py, Projects/internal/cognitive-engineering-os/tests/unit/test_erasure_workflow.py, Projects/internal/cognitive-engineering-os/tests/unit/test_pg_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_step2_foundation.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A run admitted after the file snapshot can survive a completed case erasure
  main.py:302 -> ai_lego/platform/erasure.py:129
  confidence  -> CONFIRMED
  scenario    -> `_case_runs` sees no sidecar; a concurrent `/recipes/.../run` passes the project check and creates its sidecar after the snapshot; `decide_case` outboxes only the earlier `runs`, then cleanup returns done while the new journal/artifacts remain with no job.
  why missed  -> The concurrency test pauses cleanup after the decision, but never races run admission against the snapshot.

FINDING 2: Artifact cleanup can remove a CAS object still referenced by another run
  project_source_repository.py:379 -> ai_lego/platform/erasure.py:219
  confidence  -> CONFIRMED
  scenario    -> Two same-tenant runs store identical JSON, producing the same CAS path; one person is erased, while another person’s run sidecar still references it. `artifact_referenced` checks only database artifact tables, so cleanup deletes the shared object and the other run later fails to read it.
  why missed  -> Shared-blob coverage checks Source rows, not artifact references held only in run sidecars; `JsonArtifactStore.put` derives the path solely from content at json_artifact_store.py:46.

FINDING 3: An unremovable artifact is reported as physically complete
  json_artifact_store.py:61 -> ai_lego/platform/erasure.py:234
  confidence  -> CONFIRMED
  scenario    -> An artifact reference has a valid path but a wrong content hash; deletion raises `JSON_ARTIFACT_HASH_MISMATCH`, `_remove` settles it as `unremovable`, `_complete` counts only `pending` items at erasure.py:243, deletes the job at erasure.py:249, and returns `physical_cleanup: "done"` while the file remains forever.
  why missed  -> Tests include malformed references alongside a valid duplicate, so the file is deleted by the valid item; they do not test an existing hash-mismatched file alone.

Final: TOTAL: 3 findings
