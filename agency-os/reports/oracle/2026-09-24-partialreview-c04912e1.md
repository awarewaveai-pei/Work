# codex-oracle review -- 2026-09-24 15:48:37 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/wp-cron-runner.sh, lobster-factory/infra/hetzner-phase1-core/scripts/endpoint-alert.sh, lobster-factory/infra/hetzner-phase1-core/scripts/awarewave-endpoint-alert.service, lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, lobster-factory/infra/hetzner-phase1-core/scripts/install-maintenance-crons.sh, lobster-factory/infra/soulful/nginx/soulful-cache.conf, lobster-factory/infra/soulful/nginx/soulfulexpression.org.conf, lobster-factory/infra/soulful/mu-plugins/aw-slow-log.php, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/wp-cron-runner.test.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-host-nginx.test.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Soulful WordPress: DISABLE_WP_CRON had no scheduler for 4 weeks. Adds a host wp-cron-runner (discovery by /var/www/html mount + DISABLE_WP_CRON, per-container flock, heartbeat only after a fully healthy tick), a dead-man freshness check in endpoint-alert.sh (fresh.d registrations), endpoint-alert service now runs the sync-host-scripts copy, safe-infra-patch host-nginx type (the nginx type only tests the lobster-nginx container), nginx: timed log format, proxy_cache_background_update, 403 on /wp-cron.php, and a slow-request mu-plugin logging to error_log. Runs as root on the prod host. Look for: wrong-host effects, silent-pass paths, lock/heartbeat logic errors, injection via container names or registration files, nginx cache correctness for a WooCommerce store.
- exit: 0 | elapsed: 93568ms | answer: 1602B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/awarewave-endpoint-alert.service, lobster-factory/infra/hetzner-phase1-core/scripts/endpoint-alert.sh, lobster-factory/infra/hetzner-phase1-core/scripts/install-maintenance-crons.sh, lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, lobster-factory/infra/hetzner-phase1-core/scripts/wp-cron-runner.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-host-nginx.test.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/wp-cron-runner.test.sh, lobster-factory/infra/soulful/mu-plugins/aw-slow-log.php, lobster-factory/infra/soulful/nginx/soulful-cache.conf, lobster-factory/infra/soulful/nginx/soulfulexpression.org.conf
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A Docker discovery failure is treated as a healthy tick and refreshes the dead-man heartbeat  
  `lobster-factory/infra/hetzner-phase1-core/scripts/wp-cron-runner.sh:60` -> `lobster-factory/infra/hetzner-phase1-core/scripts/wp-cron-runner.sh:99`  
  confidence  -> CONFIRMED  
  scenario    -> Docker daemon is unavailable, so `docker ps` yields no containers; the loop runs zero times, `healthy` remains `1`, and `heartbeat` is touched. Endpoint-alert therefore stays healthy while no WordPress cron jobs can run. The same occurs when `docker inspect` fails for every discovered container because line 63 silently skips them.  
  why missed  -> The heartbeat condition checks only whether the loop observed failures; it does not distinguish “all targets healthy” from “discovery returned nothing.”

FINDING 2: A timed-out remote cron command can outlive the per-container lock  
  `lobster-factory/infra/hetzner-phase1-core/scripts/wp-cron-runner.sh:76` -> `lobster-factory/infra/hetzner-phase1-core/scripts/wp-cron-runner.sh:83`  
  confidence  -> PLAUSIBLE  
  scenario    -> A cron event runs longer than `RUN_TIMEOUT`; `timeout` terminates the local `docker exec` client, the lock is released at line 85, but the process inside the container continues. The next minute starts a second `wp cron event run --due-now`, creating concurrent cron execution despite the claimed serialization.  
  why missed  -> The lock protects only the host-side command lifetime; the code assumes terminating `docker exec` also terminates the process inside the container.

Final: TOTAL: 2 findings
