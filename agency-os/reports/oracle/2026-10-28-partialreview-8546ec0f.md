# codex-oracle review -- 2026-10-28 09:19:28 +08:00

- mode: `review`
- scope: -Path mcp-local-wrappers/postgres-full-access-mcp.mjs, scripts/open-supabase-ssh-tunnel.ps1, agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md, mcp/DESKTOP_MCP_SETUP.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `6581ee127`
- context: Self-hosted Supabase postgres MCP wrapper + SSH tunnel script + runbook docs (commit 6581ee127).
- exit: 0 | elapsed: 66445ms | answer: 742B
- files-reviewed: agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md, mcp-local-wrappers/postgres-full-access-mcp.mjs, mcp/DESKTOP_MCP_SETUP.md, scripts/open-supabase-ssh-tunnel.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: MCP 自動開啟隧道後，文件提供的 Studio 啟動指令必定因連接埠衝突失敗
  file:line   -> agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md:223
  confidence  -> CONFIRMED
  scenario    -> MCP 先透過 wrapper 第 71 行建立僅含 5432 的隧道；使用者接著依文件執行 `open-supabase-ssh-tunnel.ps1 -Background`。腳本第 34 行預設再次綁定 5432、3000、8000，第 74 行啟用 `ExitOnForwardFailure=yes`，因此既有 5432 listener 使整條新 SSH 隧道退出，Studio 的 3000 無法使用。
  why missed  -> 作者處理了開啟 Postgres 時避開 3000 衝突，卻未核對反向流程：Postgres 已自動佔用 5432 後，如何追加 Studio 隧道。

TOTAL: 1 findings
