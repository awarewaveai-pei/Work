# codex-oracle review -- 2026-10-23 12:59:00 +08:00

- mode: `review`
- scope: -Path scripts/lib/ssh-deadline.ps1, scripts/check-cloudflare-security.ps1, scripts/archive-completed-tasks.ps1, lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, scripts/audit-detector-contract.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Re-review of fixes for 5 findings from the previous round: ssh-deadline post-kill drain bounded (~3s overrun); cloudflare lockdown any non-active state degrades PASS to WARN; archive-completed-tasks keeps a checked parent that has an open child in place; safe-infra-patch rollback uses the compose file own directory like the forward path; audit-detector-contract requires generated_utc. Verify each fix is correct and complete and introduces no regression. PS 5.1 / bash.
- exit: 0 | elapsed: 208790ms | answer: 1856B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, scripts/check-cloudflare-security.ps1, scripts/archive-completed-tasks.ps1, scripts/audit-detector-contract.ps1, scripts/lib/ssh-deadline.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Compose checks can operate on a different file than the patched file  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:50`  
  confidence  -> CONFIRMED  
  scenario    -> `COMPOSE_FILE` points elsewhere, or multiple default compose files exist -> `config`/`up` validates another project, reports healthy, and leaves the patched file inactive.  
  why missed  -> The directory was corrected, but the explicit compose file was never passed with `-f`.

FINDING 2: Cloudflare lockdown ignores nonzero SSH exits when stdout matches  
  file:line   -> `scripts/check-cloudflare-security.ps1:328`  
  confidence  -> CONFIRMED  
  scenario    -> SSH prints `AW=403;SF=403` then exits 255 after a connection failure -> status becomes `active` and PASS is retained.  
  why missed  -> The branch checks only timeout and regex output; it never checks `ExitCode`.

FINDING 3: Detector audit accepts unusable `generated_utc` values  
  file:line   -> `scripts/audit-detector-contract.ps1:34` -> `scripts/ao-resume.ps1:798`  
  confidence  -> CONFIRMED  
  scenario    -> JSON has `generated_utc: ""` or an invalid timestamp with `measured=1` -> audit passes, while AO-RESUME treats the report as stale/unreadable and reruns the check.  
  why missed  -> The fix checks field presence only, not parseability or non-empty content.

FINDING 4: Task archive write is non-atomic and can lose TASKS.md  
  file:line   -> `scripts/archive-completed-tasks.ps1:151` -> `scripts/lib/repo-text.ps1:36`  
  confidence  -> CONFIRMED  
  scenario    -> Process or power fails during `WriteAllText` -> `agency-os/TASKS.md` may be truncated after tasks were removed in memory, losing both open and completed tasks.  
  why missed  -> The shared writer supports `-Atomic`, but this caller uses its direct-write path.

TOTAL: 4 findings
