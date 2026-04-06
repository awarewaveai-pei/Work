# 他處電腦／公司機 — 開機與首次接線須知

> **目的**：在家 push 後，到**另一台電腦**（公司機、筆電、新機）能**最快、安全、可驗證**地續接，並把流程收斂為「可重複、可回復、可追蹤」。
>
> **硬性原則**：
> 1. 以 `origin/main` 為單一真相。  
> 2. **Critical Gate 未 PASS 不開工大改**。  
> 3. 不可進庫資料（憑證、快取）必須機器本地化管理。

## 0) 你應該從哪裡開 repo？

- **Monorepo 根目錄**（含 `agency-os\`、`lobster-factory\`、根目錄 `scripts\`）：請整包 clone，不要只拷子資料夾。
- **路徑可不同**（例如筆電 `D:\Work`、公司機 `C:\Users\USER\Work`），流程都用**相對路徑**執行，不綁磁碟代號。
- **Cursor / IDE**：可開 repo 根或 `agency-os`；若規則/連動檢查找不到 `.cursor`，請先確認開啟位置與 `.cursor` 實際存在。**IDE 行為與 MCP 職責（版控正本）** 見 `docs/operations/cursor-enterprise-rules-index.md`（與本頁 **`ao-resume.ps1`／`AO-RESUME` 單一閘道**一致：內含對齊 `origin/main` 與閘道；MCP 仍只存本機。）

### 0.1 快速確認你在正確根目錄

```powershell
git rev-parse --show-toplevel
git branch --show-current
```

預期：
- 在 `Work` repo 根（或其子目錄）
- 分支為 `main`（如非 `main`，請先確認你是否刻意在 feature branch）

## 1) 第一次或換電腦：取得程式碼

**新機／筆電第一次 clone**：請**只**依 **§1.5**（自 `git clone` 起之「最短序列」正本），**不要**再與本節重複貼上 clone 區塊。

**已 clone 過**（僅對齊 `origin/main`），在 **monorepo 根**：

```powershell
cd <你的 Work 根路徑>
git fetch origin
git checkout main
git pull --ff-only origin main
```

（與 **§2 第 1 步**相同；之後依 §2 其餘步驟即可。）

## 1.5) 筆電／新機：首次開機最短指令序列（複製貼上）

> **角色分工**：**§1.5**＝新機／筆電首次（含 `clone`、工具、`lobster-factory` 依賴、閘道）；**§2**＝之後每次開機的**例行**流程（會再 `pull`、`npm ci`、閘道）。  
> **連動**：`TASKS.md` → Next「（AO-RESUME 提醒）雙機環境對齊」、根 `README.md`「他機／首次接線」均指向本節。  
> **前置**：已安裝 **Git**、**Node.js**（建議與桌機／CI 同大版本）；可選 **winget**（裝 `gh` 用）。

### 從零 clone（這台從未載過 repo）

在**自選父目錄**開 PowerShell（路徑可與桌機不同，例如 `D:\Work`、`C:\Users\USER\Work`）：

```powershell
git clone https://github.com/awarewaveai-pei/Work.git
cd Work
git checkout main
git pull --ff-only origin main
```

### 工具與依賴（與桌機「能跑的指令」對齊）

以下一律在 **monorepo 根**執行（該層目錄需同時有 `agency-os`、`lobster-factory`、`scripts`）：

```powershell
Set-Location <你的 Work 根路徑>
git rev-parse --show-toplevel
```

```powershell
# GitHub CLI（可選；要與桌機一樣用 gh 管理 Actions 時再裝）
winget install --id GitHub.cli
# 關閉終端機再開，或刷新 PATH 後：
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
gh --version
gh auth login
```

```powershell
Set-Location <你的 Work 根路徑>

# 龍蝦工廠依賴（lockfile 在 workflows 套件；bootstrap 腳本為純 Node，但本機開發／Trigger 依賴在此）
Set-Location .\lobster-factory\packages\workflows
npm ci
Set-Location ..\..\..

# 若你有使用本機 MCP wrappers（可選）
if (Test-Path .\mcp-local-wrappers) {
  Set-Location .\mcp-local-wrappers
  npm ci
  Set-Location ..
}

# 一次閘道（通過再開工大改）
powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1
```

### 1.5.1 Windows：本機 WordPress 棧（筆電與公司桌機對齊｜**非 MCP**）

> **為什麼要裝？** 龍蝦 staging／`regression:staging-pipeline` 在傳入真實 `--wpRootPath` 時，需要本機 **WordPress + 可連線的 MySQL 相容資料庫**。**Supabase = Postgres（平台 SoR）**；**WordPress 核心只吃 MySQL／MariaDB**，兩者職責不同、**並存**，不是「多一個 Supabase」。

> **正本（操作步驟與疑難）**：`lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md`  
> **一鍵（DB 起來 + 建庫 + `.scratch` 下裝 WP）**：repo 根 `scripts/bootstrap-local-wordpress-windows.ps1`
> **多機同步策略（公司桌機/筆電/新機）**：`docs/operations/MARIADB_MULTI_MACHINE_SYNC.md`

**筆電若與公司桌機對齊「真 wp」能力**，在 monorepo 根依序執行（可複製整段；路徑與桌機磁碟代號無關）：

```powershell
Set-Location <你的 Work 根路徑>
# MySQL 相容（winget 套件名稱以當下 store 為準，常見為 MariaDB.Server）
winget install --id MariaDB.Server -e --accept-package-agreements
# PHP（WP-CLI 需要；建議與文件一致）
winget install --id PHP.PHP.NTS.8.4 -e --accept-package-agreements
```

關閉並重開終端機（或刷新 `Machine`+`User` 的 `PATH`）後：

```powershell
Set-Location <你的 Work 根路徑>
powershell -ExecutionPolicy Bypass -File .\scripts\setup-wp-cli-windows.ps1
# 依腳本提示將 %LOCALAPPDATA%\Programs\wp-cli 加進「使用者 PATH」後再開一個終端機
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni
```

`-EnsurePhpIni` 會在 `php.exe` 同目錄建立／調整本機 `php.ini`（`extension_dir`、`curl`/`openssl`/`mysqli`、`memory_limit`），避免 `wp core download`／DB 連線失敗。**憑證與 DB root 密碼不入庫**；本機開發僅限自用。

### 憑證（無法一鍵複製：每台各做一次）

- **DPAPI vault**（Trigger 等腳本用）：`scripts/secrets-vault.ps1` — 手冊 **`docs/operations/local-secrets-vault-dpapi.md`**。  
- **Cursor MCP／`mcp.json`**：只存在本機，換機後依 **`docs/operations/mcp-add-server-quickstart.md`** 重建；**勿**把 token 提交進 repo。

### 做完後

1. 讀 `agency-os\LAST_SYSTEM_STATUS.md`、`agency-os\TASKS.md`、`agency-os\reports\status\integrated-status-LATEST.md`。  
2. 在 Cursor 對 AI 輸入 **`AO-RESUME`**：代理應在 monorepo 根執行 **`.\scripts\ao-resume.ps1`**（內含與 §2 等價的 pull、`npm ci`、`verify-build-gates`）；**無 AI／無終端權限**時，請在本機先手動跑該腳本再打 `AO-RESUME`。  
3. **下一趟起**：換機以外的**日常開機**請改依 **§2**（不必重跑 §1.5 全段；除非重新 clone、換機、或依賴損毀需重建）。

---

## 2) 開機後必做四件事（約 5–15 分鐘）

> **與 §1.5 的關係**：若你為 **新機** 且尚未跑過 §1.5 的「工具與依賴」區塊，請 **先完成 §1.5**，再視 §2 為**之後每次**的節奏。若 `lobster-factory\packages\workflows\package-lock.json` 有更新，務必在該目錄 **再執行** `npm ci`。  
> **單指令等價（與下列 1～3 步相同）**：在 monorepo 根執行 **`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1`**（內建 `-AutoFix`：對齊 `origin/main`、`npm ci`、`verify-build-gates`）。**在 Cursor 打 `AO-RESUME`** 時，代理應先跑此腳本（見 **`agency-os/.cursor/rules/30-resume-keyword.mdc`**）。

1. **同步主線（先收斂到遠端真相）**  
   ```powershell
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   ```
   若失敗，先處理本機未提交或衝突，再往下走。

2. **依賴還原（`node_modules` 不入庫）**  
   - **龍蝦 workflows 套件**（`packages/workflows` 具 `package-lock.json`；Trigger／zod 等依賴在此）：  
     ```powershell
     cd lobster-factory\packages\workflows
     npm ci
     cd ..\..\..
     ```
   - （若日後 `lobster-factory` **根目錄**新增 `package-lock.json`，再在該層補一次 `npm ci`。）
   - **可選**：若使用本機 MCP wrappers：  
     ```powershell
     cd mcp-local-wrappers
     npm ci
     cd ..
     ```

3. **一次跑滿「工程 + 治理」閘道（強烈建議）**  
   在 **monorepo 根**：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1
   ```
   須已安裝 **Node.js**（給 `lobster-factory` 的檢驗腳本用）。**Critical Gate 必須 PASS** 再開始改大範圍。

4. **看狀態三件套 + 對話續接**  
   - `agency-os\LAST_SYSTEM_STATUS.md`  
   - `agency-os\TASKS.md`  
   - `agency-os\reports\status\integrated-status-LATEST.md`  

   **至此已完成 Git 同步**後，在 Cursor 對 AI 輸入 **`AO-RESUME`**（代理應先執行 **`.\scripts\ao-resume.ps1`** 含 §2 體檢；若本機未提交／衝突導致 pull 失敗，仍須先整理 `git status`）。  
   > **Human-only**：若不用 AI，在 monorepo 根只跑 **`.\scripts\ao-resume.ps1`** 即可完成 §2 的 pull／`npm ci`／閘道（工程面與「打完 `AO-RESUME`」等價）。

## 2.5 日內 Git 節奏（checkpoint 與收工）— **單一真相（人類可讀）**

> **規則正本（少分叉）**：**只改** `agency-os/.cursor/rules/50-operator-autopilot.mdc`。repo 根的 `.cursor/rules/50-operator-autopilot.mdc` 與 63–66 相同，由 **`verify-build-gates`** 裡的 **`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 自動從 agency-os **鏡像**，不必手動複製、也不再加第三支檢查腳本。代理細節見該檔 **§7**。

| 階段 | 誰做什麼 | Git |
|------|-----------|-----|
| **`AO-RESUME`（開工前檢）** | 你：在 Cursor 打關鍵字；代理：在 repo 根跑 **`ao-resume.ps1`**（`pull`、`npm ci`、**`verify-build-gates`**）、讀進度檔 | **不**為「開場」自動空 commit；並列出自上次 **`ao-resume-last.txt`** 以來的 `agency-os/reports/*` 增量 |
| **工作中（至收工前）** | 你：下任務；代理：實作與驗證 | 每完成一個**可敘述、已驗證**的里程碑：代理**應自動**在 monorepo 根執行 **`scripts/commit-checkpoint.ps1`**（**本機 commit**，**不 push**）。**你不必手動**跑該腳本。 |
| **`AO-CLOSE`（收工）** | 你：關鍵字或明示收工；代理：更新 `TASKS`／`WORKLOG`／`memory` 後跑 `ao-close.ps1` | 閘道 **PASS** 後 **`git add` → `commit`（收斂殘留）→ `git push`**；可一次推上當日**多顆**本機 commit。 |

**補充**

- **遠端真相**仍是 `origin/main`：日內 checkpoint 只救本機；**雙機／隔天續接**靠收工 **push**（或你明講的立即推送）。
- **刪檔別被 pull 洗回**：見 **§2.4**；刪除應進 commit，上雲可併入當日 **AO-CLOSE** 或急件時單獨 `push`。
- **稽核遠端是否仍追蹤某路徑**：`scripts/git-audit-tracked-remote.ps1`（可選 `-Pattern`）。

## 2.1 失敗處置（不要硬做）

- `git pull --ff-only` 失敗：先 `git status`，整理本機變更後再 pull，避免強制覆蓋。
- `packages\workflows` 的 `npm ci` 失敗：刪除 `lobster-factory\packages\workflows\node_modules` 後重試；仍失敗就檢查 Node 版本與 lockfile 是否與遠端一致。
- `mcp-local-wrappers` 的 `npm ci` 失敗：刪除 `mcp-local-wrappers\node_modules` 後重試。
- `verify-build-gates` 失敗：先修 gate，不要進行大範圍變更或收工 push。

## 2.3 AO-RESUME 後 30 秒自檢（預防 dirty 與邏輯漂移）

在 monorepo 根執行：

```powershell
git status -sb
git rev-list --left-right --count HEAD...origin/main
powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1
```

（若**剛成功**跑過 **`.\scripts\ao-resume.ps1`** 且未再改檔，最後一行 **`verify-build-gates`** 可省略以避免重複。）

判讀重點：
- `git status -sb` 只看到 `## main...origin/main` 才是乾淨工作樹（有 `M`/`??` 就是 dirty）。
- `HEAD...origin/main` 應為 `0 0`（非 `0 0` 代表尚未完全對齊）。
- `verify-build-gates` 要 PASS（避免「版本對齊但行為錯」的邏輯 bug 持續擴散）。

## 2.4 大量刪檔後：怎麼避免「pull 又長回來」？

**原因一句話**：Git 只相信**已 commit 且已 push 到 `origin/main` 的歷史**。只在檔案總管刪檔、沒把「刪除」寫進 commit，遠端仍視那些路徑為存在；下次 `pull`／合併就會讓工作目錄再出現它們。

**固定做法（收斂成習慣）**

1. **刪完立刻看索引**：在 monorepo 根執行 `git status`。若刪的是**原本有追蹤**的檔案，應看到 `deleted:` 或 `D`；若什麼都沒有，代表 Git 還不知道你刪了（或刪的是從未入庫的檔案）。
2. **把刪除寫進 Git（本機）**：`git add -A`（或只 `git add` 相關路徑）後 **commit**；可請代理代跑 **`commit-checkpoint.ps1 -Message "chore: remove …"`**（與 **§2.5** 一致）。
3. **讓遠端／另一台也一致**：須把含刪除的 commit **push** 到 `origin/main`——通常併入當日 **`AO-CLOSE`**；若雙機急於對齊可當下 **`git push origin main`**（仍須遵守祕密與閘道意識）。
4. **另一台電腦**：下次只做 §2 第 1 步 `pull`，工作樹就會與「已刪乾淨的 main」一致，不會無故復活。
5. **不確定遠端還有沒有某路徑時**：在 monorepo 根執行（可把關鍵字換成資料夾或檔名片段）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\git-audit-tracked-remote.ps1 -Pattern "關鍵字"
   ```
   腳本會 `fetch`、比對 `HEAD` 與 `origin/main`、列出「索引有但磁碟沒有」的追蹤檔，並可選列出遠端仍追蹤且路徑含該關鍵字的檔案。**0 筆**代表遠端 main 上已沒有該片段路徑，pull 不會為了那串字把檔案加回來。

**之後在對話裡怎麼配合**：只要你說「刪了一堆檔／整理過目錄」，應先完成 **commit**（可代理代跑 checkpoint），**push** 則依 **§2.5**（通常收工）；或明講「還沒 push、先幫我稽核」；代理應優先建議跑 `git-audit-tracked-remote.ps1` 並看 `git status`，而不是假設本機磁碟即團隊真相。

## 2.2 臨時離席／可能斷網（吃飯前 30 秒版）

1. 在 **monorepo 根** `<WORK_ROOT>` 開終端機（例：`C:\Users\USER\Work` 或 `D:\Work`）
2. 貼上：`git status --short`
3. 若只想暫停、不收工：可直接離開；（**回來後**在 monorepo 根打 **`AO-RESUME`**（Agent 跑 **`ao-resume.ps1`**）或手動 **`git pull --ff-only origin main`**，與 §2 對齊方式一致）
4. 若希望離開前做完整安全收工：`powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1 -SkipPush`
5. 回來後在 **同一 repo 根**：**自建議**直接 **`.\scripts\ao-resume.ps1`**（內含 `pull`/`npm ci`/閘道，與 Cursor **`AO-RESUME`** 同治）；若只用 **Autopilot** 的 **`ao-resume.ps1 -SkipVerify -AllowUnexpectedDirty`**，則**未**跑滿閘道，接真開工前請再跑 **`verify-build-gates`** 或再打一次**人工** `AO-RESUME`

你會看到什麼（成功判斷）：
- `ao-close`：會產生 closeout/health/guard 報告
- `ao-resume.ps1`（預設 / Cursor **`AO-RESUME`**）：preflight completed；內含 **`git pull --ff-only origin main`**（在 `check-three-way-sync -AutoFix` 中）+ 自上次 **`ao-resume-last.txt`** 以來 `agency-os/reports/{closeout,health,guard,status}` 增量列表

## 3) 兩份「綜合狀態」路徑別搞混

| 路徑 | 說明 |
|------|------|
| **`agency-os/reports/status/`** | **主要**：`generate-integrated-status-report.ps1` 與 **AO-CLOSE** 會更新這裡（內容較完整）。 |
| **`Work/reports/status/`**（repo 根下） | **已退役**（僅相容保留，不再作為輸出路徑）；請只看 `agency-os/reports/status`。 |

## 4) 憑證與不可進庫的檔案

- **勿**把 `.env`、API key、Claude OAuth 等放進 Git（見 `docs/operations/security-secrets-policy.md`）。
- `.claude\`、`node_modules\` 已被 `.gitignore`；新機要**各自重新登入** Claude / MCP / GitHub（本機憑證管理員）。
- MCP 若因換機路徑失效，請只改本機設定（例如 `C:\Users\USER\.cursor\mcp.json`），不要把秘密值提交到 repo。
- 密鑰庫建置與復原手冊：`docs/operations/local-secrets-vault-dpapi.md`（換機時先照手冊重建 vault）
- MCP 常用新增流程：`docs/operations/mcp-add-server-quickstart.md`

## 5) 與「重開機續接」的關係

- 同一台電腦重開：見 repo 根的 **`RESUME_AFTER_REBOOT.md`**（貼 **`AO-RESUME`**）。  
- **換電腦／新機**：先 **§1.5**，之後每次開工 **§2** 再在 Cursor 用 **`AO-RESUME`**。

## 6) 開工完成判定（Definition of Ready）

### 6.1 可安全開工（最低標）

符合以下 5 項才算「可安全開工」：
1. `git pull --ff-only origin main`（或等價對齊 `origin/main`）成功，且在正確分支。  
2. **`lobster-factory\packages\workflows` 已執行** `npm ci`（該處為目前唯一 lockfile）；若有 `mcp-local-wrappers` 則一併 `npm ci`。  
3. `verify-build-gates.ps1` Critical Gate = PASS。  
4. 已讀 `LAST_SYSTEM_STATUS.md` / `TASKS.md` / `integrated-status-LATEST.md`。  
5. **`AO-RESUME` 在 Git 同步與閘道之後執行**（例行流程即 §2；新機第一次即 §1.5），回覆可清楚列出「已完成／目前進度／下一步」（含龍蝦 Milestone/DoD/風險，見 `AGENTS.md`）。

### 6.2 「完美」環境（建議標：可重現、雙機一致、與 CI 對齊）

在 **§6.1** 之上，建議再加：

| 項 | 說明 |
|----|------|
| **Node 與 CI 一致** | `lobster-factory` 要求 **>=18**；GitHub Actions 目前為 **22.x**（見 `.github/workflows/*.yml`）。本機用 **Node 22** 可最大程度避免「本機綠、CI 紅」。 |
| **GitHub CLI** | `gh` 已安裝並 `gh auth login`（雙機各自一次）。 |
| **乾淨工作樹** | `git status` 無未提交變更再宣告環境穩定（避免與 pull/rebase 拉扯）。 |
| **DPAPI vault** | `%LOCALAPPDATA%\AgencyOS\secrets\vault.json` 已依手冊建立，且含腳本所需鍵名（見 `agency-os/docs/operations/local-secrets-vault-dpapi.md`）。 |
| **Cursor MCP** | `%USERPROFILE%\.cursor\mcp.json` 存在；token／OAuth 仅存本機（見 `agency-os/docs/operations/mcp-add-server-quickstart.md`）。 |
| **（僅 Windows）本機 WP 真路徑** | 若需與他機一致跑 **真 `wp`**：已依 **§1.5.1** 安裝 **MariaDB + PHP + WP-CLI**，並能成功執行 `bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`；詳 `lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md`（**與 Supabase 分工不同**）。 |

**一鍵稽核**（不讀取密鑰內容；可加上 `-FetchOrigin` 讓 ahead/behind 較準）：

```powershell
# 快速：結構 + Git + Node + node_modules + gh / vault / mcp 占位
powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin

# 最嚴格：上述通過後再跑 verify-build-gates，且把「建議項」也當失敗
powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin -RunVerifyGates -Strict
```

新機／第二台電腦在 §1.5 收尾時，建議至少跑 **第一段**；上線前或大改版前可跑 **第二段**。

## Related Documents (Auto-Synced)
- `../README.md`
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `AGENTS.md`
- `docs/operations/end-of-day-checklist.md`
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/INTEGRATED_STATUS_REPORT.md`
- `memory/CONVERSATION_MEMORY.md`
- `RESUME_AFTER_REBOOT.md`
- `TASKS.md`

_Last synced: 2026-04-06 09:35:15 UTC_

