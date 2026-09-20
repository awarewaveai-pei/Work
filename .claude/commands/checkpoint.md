---
name: checkpoint
description: Take a mid-session git checkpoint scoped to the files this session actually touched.
---

Run a mid-session git checkpoint from the monorepo root, scoped to files this session actually touched (the script no longer supports blind `-A` staging — see its header comment for why).

1. List the paths edited this session (Edit/Write calls this turn), then confirm each is dirty: `git status --porcelain -- <path>`.
2. Write a one-line message summarizing the change.
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\commit-checkpoint.ps1 -Message "<message>" -Paths @("<path1>", "<path2>")
```

Report: commit hash if one was created, or confirm "nothing to commit" if the named paths had no changes. Do not push — push is reserved for AO-CLOSE.
