# Governance Docs Drift - 2026-08

- Generated: 2026-08-12 17:35:06 +08:00
- Overall: **WARN**
- Scope: 4 long-term governance documents

## Status by check

| Check | Status |
|-------|--------|
| existence | PASS |
| mtime_drift | PASS |
| cross_reference | PASS |
| footer_present | PASS |
| mcp_set_consistency | WARN |

## Documents

| Doc | Path | Last modified (UTC) |
|-----|------|----------------------|
| Inventory | agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md | 2026-06-26 17:29 |
| RoutingSpec | lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md | 2026-04-21 10:55 |
| RoutingMatrix | lobster-factory/docs/ROUTING_MATRIX.md | 2026-04-21 10:55 |
| Traceability | agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md | 2026-05-20 10:55 |

## Findings

- mcp_set_consistency: shared=9 ; only_in_inventory=9 ; only_in_spec=0
  - only in inventory: awarewave-ops, chatgpt-fast, chatgpt-latest, claude-fast, claude-latest, gemini-fast, gemini-latest, hetzner-ssh, supabase-awarewave-postgres
- mtime_drift: span=66 days (youngest=2026-06-26; oldest=2026-04-21)
  - Inventory: 2026-06-26 (age 47 days)
  - RoutingSpec: 2026-04-21 (age 113 days)
  - RoutingMatrix: 2026-04-21 (age 113 days)
  - Traceability: 2026-05-20 (age 84 days)

## Notes

- This is an **informational snapshot**, not a build gate. WARN means the docs are out of lockstep but not necessarily broken; FAIL means a structural problem (missing file, span > 180 days).
- mcp_set_consistency uses a known-name allowlist; if a new MCP is added to registry, update the script.
- Designed for monthly invocation by `AgencyOS-MonthlyReview` routine; also runnable manually.
- Owner doc: this script. Trigger: `scripts\check-governance-docs-drift.ps1`.
