# codex-oracle review -- 2026-10-08 13:23:15 +08:00

- mode: `review`
- scope: whole repo
- target: `8567da9bf`
- context: Rebase of the PostgreSQL storage switch onto main (Cognitive Sovereignty Platform engine). This commit: (1) main's blocks/docs.py _save runs BEFORE_SAVE as the save_many check; PG save_many refused a check for a person owner -> every /me/docs save 400; fix: a person batch with a check takes the person lock exclusive (record_log.require_person(exclusive=)); (2) your W1-W3 F2 pool deadlock: Databases._held_connection, one pooled connection per thread, nested transaction = savepoint, a session lock runs on its own connection and must be the thread's first hold (DB_SESSION_LOCK_NESTED); (3) F6: the no-SQLite-DDL guard reads f-strings. Hunt: a savepoint where an inner commit was relied on to be independent (a write that must survive the outer rollback, e.g. an audit, a hook's own record, the erasure outbox); a lock order cycle person/case/blob/run; a thread that holds a connection across a network call or hook now that it is reused; tests passing for the wrong reason.
- exit: 0 | elapsed: 517724ms | answer: 697B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/data/db.py, Projects/internal/cognitive-engineering-os/ai_lego/data/events/record_log.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/docs/platform/STORAGE_SWITCH.md, Projects/internal/cognitive-engineering-os/tests/unit/test_block_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_verify.py, Projects/internal/cognitive-engineering-os/tests/unit/test_pg_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_step2_foundation.py, agency-os/WORKLOG.md, agency-os/reports/review-debt.md
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The SQLite DDL guard misses quoted dynamic table/index identifiers.
  Projects/internal/cognitive-engineering-os/tests/unit/test_pg_foundation.py:45 -> Projects/internal/cognitive-engineering-os/tests/unit/test_pg_foundation.py:61
  confidence  -> CONFIRMED
  scenario    -> A source contains `f'CREATE TABLE "{table}" (id INTEGER)'` or `CREATE INDEX "{index}" ON "{table}" (id)` -> `string_texts()` preserves the SQL, but the regex only accepts bare `[\w{}%]+` names, so `sqlite_ddl_in()` returns no hit and the guard passes.
  why missed  -> The new test covers bare `{}` placeholders but not quoted identifiers, even though quoted identifiers are valid SQLite DDL.

TOTAL: 1 findings
