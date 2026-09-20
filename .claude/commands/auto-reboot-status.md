---
name: auto-reboot-status
description: Check the ks-aw-01 daily auto-reboot health: last run, next run, and whether the 16-hour escalation window was breached.
---

# Check ks-aw-01 auto-reboot health

Read-only diagnostic for the only production host: **ks-aw-01** (`145.239.195.47`,
SSH `-p 58122`, `ubuntu` with `sudo`). It never changes the host or triggers a reboot.

Use when:

- the auto-reboot report is non-green or a reboot marker has remained for 16 hours;
- verifying the reboot control plane after a host switch or a maintenance change;
- checking the next conditional window (20:00 UTC / 04:00 TPE).

During a **host switch**, read only `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md`; this
command is its read-only health probe. For normal day-2 operation, see
`runbooks/VPS-AUTO-REBOOT-RUNBOOK.md`.

Risk tier: **Low**. Manual reboot escalation is `/ks-aw-01-reboot` and remains
**High risk**: require an explicit operator go-ahead.

## Run

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-vps-auto-reboot-health.ps1
```

The script writes `agency-os/reports/status/auto-reboot-LATEST.{md,json}` and
checks the remote ground truth against the repository SSOT:

- `Automatic-Reboot=true`, `Automatic-Reboot-Time=20:00`, and
  `Automatic-Reboot-WithUsers=true`;
- SHA256 of `ks-aw-01-auto-reboot.conf` deployed as
  `/etc/apt/apt.conf.d/52awarewave-auto-reboot`;
- `unattended-upgrades` active **and** enabled;
- no legacy `53awarewave-stagger-eu.conf`;
- boot-notify unit enabled, unit file present, notification script executable,
  and Telegram drop-in present (values are never read or printed);
- reboot-required marker, current kernel, and last reboot.

## Verdict

- **PASS** — all required control-plane checks are present and match SSOT.
- **WARN** — a configuration or SSOT mismatch; investigate before it becomes a
  reboot incident.
- **FAIL** — SSH failure, daemon/config missing, or boot-notify chain incomplete.

`reboot-required` is informational: Ubuntu performs its conditional automatic
reboot at 20:00 UTC. If it persists more than 16 hours, inspect the report then
use `/ks-aw-01-reboot` only after explicit approval.

## Source of truth

- Host-switch procedure: `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md`
- Day-2 operations: `runbooks/VPS-AUTO-REBOOT-RUNBOOK.md`
- Repository SSOT: `lobster-factory/infra/hetzner-phase1-core/auto-reboot/`
- Manual emergency procedure: `/ks-aw-01-reboot`
