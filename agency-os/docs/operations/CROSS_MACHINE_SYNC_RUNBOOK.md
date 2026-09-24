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
| Codex skills / native agents / hook bridge | `sync-claude-to-codex.ps1 -Mode linked`（讀 Claude source，僅生成薄 bridge）✅ |
| MCP 設定（.mcp.json / Codex / Copilot / Gemini） | `sync-mcp-config.ps1`（讀 registry.template.json） ✅ |
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
4. `sync-claude-to-codex.ps1 -Mode linked` + `check-claude-codex-parity.ps1`（Codex bridge 重生並機械驗證）
5. `import-cross-machine-memory.ps1`（偵測桌面 AO-SYNC 資料夾 → 自動匯入 MEMORY.md）

> **注意**：AO-SYNC 資料夾放桌面後，AO-RESUME 執行時會自動匯入並寫入 `.imported` 標記，之後不再重複匯入同一份。

---

### 萬一 hook 失效（手動備案）

```powershell
git pull origin main
powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1 -FullMainlineParity
```

---

## 為什麼需要 sync-claude-userlevel 和 sync-mcp-config？

`ao-resume.ps1` 在 AO-RESUME 時會自動執行 `sync-claude-userlevel.ps1 -Mode merge`、`sync-mcp-config.ps1`，以及 `sync-claude-to-codex.ps1 -Mode linked` 後的 parity proof。既有 Claude skill/agent/command 的內容由 Codex bridge 直接讀 source；只有新增、改名或刪除資產才需要這個自動 discovery step。

若 Claude user-level sync 仍看到：

```
WARN: ~/.claude/ drifted from SSOT (mcp/claude-userlevel/).
      Fix:  powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode merge
```

代表本機 hooks/settings 與 repo SSOT 不同步 → 補跑 `-Mode merge` 即可（normalizer 自動處理 PS 5.1 array bug，不需手動修補）。

若需要在 AO-RESUME 之外立即修復 Codex bridge，執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1 -WorkRoot D:\Work -Mode linked
powershell -NoProfile -ExecutionPolicy Bypass -File .\mcp\codex-userlevel\scripts\check-claude-codex-parity.ps1 -WorkRoot D:\Work
```

---

## 故障排除：多 session 並行下 settings.json 短暫漂移（multi-session contention，2026-06-12 查清）

**症狀**：跑了 `-Mode merge`（自報 `RESULT: PASS`、有 backup），但下一次獨立 `-Mode verify` / `check-claude-sync` 仍 `HARD drift`；手動讀 `~/.claude/settings.json` 一下對、一下又變回舊值。

**根因（多 session 並行爭用，非單體 harness bug）**：
- `D:\Work\.claude` 是 **junction → `C:\Users\<user>\.claude`**（同一個實體檔；`Get-Item ... .LinkType=Junction` 可驗）。
- 同一帳號同時開 **N 個 Claude Code session**（2026-06-12 實測 = 4 個 `claude.exe`，啟動時間各異）。每個 session 在**啟動時把 settings.json 載入記憶體**，之後在 permission/persist 事件**寫回自己的快照**。
- 若某 session 啟動時磁碟是舊值，它記憶體就是舊值；它一寫回就把別的 session 剛 merge 的新值蓋掉 → 看似「merge 沒生效」。這是 **N 個寫者共用一個可變檔 + last-writer-wins**，不是某個 harness「頻繁回寫」。

**嚴重性：低（良性）**。2026-06-12 實測**唯一**會 flap 的 deny 只有 fork-bomb 守則 `Bash(:(){ *)`（2026-05-07 才加進 SSOT）；其餘 19 條重要守則（`rm -rf`、force push、`sudo`、`git reset --hard`…）**每個 session 都一致穩定**，不受影響。亦即真正的安全護欄不會掉，只有一條冷門守則在 ephemeral 檔上短暫缺席。`mcp/claude-userlevel/settings.template.json`（git SSOT）永遠正確。

**這不是該用 code「修掉」的 bug**：N 個 session 共用一個 user-level config，本來就會 last-writer-wins。無法 mid-session 強制它持久——除非關掉其他 session。

**處置**：
1. **判讀優先（多數情況）**：mid-session 看到此單條 deny drift = 已知良性現象，**不需纏鬥**。git SSOT 正確即可。
2. **要某 gate 立刻綠**：把 merge 與該 gate 串進**同一個 invocation**（把 race 窗口從「分鐘級」縮到「毫秒級」，多 session 下仍非 100% 保證，但實務夠用）：
   ```powershell
   powershell -Command "& scripts/sync-claude-userlevel.ps1 -Mode merge *>$null; & scripts/verify-build-gates.ps1"
   ```
   **不要**把 merge 與 verify 拆成兩次 Bash call（中間數秒 wall-clock 給別的 session 寫入窗口 = 2026-06-12 困惑根因）。
3. **真正收斂**：等所有舊 session 結束、新 session 從最終磁碟版重載即一致；`ao-close.ps1` sync 自癒（`§「Claude Code sync self-heal」`）在單一 process 內 re-merge，是每個 session 收工的收斂點。

> **跨機提醒**：只影響本機 ephemeral 檔，不影響 git-tracked SSOT；另一台機器 `git pull` 取得 template 正本即正確，**不需跨機同步任何東西**。

---

## 一次性設定（不在每日匯出）

首次換機才需要做一次，之後不需要每天同步：

| 項目 | 位置 | 做法 |
|------|------|------|
| SSH key（ks-aw-01 連線） | `~/.ssh/id_ed25519` | 從筆電手動複製 `id_ed25519` + `id_ed25519.pub`（主機資訊見 `scripts/lib/prod-host.ps1`） |
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
| `mcp/codex-userlevel/scripts/sync-claude-to-codex.ps1` | Codex thin bridge 生成、備份與舊副本清除 |
| `mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1` | 讀取式 Claude/Codex parity 檢查（不輸出機密） |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` §2 | 完整開機步驟正本 |
