# CI health (GitHub Actions, branch main)

- Generated: 2026-10-14 09:53:56
- Overall: **🔴 FAIL**
- Method: every workflow enumerated; last 20 run(s) of each inspected on `main`

## Workflows

| Workflow | Latest | Consecutive failures | Failing for |
|----------|--------|----------------------|-------------|
| Auto-Repair - Claude Code | skipped | - | - |
| Auto-Repair - PR Notification | none | - | - |
| Cognitive OS eval harness | success | - | - |
| Cognitive OS full suite | failure | 3 | 1d |
| HCI-30 — Wave 1 cross-box restore drill (P0-10) | success | - | - |
| Lobster workflows package — validate (main) | success | - | - |
| next-admin — TypeScript typecheck | success | - | - |
| Perplexity Search-only guard | success | - | - |
| Release Gate (main) | none | - | - |
| SG Deploy (self-hosted runner) | success | - | - |
| Shared asset gates (Claude + Codex) | success | - | - |
| Tenant staging SSOT | none | - | - |
| Trigger infra config guard | success | - | - |
| Weekly workflows security audit | success | - | - |
| ziwei — typecheck · test · build | none | - | - |

## Findings

- 'Cognitive OS full suite' has been failing for 3 consecutive run(s) over 1 day(s) - this gate has been off that whole time: https://github.com/awarewaveai-pei/Work/actions/runs/38493906498

## Why this check exists

Nothing watched CI. Found on 2026-08-25 while root-causing the fifth ClickHouse incident:
`Trigger infra config guard` had failed on every push since 2026-08-15 - four red runs over
ten days - and the commit that turned it red was the fix for the FOURTH ClickHouse incident.
The gate meant to stop ClickHouse config regressions was itself off for the whole window in
which the next ClickHouse incident developed. A gate nobody watches is not a gate.

Pattern: `runbooks/ADD-PERIODIC-HEALTH-CHECK.md`
