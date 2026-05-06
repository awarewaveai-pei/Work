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
| `~/.claude/settings.json` | hooks + permissions（user-level） |
| `~/.claude/hooks/ao-resume-on-prompt.ps1` | Claude Code AO-RESUME hook 腳本 |
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
