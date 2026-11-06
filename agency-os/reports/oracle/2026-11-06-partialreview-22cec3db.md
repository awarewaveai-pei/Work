# codex-oracle review -- 2026-11-06 19:02:40 +08:00

- mode: `review`
- scope: -Path mcp/registry.template.json, mcp-local-wrappers/package.json, scripts/sync-mcp-config.ps1, scripts/start-trigger-mcp.ps1, scripts/run-filesystem-mcp.ps1, .codex/config.toml.example, agency-os/docs/operations/mcp-add-server-quickstart.md, agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md, agency-os/docs/operations/CURSOR_AGENT_RUNTIME_PLAYBOOK.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Enabled stdio MCP servers no longer launch through npx: 6 packages pinned at exact versions in mcp-local-wrappers/package.json and started with node from that install (registry + start-trigger-mcp.ps1 + run-filesystem-mcp.ps1); sync-mcp-config.ps1 now refuses an enabled server that uses npx (also when hidden in its launch script) or whose entry file is missing. Root sdk pinned to 1.27.1 so the three in-repo wrappers keep their SDK. Goal: no per-server npx wrapper process, no unpinned runtime package resolution.
- exit: 0 | elapsed: 109824ms | answer: 526B
- files-reviewed: .codex/config.toml.example, agency-os/docs/operations/CURSOR_AGENT_RUNTIME_PLAYBOOK.md, agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md, agency-os/docs/operations/mcp-add-server-quickstart.md, mcp-local-wrappers/package.json, mcp/registry.template.json, scripts/run-filesystem-mcp.ps1, scripts/start-trigger-mcp.ps1, scripts/sync-mcp-config.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 啟用中的 server 使用 `npx.cmd` 時，sync 檢查會放行
  file:line   -> scripts/sync-mcp-config.ps1:552
  confidence  -> CONFIRMED
  scenario    -> 啟用中的 stdio server 設為 `command: "npx.cmd"`、`args: ["-y", "replicate-mcp"]` → `$argv -contains "npx"` 為 false，也沒有腳本檔可供後續檢查 → sync 成功，server 仍透過 npx 啟動並在執行時解析套件。
  why missed  -> 檢查只比對完整參數 `npx`；Windows 的可執行檔名稱可帶 `.cmd`。

TOTAL: 1 findings
