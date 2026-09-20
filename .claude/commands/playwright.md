---
name: playwright
description: Headless Playwright automation: post-deploy smoke, full QA flows, per-client site verification, and delivery screenshots. Complementary to /browser-test, which drives real Chrome.
argument-hint: [smoke|qa|client <slug>|screenshot <url>]
---

Playwright browser-automation skill — smoke testing, QA flows, client site verification, screenshots, accessibility, and performance checks.

## Usage

```
/playwright                         → smoke (default)
/playwright smoke                   → post-deploy sanity (3-5 min)
/playwright qa                      → full UI flows (needs OPS_TEST_EMAIL/PASSWORD)
/playwright client <slug>           → WordPress client site health + screenshots
/playwright client <slug> --url <u> → override URL instead of resolving from registry
/playwright screenshot <url>        → full-page PNG capture at 3 viewports
/playwright screenshot <url> <label>→ named capture (e.g. before-update)
/playwright a11y                    → WCAG 2.1 AA accessibility audit
/playwright perf                    → load time + LCP + TTFB checks
/playwright perf <url>              → perf against a specific URL (client site)
/playwright all                     → smoke + qa + a11y + perf (client if slug given)
/playwright install                 → install Playwright browsers only
```

## Runner script

All modes invoke:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 `
  -Mode <mode> [options]
```

Owner doc: `scripts/playwright-runner.ps1` (canonical — do not duplicate logic here).

## Mode dispatch

### smoke
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 -Mode smoke
```
Runs Playwright projects `smoke` + `mobile-smoke`. Tests:
- Public HTTP endpoints (api-health, n8n-healthz)
- Ops dashboard browser render + screenshots
- /api/ops/summary and /api/ops/repairs/health routes

Auto-triggered by `/sg-deploy` — run after every production deploy.

### qa
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 -Mode qa
```
Full authenticated UI flows. Requires `OPS_TEST_EMAIL` + `OPS_TEST_PASSWORD` in env.
Without creds, auth-gated tests skip gracefully.

### client
```powershell
# Resolve URL from agency-os/tenants/<slug>/core/ENVIRONMENT_REGISTRY.md
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 `
  -Mode client -ClientSlug soulful-expression

# Override URL directly
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 `
  -Mode client -ClientUrl https://soulfulexpression.org
```
Checks: 200 homepage, no PHP fatal errors, no broken JS, wp-admin accessible.
Captures: full-page + above-the-fold + mobile viewport screenshots.

Auto-triggered by `/wp-maintenance safe-update` — confirms no visible breakage.

### screenshot
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 `
  -Mode screenshot -TargetUrl https://soulfulexpression.org -Label soulful-before-update
```
Captures PNG at desktop (1440×900), tablet (768×1024), mobile (390×844), and above-the-fold.
Output: `agency-os/reports/e2e/YYYY-MM-DD/screenshot/screenshots/`

### a11y
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 -Mode a11y
```
Scans /, /ops/clients, /ops/repairs with axe-core (WCAG 2.1 AA).
Critical/serious violations = FAIL. Moderate/minor = logged warning only.

### perf
```powershell
# Against ops dashboard
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 -Mode perf

# Against client site
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 `
  -Mode perf -ClientUrl https://soulfulexpression.org
```
Thresholds: LCP < 4 000 ms, total load < 8 000 ms, no resource > 2 MB, TTFB < 2 000 ms.
Override per-run: `-LcpLimitMs 2500 -LoadLimitMs 5000`.

### install
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 -Mode install
```
Runs `npm install` + `playwright install chromium --with-deps`. Run once on a new machine or after a Node version upgrade.

## Output locations

| Artifact | Path |
|----------|------|
| JSON results | `agency-os/reports/e2e/YYYY-MM-DD/<mode>/results.json` |
| HTML report  | `agency-os/reports/e2e/YYYY-MM-DD/<mode>/playwright-report/index.html` |
| Screenshots  | `agency-os/reports/e2e/YYYY-MM-DD/<mode>/screenshots/**/*.png` |

The runner always archives to `agency-os/reports/e2e/` — Evidence path matches `ENVIRONMENT_REGISTRY.md §Change Control`.

## Integration with other skills

| Trigger | Auto-action |
|---------|-------------|
| `/sg-deploy` completes | Run `/playwright smoke` |
| `/wp-maintenance safe-update` completes | Run `/playwright client <slug>` |
| New client site delivered | Run `/playwright screenshot <url> delivery` + `/playwright client <slug>` |
| PR touches Next.js routes | Run `/playwright smoke` before merge |

## Env vars reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLAYWRIGHT_BASE_URL` | `https://app.aware-wave.com` | Ops dashboard URL |
| `PLAYWRIGHT_API_URL` | `https://api.aware-wave.com` | API base URL |
| `PLAYWRIGHT_N8N_URL` | `https://n8n.aware-wave.com` | n8n base URL |
| `PLAYWRIGHT_CLIENT_URL` | _(empty)_ | Client site URL |
| `PLAYWRIGHT_TARGET_URL` | _(empty)_ | Screenshot mode target |
| `PLAYWRIGHT_LABEL` | `capture` | Screenshot file label |
| `OPS_API_TOKEN` | _(empty)_ | Bearer token for authenticated API checks |
| `OPS_TEST_EMAIL` | _(empty)_ | Clerk email for QA auth flows |
| `OPS_TEST_PASSWORD` | _(empty)_ | Clerk password for QA auth flows |
| `PLAYWRIGHT_PERF_LCP_MS` | `4000` | LCP threshold override |
| `PLAYWRIGHT_PERF_LOAD_MS` | `8000` | Total load threshold override |

## First-time setup on a new machine

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\playwright-runner.ps1 -Mode install
```

Node.js 18+ required. If browsers fail to install with `--with-deps`, run once as Administrator.

## Report

After each run, summarize:
- Mode and target URL
- Pass / Fail / Skip counts
- Any FAIL tests with test name + error
- Screenshot paths (for client/screenshot modes)
- Link to HTML report
- Next action for any failures
