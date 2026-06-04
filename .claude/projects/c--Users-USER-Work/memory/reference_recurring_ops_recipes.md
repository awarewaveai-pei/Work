---
name: Recurring ops recipes — trigger-webapp memory creep, SG kernel reboot, parallel-session conflicts
description: Three operational recipes proven safe in production: Trigger.dev self-hosted webapp memory restart, SG (wordpress-ubuntu-4gb-sin-1) kernel reboot, and detection of parallel agent edits that overwrite my drop-ins
type: reference
originSessionId: 6ed5055d-1f88-4ffe-968b-938f28b56a31
---
## 1. Trigger.dev self-hosted webapp memory creep (EU)

**Symptom:** EU `awarewave-eu-hel1-cpx32` (204.168.175.41) Netdata "Avg Used RAM" climbs from baseline ~50% to ~73% over 24-48h.
**Root cause:** `trigger-webapp` container (Node.js Next.js SSR) memory creep — typical Trigger.dev self-hosted behavior. Not a leak triggering OOM; just slow heap growth.
**Recipe (Low risk, ~22s downtime, jobs auto-retry):**
```bash
ssh hetzner-eu
docker stats --no-stream --format 'name={{.Name}} mem={{.MemUsage}} ({{.MemPerc}})' trigger-webapp
docker restart trigger-webapp
# wait healthy, expect ~22s
docker stats --no-stream --format 'name={{.Name}} mem={{.MemUsage}} ({{.MemPerc}})' trigger-webapp
```
**Expected result:** RAM drops from ~1.6 GiB to ~700 MiB. Baseline restored.
**Trigger:** when EU Netdata gauge >70% AND `trigger-webapp` `MemPerc` >60% of its 2.5 GiB limit.
**Last verified:** 2026-05-08 — 1.648 GiB → 727 MiB (-55%).

## 2. SG kernel reboot (`wordpress-ubuntu-4gb-sin-1`, 5.223.93.113)

**Symptom:** `/var/run/reboot-required` exists; Netdata shows yellow "System requires reboot after package updates" alert.
**Recipe (High risk in name, but actually clean — <1 min total downtime, all 6 containers `restart=unless-stopped`):**
```bash
ssh hetzner-sg
# pre-flight
cat /var/run/reboot-required.pkgs
uname -r            # current kernel
dpkg -l | grep '^ii\s\+linux-image-' | awk '{print $2}'   # confirm new kernel installed
docker inspect --format '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}}' $(docker ps -q)
# all containers must show restart=unless-stopped before reboot

nohup bash -c 'sleep 1 && reboot' >/dev/null 2>&1 &
exit
# Box returns SSH-reachable in ~30-60s. ICMP ping is blocked by Hetzner edge — test SSH directly, not ping.

# post-flight (after reconnect)
uname -r            # must match new kernel
ls /var/run/reboot-required* 2>&1   # must be "No such file or directory"
docker ps           # all 6 containers Up <N> minutes (lobster-nginx has no healthcheck)
systemctl is-active awarewave-endpoint-alert.timer  # active
```
**Containers:** lobster-next-admin, lobster-wordpress, lobster-node-api, lobster-redis, lobster-nginx, lobster-wordpress-db. All have `restart=unless-stopped`.
**Slack noise during reboot:** ZERO if endpoint-alert state was `ok` pre-reboot — script doesn't fire during system shutdown, and post-reboot first cycle finds all endpoints healthy → state stays `ok` → no transition → no Slack.
**External monitors during reboot:** Uptime Kuma external HTTP probes from EU may flag SG monitors briefly (~1-2 minutes); they auto-recover.
**Last verified:** 2026-05-08 — 110→111 kernel, downtime ~30s, all containers healthy post-boot.

## 3. Parallel agent / Cursor session conflict detection

**Symptom:** A drop-in / config file I just edited gets reverted minutes later without my action.
**Detection path:**
```bash
# Check file mtime vs my last edit timestamp
stat /etc/default/awarewave-endpoint-alert.local
# Check journal for crontab REPLACE / sudo / sshd activity at that mtime
journalctl --since '<mtime - 2m>' --until '<mtime + 2m>' --no-pager | grep -iE '(crontab|REPLACE|sudo|edit)'
```
**Real example (2026-05-08):**
- I edited `/etc/default/awarewave-endpoint-alert.local` at 08:29 to uncomment HEARTBEAT_URL. Round-trip verified.
- A parallel session edited crontab at 08:38:18 (`crontab REPLACE`) AND apparently re-templated the same `.local` file (mtime 08:38). This re-commented HEARTBEAT_URL.
- After SG reboot at 08:44:56, Kuma flagged the heartbeat as DOWN starting 08:46:09 because the script was reading the empty HEARTBEAT_URL.
- Fix: re-run my un-comment sed; round-trip restored at 08:58:03.
**Apply:** when fixing infrastructure mid-session, periodically re-verify drop-ins still match my expected state (especially after long gaps or another agent's session is suspected). Don't trust "I just wrote it" — verify with `stat`/`grep` before declaring done.
