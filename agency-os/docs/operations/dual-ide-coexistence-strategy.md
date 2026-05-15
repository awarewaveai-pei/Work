# 雙 IDE 並存策略（Cursor + Claude Code）

> **Owner**：本檔  
> **狀態**：生效中  
> **設計目標**：Cursor 與 Claude Code 可獨立完整運作，也可同時開啟，任何時候都能切換，不需要遷移或重建。

---

## 架構總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                     共用層（git 版控，兩 IDE 都讀）               │
│                                                                  │
│  .mcp.json              ← MCP 伺服器唯一 SSOT                   │
│  CLAUDE.md              ← Claude Code 專案指令（含 @AGENTS.md） │
│  agency-os/AGENTS.md    ← 治理規則（兩 IDE 都遵守）             │
│  scripts/ao-resume.ps1  ← 開工腳本（兩 IDE 的 hook 都呼叫它）  │
│  scripts/ao-close.ps1   ← 收工腳本                              │
│  agency-os/.agency-state/ao-resume-hook-last.json ← 共用狀態檔 │
└───────────────────────┬─────────────────────┬───────────────────┘
                        │                     │
          ┌─────────────▼──────┐   ┌──────────▼──────────┐
          │    Cursor 層        │   │   Claude Code 層     │
          │  （完整保留，不動） │   │  （完整補齊，可用）  │
          │                    │   │                      │
          │ .cursor/rules/*.mdc│   │ CLAUDE.md（自動載入）│
          │ .cursor/hooks.json │   │ ~/.claude/           │
          │ .cursor/mcp.json   │   │   settings.json      │
          │                    │   │   hooks/             │
          │ Hook event:        │   │     ao-resume-on-    │
          │  beforeSubmitPrompt│   │     prompt.ps1       │
          │                    │   │ Hook event:          │
          │                    │   │  UserPromptSubmit    │
          └────────────────────┘   └──────────────────────┘
```

---

## 各層責任

### 共用層（repo，永遠不動）

| 檔案 | 用途 | Owner |
|------|------|-------|
| `.mcp.json` | 所有 MCP 伺服器定義 | `mcp/registry.template.json` → `sync-mcp-config.ps1` |
| `CLAUDE.md` | Claude Code 專案指令 | 本檔 + `@AGENTS.md` |
| `agency-os/AGENTS.md` | 治理規則、AO 關鍵字行為 | AGENTS.md |
| `scripts/ao-resume.ps1` | 開工邏輯實體 | scripts/ |
| `scripts/ao-close.ps1` | 收工邏輯實體 | scripts/ |
| `agency-os/.agency-state/` | hook 輸出狀態（兩 IDE 共用） | 執行時產生 |

### Cursor 層（保留，不主動維護但隨時可用）

| 檔案 | 用途 |
|------|------|
| `agency-os/.cursor/rules/*.mdc` | Cursor 專案規則（canonical） |
| `.cursor/rules/*.mdc` | monorepo 根鏡像（由 sync 腳本維護） |
| `.cursor/hooks.json` | Cursor hook：`beforeSubmitPrompt` → `run-ao-resume-on-prompt.ps1` |
| `.cursor/hooks/run-ao-resume-on-prompt.ps1` | Cursor AO-RESUME hook 腳本 |
| `.cursor/mcp.json` | Cursor 本地 MCP（backup，非 SSOT） |

### Claude Code 層（主力，完整配置）

| 檔案 | 用途 |
|------|------|
| `CLAUDE.md` | 專案指令（自動讀取 `@AGENTS.md`） |
| `.claude/commands/*.md` | Slash commands — 完整列表見 `CLAUDE.md §Slash Commands`（含 `/signals`、`/sg-deploy`、`/playwright` 等 24 個） |
| `.claude/agents/repair-agent.md` | 系統診斷 subagent |
| `.claude/agents/site-builder.md` | 租戶佈建 subagent |
| `.claude/agents/trigger-deploy-agent.md` | Trigger.dev EU 部署 subagent |
| `.claude/agents/client-onboarding.md` | 新客戶 onboarding subagent |
| `.claude/agents/wordpress-maintenance-agent.md` | WP 維護 subagent |
| `.claude/agents/decision-intelligence.md` | 18 階段決策評審 subagent |
| `~/.claude/settings.json` | hooks + permissions（user-level，不進 git） |
| `~/.claude/hooks/ao-resume-on-prompt.ps1` | Claude Code AO-RESUME hook 腳本（user-level，不進 git） |
| `~/.claude/hooks/branch-protection.js` | 分支保護 hook（user-level，不進 git） |
| `.mcp.json` | 共用 MCP（同共用層） |

---

## AO-RESUME 執行流程（兩 IDE 對比）

```
使用者輸入 AO-RESUME
        │
        ├── 使用 Cursor ──→ .cursor/hooks.json beforeSubmitPrompt
        │                          │
        └── 使用 Claude Code ──→ ~/.claude/settings.json UserPromptSubmit
                                   │
                    ┌──────────────▼──────────────────┐
                    │  hook 腳本執行（兩者邏輯相同）    │
                    │  1. 偵測 ^AO-RESUME              │
                    │  2. 若樹髒 → commit-checkpoint   │
                    │     ([cursor] 或 [claude] prefix)│
                    │  3. 跑 ao-resume.ps1             │
                    │     -FullMainlineParity          │
                    │  4. 寫入 ao-resume-hook-last.json│
                    │     （120 秒去重，兩 IDE 共用）   │
                    └──────────────────────────────────┘
                    │
                    └──→ 代理讀狀態檔 → 輸出五段式摘要
```

---

## 切換 IDE

### 從 Claude Code 切回 Cursor
不需要任何操作。打開 Cursor，一切如舊。

### 從 Cursor 切回 Claude Code
不需要任何操作。關閉 Cursor，使用 Claude Code CLI。

### 兩個同時開啟
可以。兩邊讀不同的 config 檔案，不互相干擾。  
唯一共用的是 `agency-os/.agency-state/ao-resume-hook-last.json`（120 秒去重防止重複跑）。

### Cursor 停訂閱（Claude-only）模式

若 Cursor 方案停用，請直接轉為 Claude-only，**不需要**重建專案流程：

1. 保留共用層（`.mcp.json`、`scripts/ao-resume.ps1`、`scripts/ao-close.ps1`、`AGENTS.md`）不變。
2. 以 Claude Code 執行既有流程：
   - 開工：`ao-resume.ps1 -FullMainlineParity`
   - 驗證：`verify-build-gates` / `system-health-check` / 專案 smoke
   - 收工：`ao-close.ps1`
3. Cursor 專屬能力可停用，但**不要刪除** `.cursor/rules` 與 `.cursor/hooks.json`（作為相容回切與規則鏡像）。
4. 維持單一真相：不要新增「無 Cursor 專用第二套 SOP」。

---

## 新機器 / 桌機快速啟動

### 從 git repo 自動同步的（不需手動複製）

`git clone` 或 `git pull` 後即可用：
- `.claude/commands/` — 所有 slash commands（完整列表見 `CLAUDE.md §Slash Commands`）
- `.claude/agents/` — 專案 subagents（完整清單 SSOT：`CLAUDE.md §Project Subagents`）
- `CLAUDE.md`、`agency-os/AGENTS.md` — 指令與治理規則
- `scripts/ao-resume.ps1`、`scripts/ao-close.ps1` — 開工收工腳本
- `.mcp.json` — MCP 伺服器定義（機密由環境變數填入）

### user-level 對齊（**自動化版**，2026-05-07 起）

過去：手動複製 3 個檔案。  
現在：跑一個指令，全自動。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode install
```

SSOT 在 `mcp/claude-userlevel/`：
- `hooks/`（19 檔，跨機完全一致；用 `${CLAUDE_PLUGIN_ROOT}` 與 `~/.claude/` 變數，無機器路徑）
- `settings.template.json`（hooks 段、`permissions.deny`、`additionalDirectories`、theme、autoUpdatesChannel）
- `mcp.template.json`（強制 `{"mcpServers":{}}`，per CLAUDE.md）
- `manifest.json`（宣告式治理清單；新增/刪減項目改這裡）

`bootstrap-mcp-machine.ps1` 已自動串接，新機器**只跑 bootstrap 一條指令**即可全部對齊：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```

詳細：`mcp/claude-userlevel/README.md`

### MCP secrets（每台機器獨立設定）

```powershell
# 1. 複製範本
Copy-Item .\mcp\user-env.template.ps1 .\mcp\user-env.ps1
# 2. 填入真實 token（用文字編輯器開 mcp\user-env.ps1）
# 3. 執行 bootstrap
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```

### 驗證新機器是否正常

```powershell
# 跑系統健康檢查
powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1
# 跑 MCP 煙霧測試
powershell -ExecutionPolicy Bypass -File .\scripts\n8n-mcp-smoke.ps1
```

---

## 新增第三個 IDE（擴充指引）

1. 在對應 IDE 的 hook config 加入 prompt-submit hook
2. 建立 hook 腳本（複製 `.cursor/hooks/run-ao-resume-on-prompt.ps1` 或 `~/.claude/hooks/ao-resume-on-prompt.ps1`，改 `hook_event` 欄位與 commit prefix）
3. 在 `cursor-enterprise-rules-index.md` 的 §Claude Code 對應表格加一列
4. 在本檔「各層責任」加一節
5. 不需要動共用層

---

## 不應該做的事

| 操作 | 原因 |
|------|------|
| 刪除 `.cursor/` 目錄 | 破壞 Cursor 可用性 |
| 把 MCP 秘鑰寫入 `.cursor/mcp.json` 或 `.mcp.json` | 機密不進 git |
| 在 `AGENTS.md` 或 `CLAUDE.md` 硬編「必須用 Cursor」 | 破壞 IDE 中性 |
| 在兩邊各維護不同版本的治理規則 | 違反單一真相原則 |
| 複製 `ao-resume.ps1` 邏輯到 hook 腳本 | hook 只呼叫腳本，不含業務邏輯 |

---

## Related Documents (Auto-Synced)

- `.cursor/hooks.json`
- `.cursor/hooks/run-ao-resume-on-prompt.ps1`
- `~/.claude/settings.json`（user-level，不進 git）
- `~/.claude/hooks/ao-resume-on-prompt.ps1`（user-level，不進 git）
- `CLAUDE.md`
- `agency-os/AGENTS.md`
- `agency-os/docs/operations/cursor-enterprise-rules-index.md`
- `agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md`
- `scripts/ao-resume.ps1`
- `scripts/ao-close.ps1`

_Created: 2026-05-06_
