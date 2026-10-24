# codex-oracle review -- 2026-10-24 15:02:30 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/cron-run.sh, lobster-factory/infra/hetzner-phase1-core/scripts/report-host-schedules.py, lobster-factory/infra/hetzner-phase1-core/scripts/install-host-schedules.sh, lobster-factory/infra/hetzner-phase1-core/scripts/cron.d, lobster-factory/infra/hetzner-phase1-core/scripts/reconcile-videos.sh, lobster-factory/infra/hetzner-phase1-core/scripts/wp-cron-runner.sh, lobster-factory/infra/hetzner-phase1-core/scripts/install-maintenance-crons.sh, lobster-factory/infra/hetzner-phase1-core/scripts/backup-coverage.cron, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/host-schedules.test.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Every host schedule becomes visible on /ops/schedules: scripts/cron.d/* is the repo SSOT for our cron files (root crontab retired into awarewave-schedules), each line runs through cron-run.sh which records the exit code to /var/lib/awarewave/jobs, report-host-schedules.py inventories the LIVE crontab/cron.d/run-parts/systemd timers every 10 min, next-admin shows unregistered/missing/drift rows. Also reconcile-videos goes from */15 to twice daily with 3 in-run retries, exits 1 when broken, and fixes the 24h re-alert stamp that was overwritten every run. Key risks to check: a cron line that no longer runs its job (quoting, %, env, PATH), the installer losing a root crontab job or not being reversible, secrets leaking into the published JSON, the page claiming ok when the data is stale. Also verify: does this change depend on something NOT visible in this diff -- a config value, retention/timeout setting, schema assumption, cron schedule, or upstream default defined elsewhere in the repo? If it contradicts the change, report it. If you cannot support a real finding, say so directly and return no findings; do not invent weak findings.

- exit: 0 | elapsed: 149935ms | answer: 3050B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/host-status.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/types.ts, lobster-factory/infra/hetzner-phase1-core/scripts/backup-coverage.cron, lobster-factory/infra/hetzner-phase1-core/scripts/install-maintenance-crons.sh, lobster-factory/infra/hetzner-phase1-core/scripts/reconcile-videos.sh, lobster-factory/infra/hetzner-phase1-core/scripts/wp-cron-runner.sh, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/host-schedules.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/host-schedules.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/cron-cadence.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/host-jobs.ts, lobster-factory/infra/hetzner-phase1-core/scripts/cron-run.sh, lobster-factory/infra/hetzner-phase1-core/scripts/install-host-schedules.sh, lobster-factory/infra/hetzner-phase1-core/scripts/report-host-schedules.py, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/host-schedules.test.py
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/backup-coverage.cron@17ab48663

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Installer leaves retired `/etc/cron.d` files active and reports the host as in sync  
  lobster-factory/infra/hetzner-phase1-core/scripts/install-host-schedules.sh:41-48 -> lobster-factory/infra/hetzner-phase1-core/scripts/install-host-schedules.sh:71-80  
  confidence  -> CONFIRMED  
  scenario    -> An old `/etc/cron.d/backup-coverage` remains after upgrade -> `--check` ignores it and the old job continues running, potentially duplicating the new schedule.  
  why missed  -> The installer compares only filenames currently present in `scripts/cron.d`; it never enumerates or removes extra live cron files.

FINDING 2: Inventory errors are written but ignored, so a fresh partial report can claim jobs are missing  
  lobster-factory/infra/hetzner-phase1-core/scripts/report-host-schedules.py:82 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/host-schedules.ts:22-25,113-126  
  confidence  -> CONFIRMED  
  scenario    -> `systemctl list-timers` fails, but the reporter writes a fresh document with `errors` and no timers -> the page treats the affected registered jobs as currently missing instead of showing an inventory failure/stale state.  
  why missed  -> The producer includes `errors`, but the consumer’s schema and validation discard that field.

FINDING 3: Published unregistered commands can still expose secrets  
  lobster-factory/infra/hetzner-phase1-core/scripts/report-host-schedules.py:27 -> lobster-factory/infra/hetzner-phase1-core/scripts/report-host-schedules.py:73-74  
  confidence  -> CONFIRMED  
  scenario    -> An unregistered cron line contains `curl -H 'Authorization: Bearer secret' ...` -> the command is copied into the JSON unchanged because redaction only handles `NAME=value` assignments.  
  why missed  -> The implementation treats assignment-shaped values as the complete secret surface, while headers, `-u user:pass`, and command arguments are also common secret forms.

FINDING 4: The run-parts inventory reports files that cron will not execute  
  lobster-factory/infra/hetzner-phase1-core/scripts/report-host-schedules.py:116-126 -> `/etc/cron.daily/backup.disabled`  
  confidence  -> CONFIRMED  
  scenario    -> An executable `/etc/cron.daily/backup.disabled` exists -> `collect_run_parts()` publishes it as a daily schedule even though run-parts ignores filenames containing a dot.  
  why missed  -> The collector checks only executability, leading-dot names, and `placeholder`; it does not apply run-parts filename rules.

FINDING 5: A malformed successful timestamp is classified as healthy  
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/host-schedules.ts:42-47 -> `finished_at: "not-a-timestamp"`  
  confidence  -> CONFIRMED  
  scenario    -> A record has `exit_code: 0` but an invalid `finished_at` -> `Date.parse()` yields `NaN`, the stale comparison is false, and the row is returned as `ok`.  
  why missed  -> Timestamp validity is not checked before applying the success path.

TOTAL: 5 findings
