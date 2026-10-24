# codex-oracle review -- 2026-10-24 20:16:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3 after partialreview-b1246aa0: F1 (compose up failure under set -e skipped rollback) fixed by an invariant, not per command: right before the new content is written an EXIT trap is installed; any exit before finished=1 runs rollback (restore backup, re-up / reload). F2 test now asserts FROM_ENV from the shell. F3 the test uses its own label aw-sip-test=1. Test 16/16 on real docker compose; with the trap removed 5 cases fail.
- exit: 0 | elapsed: 350621ms | answer: 1916B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Rollback is skipped when the process receives TERM/HUP after writing the new file  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:128-129`  
  confidence  -> CONFIRMED  
  scenario    -> The script writes the new content, then SSH disconnect or an operator sends SIGTERM; only an EXIT trap is installed, so the shell terminates without rollback and leaves the unverified file deployed.  
  why missed  -> The invariant covers ordinary shell exits but not terminating signals.

FINDING 2: Shell environment values used at creation are not preserved  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:52,65-71`  
  confidence  -> CONFIRMED  
  scenario    -> A service is created with `V_SRC=old docker compose -f ... up`; later the patch runs without `V_SRC`. The container label has no env-file value, so Compose expands `${V_SRC}` from the current shell, recreates the service with an empty/different value, and the health check can still pass.  
  why missed  -> The test reuses the same shell value during patching (`safe-infra-patch-compose-labels.test.sh:65-69`), so it verifies current-environment propagation, not preservation of creation-time overrides.

FINDING 3: The success marker is set before success logging, so logging failure returns failure without rollback  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:221-226`  
  confidence  -> CONFIRMED  
  scenario    -> Health passes, `finished=1` is set, then `tee -a /root/lobster-phase1/safe-patch.log` fails because the disk is full; `set -e` exits nonzero, but the EXIT trap sees `finished=1` and leaves the new configuration in place despite reporting failure.  
  why missed  -> The new trap assumes every failure occurs before `finished=1`, but the success-reporting operations occur afterward.

TOTAL: 3 findings
