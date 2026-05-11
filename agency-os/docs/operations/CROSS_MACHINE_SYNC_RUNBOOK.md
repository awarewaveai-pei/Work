# 跨機記憶同步 Runbook

> **Owner**：本檔  
> **自動化**：`scripts/export-cross-machine-memory.ps1`（AO-CLOSE 收工後自動執行）  
> **觸發時機**：每次 AO-CLOSE 成功後自動產生桌面匯出包

---

## 背景

| 層 | 同步方式 |
|----|---------|
| Repo 所有檔案（WORKLOG、TASKS、rules 等） | `git push`（AO-CLOSE 已處理）✅ |
| Claude hooks / settings / commands | `sync-claude-userlevel.ps1 -Mode merge` 從 SSOT 產生 ✅ |
| **Claude 記憶檔**（`~/.claude/projects/.../memory/`） | ❌ 不在 git → 每次 AO-CLOSE 自動複製到桌面 |

---

## 每日例行（自動）

**AO-CLOSE 結束後**，桌面會自動出現：

```
Desktop\
└── AO-SYNC-2026-05-11\
    ├── memory\
    │   ├── MEMORY.md
    │   ├── feedback_git_push.md
    │   └── feedback_trigger_deploy.md
    └── IMPORT_INSTRUCTIONS.md
```

---

## 帶到另一台機器後的匯入步驟

開啟 `IMPORT_INSTRUCTIONS.md` 或直接執行：

```powershell
$dest = "$env:USERPROFILE\.claude\projects\c--Users-USER-Work\memory"
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force }
Copy-Item "$env:USERPROFILE\Desktop\AO-SYNC-*\memory\*.md" "$dest\" -Force
Write-Host "匯入完成" -ForegroundColor Green
```

> **注意**：如果桌面有多個日期的 `AO-SYNC-*` 資料夾，改成指定最新的那個日期。

---

## 一次性設定（不在每日匯出）

這些項目只需在新機器第一次設定，之後不需要每天同步：

| 項目 | 位置 | 做法 |
|------|------|------|
| SSH key（EU server 連線） | `~/.ssh/hetzner_trigger` | 從筆電手動複製 `hetzner_trigger` + `hetzner_trigger.pub` |
| DPAPI vault | 機器綁定 | `secrets-vault.ps1 -Action import-mcp`（重新輸入密鑰）|
| `mcp/user-env.ps1` | gitignore | 從 `mcp/user-env.template.ps1` 建立，填入密鑰 |

---

## 何時會有新的記憶檔需要同步

- Claude 學到新的偏好或修正（`feedback_*.md`）
- 記憶索引 `MEMORY.md` 有更新
- 未來新增的 `user_*.md` 或 `project_*.md`（自動掃描，不需手動維護清單）

---

## 相關

| 檔案 | 角色 |
|------|------|
| `scripts/export-cross-machine-memory.ps1` | 自動匯出腳本（AO-CLOSE 呼叫）|
| `scripts/ao-close.ps1` | 收工主腳本（最後一步呼叫 export）|
| `agency-os/memory/user_devices.md` | 設備描述（git-tracked，git pull 自動同步）|
| `mcp/claude-userlevel/README.md` | Claude user-level SSOT 說明 |
