# codex-oracle review -- 2026-10-24 13:01:37 +08:00

- mode: `review`
- scope: -Path scripts/codex-continue.ps1, Projects/internal/cognitive-engineering-os/tests/unit/test_codex_queue.py, Projects/internal/cognitive-engineering-os/scripts/validate-codex-queue.py, agency-os/handoffs/cos-codex-queue/queue.json, agency-os/handoffs/codex-queue/queue.json, agency-os/handoffs/codex-queue/PREAMBLE.md, agency-os/handoffs/codex-queue/README.md, agency-os/handoffs/codex-queue/gates/README.md, agency-os/handoffs/codex-queue/cards/01-register-codex-do-demo.md, .claude/commands/codex-do.md, .claude/commands/account.md, scripts/claude-account.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Generalize the Codex card queue driver (per-queue settings: profile, worktree, state_dir, work_ref, junctions, postgres) and its validator (cos/general check-shape profiles); new general queue + /codex-do; /account + scripts/claude-account.py picks which Claude subscription headless workers bill (manual switch only; strips parent CLAUDE*/ANTHROPIC* env). Focus: security of the general check-command allowlist (runs via cmd.exe), env stripping so a wda worker can never bill the parent account, and that the COS queue keeps identical behaviour and paths.
- exit: 0 | elapsed: 197584ms | answer: 2770B
- files-reviewed: Projects/internal/cognitive-engineering-os/scripts/validate-codex-queue.py, Projects/internal/cognitive-engineering-os/tests/unit/test_codex_queue.py, agency-os/handoffs/cos-codex-queue/queue.json, scripts/codex-continue.ps1, .claude/commands/account.md, .claude/commands/codex-do.md, agency-os/handoffs/codex-queue/PREAMBLE.md, agency-os/handoffs/codex-queue/README.md, agency-os/handoffs/codex-queue/cards/01-register-codex-do-demo.md, agency-os/handoffs/codex-queue/gates/README.md, agency-os/handoffs/codex-queue/queue.json, scripts/claude-account.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The general allowlist treats `npm test` as side-effect-free although npm executes arbitrary package lifecycle scripts.
  file:line   -> Projects/internal/cognitive-engineering-os/tests/unit/test_codex_queue.py:52 -> scripts/codex-continue.ps1:131
  confidence  -> CONFIRMED
  scenario    -> A card runs `npm test` in a package whose `pretest` or `test` script deploys; validation passes and `cmd.exe` executes the deployment.
  why missed  -> Tests reject `npm run deploy` but do not inspect `package.json` lifecycle scripts.

FINDING 2: Check `cwd` is not constrained to the Codex worktree.
  file:line   -> Projects/internal/cognitive-engineering-os/tests/unit/test_codex_queue.py:195 -> scripts/codex-continue.ps1:313
  confidence  -> CONFIRMED
  scenario    -> A card sets `cwd` to `../../Work` from `D:/tmp/codex-do`; the acceptance command runs in `D:/Work`, so a “worktree-only” check can execute against or modify the main checkout.
  why missed  -> Validation only checks that `cwd` is a string.

FINDING 3: `postgres: false` does not clear inherited PostgreSQL environment variables.
  file:line   -> scripts/codex-continue.ps1:235 -> Projects/internal/cognitive-engineering-os/tests/pg.py:117
  confidence  -> CONFIRMED
  scenario    -> The parent PowerShell has `COGNITIVE_OS_REQUIRE_POSTGRES=1` or `COGNITIVE_OS_TEST_DATABASE_URL`; the general queue declares `postgres: false`, but its PostgreSQL check still connects to that database or fails instead of skipping.
  why missed  -> The driver only sets the flag when PostgreSQL is enabled and restores the previous value afterward; it never isolates the false case.

FINDING 4: `init-wda` silently accepts a normal `projects` directory instead of verifying the required junction.
  file:line   -> scripts/claude-account.py:93 -> scripts/claude-account.py:98
  confidence  -> CONFIRMED
  scenario    -> `.claude-wda/projects` already exists as an ordinary directory; initialization skips `mklink`, prints “projects -> …”, and Wda transcripts remain separate, so `--resume` cannot find the shared session.
  why missed  -> The code tests existence, not whether the existing entry is the intended junction.

FINDING 5: The takeover command does not strip parent `CLAUDE*`/`ANTHROPIC*` variables.
  file:line   -> scripts/claude-account.py:45 -> scripts/claude-account.py:140
  confidence  -> PLAUSIBLE
  scenario    -> `/account wda` is followed by `resume-cmd` in a shell inheriting the parent session’s auth variables; the printed command changes only `CLAUDE_CONFIG_DIR`, so resume can continue using the parent authentication instead of Wda.
  why missed  -> Environment stripping is applied only inside `worker_env()` for `run`, not to the emitted resume command.

TOTAL: 5 findings
