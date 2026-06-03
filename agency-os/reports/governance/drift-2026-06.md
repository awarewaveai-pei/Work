# Governance Docs Drift - 2026-06

- Generated: 2026-06-03 17:23:56 +08:00
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
| Inventory | agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md | 2026-06-03 05:51 |
| RoutingSpec | lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md | 2026-04-10 07:37 |
| RoutingMatrix | lobster-factory/docs/ROUTING_MATRIX.md | 2026-04-10 07:37 |
| Traceability | agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md | 2026-05-18 06:50 |

## Findings

- mcp_set_consistency: shared=9 ; only_in_inventory=9 ; only_in_spec=0
  - only in inventory: awarewave-ops, chatgpt-fast, chatgpt-latest, claude-fast, claude-latest, gemini-fast, gemini-latest, hetzner-ssh, supabase-awarewave-postgres
- mtime_drift: span=54 days (youngest=2026-06-03; oldest=2026-04-10)
  - Inventory: 2026-06-03 (age 0 days)
  - RoutingSpec: 2026-04-10 (age 54 days)
  - RoutingMatrix: 2026-04-10 (age 54 days)
  - Traceability: 2026-05-18 (age 16 days)

## Notes

- This is an **informational snapshot**, not a build gate. WARN means the docs are out of lockstep but not necessarily broken; FAIL means a structural problem (missing file, span > 180 days).
- mcp_set_consistency uses a known-name allowlist; if a new MCP is added to registry, update the script.
- Designed for monthly invocation by `AgencyOS-MonthlyReview` routine; also runnable manually.
- Owner doc: this script. Trigger: `scripts\check-governance-docs-drift.ps1`.
