# CI health (GitHub Actions, branch main)

- Generated: 2026-08-25 03:30:19
- Overall: **🔴 FAIL**
- Sampled: last 100 runs on `main`

## Workflows

| Workflow | Latest | Consecutive failures | Failing for |
|----------|--------|----------------------|-------------|
| Auto-Repair - Claude Code | skipped | - | - |
| Lobster workflows package — validate (main) | success | - | - |
| next-admin — TypeScript typecheck | success | - | - |
| Trigger infra config guard | failure | 4 | 9d |
| Weekly workflows security audit | failure | 1 | 1d |

## Findings

- 'Trigger infra config guard' has been failing for 4 consecutive run(s) over 9 day(s) - this gate has been off that whole time: https://github.com/awarewaveai-pei/Work/actions/runs/32763510230
- 'Weekly workflows security audit' latest run on main is failure: https://github.com/awarewaveai-pei/Work/actions/runs/32683910784

## Why this check exists

Nothing watched CI. Found on 2026-08-25 while root-causing the fifth ClickHouse incident:
`Trigger infra config guard` had failed on every push since 2026-08-15 - four red runs over
ten days - and the commit that turned it red was the fix for the FOURTH ClickHouse incident.
The gate meant to stop ClickHouse config regressions was itself off for the whole window in
which the next ClickHouse incident developed. A gate nobody watches is not a gate.

Pattern: `runbooks/ADD-PERIODIC-HEALTH-CHECK.md`
