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
- **Cursor / IDE**：可開 repo 根或 `agency-os`；若規則/連動檢查找不到 `.cursor`，請先確認開啟位置與 `.cursor` 實際存在。**IDE 行為與 MCP 職責（版控正本）** 見 `docs/operations/cursor-enterprise-rules-index.md`。桌機正式開工：在 monorepo 根跑 **`scripts/ao-resume.ps1`（預設）**＝**behind 時**才 `pull --ff-only`＋閘道＋依賴＋Strict 稽核；髒樹／衝突時腳本會非 0，須先整理（見 **2.5.1**），**不必**與「先手動 pull」綁死。

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
git clone https://github.com/peijingartstudio-pei/Work.git
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

# 雙機對齊可驗證判定（勾 `TASKS`「雙機環境對齊」前必達）：`-Strict` 將 gh／vault／mcp／乾淨樹等建議項視為失敗，輸出須為「PASS (no warnings)」
powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin -Strict
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

1. 你已在上方跑過 **`verify-build-gates`** 與 **`machine-environment-audit -FetchOrigin -Strict`**（與 **`ao-resume.ps1` 預設**內含步驟對齊；若略過 Strict，不應勾選 `TASKS` 雙機項）。  
2. **下一趟起（日常）**：在 monorepo 根跑 **`scripts/ao-resume.ps1`**（或 Cursor 打 **`AO-RESUME`** 由代理代跑同一支腳本）即可；**Exit 0**＝未落後（必要時已 ff-only pull）＋閘道＋依賴＋Strict 無 WARN，**不必**為了「再對齊一次」重複手動 `pull`／閘道。  
3. **人類掃一眼（可選）**：`agency-os\LAST_SYSTEM_STATUS.md`、`agency-os\TASKS.md`、`agency-os\reports\status\integrated-status-LATEST.md`。  
4. **下一趟起**：換機以外的**日常開機**請改依 **§2**（不必重跑 §1.5 全段；除非重新 clone、換機、或依賴損毀需重建）。

---

## 2) 開機後必做四件事（約 5–15 分鐘）

> **捷徑（與關鍵字 `AO-RESUME` 對齊）**：在 monorepo 根執行 **`scripts/ao-resume.ps1`（預設）**＝下列第 1～4 步的**機器裁決版**（fetch、behind 時 ff-only pull、`npm ci` 由腳本在需要時觸發、`verify-build-gates`、**`print-open-tasks`**、**`machine-environment-audit -FetchOrigin -Strict`**）。**Exit 0** 後再開 Cursor 打 **`AO-RESUME`** 讀檔即可。下列分步保留給除錯或想手動理解內部者。
>
> **與 §1.5 的關係**：若你為 **新機** 且尚未跑過 §1.5 的「工具與依賴」區塊，請 **先完成 §1.5**，再視 §2 為**之後每次**的節奏。若 `lobster-factory\packages\workflows\package-lock.json` 有更新，務必在該目錄 **再執行** `npm ci`（或由 **`ao-resume.ps1`** 偵測後代跑）。

1. **同步主線（先收斂到遠端真相）**  
   ```powershell
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   ```
   若失敗，先處理本機未提交或衝突，再往下走。

2. **依賴還原（`node_modules` 不入庫）**  

   **（小白）`npm ci` 是什麼？** 可以想成：照著 **`package-lock.json` 這份購物清單**，把要用到的 JavaScript 套件裝進本機的 **`node_modules`** 資料夾。清單會跟著 GitHub；`node_modules` 太大通常不入庫，所以**每一台電腦**至少要裝一次；**`git pull` 之後若清單有更新**，也要再裝一次才跟筆電／CI 一致。  
   **現在打 `AO-RESUME`（跑 `ao-resume.ps1`）時，若偵測到還沒裝過或清單變新了，會自動替你執行 `npm ci`**（腳本會印簡短英文說明；npm 本身可能出現黃色 **英文警告**，多數可忽略，只要最後顯示完成即可）。想略過可傳 **`-SkipWorkflowsDeps`**（進階用）。亦可手動貼上：  

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

4. **對話續接（擇一）**  
   - **機器裁決（預設，與只打 `AO-RESUME` 一致）**：代理／終端在 monorepo 根跑 **`.\scripts\ao-resume.ps1`**（**預設**即含 **`verify-build-gates` + 結尾 `machine-environment-audit -FetchOrigin -Strict`**）。**Exit 0**＝未落後遠端（必要時已 ff-only pull）+ 閘道 + 依賴檢查 + 嚴格環境稽核無 WARN；**不必**再開三件套 markdown 目視。別名：**`.\scripts\align-workstation.ps1`**（與上一行同行為）。  
     **進階略過（非人類日常開工）**：**`-SkipStrictEnvironmentAudit`**（Autopilot 開機會加；並常搭配 **`-SkipVerify`**）；**不要**在桌機正式開工時隨意省略。  
     **做不到全自動的邊界**：`gh` 登入、DPAPI vault、`mcp.json` 等**不可進庫**，腳本只驗證「有／無」，缺了會 **Strict FAIL**——仍要你在該機做一次設定（見 **§1.5** 憑證段）。  
   - **人類掃一眼（可選）**：讀 `agency-os\LAST_SYSTEM_STATUS.md`、`agency-os\TASKS.md`、`agency-os\reports\status\integrated-status-LATEST.md` 後，在 Cursor 對 AI 輸入 **`AO-RESUME`**；代理仍應在可執行終端時跑 **`ao-resume.ps1`**（帶預設完整檢查）。  
   > **重要**：`ao-resume`／`align-workstation` 會 `fetch`；**僅在落後 `origin/main`（behind>0）** 時 **`git pull --ff-only`**。**若落後且工作樹仍有未提交變更**，預設 **不**自動 stash（見 **2.5.1**）；Autopilot 路徑可鬆綁 stash（見 **AGENTS.md**）。

## 2.5 日內 Git 節奏（checkpoint 與收工）— **單一真相（人類可讀）**

> **規則正本（少分叉）**：**日常改動**以 `agency-os/.cursor/rules/` 為準（含 **`00-session-bootstrap`**、**`30-resume-keyword`**、**`50-operator-autopilot`**、**63–66**）。repo 根 `.cursor/rules/` 由 **`verify-build-gates`** 內 **`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 自動鏡像；其中 **`00`／`30`** 會套用 **monorepo 路徑轉換**（`docs/...` → `agency-os/docs/...`），**health gate** 以「轉換後內容」驗證 SHA 等價。代理細節見 **`50-operator-autopilot`** **§7**。

| 階段 | 誰做什麼 | Git |
|------|-----------|-----|
| **`AO-RESUME`（開工前檢）** | 你：在 Cursor 打關鍵字；代理：跑 **`scripts/ao-resume.ps1`**（**預設完整**：preflight 含 `verify-build-gates`、依賴、`print-open-tasks`、**結尾 `machine-environment-audit -FetchOrigin -Strict`**）、讀進度檔 | **不**為「開場」自動空 commit。進階略過：**`-SkipOpenTasksList`**、**`-SkipStrictEnvironmentAudit`**（與 Autopilot／輕量開機）；**勿**在正式開工隨意略過 Strict。 |
| **工作中（至收工前）** | 你：下任務；代理：實作與驗證 | 每完成一個**可敘述、已驗證**的里程碑：代理**應自動**在 monorepo 根執行 **`scripts/commit-checkpoint.ps1`**（**本機 commit**，**不 push**）。**你不必手動**跑該腳本。 |
| **`AO-CLOSE`（收工）** | 你：關鍵字或明示收工；代理：更新 **`WORKLOG`**／`memory`（**不必手動勾 `TASKS`**）後跑 `ao-close.ps1` | **開頭** **`print-today-closeout-recap`**；閘道 **PASS** 後、**`git add` 前**：**`apply-closeout-task-checkmarks`** 讀取當日 **`WORKLOG`** 之 **`- AUTO_TASK_DONE: …`**（＋選用 **`pending-task-completions.txt`**）自動打勾 **`TASKS`**。略過：**`-SkipAutoTaskCheckmarks`**。其餘略過旗標見 **`end-of-day-checklist`**。再 **`git add` → `commit` → `git push`**。 |

**補充**

- **遠端真相**仍是 `origin/main`：日內 checkpoint 只救本機；**雙機／隔天續接**靠收工 **push**（或你明講的立即推送）。
- **刪檔別被 pull 洗回**：見 **§2.4**；刪除應進 commit，上雲可併入當日 **AO-CLOSE** 或急件時單獨 `push`。
- **稽核遠端是否仍追蹤某路徑**：`scripts/git-audit-tracked-remote.ps1`（可選 `-Pattern`）。

### 2.5.1 AO-RESUME／AO-CLOSE 與 GitHub 單一真相（腳本實際行為）

- **`scripts/ao-resume.ps1`** 在 Git 同步通過後會呼叫 **`scripts/ensure-lobster-workflows-deps.ps1`**（除非 **`-SkipWorkflowsDeps`**）：在需要時自動執行 **`lobster-factory\packages\workflows`** 的 **`npm ci`**，並印出小白說明（見上文「`npm ci` 是什麼」）。通過後預設會呼叫 **`scripts/print-open-tasks.ps1`** 列出 **`agency-os/TASKS.md`** 所有未完成項（**`-SkipOpenTasksList`** 可略過），並**同步寫入** **`agency-os/.agency-state/open-tasks-snapshot.md`**（**gitignore**；內含 **Total open** 與依 **`##` 區塊**分段的 Markdown，供 **`AO-RESUME`** 代理 **Read** 後與聊天內「逐條全列」核對）。**預設**在列印 TASKS 後再跑 **`machine-environment-audit.ps1 -FetchOrigin -Strict`**；僅在傳 **`-SkipStrictEnvironmentAudit`** 時略過（例如 Autopilot 開機）。
- **`scripts/ao-resume.ps1`**（對應關鍵字 **AO-RESUME**）會呼叫 **`check-three-way-sync.ps1 -AutoFix`**。**AutoFix 不會**對任何版本庫檔案做 **`git restore`**（避免未提交修正被靜默洗掉）；僅 **`agency-os/settings/local.permissions.json`** 可在未加 `-AllowUnexpectedDirty` 時仍視為可接受的本機差異。預設（桌機／正式雙機節奏）：
  - **落後 `origin/main` 且工作樹仍有未提交變更**：**不**自動 stash；請先 **commit、捨棄或手動 `git stash`**，再跑 AO-RESUME，避免「以為已對齊、變其實在 stash」。
  - **需要開機自動 pull 且可接受暫存**：筆電 **Autopilot** 已傳 **`-AllowUnexpectedDirty`**（會連帶啟用 `-AllowStashBeforePull`、`-AllowPendingStash`）。僅在手動確認時可自傳：  
    `-AllowStashBeforePull`、`-AllowPendingStash`。
  - **若在 pull 前替你建了 stash 且未允許擱置**：會 **FAIL**；依畫面指示執行 `git stash list`，再 `git stash pop` 或 `git stash drop` 後重跑。
  - Pull 為 **`git pull --ff-only origin main`**；若失敗，代表與遠端 **非快轉關係**，請 `git status` 後 **rebase** 或依上文 **`reset --hard origin/main`**（以 GitHub 為準時）處理。
- **`scripts/ao-close.ps1`**（**AO-CLOSE**）：預設先 **`print-today-closeout-recap`**；**`-SkipTodayRecap`** 可略過。在未加 **`-SkipPush`** 時，會先 **`git fetch`** 並檢查是否落後 **`origin/<同一分支>`**；若落後則 **中止**。僅在明示風險且必要時使用 **`-AllowPushWhileBehind`**。在 **`git add` 前**會執行 **`apply-closeout-task-checkmarks.ps1`**（自 **`WORKLOG` 當日 `## yyyy-MM-dd`** 區塊解析 **`- AUTO_TASK_DONE:`** 行，並合併選用之 **`pending-task-completions.txt`**；**`-SkipAutoTaskCheckmarks`** 可略過）。
- **「整台電腦目錄」仍不可能與 GitHub 完全相同**：`node_modules`、本機 MCP／vault 等多為 **`.gitignore`**，兩台需各依 **1.5** 與 **6.2** 建置。

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

判讀重點：
- `git status -sb` 只看到 `## main...origin/main` 才是乾淨工作樹（有 `M`/`??` 就是 dirty）。
- `git rev-list --left-right --count HEAD...origin/main` 輸出 **`ahead behind`**（兩個數字）：**第二個數字（behind）必須為 `0`** 才表示未落後遠端；第一個數字（ahead）可大於 `0`（本機已有未 push 的 checkpoint，與 **§2.5** 一致）。若 **behind > 0**，先 §2 第 1 步 `pull` 再開工大改。
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
3. 若只想暫停、不收工：可直接離開；（**回來後**建議在 monorepo 根跑 **`scripts/ao-resume.ps1`**，或手動 `git pull --ff-only origin main` 後再打 **`AO-RESUME`**）
4. 若希望離開前做完整安全收工：`powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1 -SkipPush`
5. 回來後在 **同一 repo 根**：桌機正式開工請跑 **`ao-resume.ps1`（預設，無 `-SkipVerify`）**；Autopilot 可選 `-AllowUnexpectedDirty` 等（見 **2.5.1**）。**Exit 0** 即表示已處理 fetch／必要時 ff-only pull／閘道／Strict（預設路徑）。

你會看到什麼（成功判斷）：
- `ao-close`：會產生 closeout/health/guard 報告
- `ao-resume.ps1`：preflight completed；`check-three-way-sync` 在條件允許時會 **`git pull --ff-only origin main`**（見 **2.5.1**）；通過後會跑 **workflows `npm ci`** 檢查（除非 `-SkipWorkflowsDeps`）；並列出 **`TASKS.md` 全部未完成項**與自上次以來 `agency-os/reports/{closeout,health,guard,status}` 增量。若工作樹髒／behind，請先依 **2.5.1** 整理再重跑，避免強依賴「先手動 pull」與腳本两套敘述。

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
1. **未落後** `origin/main`（behind=0；通常由 **`ao-resume.ps1`** 在 behind>0 時 ff-only pull 達成），且在正確分支；或手動 **`git pull --ff-only origin main`** 成功之等價狀態。  
2. **`lobster-factory\packages\workflows` 已執行** `npm ci`（該處為目前唯一 lockfile；**`ao-resume.ps1`** 會在需要時代跑）；若有 `mcp-local-wrappers` 則一併 `npm ci`。  
3. **`verify-build-gates.ps1` Critical Gate = PASS**（**`ao-resume.ps1` 預設**會跑）。  
4. **`machine-environment-audit.ps1 -FetchOrigin -Strict` = PASS（無 WARN）**（**`ao-resume.ps1` 預設**會跑；Autopilot 略過不計入「正式開工」）。  
5. **`AO-RESUME` 在腳本 Exit 0 之後**（代理讀檔並回覆）：可清楚列出「已完成／目前進度／下一步」（含龍蝦 Milestone/DoD/風險，見 `AGENTS.md`）。**`LAST_SYSTEM_STATUS.md`／`integrated-status-LATEST.md` 為可選人類掃視**，不與 Exit 0 機器裁決互斥。

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
# 快速診斷（仍有 WARN 亦 exit 0）：日常自查用；不足以勾選 `TASKS`「雙機環境對齊」
powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin

# 勾選雙機項／§1.5 正式收尾：建議項視為失敗（須無 WARN）
powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin -Strict

# 最嚴格：上述通過後再跑 verify-build-gates，且把「建議項」也當失敗
powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin -RunVerifyGates -Strict
```

新機／第二台電腦在 §1.5 收尾時，**勾選 `TASKS` 雙機項前**須跑 **含 `-Strict` 之指令**（與 §1.5「工具與依賴」區塊一致）；上線前或大改版前可跑 **第三段**（`-RunVerifyGates`）。

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

_Last synced: 2026-04-09 05:52:22 UTC_

