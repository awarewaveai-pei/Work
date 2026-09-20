---
name: verify
description: Run the build-gate verification to confirm every quality and governance gate passes before committing.
---

Run the build gates verification to confirm all quality and governance gates pass before committing or deploying.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1
```

Report:
- PASS / FAIL status for each gate
- Any blocking issues with file paths and recommended fixes
- Whether the repo is ready for `git push`

If any gates fail, do NOT proceed with committing or pushing — fix the issues first.
