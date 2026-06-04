---
name: feedback-all-machines-sync
description: All user devices (個人筆電 D:\Work + 公司桌機 C:\Users\USER\Work) must stay synced — any infra change requires explicit verification of cross-machine path
metadata: 
  node_type: memory
  type: feedback
  originSessionId: be3de1eb-01d8-4b15-9564-bd3898cc8e82
---

**Rule**: 使用者擁有**至少兩台**獨立電腦：
- 個人筆電：`D:\Work\` + `D:\Users\USER1115\Work\mcp\user-env.ps1`
- 公司桌機：`C:\Users\USER\Work\` + `C:\Users\USER\Work\mcp\user-env.ps1`

**任何 infra / hook / settings / vault 改動都必須跨機同步**。記憶或在 一台機器上跑通的 fix
不算完成——必須驗證另一台機器也能正常 pull / sync / run。

**Why**: User feedback 2026-05-22 — "你要記得 我所有電腦設備都要同步"。歷史上多次因為單機修法
不到另一機器而生事故（CREDENTIALS BOM 迴圈、AO-SYNC 路徑不一致、import-cross-machine
ppid SID bug）。

**How to apply** — 凡涉及以下任何一類改動，**事後必須點名跨機同步路徑**：

| 改動類 | SSOT 位置 | 跨機同步路徑 |
|--------|---------|------------|
| Repo 內 code/docs/scripts | git tracked path | `git pull origin main` |
| Hooks `*.js` / `*.ps1` | `mcp/claude-userlevel/hooks/` | git pull + `scripts/sync-claude-userlevel.ps1 -Mode merge` |
| `~/.claude/settings.json` `hooks` key | `mcp/claude-userlevel/settings.template.json` | 同上 (merge-json + overwriteKeys 處理 hooks) |
| `~/.claude/commands/*.md` | `.claude/commands/` (project SSOT) | 同上 (manifest mirror) |
| `~/.claude/projects/<key>/memory/*.md` | local user-level | export 到 Google Drive vault (AO-CLOSE 自動) + import 由 AO-RESUME 自動跑 |
| `AWARE_WAVE_CREDENTIALS.md` | `$env:AO_SYNC_SECRETS_ROOT\` (Cryptomator vault) | export-cross-machine-memory.ps1 (BOM 強制) |
| Windows env vars (User registry) | `mcp/user-env.ps1` (local on each machine) | **手動同步**——each machine maintains own (vault-pull pattern), 跨機修需明確告訴使用者 |

**驗證 hook (操作者跨機開工流程)**：
1. 桌機開機 → 打開 Claude Code → 任意打字觸發 AO-RESUME hook
2. hook 自動跑 `git pull --ff-only` + `sync-claude-userlevel.ps1 -Mode merge`
   + `import-cross-machine-memory.ps1`（從 Drive 拉 memory）
3. AO-RESUME 7 段式輸出時若有警告（`signals-stale`、`tracker-mismatch` 等）→ 桌機側未同步
   → 操作者手動處理

**禁止**：
- 「我在筆電修了一個 hook」不算完——必須說「**桌機下次 AO-RESUME 會自動 sync 拿到**」
- 改 user-env.ps1 後不提醒「另一台機器也要更新對應 env var」
- 假設 single-machine path（如 hardcode `D:\Work\`）—— 必須用 `$PSScriptRoot` 或 git rev-parse

**配套記憶**：
- [[reference-aware-wave-credentials]] (vault 路徑跨機獨立)
- [[feedback-test-review-default]] (rule + real exec test → real exec 也應跨機驗)
- [[feedback-root-cause-discipline]] (fix must survive machine switch + session restart)
