# codex-oracle review -- 2026-09-23 23:08:36 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh, lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh, lobster-factory/infra/hetzner-phase1-core/scripts/check-drift-and-alert.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/sync.test.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 3 of the host-script refresh (sync-host-scripts.sh + the re-exec glue in auto-deploy-next-admin.sh / check-drift-and-alert.sh / sg-deploy.sh step 1.8). Rounds 1-2 by the authoring session (it hit its usage limit). Round-2 findings and what changed: (F1 bootstrap) both cron callers now fall back to  into a mktemp file when the host has no installed copy, run it once, delete the temp copy; (F2 lock gap) auto-deploy no longer rm -f the lock before exec: the lock now holds 1817 and the re-exec copy (same PID, AUTO_DEPLOY_REEXEC=1) is the only thing allowed past an existing lock whose content is its own PID; (F3 all-or-nothing) sync-host-scripts.sh copies every changed file to <dst>.sync-<pid> first and renames all only after every copy succeeded; the EXIT trap removes partials on failure; (F4 deleted scripts remain on host) REJECTED with evidence: the previous inline rsync -a had no --delete either and the contract explicitly keeps host-only files (test t_block_install_and_idempotence). Container suite ubuntu:24.04 now 62/62 incl. 3 new tests (bootstrap for both callers, second tick during re-exec meets the lock, injected cp failure installs nothing and leaves no partial). Please attack: the 1817-based lock takeover (stale lock with a reused PID, kill -0 semantics not used here), exec preserving the PID under  vs , set -e/-u pitfalls in the new blocks, the temp bootstrap copy running a block that installs a NEWER caller which then re-execs while the temp file is deleted, and whether sg-deploy.sh step 1.8 still interacts correctly with the flock.
- exit: 0 | elapsed: 112496ms | answer: 1359B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh, lobster-factory/infra/hetzner-phase1-core/scripts/check-drift-and-alert.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/sync.test.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The auto-deploy lock is not acquired atomically, so simultaneous fresh invocations can deploy concurrently.
  lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh:31 -> lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh:35
  confidence  -> CONFIRMED
  scenario    -> Two cron processes both observe that `/tmp/auto-deploy-next-admin.lock` does not exist before either writes it; both write their PIDs and continue into deployment, defeating the lock.
  why missed  -> The re-exec test covers a second tick after the first lock exists, but not two processes racing during initial lock creation.

FINDING 2: The sync is not actually all-or-nothing when a rename fails after earlier renames succeed.
  lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh:36 -> lobster-factory/infra/hetzner-phase1-core/scripts/sync-host-scripts.sh:79
  confidence  -> CONFIRMED
  scenario    -> `cp` stages every changed file successfully, the first `mv` succeeds, then a later target is immutable or otherwise cannot be replaced; the script exits non-zero, but the earlier file remains installed while later files remain old.
  why missed  -> The failure test injects an error only in `cp`; the EXIT trap removes staged files but cannot roll back files already renamed.

Final line: TOTAL: 2 findings
