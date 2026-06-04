---
name: State persistence must come before any side effect in shell scripts
description: Bash scripts using `set -e` must persist their state machine BEFORE Slack/PagerDuty/heartbeat/etc., or a side-effect crash will silently corrupt dedup
type: feedback
originSessionId: 6ed5055d-1f88-4ffe-968b-938f28b56a31
---
In a `set -euo pipefail` shell script that drives a state machine + side effects (alerts, webhooks, heartbeats), **always write the new state to disk BEFORE any side effect**. Use atomic write (`tmp + mv -f`).

**Why:** SG `endpoint-alert.sh` (2026-05-08) had `printf > STATE_FILE` as the LAST line. When the heartbeat call (`curl -fsS HEARTBEAT_URL`) hit a 404 (Uptime Kuma push token expired), `set -e` killed the script before state was persisted. STATE_FILE stayed at "fail" indefinitely; every subsequent run misread "fail→ok" as a fresh recovery and re-spammed Slack with `[aware-wave endpoint recovered]` every minute. User received hundreds of identical "recovered" messages until silenced.

**How to apply:** When reviewing or writing alerter / cron / event-driven scripts, the order MUST be:
1. compute new state
2. atomically persist new state (`tmp + mv -f`)
3. emit side effects (Slack, PagerDuty, heartbeat, log)
4. mark side-effect calls non-fatal (`|| true`, or implement them so non-2xx logs a warning instead of exiting)

Side effects that crash the script must NEVER be allowed to regress the state machine.

Companion rules in the same script class:
- **Heartbeat / observability calls must be non-fatal.** They observe the alerter; they must not break it. No `curl -f` in heartbeat. Use `code=$(curl -w "%{http_code}" || echo 000)` and log if non-2xx.
- **Dedup needs a fingerprint, not a binary.** "ok"/"fail" only dedups identical states; "ok"/"fail:<sha256(sorted_failures)>" dedups identical *failure sets*, which is what operators actually want — same failure set → one alert; different failure set → new alert.
