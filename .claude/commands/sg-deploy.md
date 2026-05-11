Deploy lobster-phase1 services on the SG VPS by SSHing in and running `sg-deploy.sh`.

Default app is `next-admin`. Pass extra args after `/sg-deploy` to override:
- `/sg-deploy next-admin` — deploy just next-admin
- `/sg-deploy next-admin node-api` — deploy multiple apps
- `/sg-deploy next-admin --dry-run` — preview rsync without rebuilding
- `/sg-deploy next-admin --skip-pull` — skip the upstream `git pull` step

Use the `hetzner-ssh` MCP server. Connection details:
- host: `5.223.93.113`
- user: `root`
- privateKeyPath: `$env:USERPROFILE\.ssh\hetzner_trigger`（Claude 須先展開為絕對路徑，例如 `C:\Users\USER\.ssh\hetzner_trigger`）

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

Owner doc: `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` §2.1. Do not duplicate the procedure in this file — link, do not copy.

Risk tier: **Medium** (rebuilds + restarts production containers). Confirm with the user before running unless they explicitly authorized autopilot for this turn.
