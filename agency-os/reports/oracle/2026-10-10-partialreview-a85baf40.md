# codex-oracle review -- 2026-10-10 02:08:18 +08:00

- mode: `review`
- scope: whole repo
- target: `391a473ff..cc76e66f8`
- context: Go-live tooling for the Cognitive OS PostgreSQL cutover (nothing applied yet): SQLite->PG data move with proof, governed cognitive-db installer, deploy.sh with pre-deploy dump + explicit migration + rollback that restores the dump, GO_LIVE.md runbook. Report ONLY: (1) data loss or a path where production data could be destroyed/overwritten (rollback deleting the wrong database or volume, restore over live data, move writing to a non-empty target, proof that can pass on a mismatch), (2) secret leakage (password printed, committed, or in process args/logs), (3) a step that would leave production down with no way back, (4) CI break. file:line each. No style.
- exit: 0 | elapsed: 485608ms | answer: 1506B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/migrate_db.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/move_sqlite_to_pg.py, Projects/internal/cognitive-engineering-os/deploy/.env.example, Projects/internal/cognitive-engineering-os/deploy/deploy.sh, Projects/internal/cognitive-engineering-os/deploy/lib-db.sh, Projects/internal/cognitive-engineering-os/docker-compose.yml, Projects/internal/cognitive-engineering-os/docs/platform/GO_LIVE.md, Projects/internal/cognitive-engineering-os/docs/platform/STORAGE_SWITCH.md, Projects/internal/cognitive-engineering-os/ops/cognitive-db/README.md, Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml, Projects/internal/cognitive-engineering-os/ops/cognitive-db/install-cognitive-db.sh, Projects/internal/cognitive-engineering-os/ops/cognitive-db/restore-cognitive-db.sh, Projects/internal/cognitive-engineering-os/ops/cognitive-db/restore-live-cognitive-db.sh, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/.gitattributes, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/generate.py, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/artifact-cas/objects/tenant-alpha/sha256/09/3c/093cd9cd41b2b894d94d88fa22812ffe1f668cf169fc7886e1728b76b92c7de4, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/artifact-cas/objects/tenant-alpha/sha256/78/a9/78a94a482c54381adba626bda49ad530c57af6705dedb6f821a1710f68a60c8c, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/artifact-cas/objects/tenant-alpha/sha256/81/3e/813e82b418c212bf265ca82c278432afcdea941d0719f27aaca6f1289f63f52e, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/artifact-cas/objects/tenant-alpha/sha256/f0/f6/f0f6abfcbd9c88b2c2d6c29b34efad371edc34e0b0941fd622f24864c83fece5, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/custom_workflows.sqlite3, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/derived_cache.sqlite3, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/identity.sqlite3, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/projects.sqlite3, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/source-cas/objects/tenant-alpha/sha256/3e/a2/3ea2b69511419fd7bc65bf1d0311ddda13ba6728130e47ea28c3302dcee538f5, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/source-cas/objects/tenant-alpha/sha256/bd/21/bd2177b19e6269564317b210a05bdea0e643a5b30f37a81066a587c50720d148, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/source-cas/objects/tenant-alpha/sha256/c1/ce/c1cee016052596af1224ff72553a7ad9807d2b65fb458e87c0fa50dcae585131, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/source-cas/objects/tenant-bravo/sha256/98/35/9835cca3a2be79aceb0211c11614f886b1e4c0a39df1170bac6d93d3c251f1f0, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/workflow-cas/objects/d10b4f3ef504e2c900c137014165a6dd/sha256/11/cd/11cd411a8f2e462921e7b1ac5025f6ef1406c7fb6ddb35faa399a82c528ebe48, Projects/internal/cognitive-engineering-os/tests/fixtures/sqlite_a76af28da/runtime/workflows/d10b4f3ef504e2c900c137014165a6dd/57c003c10d28a5d3c2be83569016cd62/run-fixture.journal.json, Projects/internal/cognitive-engineering-os/tests/unit/test_cognitive_db_ops.py, Projects/internal/cognitive-engineering-os/tests/unit/test_move_sqlite_to_pg.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Migration proceeds after API/web stop failure, allowing writes during migration or rollback.
  deploy/lib-db.sh:88 -> deploy/lib-db.sh:119
  confidence  -> CONFIRMED
  scenario    -> API stop fails but returns nonzero; `|| true` is ignored, migration runs against live writers, and rollback may restore a dump over new writes.
  why missed  -> The stop command is treated as best-effort while `QUIESCED=1` records it as successful.

FINDING 2: Installer can write the database password into a world-readable existing `.env`.
  ops/cognitive-db/install-cognitive-db.sh:7 -> ops/cognitive-db/install-cognitive-db.sh:189
  confidence  -> CONFIRMED
  scenario    -> Existing `deploy/.env` is mode 0644; `umask 077` does not change it, then the password URL is appended and readable by every local user.
  why missed  -> `umask` protects only newly created files; existing-file permissions are never checked or tightened.

FINDING 3: A target with deleted rows but advanced identity sequences is accepted as empty, then sequence history is overwritten.
  ai_lego/apps/cli/move_sqlite_to_pg.py:333 -> ai_lego/apps/cli/move_sqlite_to_pg.py:419
  confidence  -> CONFIRMED
  scenario    -> Target has no rows but `ai_usage_id_seq.last_value = 1000`; source’s maximum ID is 5. The move passes the emptiness check, calls `setval(..., 5)`, and later reuses IDs 6–1000.
  why missed  -> Emptiness checks inspect table rows only; existing sequence state is not rejected before `setval`.

TOTAL: 3 findings
