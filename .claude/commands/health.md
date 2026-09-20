---
name: health
description: Run the system health check and report the score plus every failing item.
---

Run the system health check and report results.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1
```

After running, summarize:
- Overall score (must be 100% to pass the Critical Gate)
- Any FAIL or WARN items with file paths
- Recommended fix for each issue found
- Whether the repo is safe to commit/close

If any Critical Gate items are failing, propose fixes immediately.
