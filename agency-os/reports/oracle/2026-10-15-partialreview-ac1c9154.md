# codex-oracle review -- 2026-10-15 18:53:28 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/check-migrations-applied.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 after your round 1 (agency-os/reports/oracle/2026-10-15-partialreview-57f20163.md, 4 findings). Fixes: F1 the gate now compares sha256 (CRLF->LF, same as apply-db-migration.mjs migrationSha256) with the ledger and lists edited-after-apply files; F2 sg-deploy reads the gate exit code: 1 (repo ahead) may be overridden with MIGRATION_GATE_OVERRIDE=1, 2 (could not check) never; F3 the ContentStudio link carries ?brand=<the selected site organizationId> and shows text instead of a link when there is no site or no organization; the social manager no longer falls back to the first brand when a named brand is not accessible (shows a message plus the brand buttons); F4 find output is captured with its own exit status and an empty list is exit 2. Host tests: pass, missing+edited (exit 1, both listed), CRLF-only (pass), ledger unreachable via failing docker (exit 2); a harness ran the sg-deploy block for rc 0/1/1+override/2+override.
- exit: 0 | elapsed: 606831ms | answer: 1246B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx, lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh, lobster-factory/infra/hetzner-phase1-core/scripts/check-migrations-applied.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The migration gate misparses valid migration filenames containing spaces.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/scripts/check-migrations-applied.sh:31 -> lobster-factory/packages/db/migrations/0092_schema_migrations_ledger.sql:21
  confidence  -> CONFIRMED
  scenario    -> Ledger contains `0103_add social index.sql <hash>` and the repo has that file -> `awk` sees `0103_add` as `$1`, finds no hash, and blocks deployment as “missing”.
  why missed  -> Tests use underscore-only filenames; the schema and migration runner permit spaces.

FINDING 2: Auto-deploy reports an unreachable ledger as an unapplied migration.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh:204-209 -> lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh:197-200
  confidence  -> CONFIRMED
  scenario    -> `supabase-db` is stopped, so the checker exits 2 -> `.migration-gate-failed` is written, and the alert tells the operator that database changes are unapplied and to run `apply-db-migration.mjs`, although the ledger was never read.
  why missed  -> Deploy control distinguishes exit 1 from exit 2, but the notification flag stores only a boolean failure.

TOTAL: 2 findings
