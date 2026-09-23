# 治理 Hooks（runner v2）

**[English](./README.md) · 繁體中文**

所有機械閘都經由**單一 runner**（`runner.js`）執行：依**唯一接線正本**（`rules.manifest.json`）分派到**純規則模組**（`rules/*.js`）。過去 23 個 hook 各自手刻的生命週期（讀 stdin、parse JSON、SID 推導、flag 檔、fail-open 錯誤處理、exit code）現在只實作一次，放在 runner 與 `lib/`。

```
hooks/
├── runner.js            # 唯一入口：node runner.js <event>
├── rules.manifest.json  # SSOT：event → matcher → 規則名（有序）
├── rules/               # 一檔一規則：module.exports = { check(ctx) }
├── lib/
│   ├── shared.js        # SID 推導、tracker I/O、風險分級、fail-open 日誌
│   └── flags.js         # once-per-session flag 檔（原子 wx 建立）
├── ao-resume-on-prompt.ps1        # 機器層（Windows），直接接在 settings
└── post-push-trigger-deploy.ps1   # 機器層（Windows），直接接在 settings
```

## 結構性保證

以下保證由 runner 提供，不再依賴逐 hook 的自律：

- **Fail-open 且大聲。** 規則 crash 或載入失敗，永遠不會擋掉工具呼叫、也不會拖垮其他規則；錯誤同時印到 stderr 並寫入 `~/.claude/verify-gate-failures.log`。
- **只有 exit 2 是 BLOCK。** 規則回傳 `{ block: [行] }`；runner 聚合所有命中規則的裁決、一次印出、再 exit 2。其餘一律放行。
- **SID 只有一套。** `lib/shared.js getSessionId()`（stdin `session_id` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID` → sha1(cwd)）；舊系統三套互異的推導已消失。
- **禁止手寫計數。** SessionStart banner 的數字從 manifest 推導。散文要數字就推導 —— 舊 description「15 total」的漂移就是 copy-drift 的教訓。
- **殼包裹可見。** runner 提供 `ctx.commandExpanded`，把 `bash -c "…"` / `sh -lc '…'` 的字串載荷解包（深度 3），掃指令的規則不再能被字串包裹繞過。單行 `cd x && docker compose down` 鏈維持記載中的放行（操作者刻意輸入）。

## 規則 API

```js
// rules/example.js
module.exports = {
  check(ctx) {
    // ctx: { event, payload, toolName, toolInput, command, commandExpanded,
    //        files, sid, cwd, shared, flags, manifest }
    if (!somethingWrong(ctx)) return null;      // 放行
    return { warn: ['[Hook] 提醒 …'] };          // stderr，不擋
    // 或
    return { block: ['[Hook] BLOCKED: …'] };    // 聚合 → exit 2
  },
};
```

新增一個閘 = `rules/` 一個檔 + `rules.manifest.json` 一行 + `tests/hooks/runner-parity.test.mjs` 一個 case。移除反向操作。其他都不用動。

## 接線（三個消費端，一份 manifest）

| 環境 | 接線檔 | 指令 |
|---|---|---|
| Windows 工作站（user-level） | `settings.template.json` → 同步到 `~/.claude/settings.json` | `node ~/.claude/hooks/runner.js <event>` |
| Plugin 打包 | `hooks.json` | `node ${CLAUDE_PLUGIN_ROOT}/hooks/runner.js <event>` |
| 遠端 container（Claude Code web） | `.claude/settings.local.json`，由 `scripts/wire-remote-hooks.sh` 產生（gitignored —— 若 tracked 會與工作站的 `~/.claude` junction 相撞） | `node "$CLAUDE_PROJECT_DIR/mcp/claude-userlevel/hooks/runner.js" <event>` |

接線檔**不含任何規則知識**，結構上不可能互相漂移。哪些規則在哪跑，只寫在 `rules.manifest.json`。

兩支 `.ps1` 維持直接接在 `settings.template.json`：它們是 Windows／機器層自動化（AO-RESUME 觸發、push 後 Trigger.dev 部署），不屬於可攜治理。

## 規則速查

會 BLOCK（exit 2）：`dangerous-bash`（rm -rf、--no-verify）、`branch-protection`（force-push 保護分支）、`commit-quality`（staged debugger/密鑰）、`verify-gate-commit`（帶未驗證 code 的 commit）、`git-add-scope-tracker`（擋 `git add -A`/`--all`/`.`/`-u`/`-p`/`-i`；`-A`/`--all`/`-u`/裸 `.` 可用首行 `# CONFIRMED-HIGH-RISK:` 解鎖，解鎖後用真實 `git add -n` dry-run 記錄實際會加的檔案；`-p`/`-i` 無 ack 例外；同時記錄 `git rm`/`git mv` 的目標）、`git-commit-scope-guard`（PreToolUse：擋 `git commit -a`/`--all`/`-am`；擋真實 `git diff --cached` 內含本 session 從未 `git add` 過的檔案的裸 `git commit`——即另一個並行 session 已 staged 的內容；`-- <pathspec>` 尾巴須經 `git ls-files` 驗證為真實路徑才會放行，不是文字比對。PostToolUse：依指令執行後「實際還 staged 什麼」修剪 tracker，被擋下/失敗的 commit 不會遺失 tracker 狀態）、`doc-link-commit-check`（PostToolUse：`git commit` 之後以 `lobster-factory/scripts/validate-doc-integrity.mjs --commit=<sha>` 只判該 commit 改到或弄斷的連結，對照 commit 自己的 tree；exit 2 撤不回 commit，是把壞連結交回作者）、`high-risk-bash-warn`（docker down／prod rsync／migrate —— 首行 `# CONFIRMED-HIGH-RISK:` ACK 解鎖）、`sensitive-file-block`（.env/.pem/.key 寫入）、`git-log-injector`（session 首次 Write/Edit 顯示上個 session 的 commits，每 session+日一次）、`auto-repair-guard` + `file-path-router`（每類別一次的前置檢查／路由）、`config-protection`（linter 設定檔）、`large-file-warner`（≥2MB 讀取）、`mcp-health`（backoff 斷路器）。

不擋：`suggest-compact`、`log-error`、`audit-log`、`accumulator`+`batch-format`（Stop 時 Prettier+tsc）、`design-quality`、`test-runner`、`code-change-tracker`（＋verify tracker）、`agent-dispatch-log`、`check-console`、`cost-tracker`、`session-summary`、`verify-gate-stop`、`session-banner`。

權威清單：`rules.manifest.json`。行為規格：`tests/hooks/runner-parity.test.mjs`。

## 測試

```
bash scripts/test-hooks.sh
```

`tests/hooks/runner-core.test.mjs` 用 fixture 規則驗 runner 保證（分派、crash 隔離、聚合、fail-open）；`tests/hooks/runner-parity.test.mjs` 用真 manifest 驗每條規則的裁決矩陣，含 manifest↔rules 完整性檢查（無缺檔、無孤兒）。Node ≥ 18，零套件。

## 歷史

v2 於 2026-07-02 取代 23 個獨立 hook 檔 + 5 個 inline blocker。遷移採絞殺式：先用 48 案例套件鎖住舊行為（`tests/hooks/legacy-behavior.test.mjs`，與舊檔同批退役 —— 見 git 歷史），再逐條移植並逐案驗 parity。過程修正四個舊缺陷，各有測試鎖定：inline rm-rf 與 sensitive-file blocker 讀錯 stdin 欄位從未生效；`bash -c` 包裹可繞過 high-risk-bash-warn；`log-error.sh` 在全新 HOME 靜默失敗。
