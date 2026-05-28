Show vault key inventory and alignment gap with MCP configuration.

Run both commands:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action list
powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action sync-cursor-mcp-user-env
```

Report three sections:
1. **Vault keys** — all key names currently stored (names only — never display values)
2. **Missing from vault** — keys referenced in `.cursor/mcp.json` but absent (from sync output)
3. **Fill commands** — template `set` command for each missing key

Read-only. Never display actual secret values.
