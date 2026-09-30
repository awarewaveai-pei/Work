# codex-oracle review -- 2026-09-23 17:04:14 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh, lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh, lobster-factory/infra/hetzner-phase1-core/scripts/check-drift-and-alert.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/sync.test.sh, agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Incident 2026-09-23 07:00Z: Telegram "auto-deploy FAILED" was a false alarm. The host's cron caller
auto-deploy-next-admin.sh was an old copy without the DEPLOY_HOLD pre-check; it called sg-deploy.sh,
which self-synced the scripts dir (step 1.8) and correctly refused on DEPLOY_HOLD (step 1.85); the old
caller reported the refusal as FAILED. Root cause: host scripts (/root/lobster-phase1/scripts) were only
refreshed by sg-deploy.sh step 1.8, i.e. AFTER the caller had decided, and never when there was no app
drift or a hold was active. Invariant targeted: every deploy-pipeline cron entry point decides with
origin/main's version of itself. Change: new block sync-host-scripts.sh (git archive origin/main:<dir>,
all-or-nothing bash -n gate, chmod +x before install, per-file cp+rename, flock, skip while another
sg-deploy holds /tmp/sg-deploy.lock); both cron callers run it after git fetch and re-exec themselves if
their own file changed; sg-deploy.sh step 1.8 calls the same block instead of inline rsync; the caller's
log() no longer writes each line twice under cron (cron already redirects stdout to the same file).
Host: Ubuntu 24.04, bash 5.2, git 2.43, runs as root. Please attack: re-exec + lock handling and loop
guard, set -e / pipefail pitfalls, the deploy-pin race vs a concurrently starting sg-deploy (with and
without --skip-pull), bootstrap from the currently installed old scripts, whether any other host consumer
depends on the old rsync semantics (rsync -a also preserved mtimes/modes of non-.sh files), and whether
the test really exercises the production paths.
ROUND 2. Your round-1 findings were both confirmed and fixed: (1) TOCTOU: sg-deploy.sh now checks and
creates its PID lock inside the same flock (/tmp/sync-host-scripts.lock, fd 8, closed right after) that
the sync block holds for check+install, and step 1.8 now ALWAYS re-execs the copy it just installed
instead of cmp-ing the on-disk file (a cron-side sync could have replaced that file after the deploy
started, making cmp say "equal" while the old inode kept running). (2) Deliberate refusals (DEPLOY_HOLD,
lock busy) now exit 75 (refuse()) and auto-deploy maps rc 75 to a silent skip; every other non-zero still
alerts. Verify the fixes and hunt for what they broke: fd 8 inherited by children or across exec,
--force / --dry-run / --skip-pull paths, the GHA self-hosted runner path, exit code 75 colliding with a
raw exit status propagated by set -e, the unconditional re-exec (double logging, lock ownership, loops).
- exit: 0 | elapsed: 166945ms | answer: 2666B
- files-reviewed: agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md, lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh, lobster-factory/infra/hetzner-phase1-core/scripts/check-drift-and-alert.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/sync.test.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Existing hosts cannot bootstrap the new pre-decision sync helper

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh:60-66` -> `lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh:1`

  confidence  -> CONFIRMED

  scenario    -> A host still has the old caller and no `sync-host-scripts.sh`; the next tick invokes `bash .../sync-host-scripts.sh`, gets rc 127, logs a warning, and continues with the old installed caller. With `DEPLOY_HOLD` active and no app drift, no `sg-deploy.sh` runs to install the helper, so the host remains permanently stale.

  why missed  -> The test harness copies the new helper into the staging directory during `reset_world`, so it never exercises the real old-host bootstrap state.

FINDING 2: Re-exec has a race that can launch concurrent auto-deploy runs

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh:68-71`

  confidence  -> CONFIRMED

  scenario    -> The first caller removes `/tmp/auto-deploy-next-admin.lock` before `exec bash "$SELF_PATH"`; a second cron invocation starts in that window, sees no lock, creates its own lock, and both callers proceed to drift/deploy decisions concurrently.

  why missed  -> The test verifies lock cleanup after execution but does not start a second caller during the remove-to-exec window.

FINDING 3: Sync is not all-or-nothing when installation fails

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh:56-74`

  confidence  -> CONFIRMED

  scenario    -> Syntax validation passes, but the target filesystem fills or a later `cp -p`/`mv` fails. Earlier files have already been renamed into `/root/lobster-phase1/scripts`, leaving a mixed-generation script set while the command exits non-zero.

  why missed  -> The test’s “all-or-nothing” case only covers a `bash -n` failure before installation; it does not inject an installation-time failure.

FINDING 4: Deleted repository scripts remain executable on the host

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh:56-74`

  confidence  -> CONFIRMED

  scenario    -> `legacy.sh` exists on the host, is removed from `origin/main`, and remains in `/root/lobster-phase1/scripts` because the sync loop only copies source files. A cron entry or operator invoking `legacy.sh` continues running code no longer present in `origin/main`, unlike the previous `rsync -a --delete` behavior.

  why missed  -> The test explicitly verifies that host-only files are preserved and never tests removal of a previously managed file.

TOTAL: 4 findings
