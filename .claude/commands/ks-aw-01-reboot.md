---
name: ks-aw-01-reboot
description: Reboot ks-aw-01 (the only live host) with the full pre-flight and post-flight checklist. HIGH-RISK: the actual reboot is additionally gated by high-risk-bash-warn.js.
---

Reboot ks-aw-01 (`145.239.195.47`, OVH KS-6, SSH port `58122`, user `ubuntu`) safely with full pre-flight + post-flight checklists. **Replaces `/sg-reboot` and `/eu-reboot`** — those two commands targeted retired hosts, so they were deleted on 2026-09-20 rather than left as gravestones that still showed up in the command list.

> **Why this file exists (2026-08-30)**: `/codex-review` flagged that after the 2026-08-28 SG+EU consolidation, `scripts/ao-resume.ps1`'s reboot-required escalation still computed `/sg-reboot` or `/eu-reboot` as the suggested action, and both of those pointed their SSH `Connection:` at IPs that were deleted 2026-08-30 — a real risk that Claude itself would be instructed to run a command that fails outright. `ao-resume.ps1` now always points here instead.

> **Automatic reboots**: as of 2026-08-30 `lobster-factory/infra/hetzner-phase1-core/auto-reboot/ks-aw-01-auto-reboot.conf` re-enables native `unattended-upgrades` conditional auto-reboot (fires only when a reboot is actually pending, at 20:00 UTC). This manual command is for: forced/emergency reboots, or when the automatic one is disabled/pending decision (see TASKS.md). `ks-aw-01-boot-health-notify.sh` (same directory) fires on every boot — manual or automatic — and reports outcome via Telegram, so a bad reboot is never silent.

Use when:
- Netdata shows `System requires reboot after package updates` (warning), or
- `/var/run/reboot-required` exists, or
- A new kernel was installed by `unattended-upgrades` and is waiting for activation, or
- Forced/emergency reboot needed (kernel panic, disk corruption, post-incident recovery).

Use the `hetzner-ssh` MCP server. Connection:
- host: `145.239.195.47`
- port: `58122`
- user: `ubuntu` (passwordless sudo — **not** `root`; OVH Ubuntu cloud image convention, differs from the old Hetzner boxes which used `root` directly)
- privateKeyPath: `$env:USERPROFILE\.ssh\id_ed25519`（Claude 須先展開為絕對路徑）

ks-aw-01 runs **everything**: WordPress/Node-API/Next-Admin (ex-SG), Trigger.dev/Supabase/n8n/MainWP/Uptime-Kuma (ex-EU), plus Postiz and Soulful Expression WordPress (added after both migrations). A reboot here is a full-stack outage, not a partial one — there is no second box absorbing traffic while this one is down.

## Step 1 — Pre-flight (read-only; ABORT if any line fails)

1. `cat /var/run/reboot-required.pkgs` — confirm there IS a pending reboot reason; if file missing, ABORT (nothing to do) unless this is a forced/emergency reboot.
2. `uname -r` — record current kernel.
3. `dpkg -l | grep '^ii\s\+linux-image-' | awk '{print $2}'` — confirm the new kernel is already installed (otherwise reboot won't help).
4. `sudo docker ps -a --format '{{.Names}}\t{{.Status}}' | sort` — record full baseline (expect ~45+ containers across lobster/trigger/supabase/n8n/mainwp/postiz/soulful/uptime-kuma). `sudo docker ps --filter health=unhealthy -q` must be empty — ABORT if any container is unhealthy/restarting BEFORE you add a reboot on top of it.
5. `sudo docker inspect --format '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}}' $(sudo docker ps -q) | grep -vE 'unless-stopped|always'` — output must be empty. If any container shows `no`/`on-failure`, ABORT and fix the compose file first.
6. `sudo grep -E '^CLICKHOUSE_IMAGE_TAG' /root/trigger/.env` — must read a pinned `25.7.x` tag, never `latest`/`24.x` (AGENTS.md ClickHouse lock).
7. `df -h /` — root partition must be < 80% used (ks-aw-01's own strict threshold per `check-capacity-health.ps1`).
8. Backup freshness: `sudo ls -lt /root/lobster-phase1/backups/ 2>/dev/null | head -3` and check `agency-os/reports/status/backup-health-LATEST.md` — newest backup must be < 24h old. If stale, do NOT reboot on faith; investigate first.
9. Probe public endpoints — must all return 2xx (or 401/403 for protected):
   - `https://aware-wave.com/`, `https://app.aware-wave.com/`, `https://api.aware-wave.com/health`
   - `https://trigger.aware-wave.com/`, `https://supabase.aware-wave.com/`, `https://uptime.aware-wave.com/dashboard`
   - `https://postiz.aware-wave.com/`, `https://soulfulexpression.org/`, `https://mainwp.aware-wave.com/`
10. `cat /var/lib/awarewave-alert/last_state` — should be `ok`. If `fail:<sha>`, there's an outstanding incident; investigate first to avoid confusing a pre-existing failure with reboot fallout.
11. If Trigger.dev jobs run long: `sudo docker exec trigger-postgres psql -U postgres -d trigger -c "SELECT count(*) FROM \"TaskRun\" WHERE status IN ('EXECUTING','WAITING_FOR_DEPLOY') AND \"updatedAt\" > now() - interval '10 minutes';"` — if count > 0 and you can wait, postpone; otherwise note in WORKLOG.

## Step 2 — Reboot
Issue: `sudo bash -c 'nohup bash -c "sleep 1 && reboot" >/dev/null 2>&1 &'` then `ssh_disconnect`.
The 1-second delay lets SSH return cleanly so the MCP doesn't hang on a half-closed socket.

## Step 3 — Wait for box to come back
`ssh_connect` again with the same credentials (port 58122, user `ubuntu`). Poll up to 5 minutes.

**ICMP ping may be blocked at the OVH Edge Network Firewall** (only ICMP is explicitly permitted per `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md` P2.5c rules — ping SHOULD work here, unlike the old Hetzner boxes, but if it doesn't respond within a few seconds fall back to trying SSH directly; a connecting SSH is definitive, a missing ping is not).

**`ks-aw-01-boot-health-notify.service` will have already fired a Telegram message by the time you reconnect** (systemd runs it automatically on every boot) — check that message first; it independently confirms the boot outcome without you re-deriving it by hand.

## Step 4 — Post-flight verification (ALL must pass before reporting done)

1. `uname -r` — must equal the new kernel from pre-flight step 2.
2. `ls /var/run/reboot-required* 2>&1` — must say "No such file or directory".
3. Wait 60–90s after first SSH success for Docker daemon + all containers to come up. Then `sudo docker ps -a --format '{{.Names}}\t{{.Status}}' | sort` — compare against the Step 1.4 baseline; every container that was `Up`/`(healthy)` before must be again. `sudo docker ps --filter health=unhealthy -q` must be empty.
4. `sudo docker inspect trigger-clickhouse --format '{{.Config.Image}}'` — must still read the pinned `25.7.x` tag.
5. `sudo docker exec supabase-db pg_isready -U postgres` — must say `accepting connections`. If it reports `recovery mode` or refuses for > 2 minutes, investigate WAL replay before declaring done.
6. Probe the same public endpoints from pre-flight step 9 — must all return the same codes.
7. `systemctl is-active awarewave-endpoint-alert.timer` — must say `active`.
8. `sudo docker logs supabase-db --since 5m 2>&1 | grep -iE 'error|fatal|panic' | head` — should be empty or only routine warnings. Same spot-check for `trigger-postgres` and `trigger-clickhouse`.
9. Netdata: confirm any `post_update_reboot` alert clears within ~5 minutes.

## Step 5 — Report
Output:
- Old kernel → New kernel
- Total downtime (seconds, computed from the `nohup` timestamp vs first successful `ssh_connect`)
- Container status diff (baseline vs post-reboot — call out anything that didn't come back)
- All public endpoint codes
- ClickHouse image tag confirmation
- boot-health-notify Telegram message content (paste it — it's the independent check)
- Any anomalies

If anything fails post-flight: do NOT attempt remediation autonomously. Report immediately and let the operator decide between rollback or forward fix.

## Rollback (bad kernel / boot failure)

**⚠️ Gap, not a copy-paste procedure**: the old `/sg-reboot`/`/eu-reboot` rollback sections described Hetzner Cloud Console web KVM + GRUB menuentry selection — **that does not apply to ks-aw-01, which is an OVH dedicated server**, a different provider with a different out-of-band access mechanism (OVH Manager KVM/IPMI, not Hetzner Console). The exact OVH rescue-boot-to-fix-GRUB procedure has **not been written down anywhere in this repo yet** (same gap `/codex-review` flagged in `HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md`'s rescue-mode section — that playbook's Hetzner API rescue steps are equally inapplicable here). What IS known and verified: OVH rescue mode was tested successfully during provisioning (`AWARE_WAVE_CREDENTIALS.md` "OVH Dedicated Server" section, "rescue mode 實測 PASS") and OVH Manager access is via `auth.ca.ovhcloud.com` (same file). Until someone writes the actual step-by-step (boot to rescue via OVH Manager → mount root partition → chroot → grub-set-default → reboot), a genuinely stuck box needs: 1) OVH Manager → server → "Boot in rescue mode", 2) get rescue SSH credentials from the Manager, 3) mount the RAID1 root partition and chroot in, 4) fix the boot config, 5) reboot to normal mode. Treat this as a High-risk, go-slow situation and loop the operator in immediately rather than improvising further — this is exactly the kind of action where a wrong guess (wrong partition, wrong grub entry) can turn a bad-kernel problem into a data-loss problem.

Owner: this file is the canonical procedure for ks-aw-01. Supersedes `sg-reboot.md` (WP/Node-API/Next-Admin container list) and `eu-reboot.md` (Trigger/Supabase/n8n/MainWP container list + ClickHouse lock check) — this file's container/endpoint checks are their union plus Postiz/Soulful, which existed on neither original box.

History reference: see `eu-reboot.md`/`sg-reboot.md` git history for individual-box reboot precedent before the 2026-08-28 consolidation.

Risk tier: **High** — single point of failure for the entire stack, unlike the old two-box topology where this was Medium-in-name-Low-in-practice. Always confirm with operator before running unless they explicitly authorized autopilot for this turn (per AGENTS.md 操作風險分級, reboot of the sole production host is High-STOP by default).
