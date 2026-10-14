# codex-oracle review -- 2026-10-10 12:31:36 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/platform/erasure.py, Projects/internal/cognitive-engineering-os/ai_lego/data/db.py, Projects/internal/cognitive-engineering-os/tests/unit/test_erasure_workflow.py, Projects/internal/cognitive-engineering-os/ops/cognitive-db/backup-cognitive-db.sh, Projects/internal/cognitive-engineering-os/ops/cognitive-db/README.md, Projects/internal/cognitive-engineering-os/docs/platform/GO_LIVE.md, Projects/internal/cognitive-engineering-os/docs/platform/STORAGE_SWITCH.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Implements the decided physical-retention step after erasure on PostgreSQL: after each erasure transaction commits (decide_case, decide_groups, decide_person, _complete), VACUUM (INDEX_CLEANUP ON) every table it deleted/updated rows in (pg_stat_xact_user_tables read just before commit), in one background worker thread on a pooled autocommit connection; failures logged, never fail the erasure. Backup default retention 14->7 days. Docs state what is done and what is not (freed space not zeroed, WAL, dumps). Look for: a path where VACUUM could run inside a transaction or deadlock the pool, a touched table missed, an erasure failing because of the hook, wrong doc claims.
- exit: 0 | elapsed: 339689ms | answer: 2511B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/data/db.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/erasure.py, Projects/internal/cognitive-engineering-os/docs/platform/GO_LIVE.md, Projects/internal/cognitive-engineering-os/docs/platform/STORAGE_SWITCH.md, Projects/internal/cognitive-engineering-os/ops/cognitive-db/README.md, Projects/internal/cognitive-engineering-os/ops/cognitive-db/backup-cognitive-db.sh, Projects/internal/cognitive-engineering-os/tests/unit/test_erasure_workflow.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Corrupt backups bypass the new 7-day retention guarantee.
  file:line   -> `ops/cognitive-db/backup-cognitive-db.sh:125-142` -> `ops/cognitive-db/README.md:24`
  confidence  -> CONFIRMED
  scenario    -> A corrupt dump still contains erased data; the script renames it to `.dump.corrupt`, but future retention scans only `*.dump`, so that copy remains indefinitely despite the documented 7-day maximum.
  why missed  -> Quarantine handling is separate from expiration, so the renamed file falls outside the retention glob.

FINDING 2: A blocked VACUUM can starve the sole worker and the database pool.
  file:line   -> `ai_lego/platform/erasure.py:95-96,121-125` -> `ai_lego/data/db.py:154,194-207,270-271`
  confidence  -> CONFIRMED
  scenario    -> An `ALTER TABLE` holds a conflicting lock; VACUUM waits without a timeout, the one worker never reaches later jobs, and a database configured with `max_size=1` also blocks API transactions waiting for the occupied connection. PostgreSQL documents that VACUUM can wait for conflicting locks. ([VACUUM docs](https://www.postgresql.org/docs/current/sql-vacuum.html))
  why missed  -> “Background” makes submission non-blocking, but execution remains an unbounded pool operation.

FINDING 3: Executor submission failure can make a committed erasure return 500.
  file:line   -> `ai_lego/platform/erasure.py:106-112,202-203` -> `ai_lego/apps/api/main.py:2864-2869`
  confidence  -> PLAUSIBLE
  scenario    -> During executor shutdown, `ThreadPoolExecutor.submit` raises after the decision transaction commits; the hook does not catch it, the API catches only `InvariantViolation`, and the request returns 500 with the database already erased and cleanup unfinished.
  why missed  -> Exceptions inside `_vacuum` are guarded, but the enqueue operation itself is outside that guard.

FINDING 4: The physical-retention test does not detect missed artifact tables.
  file:line   -> `tests/unit/test_erasure_workflow.py:80-81,431-443` -> `ai_lego/data/repositories/project_source_repository.py:768,792-793`
  confidence  -> CONFIRMED
  scenario    -> A regression omits `project_interpretations` from the VACUUM list while still VACUUMing the six hard-coded tables; the test passes even though its fixture deletes an interpretation row and that table is not physically cleaned.
  why missed  -> The assertion checks a fixed subset, not the tables actually reported by the erasure transaction, and does not exercise account-erasure paths.

TOTAL: 4 findings
