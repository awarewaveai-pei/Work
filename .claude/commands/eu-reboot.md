Reboot the EU VPS (`awarewave-eu-hel1-cpx32` / 204.168.175.41) safely with full pre-flight + post-flight checklists.

> **🚨 2026-08-28 拓樸退役**：本指令針對的機器已整併入 ks-aw-01（`149.202.64.114`）並待刪除。
> 單機拓樸下的 reboot = 全站停機窗口，一律 High-risk 手動 + 明示 go-ahead；auto-reboot 決策見 TASKS.md。


Use when:
- Netdata shows `System requires reboot after package updates` (warning) on `awarewave-eu-hel1-cpx32`, or
- `/var/run/reboot-required` exists on EU, or
- A new kernel was installed by `unattended-upgrades` and is waiting for activation.

Use the `hetzner-ssh` MCP server (or `ssh` directly). Connection:
- host: `204.168.175.41`
- user: `root`
- privateKeyPath: `$env:USERPROFILE\.ssh\hetzner_trigger`（Claude 須先展開為絕對路徑）

EU 是 Trigger.dev / Supabase / n8n / MainWP / uptime-kuma 的家。Reboot 期間這些服務全部短暫中斷（5–10 分鐘），客戶 webhook、realtime、ops dashboard 會收到 502。

## Step 1 — Pre-flight (read-only; ABORT if any line fails)

1. `cat /var/run/reboot-required.pkgs` — confirm there IS a pending reboot reason; if file missing, ABORT (nothing to do).
2. `uname -r` — record current kernel.
3. `dpkg -l | grep '^ii\s\+linux-image-' | awk '{print $2}'` — confirm the new kernel is already installed (otherwise reboot won't help).
4. `docker ps --format '{{.Names}}\t{{.Status}}'` — expected ~25 containers up:
   - Trigger.dev (10): `trigger-clickhouse`, `trigger-docker-proxy`, `trigger-electric`, `trigger-minio`, `trigger-postgres`, `trigger-redis`, `trigger-registry`, `trigger-supervisor`, `trigger-webapp`, `buildx_buildkit_trigger0`
   - Supabase (11): `supabase-auth`, `supabase-db`, `supabase-edge-functions`, `supabase-imgproxy`, `supabase-kong`, `supabase-meta`, `supabase-pooler`, `supabase-rest`, `supabase-storage`, `supabase-studio`, `realtime-dev.supabase-realtime`
   - n8n (1): `n8n`
   - MainWP (2): `mainwp-db`, `mainwp-web`
   - Other (1): `uptime-kuma`
   All `healthy` containers must show `(healthy)`; ABORT if any critical container is unhealthy/restarting (would amplify reboot risk).
5. `docker inspect --format '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}}' $(docker ps -q) | grep -v unless-stopped` — output must be empty. If any container shows `no`/`on-failure`/empty, ABORT and fix the compose file first.
6. `grep -E '^CLICKHOUSE_IMAGE_TAG' /root/trigger/.env` — must read `CLICKHOUSE_IMAGE_TAG=25.7.5-debian-12-r0`. If missing or floating (`latest`/`24.x`), ABORT — locked per AGENTS.md.
7. `df -h /` — root partition must be < 90% used.
8. Backup verification: `ls -lt /root/backups/ | head -3` — newest daily backup must be < 24 hours old. If stale, run a fresh `pg_dump` of supabase-db before proceeding (best-effort safety net for dirty-shutdown recovery).
9. Probe public endpoints — must all return 2xx (or 401 for protected):
   - `https://trigger.aware-wave.com/`
   - `https://supabase.aware-wave.com/` (kong)
   - `https://uptime.aware-wave.com/dashboard`
   - n8n if publicly exposed
10. (Optional, if Trigger.dev jobs run long) check for in-progress long-running runs that would be killed by reboot:
    - `docker exec trigger-postgres psql -U postgres -d trigger -c "SELECT count(*) FROM \"TaskRun\" WHERE status IN ('EXECUTING','WAITING_FOR_DEPLOY') AND \"updatedAt\" > now() - interval '10 minutes';"` 
    - If count > 0 and you can wait, postpone until idle; otherwise note in WORKLOG.

## Step 2 — Reboot
Issue: `nohup bash -c 'sleep 1 && reboot' >/dev/null 2>&1 &` then disconnect SSH.
The 1-second delay lets SSH return cleanly so the MCP doesn't hang on a half-closed socket.

## Step 3 — Wait for box to come back
`ssh_connect` again with the same credentials. Poll up to 4 minutes; success usually within 30–90 s (Hetzner CPX32 boots slightly slower than the smaller SG box).

**ICMP ping is blocked at the Hetzner edge** — do NOT poll with `ping`. Try SSH directly; if it connects, the box is up.

## Step 4 — Post-flight verification (ALL must pass before reporting done)

1. `uname -r` — must equal the new kernel from pre-flight step 3.
2. `ls /var/run/reboot-required* 2>&1` — must say "No such file or directory".
3. Wait 60–90 s after first SSH success for Docker daemon + containers to come up. Then `docker ps --format '{{.Names}}\t{{.Status}}'` — all ~25 containers `Up` and the ones that had `(healthy)` pre-flight must regain `(healthy)`.
4. `docker inspect trigger-clickhouse --format '{{.Config.Image}}'` — must read `bitnamilegacy/clickhouse:25.7.5-debian-12-r0` (NOT `latest`, NOT `24.x`). This is the ClickHouse lock confirmation.
5. `docker exec supabase-db pg_isready -U postgres` — must say `accepting connections`. If Postgres reports `recovery mode` or refuses for > 2 minutes, investigate WAL replay before declaring done.
6. Probe the same public endpoints from pre-flight step 9 — must all return 2xx/401.
7. `docker logs supabase-db --since 5m 2>&1 | grep -iE 'error|fatal|panic' | head` — should be empty or only routine warnings. Same for `trigger-postgres` and `trigger-clickhouse`.
8. Netdata: confirm `system.post_update_reboot_status` flips back to 0 (alert auto-clears within ~5 minutes).

## Step 5 — Report
Output:
- Old kernel → New kernel
- Total downtime (seconds, computed from `nohup` time vs first successful `ssh_connect`)
- All 25 container statuses (highlight any not `Up`/`healthy`)
- All public endpoint codes
- ClickHouse image tag confirmation
- Netdata alert state
- Any anomalies

If anything fails post-flight: do NOT attempt remediation autonomously. Report immediately and let the operator decide between rollback (`grub-set-default '0>1'` → previous kernel + reboot) or forward fix.

## Rollback
If new kernel fails to boot or causes regression:
1. Get into the box via Hetzner Cloud Console (web KVM) — `https://console.hetzner.cloud/projects/<id>/servers/<id>` → "Console".
2. At the GRUB menu, select "Advanced options for Ubuntu" → choose the previous kernel (`5.15.0-177-generic` or whichever was current pre-reboot).
3. Once booted on the old kernel, run `grub-set-default '1>2'` (or similar — the exact menuentry index depends on the GRUB menu). Verify with `grub-reboot --help` first.
4. `apt-mark hold linux-image-<bad-version>` to prevent re-application until investigated.
5. File a GitHub issue with full logs (`journalctl -k -b -1` = previous boot kernel log).

Owner: this file is the canonical procedure for EU reboots. Mirrors `sg-reboot.md` structure; differences are container scope (EU runs Trigger/Supabase/n8n/MainWP, SG runs WP/Node-API/Next-Admin), ClickHouse lock check (EU-specific), and Postgres recovery check (Supabase DB is more state-critical than SG's WP DB).

History reference: see WORKLOG entry `2026-05-22` (first EU reboot under this runbook; kernel `5.15.0-177 → 5.15.0-179`).

Risk tier: **Medium** in name, **Low** in practice when the pre-flight checklist passes (downtime < 2 minutes, all containers `restart=unless-stopped`, fresh daily backup exists, ClickHouse pinned). Confirm with operator before running unless they explicitly authorized autopilot for this turn.
