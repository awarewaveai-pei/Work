Run a mid-session git checkpoint from the monorepo root:

```
powershell -ExecutionPolicy Bypass -File .\scripts\commit-checkpoint.ps1
```

Report: commit hash if one was created, or confirm "nothing to commit" if the tree was already clean. Do not push — push is reserved for AO-CLOSE.
