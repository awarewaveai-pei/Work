Run smoke tests to verify core services are healthy.

Run the n8n MCP smoke test:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\n8n-mcp-smoke.ps1
```

Also check:
1. MCP server connectivity (list active connections)
2. Supabase REST endpoint via `awarewave-ops`
3. `api.aware-wave.com` health endpoint

Report:
- Pass/fail for each service
- Exit codes (exit 0 = ok, exit 3 = 404/path issue, other = auth/network failure)
- If exit 3 appears with `TRY_ALT_MCP_URL`, check `docs/operations/n8n-self-hosted-mcp-troubleshooting.md` for the URL correction table
- Recommended next step for any failing service
