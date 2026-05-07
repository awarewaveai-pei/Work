Sync all vault secrets to Windows user environment variables and report alignment with `.cursor/mcp.json`.

Run from monorepo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action sync-cursor-mcp-user-env
```

Report:
- **Synced** — number of variables written to Windows user env
- **Missing** — key names referenced in `.cursor/mcp.json` but absent from vault
- **Next step** — for each missing key: `.\scripts\secrets-vault.ps1 -Action set -Name <NAME> -Value '<value>'`

If nothing is missing, confirm vault is fully aligned with MCP config. Remind user to fully restart Cursor/Claude to pick up newly synced env vars.
