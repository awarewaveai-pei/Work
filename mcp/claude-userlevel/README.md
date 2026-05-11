# Claude Code user-level SSOT

**單一目的**：讓每台機器的 `~/.claude/` 內容（hooks、settings.json、mcp.json、commands/）能透過 git pull + 一個指令對齊，達成「**筆電與桌機的 Claude Code 行為完全一致**」，且不靠手動複製整個資料夾。

> 本目錄是 30 年級的 SSOT。要新增、修改、刪除被治理的檔案，**只**改這裡 → commit → 兩台跑 `sync-claude-userlevel.ps1 -Mode merge`。

---

## 為什麼存在這個目錄

Claude Code 的設定分三層：

| 層 | 路徑 | 是否該共用 | 怎麼共用 |
|----|------|---------|---------|
| **專案級** | `repo-root/.claude/` | ✅ 是 | 直接 git 追蹤（已做） |
| **專案級 MCP** | `repo-root/.mcp.json` | ✅ 是 | git 追蹤（從 `mcp/registry.template.json` 衍生） |
| **使用者級** | `~/.claude/` | ⚠️ 部分 | **本目錄 + `sync-claude-userlevel.ps1`** |

過去使用者級檔案（hooks、settings、mcp）只能手動複製 → 換機累、易漏、易帶過密鑰。本機制把「跨機共用部分」收進 git，把「機器特定部分」（如 `permissions.allow` 累積）留在各機。

---

## 目錄結構

```
mcp/claude-userlevel/
├── hooks/                            # 19 個 hook 檔（跨機完全一致；用 ${CLAUDE_PLUGIN_ROOT} 與 ~/.claude 路徑）
│   ├── hooks.json
│   ├── ao-resume-on-prompt.ps1
│   ├── branch-protection.js
│   ├── commit-quality.js
│   └── ... (15 more, 含 README*.md)
├── settings.template.json            # 跨機共用設定（hooks 段、permissions.deny、additionalDirectories、theme、autoUpdatesChannel）
├── mcp.template.json                 # {"mcpServers":{}} — per CLAUDE.md，~/.claude/mcp.json 必須為空
├── manifest.json                     # 宣告式治理清單（sync 腳本讀這裡）
└── README.md                         # 本檔
```

---

## 治理規則（哪些 sync、哪些不 sync）

### `hooks/` — 完全 sync
所有 19 個檔案 cross-machine identical。腳本用 mirror 模式覆蓋。

### `~/.claude/commands/` — 完全 sync（2026-05-11 新增）
**SSOT 來源**：`repo/.claude/commands/`（已進 git）。腳本用 mirror 模式覆蓋。  
project-level commands 在 repo 開啟時優先；user-level 作為不開 repo 時的 fallback。  
**禁止**：在 `~/.claude/commands/` 直接建立不在 repo 裡的副本。

### `settings.json` — 部分 sync
**強制覆蓋（overwriteKeys）**：
- `autoUpdatesChannel`（"latest"）
- `theme`（"light"）
- `permissions.deny`（git push --force / -f / gh pr merge / git checkout -b / git switch -c / git switch --create / git branch — CLAUDE.md 強制分支保護）
- `permissions.additionalDirectories`（用 `${USERPROFILE}` `${MONOREPO_ROOT}` 變數展開）
- `hooks` 段（呼叫 ~/.claude/hooks/* 的所有 hook 設定）

**保留（preserveKeys）**：
- `permissions.allow`（每機 Claude Code 自動累積；含 session 特定路徑與密鑰，不該入 git）

> 結果：兩台 Claude Code **行為完全一致**（hooks 一樣 + deny 一樣 + 必要目錄存取一樣）；個性化的 allow 條目不互相覆蓋。

### `mcp.json` — 強制空
直接覆蓋為 `{"mcpServers":{}}`。原因：CLAUDE.md 規定 user-level mcp.json 不該作為 shared MCP config，shared MCP 走 `repo-root/.mcp.json`（從 `mcp/registry.template.json` SSOT 衍生）。

---

## 使用方式

### 換機 / 新機
```powershell
git clone <repo> Work
cd Work
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```
`bootstrap-mcp-machine.ps1` 會自動呼叫 `sync-claude-userlevel.ps1 -Mode install`。

### 日常維護（git pull 拉到新 hooks 或 template 更新時）
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode merge
```

### 巡檢（不寫檔，只報告 drift）
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode verify
```
exit 0 = 對齊；exit 1 = 有 drift。

### 預演（看 merge 會做什麼，但不寫）
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-claude-userlevel.ps1 -Mode dry-run
```

---

## 如何擴充與刪減（30 年穩定）

### 加新 hook
1. 把新 hook 檔丟進 `mcp/claude-userlevel/hooks/`
2. （若 hook 要被觸發）改 `mcp/claude-userlevel/hooks/hooks.json` 加 matcher
3. （若 settings.json `hooks` 段要對應）改 `mcp/claude-userlevel/settings.template.json`
4. commit + push
5. 兩台跑 `sync-claude-userlevel.ps1 -Mode merge`

### 加新 deny 規則
改 `settings.template.json` 的 `permissions.deny`，commit，兩台 merge。

### 加新 additionalDirectories
改 `settings.template.json` 的 `permissions.additionalDirectories`（可用 `${USERPROFILE}` `${MONOREPO_ROOT}` 變數），commit，兩台 merge。

### 把新檔案納入跨機治理
1. 把檔案放進 `mcp/claude-userlevel/`
2. 改 `manifest.json` 加新 entry：
   ```json
   "myfile": {
     "type": "directory" | "merge-json" | "replace-json",
     "source": "mcp/claude-userlevel/myfile.json",
     "target": "${USERPROFILE}\\.claude\\myfile.json",
     "syncMode": "mirror" | "merge" | "replace",
     ...
   }
   ```
3. 不需要改腳本（腳本是宣告式，依 manifest 派發）

### 移除某條治理
從 `manifest.json` 刪該 entry，並（可選）刪 `mcp/claude-userlevel/` 下對應檔案。

---

## 安全保證

- ✅ hooks 入 git 前掃過，**無密鑰、無機器路徑**（用 `${CLAUDE_PLUGIN_ROOT}` 與 `~/.claude/`）
- ✅ settings template **不含** `permissions.allow`（不會洩漏密鑰或機器路徑）
- ✅ user-level mcp.json 強制清空 → 消除 legacy 雙寫困擾
- ✅ install/merge/verify/dry-run 四模式，預設 merge 最安全（保留 allow）
- ✅ 寫入前自動備份到 `agency-os/Backups/claude-userlevel-<UTC>/`

---


## 為什麼有 `scripts/normalize-claude-settings.mjs`（PowerShell ConvertTo-Json 1-element-array bug）

### 症狀

舊版（沒接 normalizer）跑 `sync-claude-userlevel.ps1 -Mode merge` 後，Claude Code 啟動跳：

> Settings file failed to parse: `~/.claude/settings.json` — Expected array, but received object

結果：所有 hooks 失效，permissions allow 不生效。

### 根因

**PowerShell 5.1 `ConvertTo-Json` 已知 bug**：1-element array 序列化會被拆成單一 object，
所以 `hooks.UserPromptSubmit: [{...}]`（1 個 matcher）寫檔時被改成 `hooks.UserPromptSubmit: {...}`。

中招的層級不只一層：

- 頂層：`hooks.{Event}` 若只有 1 個 matcher → 變 object
- 嵌套：`hooks.{Event}[N].hooks` 若只有 1 個 hook → 變 object

`permissions.allow` / `permissions.deny` / `permissions.additionalDirectories` 只有 1 個元素時也會中。

### 修法（不改 PowerShell，新增 Node 後處理）

`Sync-Json-Merge` 在 `Set-Content` 後 **立刻** 呼叫 `scripts/normalize-claude-settings.mjs`：

- 走訪 `HOOK_EVENTS` 清單裡每個事件的頂層 + 嵌套 `.hooks` 欄位
- 走訪 `PERMISSION_ARRAY_KEYS`（allow/deny/additionalDirectories/ask）
- 任何「應該是 array 卻是 object」的位置 → 包成 `[obj]`
- 完全 idempotent：跑在已經正確的檔案上是 no-op
- 失敗會 WARN（不阻擋 sync），訊息明確指引

### 為什麼不直接改 PowerShell 序列化

- PS 5.1 `ConvertTo-Json` 沒有 `-AsArray` 旗標（PS 7+ 才有；本機是 5.1）
- 用 `,$value` 強制保 array 在巢狀深層不可靠
- 換用 Newtonsoft.Json 需要 DLL，違反「無外部依賴」
- Node 已是本 repo 既有依賴（`run-llm-mcp.ps1`、`apply-lobster-rls-migrations-eu.mjs` 等都用），新增 normalizer 不增加維運面積

### 擴充 normalizer 的 schema

若 Claude Code 將來加新 hook event（例如 `OnError`）：

1. 編 `scripts/normalize-claude-settings.mjs`，把新事件加進 `HOOK_EVENTS` 清單
2. 跑 `sync-claude-userlevel.ps1 -Mode dry-run` 確認沒誤判
3. 不需要動 SSOT 模板（除非你也要在 SSOT 加新 hook）

### 驗收

```powershell
# 1. 先故意弄壞（模擬 PS bug）
node -e "const fs=require('fs');const f='C:/Users/USER/.claude/settings.json';let r=fs.readFileSync(f,'utf8').replace(/^﻿/,'');const c=JSON.parse(r);['UserPromptSubmit','Stop'].forEach(e=>{if(Array.isArray(c.hooks[e])&&c.hooks[e].length===1)c.hooks[e]=c.hooks[e][0];});fs.writeFileSync(f,JSON.stringify(c,null,2)+'
');"

# 2. 跑 sync
powershell -ExecutionPolicy Bypass -File .scriptssync-claude-userlevel.ps1 -Mode merge

# 3. 確認 normalizer fired（看 stdout 出現 [normalize] FIXED N structural issue(s)）
# 4. 重開 Claude Code，無 parse error
```
## Related

- `mcp/registry.template.json` — Shared MCP server SSOT
- `mcp/README.md` — MCP 治理總入口
- `scripts/sync-mcp-config.ps1` — MCP server config 同步
- `scripts/sync-claude-userlevel.ps1` — 本目錄的同步腳本
- `scripts/bootstrap-mcp-machine.ps1` — 一鍵新機引導
- `agency-os/docs/operations/dual-ide-coexistence-strategy.md` — 雙 IDE 並存策略
- `CLAUDE.md` § 桌機/換機設定
