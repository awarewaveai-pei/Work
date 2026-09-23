# codex-oracle review -- 2026-09-23 16:52:30 +08:00

- mode: `review`
- scope: whole repo
- target: `f39559f1d`
- context: site-watch step 9 round 3 (fallback after two failed companion runs). Commit f39559f1d answers codex round-2 findings on a58b34758. Invariant: the SITE_WATCH_INGEST_TOKEN held by the Trigger worker must equal the value the RUNNING lobster-next-admin container accepts; Trigger may hold none (site-watch-heartbeat returns configured:false, watchdog scripts/check-site-watch-health.ps1 reports missing heartbeats) but never a different one. The deploy script now takes it via docker exec lobster-next-admin printenv instead of .env; TASK_REFERENCE and README hand-run npx deploy recipes now point at scripts/lobster-trigger-deploy.ps1; plan step 10d/10e updated; deleting the stale site-watch handoff packet is intentional. Check the invariant on every path (deploy by hand or by the post-push hook, token rotation, half-applied step 10d, next-admin recreated by sg-deploy.sh or safe-infra-patch.sh, next-admin down during a deploy), set -e safety and secret leakage of the new docker exec line, and any remaining doc or script that bypasses it. The working tree of scripts/lobster-trigger-deploy.ps1 also holds UNCOMMITTED edits from another session (env parity gate, step 1b): out of scope. If no real finding survives checking, say so and return none; do not invent weak findings.
- exit: 0 | elapsed: 76361ms | answer: 1251B
- files-reviewed: agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md, agency-os/handoffs/2026-09-23-1116-site-watch-slice1.md, lobster-factory/infra/trigger/README.md, lobster-factory/infra/trigger/TASK_REFERENCE.md, scripts/lobster-trigger-deploy.ps1
- deletions-reviewed: agency-os/handoffs/2026-09-23-1116-site-watch-slice1.md@00cc03a35

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A downed next-admin makes the supposedly optional token lookup abort the deployment

  scripts/lobster-trigger-deploy.ps1:146 -> scripts/lobster-trigger-deploy.ps1:146  
  confidence  -> CONFIRMED  
  scenario    -> `lobster-next-admin` is stopped during a deploy; `docker exec` exits nonzero, and under the script’s `set -e` execution the command substitution aborts the deployment instead of treating the token as absent.  
  why missed  -> The `2>/dev/null` hides the error text, but does not neutralize its exit status.

FINDING 2: An empty lookup leaves a stale Trigger token instead of removing it

  agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md:62 -> scripts/lobster-trigger-deploy.ps1:146  
  confidence  -> CONFIRMED  
  scenario    -> Trigger previously holds token A; next-admin is recreated without `SITE_WATCH_INGEST_TOKEN`; deployment reads an empty value and skips synchronization, so Trigger retains A while next-admin accepts no token. Heartbeats then receive 401s and the invariant is violated.  
  why missed  -> The change corrected the token’s read source but preserved the existing “empty = not synced” behavior; synchronization is documented as overwrite-only, with no deletion path.

TOTAL: 2 findings
