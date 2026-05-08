Reboot the SG VPS (`wordpress-ubuntu-4gb-sin-1` / 5.223.93.113) safely with full pre-flight + post-flight checklists.

Use when:
- Netdata shows `System requires reboot after package updates` (warning), or
- `/var/run/reboot-required` exists on SG, or
- A new kernel was installed by `unattended-upgrades` and is waiting for activation.

Use the `hetzner-ssh` MCP server. Connection:
- host: `5.223.93.113`
- user: `root`
- privateKeyPath: `C:\Users\user1115\.ssh\hetzner_trigger`

## Step 1 — Pre-flight (read-only; ABORT if any line fails)
1. `cat /var/run/reboot-required.pkgs` — confirm there IS a pending reboot reason; if file missing, ABORT (nothing to do).
2. `uname -r` — record current kernel.
3. `dpkg -l | grep '^ii\s\+linux-image-' | awk '{print $2}'` — confirm the new kernel is already installed (otherwise reboot won't help).
4. `docker ps --format '{{.Names}}\t{{.Status}}'` — all 6 containers must be `Up`/healthy: `lobster-next-admin`, `lobster-wordpress`, `lobster-node-api`, `lobster-redis`, `lobster-nginx`, `lobster-wordpress-db`.
5. `docker inspect --format '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}}' $(docker ps -q)` — every container MUST show `restart=unless-stopped`. If any shows `no` or `on-failure`, ABORT and ask the operator to fix the compose file first.
6. Probe public endpoints — must all return 200: `https://aware-wave.com/`, `https://app.aware-wave.com/`, `https://api.aware-wave.com/health`, `https://uptime.aware-wave.com/dashboard`.
7. `cat /var/lib/awarewave-alert/last_state` — should be `ok`. If `fail:<sha>`, the endpoint-alert has an outstanding incident; investigate first to avoid noisy Slack on reboot.

## Step 2 — Reboot
Issue: `nohup bash -c 'sleep 1 && reboot' >/dev/null 2>&1 &` then `ssh_disconnect`.
The 1-second delay lets SSH return cleanly so the MCP doesn't hang on a half-closed socket.

## Step 3 — Wait for box to come back
`ssh_connect` again with the same credentials. Poll up to 4 minutes; success usually within 30-60s.

**ICMP ping is blocked at the Hetzner edge** — do NOT poll with `ping`. Try SSH directly; if it connects, the box is up.

## Step 4 — Post-flight verification (ALL must pass before reporting done)
1. `uname -r` — must equal the new kernel from pre-flight step 3.
2. `ls /var/run/reboot-required* 2>&1` — must say "No such file or directory".
3. `docker ps --format '{{.Names}}\t{{.Status}}'` — all 6 containers `Up`. Note: `lobster-nginx` shows `Up <N>m` without `(healthy)` because it has no healthcheck — that is normal, not a failure.
4. Probe the same 4 public endpoints again — must all 200.
5. `systemctl is-active awarewave-endpoint-alert.timer` — must say `active`.
6. Check Kuma push monitor `id=21` is recovering: `docker exec uptime-kuma sh -c "sqlite3 /app/data/kuma.db \"SELECT datetime(time), status FROM heartbeat WHERE monitor_id=21 ORDER BY id DESC LIMIT 3;\""` (run this on `hetzner-eu`, NOT SG). Within 2 minutes of post-reboot recovery, the latest heartbeat should be `status=1`.

## Step 5 — Report
Output:
- Old kernel → New kernel
- Total downtime (seconds, computed from `nohup` time vs first successful `ssh_connect`)
- All 6 container statuses
- All 4 public endpoint codes
- Kuma push monitor recovery status
- Any anomalies

If anything fails post-flight: do NOT attempt remediation autonomously. Report immediately and let the operator decide between rollback (`grub-set-default '0>1'` to use previous kernel + reboot) or forward fix.

Owner doc: `C:\Users\user1115\.claude\projects\d--Work\memory\reference_recurring_ops_recipes.md` §2. Do not duplicate the procedure here — link, not copy.

Risk tier: **Medium** in name, **Low** in practice when the pre-flight checklist passes (downtime < 1 minute, all containers `restart=unless-stopped`, no container holds long-lived state outside docker volumes). Confirm with operator before running unless they explicitly authorized autopilot for this turn.
