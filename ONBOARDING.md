# Welcome to AwareWave

## How We Use Claude

Based on awarewaveai-pei's usage over the last 30 days:

Work Type Breakdown:
  Build Feature  ████████████████░░░░  ~55%
  Debug Fix      ██████░░░░░░░░░░░░░░  ~20%
  Plan Design    ████░░░░░░░░░░░░░░░░  ~15%
  Analyze Data   ██░░░░░░░░░░░░░░░░░░  ~10%

Top Skills & Commands:
  /strategy-review  ████████████████░░░░  3x/month
  /model            ██░░░░░░░░░░░░░░░░░░  1x/month

Top MCP Servers:
  server-ssh    ████████████████████  427 calls
  awarewave-ops  ████░░░░░░░░░░░░░░░░  84 calls
  wizard-tools   ░░░░░░░░░░░░░░░░░░░░  5 calls
  posthog        ░░░░░░░░░░░░░░░░░░░░  4 calls

## Your Setup Checklist

### Codebases
- [ ] work — github.com/awarewaveai-pei/work

### MCP Servers to Activate
- [ ] server-ssh — SSH into the production host ks-aw-01 (145.239.195.47:58122, user ubuntu + sudo, key ~/.ssh/id_ed25519). Ask the team for the SSH private key path and confirm it's in `~/.ssh/`. Configured via `.mcp.json` in the repo root.
- [ ] awarewave-ops — Internal ops tools (Supabase, Hetzner Cloud API, n8n, Slack alerts, etc.). Needs several secrets in your local vault. Run `.\scripts\secrets-vault.ps1 -Action import-mcp` after cloning.
- [ ] posthog — PostHog analytics (Project ID: 385998, host: https://us.i.posthog.com). Get the MCP token from the team vault or PostHog project settings.
- [ ] wizard-tools — Internal wizard tooling. Ask the team for access details.

### Skills to Know About
- `/strategy-review` — Multi-angle strategic decision review (spawns 4 subagents for red/blue debate, pre-mortem, etc.). Use when choosing tools, vendors, or architecture — not just for code decisions.
- `/ao-resume` — Session startup: pulls latest from main, runs build gates, env audit, and outputs a five-part status brief. Run this at the start of every work session.
- `/ao-close` — End-of-day closeout: writes WORKLOG, syncs memory, runs gates, commits, and pushes. Run this before you stop working.
- `/health` — Runs `system-health-check.ps1` and reports results. Must be 100% before AO-CLOSE.
- `/verify` — Runs `verify-build-gates.ps1`. Run before claiming anything done.
- `/checkpoint` — Mid-session git checkpoint without pushing. Use between major milestones.
- `/smoke-test` — Runs the ops-console DoD mechanical checks against production.
- `/doc-sync` — Syncs cross-references and governance docs. Run after touching any `.md` governance file.
- `/sg-deploy` — SSH into the SG VPS and deploy the lobster-phase1 stack via `sg-deploy.sh`.
- `/check-drift` — Checks how many commits SG production is behind `origin/main`.

## Team Tips

- **一定要從 monorepo 根目錄開 Claude Code**（`D:\Work`，不是子目錄）。否則 `${workspaceFolder}` 路徑解析會錯，MCP 連線全部失敗。
- **Vault 是每台機器獨立的**（DPAPI 綁定本機帳號）。換新機或重灌時必須重跑 `.\scripts\secrets-vault.ps1 -Action import-mcp`，不能直接複製別台機器的 vault 檔案。
- **Commit prefix 強制**：所有 commit 第一行必須是 `[claude]`、`[cursor]` 或 `[codex]`，不然 pre-commit hook 會擋住。
- **禁止建新 branch**：所有工作直接在 `main` commit/push，這是刻意設計（避免多代理切換後 merge 衝突）。
- **Telegram bot 是你的 24/7 面板**：加 `@awarewave_ops_bot` 好友，傳 `/status` 或 `/client_status` 不用開電腦也能查系統狀態。
- **`system-health-check` 必須 100%** 才能收工（`/ao-close` 會檢查）。不到 100% 先修再關。
- **Migration 檔案不能動**：`lobster-factory/packages/db/migrations/0001–0024` 是歷史 migration，永遠不能改。新 schema 改動一律開新的 `0026_*.sql`。

## Get Started

1. Clone repo：`git clone <repo-url> Work && cd Work`
2. 初始化環境（一鍵）：`powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1`
3. 把各服務的 token 填進 `mcp/user-env.ps1`，然後跑 `.\scripts\secrets-vault.ps1 -Action import-mcp`
4. 開新 PowerShell，執行 `.\scripts\secrets-vault.ps1 -Action sync-cursor-mcp-user-env`
5. 打開 Claude Code（從 `D:\Work` 根目錄），傳 `/ao-resume` 確認環境正常
6. 傳 `/status` 給 Telegram `@awarewave_ops_bot` 確認 24/7 指令平台正常

有問題看 `agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md`，或直接問 Claude。

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
