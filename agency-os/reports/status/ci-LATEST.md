# CI health (GitHub Actions, branch main)

- Generated: 2026-09-30 10:20:11
- Overall: **🔴 FAIL**
- Method: every workflow enumerated; last 20 run(s) of each inspected on `main`

## Workflows

| Workflow | Latest | Consecutive failures | Failing for |
|----------|--------|----------------------|-------------|
| Auto-Repair - Claude Code | skipped | - | - |
| Auto-Repair - PR Notification | none | - | - |
| Cognitive OS eval harness | success | - | - |
| Cognitive OS full suite | success | - | - |
| HCI-30 — Wave 1 cross-box restore drill (P0-10) | failure | 8 | 22d |
| Lobster workflows package — validate (main) | success | - | - |
| next-admin — TypeScript typecheck | success | - | - |
| Perplexity Search-only guard | success | - | - |
| Release Gate (main) | none | - | - |
| SG Deploy (self-hosted runner) | success | - | - |
| Shared asset gates (Claude + Codex) | success | - | - |
| Tenant staging SSOT | none | - | - |
| Trigger infra config guard | success | - | - |
| Weekly workflows security audit | failure | 4 | 23d |
| ziwei — typecheck · test · build | none | - | - |

## Findings

- 'HCI-30 — Wave 1 cross-box restore drill (P0-10)' has been failing for 8 consecutive run(s) over 22 day(s) - this gate has been off that whole time: https://github.com/awarewaveai-pei/Work/actions/runs/35340652567
- 'Weekly workflows security audit' has been failing for 4 consecutive run(s) over 23 day(s) - this gate has been off that whole time: https://github.com/awarewaveai-pei/Work/actions/runs/36390406303

## Why this check exists

Nothing watched CI. Found on 2026-08-25 while root-causing the fifth ClickHouse incident:
`Trigger infra config guard` had failed on every push since 2026-08-15 - four red runs over
ten days - and the commit that turned it red was the fix for the FOURTH ClickHouse incident.
The gate meant to stop ClickHouse config regressions was itself off for the whole window in
which the next ClickHouse incident developed. A gate nobody watches is not a gate.

Pattern: `runbooks/ADD-PERIODIC-HEALTH-CHECK.md`
