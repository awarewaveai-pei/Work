# 跨機記憶同步 Runbook

> **Owner**：本檔  
> **自動化**：`scripts/export-cross-machine-memory.ps1`（AO-CLOSE 收工後自動執行）  
> **完整開機參考**：`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §2

---

## 背景

| 層 | 同步方式 |
|----|---------|
| Repo 所有檔案（WORKLOG、TASKS、rules、memory content） | `git pull` ✅ |
| Claude hooks / settings.json / commands | `sync-claude-userlevel.ps1 -Mode merge`（讀 repo SSOT） ✅ |
| MCP 設定（.mcp.json / .cursor/mcp.json 等） | `sync-mcp-config.ps1`（讀 registry.template.json） ✅ |
| **MEMORY.md**（Claude Code 讀取的 project memory index） | ❌ 不在 git → AO-CLOSE 自動複製到桌面 |

---

## 每日例行（自動）

**AO-CLOSE 結束後**，桌面自動出現：

```
Desktop\
└── AO-SYNC-2026-05-11\
    ├── memory\
    │   └── MEMORY.md          ← 只有這一個檔案
    └── IMPORT_INSTRUCTIONS.md
```

> **為什麼只有 MEMORY.md？**  
> 所有 memory 內容（feedback、user_devices 等）已移入 `agency-os/memory/`（git-tracked），`git pull` 自動同步。MEMORY.md 是 Claude Code 讀取的 index，不在 git，仍需手動帶。

---

## 帶到另一台機器後 — 只需一件事

把 AO-SYNC 資料夾放到**目標機器的桌面**，然後直接打：

```
AO-RESUME
```

`ao-resume.ps1` 自動完成：
1. `git pull origin main`（取得所有 memory 內容、rules、WORKLOG）
2. `sync-claude-userlevel.ps1 -Mode merge`（Claude hooks/settings 對齊）
3. `sync-mcp-config.ps1`（MCP 設定重生）
4. `import-cross-machine-memory.ps1`（偵測桌面 AO-SYNC 資料夾 → 自動匯入 MEMORY.md）

> **注意**：AO-SYNC 資料夾放桌面後，AO-RESUME 執行時會自動匯入並寫入 `.imported` 標記，之後不再重複匯入同一份。

---

### 萬一 hook 失效（手動備案）

```powershell
git pull origin main
powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1 -FullMainlineParity
```

---

## 為什麼需要 sync-claude-userlevel 和 sync-mcp-config？

`ao-resume.ps1` 在 AO-RESUME 時會自動執行 `sync-claude-userlevel.ps1 -Mode verify`（只偵測漂移，印出警告）。若看到：

```
WARN: ~/.claude/ drifted from SSOT (mcp/claude-userlevel/).
      Fix:  powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode merge
```

代表本機 hooks/settings 與 repo SSOT 不同步 → 補跑 `-Mode merge` 即可（normalizer 自動處理 PS 5.1 array bug，不需手動修補）。

`sync-mcp-config.ps1` 不在 ao-resume 自動流程中，需手動跑一次確保 `.mcp.json`、`.cursor/mcp.json` 等來自最新 `mcp/registry.template.json`。

---

## 故障排除：merge 後 verify 仍報漂移（live-race，2026-06-12 codified）

**症狀**：跑了 `-Mode merge`（自報 `RESULT: PASS`、有 backup），但下一次 `-Mode verify` / `check-claude-sync` 仍 `HARD drift`；手動讀 `~/.claude/settings.json` 一下是對的、一下又變回舊值（典型：`permissions.deny` 少一條、`hooks.*` 從 array 變回 object）。

**根因**：`~/.claude/settings.json` 由**正在執行的 Claude Code session** 持有。session 啟動時把該檔載入記憶體；harness 在某些事件會以**啟動時的舊記憶體版回寫整個檔**，覆蓋 merge 剛寫入的正確內容。因此 merge 與 verify 若分成**兩次獨立 invoke**、中間有任何 Claude 動作（tool call、permission 事件），就會被回寫卡在中間 → 看似 merge「沒生效」。

**這不是 SSOT 壞掉**：repo `mcp/claude-userlevel/settings.template.json` 永遠是正本；漂移的只是本機 ephemeral 檔。先 `git`-diff 該 template 確認正本完好，不要追幽靈。

**正解（三選一）**：
1. **手動修**：把 merge 與 verify 放進**同一個 shell invocation**（`& <sync> -Mode merge; & <sync> -Mode verify`），中間不要回到 Claude；或連跑兩次 merge 後即穩定（第二次後磁碟版與記憶體版一致，harness 回寫不再改變內容）。
2. **不用手動修（推薦）**：`ao-close.ps1` 的 AO-CLOSE sync 自癒（`scripts/ao-close.ps1` §「Claude Code sync self-heal」）在**單一 script run 內**原子完成 verify→merge→re-verify，不受此 race 影響——直接收工讓它處理即可。
3. 換 IDE／重啟 session 後，harness 會以**新的（已 merge 的）磁碟版**重載，race 自然消失。

> **跨機提醒**：此 race 只影響本機 ephemeral 檔，不影響 git-tracked SSOT，故**不需跨機同步任何東西**；另一台機器只要 `git pull` 取得 template 正本即正確。

---

## 一次性設定（不在每日匯出）

首次換機才需要做一次，之後不需要每天同步：

| 項目 | 位置 | 做法 |
|------|------|------|
| SSH key（EU server 連線） | `~/.ssh/hetzner_trigger` | 從筆電手動複製 `hetzner_trigger` + `hetzner_trigger.pub` |
| DPAPI vault | 機器綁定 | `secrets-vault.ps1 -Action import-mcp`（重新輸入密鑰）|
| `mcp/user-env.ps1` | gitignore | 從 `mcp/user-env.template.ps1` 建立，填入密鑰 |

---

## Memory 架構（兩台機器一致後的樣子）

```
~/.claude/projects/c--Users-USER-Work/memory/
└── MEMORY.md          ← index（從 AO-SYNC 帶過來）

c:\Users\<帳號>\Work\agency-os\memory\   ← git-tracked，git pull 自動到位
├── CONVERSATION_MEMORY.md
├── user_devices.md
├── feedback_git_push.md
└── feedback_trigger_deploy.md
```

---

## 相關

| 檔案 | 角色 |
|------|------|
| `scripts/export-cross-machine-memory.ps1` | AO-CLOSE 後自動匯出 MEMORY.md |
| `scripts/ao-close.ps1` | 收工主腳本（最後一步呼叫 export）|
| `scripts/sync-claude-userlevel.ps1` | Claude hooks/settings SSOT 同步 |
| `scripts/sync-mcp-config.ps1` | MCP 設定 SSOT 同步 |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` §2 | 完整開機步驟正本 |
