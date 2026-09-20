---
name: recap
description: Show today's work summary before deciding whether to close out.
---

Show today's work summary before deciding whether to close.

Run from the monorepo root:

```
powershell -ExecutionPolicy Bypass -File .\scripts\print-today-closeout-recap.ps1
```

Summarize the output: what was completed today, what remains open. Read-only — this is for review only. To commit and push, use /ao-close instead.
