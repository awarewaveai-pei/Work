---
name: vault-status
description: Show the vault key inventory and the alignment gap against the MCP configuration.
---

Show vault key inventory and alignment gap with MCP configuration.

Run both commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action list
powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action sync-mcp-user-env
```

Report three sections:
1. **Vault keys** — all key names currently stored (names only — never display values)
2. **Missing from vault** — keys referenced in `mcp/registry.template.json` but absent (from sync output)
3. **Fill commands** — template `set` command for each missing key

Read-only. Never display actual secret values.
