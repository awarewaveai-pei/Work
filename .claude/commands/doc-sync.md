---
name: doc-sync
description: Run the doc-sync automation to realign cross-references and synced sections across the governance documents.
---

Run the doc-sync automation to align cross-references and synced sections across governance documents.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect
```

After running, report:
- Which files were updated
- Any broken links or missing cross-references detected
- Whether a follow-up `system-health-check` is recommended

If the sync reports warnings about missing Owner files or broken matrix entries, surface them with the file paths so they can be fixed.
