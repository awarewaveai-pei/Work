# codex-oracle review -- 2026-10-24 15:52:21 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh, scripts/check-compose-invariants.py, tests/scripts/test_check_compose_invariants.py, lobster-factory/infra/chatwoot/docker-compose.yml, lobster-factory/infra/n8n/docker-compose.yml, lobster-factory/infra/postiz/docker-compose.yml, lobster-factory/infra/supabase/docker-compose.yml, lobster-factory/infra/trigger/docker-compose.yml, lobster-factory/infra/hetzner-eu/uptime-kuma-compose.yml, lobster-factory/infra/hetzner-phase1-core/docker-compose.observability.yml, lobster-factory/infra/hetzner-phase1-core/apps/video-service/docker-compose.video.yml, lobster-factory/infra/hetzner-phase1-core/apps/remotion-service/docker-compose.remotion.yml, Projects/internal/cognitive-engineering-os/docker-compose.yml, Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml, Projects/internal/ziwei-doushu/docker-compose.yml  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Compose invariants I1-I6 rolled out to the 12 remaining prod compose files (memory limit, memswap==memory, pids limit, init:true, healthcheck bounded by timeout N; memory raised only where peak>=80% of limit or swap>0, to 1.5x(peak+swap); pids=nextpow2(2x observed peak), min 64). chatwoot base service became an x- extension field (it was a startable phantom service). safe-infra-patch.sh compose: when TARGET has a container whose compose labels list the file, compose runs with that container project/working dir/files/env file (needed for docker-compose.observability.yml, docker-compose.video.yml --env-file .env.video, cognitive-db); else the old default-name rule. check-compose-invariants.py --running compares running containers HostConfig (Memory, MemorySwap, PidsLimit, Init) and their actual healthcheck with the file. Prod already applied for 9 files; all probes were executed inside their containers before apply.
- exit: 0 | elapsed: 257853ms | answer: 1407B
- files-reviewed: Projects/internal/cognitive-engineering-os/docker-compose.yml, Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml, Projects/internal/ziwei-doushu/docker-compose.yml, lobster-factory/infra/chatwoot/docker-compose.yml, lobster-factory/infra/hetzner-eu/uptime-kuma-compose.yml, lobster-factory/infra/hetzner-phase1-core/apps/remotion-service/docker-compose.remotion.yml, lobster-factory/infra/hetzner-phase1-core/apps/video-service/docker-compose.video.yml, lobster-factory/infra/hetzner-phase1-core/docker-compose.observability.yml, lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, lobster-factory/infra/n8n/docker-compose.yml, lobster-factory/infra/postiz/docker-compose.yml, lobster-factory/infra/supabase/docker-compose.yml, lobster-factory/infra/trigger/docker-compose.yml, scripts/check-compose-invariants.py, tests/scripts/test_check_compose_invariants.py, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Uptime Kuma’s new host port does not match the tracked public proxy port.
  file:line   -> `lobster-factory/infra/hetzner-eu/uptime-kuma-compose.yml:10` -> `lobster-factory/infra/hetzner-phase1-core/apache/sites-available/uptime.conf:22`
  confidence  -> CONFIRMED
  scenario    -> Kuma listens on `127.0.0.1:3005`, while Apache proxies `uptime.aware-wave.com` to `localhost:3050` -> public requests and WebSockets fail with connection refused/502.
  why missed  -> The patch health gate checks only container health at `safe-infra-patch.sh:116-128`; it does not probe the public vhost, and the new comment incorrectly assumes an nginx vhost.

FINDING 2: Label-based patching fails for Compose projects created without `--env-file`.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:52` -> `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:70-71`
  confidence  -> CONFIRMED
  scenario    -> Cognitive deployment creates containers with `docker compose -f ... up -d` at `deploy/deploy.sh:208`, so no `environment_file` project label exists -> `c_env` becomes `<no value>`, the script adds `--env-file <no value>`, and `compose config` fails instead of applying the patch.
  why missed  -> The new test exercises only a container explicitly created with `--env-file`; it does not cover the normal no-`--env-file` case.

TOTAL: 2 findings
