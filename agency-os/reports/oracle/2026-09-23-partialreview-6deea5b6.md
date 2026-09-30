# codex-oracle review -- 2026-09-23 16:44:25 +08:00

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
- exit: 0 | elapsed: 109899ms | answer: 1669B
- files-reviewed: agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md, lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh, lobster-factory/infra/hetzner-phase1-core/scripts/check-drift-and-alert.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/sync.test.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The deploy-pin check has a TOCTOU race and can replace scripts during a newly started deploy

  file:line   -> lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh:26-32 -> lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh:35-54
  confidence  -> CONFIRMED
  scenario    -> `sync-host-scripts.sh` sees no `/tmp/sg-deploy.lock`; before it archives or installs, `sg-deploy.sh` creates the lock and starts. The sync proceeds and replaces files while that deploy is running, so the deploy can mix old and new script versions despite the stated pin guarantee.
  why missed  -> The test only creates the deploy lock before invoking the sync block; it does not start `sg-deploy.sh` between the holder check and installation.

FINDING 2: A cron caller continues after detecting an active deploy and can report a false failure

  file:line   -> lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh:29-32 -> lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh:65-79
  confidence  -> CONFIRMED
  scenario    -> An active `sg-deploy.sh` holds `/tmp/sg-deploy.lock`; auto-deploy’s sync exits 0 with “skipped,” but the caller continues its drift decision. If drift exists, it invokes `sg-deploy.sh` anyway; the second deploy refuses because the lock is held, and auto-deploy reports `FAILED` for a deploy that was merely already in progress.
  why missed  -> The sync block treats “skipped because deploy is active” as success, while the caller distinguishes only nonzero sync failure and script replacement; the test has no concurrent auto-deploy/sg-deploy case.

TOTAL: 2 findings
