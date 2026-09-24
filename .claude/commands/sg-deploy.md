---
name: sg-deploy
description: Deploy the lobster-phase1 services on the host by running sg-deploy.sh there (test gate, healthcheck, HTTP smoke, automatic rollback). HIGH-RISK: the ssh deploy step is additionally gated by high-risk-bash-warn.js.
argument-hint: [service ...] [--dry-run]
---

Deploy lobster-phase1 services on ks-aw-01 by SSHing in and running `sg-deploy.sh`.
The command name is historical: SG was folded into ks-aw-01 on 2026-08-31 and there is no separate SG host.

Default app is `next-admin`. Pass extra args after `/sg-deploy` to override:
- `/sg-deploy next-admin` — deploy just next-admin
- `/sg-deploy next-admin node-api` — deploy multiple apps
- `/sg-deploy next-admin --dry-run` — preview rsync without rebuilding
- `/sg-deploy next-admin --skip-pull` — skip the upstream `git pull` step

Use the `server-ssh` MCP server. Connection details:
- host: `145.239.195.47`（**現役 ks-aw-01 / OVH KS-6**）
- port: `58122`／user: `ubuntu`（遠端指令前加 `sudo`）
- privateKeyPath: `$env:USERPROFILE\.ssh\id_ed25519`（先展開為絕對路徑；只用 `ubuntu` + `sudo`，不可改用 root）

## Deploy hold (check BEFORE step 1)

If `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD` exists on `main`, deploys are parked on
purpose and `sg-deploy.sh` step 1.85 refuses. Read that file's `reason=` line, report it, and stop —
do not deploy and do not set `DEPLOY_HOLD_OVERRIDE=1` without the operator explicitly saying so.
Releasing the hold is `git rm` on that file, which is the operator's call, not a step in this command.

Steps:
1. `ssh_connect` to SG with the credentials above (name the connection `sg-prod`).
2. Run `/root/lobster-phase1/scripts/sg-deploy.sh <args>` with a generous timeout (build + healthcheck can take 4 minutes).
3. After the script finishes, run `docker ps --filter name=lobster-next-admin --format '{{.Names}}\t{{.Status}}'` to confirm the container is healthy and has the normal name (no `<id>_lobster-next-admin` rename anomaly).
4. Run `cat /root/lobster-phase1/.deployed-commit` to capture the deployed commit hash.
5. `ssh_disconnect`.

Report:
- Deployed commit hash (short)
- Healthcheck status of each app's container
- Any rebuild errors
- If a container ended up renamed (`<hex>_lobster-*`), warn the user and offer to run `docker compose stop && rm -f && up -d` to clean it.

## Post-deploy: automatic smoke verification

After a **successful** deploy (containers healthy, no rebuild errors), **always** run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 -Mode smoke -SkipInstall
```

This runs the Playwright smoke suite (≈ 4 min) and archives evidence to
`agency-os/reports/e2e/YYYY-MM-DD/smoke/`. Do **not** skip this step.

The smoke suite includes `smoke/04-onboard-page.spec.ts`, which authenticates
against the nginx `auth_basic` on `app.aware-wave.com` and asserts the
OnboardWizard UI is actually rendered (not just that the route returns 200).
It requires `OPS_BASIC_USER` + `OPS_BASIC_PASSWORD` in the User-scope env
(set via `mcp/user-env.ps1`). On a fresh machine, run that script once and
restart the shell before deploying — otherwise this spec hard-fails.

If the smoke suite fails:
1. Report which tests failed with the exact error
2. Check if it is a transient network issue (retry once)
3. If still failing, flag as a deploy regression and ask the user before proceeding

If the smoke suite passes: report "Smoke PASSED" with the pass/skip counts.

Owner doc: `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` §2.1. Do not duplicate the procedure in this file — link, do not copy.

Risk tier: **Medium** (rebuilds + restarts production containers). Confirm with the user before running unless they explicitly authorized autopilot for this turn.
