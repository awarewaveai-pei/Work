# Playwright E2E — Latest Evidence

Timestamped run reports are generated locally by `scripts/playwright-runner.ps1`
and stored in `agency-os/reports/e2e/YYYY-MM-DD/<mode>/`.

These directories are `.gitignore`d (re-runnable artifacts).
Only this placeholder file is committed so the evidence path reference in
`agency-os/tenants/*/core/ENVIRONMENT_REGISTRY.md §Change Control` stays valid.

## Evidence path

```
agency-os/reports/e2e/YYYY-MM-DD/<mode>/
  ├── results.json            ← machine-readable pass/fail
  ├── playwright-report/      ← HTML report (open in browser)
  │   └── index.html
  └── screenshots/            ← PNG captures
      ├── smoke-root.png
      ├── client/<hostname>/
      └── capture/
```

## How to generate

```powershell
# Smoke (post-deploy)
.\scripts\playwright-runner.ps1 -Mode smoke

# Client site (post-update evidence)
.\scripts\playwright-runner.ps1 -Mode client -ClientSlug soulful-expression

# Delivery screenshots
.\scripts\playwright-runner.ps1 -Mode screenshot `
  -TargetUrl https://soulfulexpression.org -Label delivery-2026-05-13
```

See `.claude/commands/playwright.md` for full usage reference.
