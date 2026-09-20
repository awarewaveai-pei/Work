---
name: sync-check
description: Run the Claude Code cross-machine sync verifier and report each gate's result.
---

Run the Claude Code cross-machine sync verifier and report results.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-claude-sync.ps1
```

After running, summarize:

- **Result line** (PASS / WARN / FAIL / SKIP) — quote it verbatim
- Any **HARD** findings — these mean sync infrastructure is broken (junction missing, hooks/settings drift, files tracked in git but absent on disk). Print the `fix:` line for each
- Any **SOFT** findings — these are uncommitted local files under `.claude/{commands,agents,skills}/`. Ask the user if they want to commit
- Whether AO-CLOSE health gate is safe to pass (HARD → no; SOFT → yes but flag the uncommitted work)

If everything is PASS, one sentence is enough: "Sync 完整健康，HARD/SOFT 皆無 drift。"

Full JSON output lives at `agency-os/.agency-state/sync-check-last.json` for machine consumption (system-health-check reads this).

## When to run

- After cloning the repo on a new machine (verify bootstrap worked)
- When `/health` reports the sync check failed (drill down for detail)
- Before AO-CLOSE if you suspect drift
- When commands/agents/skills behave differently between machines
